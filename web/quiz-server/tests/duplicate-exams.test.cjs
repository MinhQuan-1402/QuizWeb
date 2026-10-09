// Run: node --experimental-vm-modules --test tests/duplicate-exams.test.cjs
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const vm = require('node:vm');
const express = require('express');

async function loadRouter(file, overrides = {}) {
  const filename = path.resolve(__dirname, '../src', file);
  const mod = new vm.SourceTextModule(await fs.readFile(filename, 'utf8'), {
    initializeImportMeta(meta) { meta.url = pathToFileURL(filename).href; },
  });
  await mod.link(async specifier => {
    const exports = overrides[specifier] ?? { ...require(specifier), default: require(specifier) };
    const names = Object.keys(exports);
    return new vm.SyntheticModule(names, function () {
      for (const name of names) this.setExport(name, exports[name]);
    });
  });
  await mod.evaluate();
  return mod.namespace;
}

async function withServer(router, run) {
  const app = express();
  app.use('/api/exams', router);
  app.use((error, _req, res, _next) => res.status(error.status || 500).json({ error: error.message }));
  const server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  try { await run(`http://127.0.0.1:${server.address().port}/api/exams`); }
  finally { await new Promise(resolve => server.close(resolve)); }
}

const bundle = { examKey: 'Sample', questionsText: '===== Q1.webp =====\nQuestion: 1 Test\nA. One\nB. Two', answersText: 'Q1: A', answersExtension: 'txt' };
const jsonPost = (url, value) => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(value) });
function upload(url, name, answers = 'Q1: B') {
  const form = new FormData();
  if (name !== undefined) form.set('examKey', name);
  form.set('questions', new Blob([bundle.questionsText]), 'Sample.txt');
  form.set('answers', new Blob([answers]), 'answers.txt');
  return fetch(`${url}/upload`, { method: 'POST', body: form });
}

test('Local JSON: rejects duplicate JSON and uploads without overwriting stored answers', async () => {
  let stored = '[]';
  const memoryFs = { readFile: async () => stored, mkdir: async () => {}, writeFile: async (_p, data) => { stored = data; }, rename: async () => {} };
  const mod = await loadRouter('localStore.js', { 'node:fs/promises': { default: memoryFs } });
  await mod.initializeLocalStore();
  await withServer(mod.localRouter, async url => {
    assert.equal((await jsonPost(url, bundle)).status, 201);
    const original = stored;
    for (const request of [() => jsonPost(url, { ...bundle, examKey: ' Sample ', answersText: 'Q1: B' }), () => upload(url, ' Sample '), () => upload(url)]) {
      const response = await request();
      assert.equal(response.status, 409);
      assert.match((await response.json()).error, /đã có.*thêm bộ đề khác/);
      assert.equal(stored, original);
    }
    assert.equal((await upload(url, 'Different')).status, 201);
    assert.equal(JSON.parse(stored).length, 2);
    const responses = await Promise.all([jsonPost(url, { ...bundle, examKey: 'Concurrent' }), jsonPost(url, { ...bundle, examKey: 'Concurrent' })]);
    assert.deepEqual(responses.map(r => r.status).sort(), [201, 409]);
  });
});

test('Mongo routes: reject duplicates and translate a unique index race into 409', async () => {
  const docs = new Map();
  const model = {
    exists: async ({ examKey }) => examKey !== 'Race' && docs.has(examKey),
    create: async doc => {
      if (doc.examKey === 'Race') throw Object.assign(new Error('duplicate key'), { code: 11000 });
      docs.set(doc.examKey, doc); return doc;
    },
  };
  const mod = await loadRouter('routes/exams.js', { '../models/ExamBundle.js': { ExamBundle: model } });
  await withServer(mod.examsRouter, async url => {
    assert.equal((await jsonPost(url, bundle)).status, 201);
    for (const request of [() => jsonPost(url, { ...bundle, examKey: ' Sample ' }), () => upload(url, 'Sample'), () => jsonPost(url, { ...bundle, examKey: 'Race' })]) {
      const response = await request();
      assert.equal(response.status, 409);
      assert.match((await response.json()).error, /đã có.*thêm bộ đề khác/);
    }
    assert.equal(docs.get('Sample').answersText, 'Q1: A');
    assert.equal((await upload(url, 'Different')).status, 201);
  });
});
