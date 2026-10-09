import express from 'express';
import multer from 'multer';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
const root = fileURLToPath(new URL('../../../', import.meta.url));
const storePath = path.join(root, 'data', 'exams.json');
let rows = [];
let writes = Promise.resolve();
function save() {
  const snapshot = JSON.stringify(rows, null, 2);
  const operation = writes.then(async () => {
    await fs.mkdir(path.dirname(storePath), { recursive: true });
    await fs.writeFile(`${storePath}.tmp`, snapshot, 'utf8');
    await fs.rename(`${storePath}.tmp`, storePath);
  });
  writes = operation.catch(() => {});
  return operation;
}
export async function initializeLocalStore() {
  try { rows = JSON.parse(await fs.readFile(storePath, 'utf8')); if (!Array.isArray(rows)) throw new Error('Invalid local store'); return; }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  for (const file of await fs.readdir(path.join(root, 'output_text'))) {
    if (!file.endsWith('.txt')) continue;
    const examKey = file.slice(0, -4);
    for (const answersExtension of ['csv', 'txt']) {
      let answersText;
      try { answersText = await fs.readFile(path.join(root, 'answer', `${examKey}.${answersExtension}`), 'utf8'); }
      catch (error) { if (error.code === 'ENOENT') continue; throw error; }
      rows.push({ _id: randomUUID(), examKey, questionsText: await fs.readFile(path.join(root, 'output_text', file), 'utf8'), answersText, answersExtension, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
      break;
    }
  }
  await save();
}
export const localRouter = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });
const route = fn => (req, res, next) => Promise.resolve(fn(req, res)).catch(next);
function validate(bundle) {
  if (typeof bundle.examKey !== 'string' || !bundle.examKey.trim() || bundle.examKey.length > 512) throw Object.assign(new Error('Tên bộ đề không hợp lệ.'), { status: 400 });
  if (typeof bundle.questionsText !== 'string' || !/=+\s*Q\d+\.webp\s*=+/i.test(bundle.questionsText)) throw Object.assign(new Error('File câu hỏi cần mốc ===== Q1.webp =====.'), { status: 400 });
  if (typeof bundle.answersText !== 'string' || !bundle.answersText.trim()) throw Object.assign(new Error('File đáp án không được để trống.'), { status: 400 });
}
async function createBundle(bundle) {
  validate(bundle);
  const examKey = bundle.examKey.trim();
  const existing = rows.find(row => row.examKey === examKey);
  if (existing) throw Object.assign(new Error(`Bộ đề “${examKey}” đã có trong thư viện. Vui lòng thêm bộ đề khác.`), { status: 409 });
  const doc = { _id: randomUUID(), createdAt: new Date().toISOString(), examKey, questionsText: bundle.questionsText, answersText: bundle.answersText, answersExtension: bundle.answersExtension === 'txt' ? 'txt' : 'csv', updatedAt: new Date().toISOString() };
  rows.push(doc);
  await save(); return doc;
}
localRouter.get('/', (_req, res) => res.json(rows.map(({ questionsText, answersText, ...row }) => ({ ...row, questionCount: (questionsText.match(/=+\s*Q\d+\.webp\s*=+/gi) ?? []).length })).sort((a, b) => a.examKey.localeCompare(b.examKey))));
localRouter.get('/:id', (req, res) => { const row = rows.find(row => row._id === req.params.id); if (!row) return res.status(404).json({ error: 'Not found' }); res.json(row); });
localRouter.post('/', express.json({ limit: '50mb' }), route(async (req, res) => res.status(201).json(await createBundle(req.body))));
localRouter.post('/upload', upload.fields([{ name: 'questions', maxCount: 1 }, { name: 'answers', maxCount: 1 }]), route(async (req, res) => {
  const q = req.files?.questions?.[0]; const a = req.files?.answers?.[0];
  if (!q || !a) return res.status(400).json({ error: 'Cần cả file câu hỏi và đáp án.' });
  if (!/\.txt$/i.test(q.originalname) || !/\.(txt|csv)$/i.test(a.originalname)) return res.status(400).json({ error: 'Câu hỏi dùng TXT; đáp án dùng TXT hoặc CSV.' });
  res.status(201).json(await createBundle({ examKey: req.body.examKey || q.originalname.replace(/\.[^.]+$/, ''), questionsText: q.buffer.toString('utf8'), answersText: a.buffer.toString('utf8'), answersExtension: /\.txt$/i.test(a.originalname) ? 'txt' : 'csv' }));
}));
localRouter.put('/:id', express.json({ limit: '50mb' }), route(async (req, res) => {
  const existing = rows.find(row => row._id === req.params.id); if (!existing) return res.status(404).json({ error: 'Not found' });
  const patch = Object.fromEntries(['examKey', 'questionsText', 'answersText', 'answersExtension'].filter(key => req.body[key] !== undefined).map(key => [key, req.body[key]]));
  const next = { ...existing, ...patch, updatedAt: new Date().toISOString() }; validate(next); next.examKey = next.examKey.trim();
  if (rows.some(row => row._id !== existing._id && row.examKey === next.examKey)) return res.status(409).json({ error: 'Tên bộ đề đã tồn tại.' });
  rows[rows.indexOf(existing)] = next; await save(); res.json(next);
}));
localRouter.delete('/:id', route(async (req, res) => { const index = rows.findIndex(row => row._id === req.params.id); if (index < 0) return res.status(404).json({ error: 'Not found' }); rows.splice(index, 1); await save(); res.status(204).end(); }));
