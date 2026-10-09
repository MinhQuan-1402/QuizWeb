import express from "express";
import multer from "multer";
import { ExamBundle } from "../models/ExamBundle.js";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 80 * 1024 * 1024 },
});

export const examsRouter = express.Router();

async function createBundle(bundle) {
  const examKey = String(bundle.examKey).trim();
  if (await ExamBundle.exists({ examKey })) {
    throw Object.assign(new Error(`Bộ đề “${examKey}” đã có trong thư viện. Vui lòng thêm bộ đề khác.`), { status: 409 });
  }
  try {
    return await ExamBundle.create({ ...bundle, examKey });
  } catch (error) {
    // The unique index also protects simultaneous uploads of the same name.
    if (error.code === 11000) {
      throw Object.assign(new Error(`Bộ đề “${examKey}” đã có trong thư viện. Vui lòng thêm bộ đề khác.`), { status: 409 });
    }
    throw error;
  }
}

function countQuestionBlocks(text) {
  if (!text || typeof text !== "string") return 0;
  const matches = text.match(/=+\s*Q\d+\.webp\s*=+/gi);
  return matches ? matches.length : 0;
}

examsRouter.get("/", async (_req, res, next) => {
  try {
    const rows = await ExamBundle.find()
      .select("examKey updatedAt createdAt questionsText")
      .sort({ examKey: 1 })
      .lean();
    const out = rows.map(({ questionsText, ...rest }) => ({
      ...rest,
      questionCount: countQuestionBlocks(questionsText),
    }));
    res.json(out);
  } catch (e) {
    next(e);
  }
});

examsRouter.get("/:id", async (req, res, next) => {
  try {
    const doc = await ExamBundle.findById(req.params.id).lean();
    if (!doc) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    res.json(doc);
  } catch (e) {
    next(e);
  }
});

examsRouter.post("/", express.json({ limit: "50mb" }), async (req, res, next) => {
  try {
    const { examKey, questionsText, answersText, answersExtension } = req.body ?? {};
    if (!examKey || !questionsText || !answersText) {
      res.status(400).json({ error: "examKey, questionsText, answersText are required" });
      return;
    }
    const ext = answersExtension === "txt" ? "txt" : "csv";
    const doc = await createBundle({ examKey, questionsText, answersText, answersExtension: ext });
    res.status(201).json(doc);
  } catch (e) {
    next(e);
  }
});

examsRouter.post(
  "/upload",
  upload.fields([
    { name: "questions", maxCount: 1 },
    { name: "answers", maxCount: 1 },
  ]),
  async (req, res, next) => {
    try {
      const examKeyRaw = req.body?.examKey;
      const qFile = req.files?.questions?.[0];
      const aFile = req.files?.answers?.[0];
      if (!qFile || !aFile) {
        res.status(400).json({ error: "Multipart fields 'questions' and 'answers' are required" });
        return;
      }
      const examKey = (examKeyRaw || qFile.originalname.replace(/\.[^.]+$/, "")).trim();
      const ext = aFile.originalname.toLowerCase().endsWith(".txt") ? "txt" : "csv";
      const doc = await createBundle({
          examKey,
          questionsText: qFile.buffer.toString("utf8"),
          answersText: aFile.buffer.toString("utf8"),
          answersExtension: ext,
        });
      res.status(201).json(doc);
    } catch (e) {
      next(e);
    }
  }
);

examsRouter.put("/:id", express.json({ limit: "50mb" }), async (req, res, next) => {
  try {
    const { examKey, questionsText, answersText, answersExtension } = req.body ?? {};
    const patch = {};
    if (examKey !== undefined) patch.examKey = String(examKey).trim();
    if (questionsText !== undefined) patch.questionsText = questionsText;
    if (answersText !== undefined) patch.answersText = answersText;
    if (answersExtension !== undefined) patch.answersExtension = answersExtension === "txt" ? "txt" : "csv";
    const doc = await ExamBundle.findByIdAndUpdate(req.params.id, patch, {
      new: true,
      runValidators: true,
    }).lean();
    if (!doc) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    res.json(doc);
  } catch (e) {
    next(e);
  }
});

examsRouter.delete("/:id", async (req, res, next) => {
  try {
    const r = await ExamBundle.findByIdAndDelete(req.params.id);
    if (!r) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    res.status(204).send();
  } catch (e) {
    next(e);
  }
});
