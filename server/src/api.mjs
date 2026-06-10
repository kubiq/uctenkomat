import express from "express";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import multer from "multer";
import { extractReceipt, SUPPORTED_MIME } from "./extract.mjs";
import { searchSubjects, createExpense, findOrCreateSubjectByIco } from "./fakturoid.mjs";
import { Receipt } from "./schema.mjs";

const MAX_UPLOAD_BYTES = 15 * 1024 * 1024; // 15 MB

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_UPLOAD_BYTES },
  fileFilter: (_req, file, cb) => {
    if (SUPPORTED_MIME.has(file.mimetype)) cb(null, true);
    else cb(new Error(`Unsupported file type: ${file.mimetype}`));
  },
});

/** Wrap async route handlers so rejections hit the error middleware. */
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

export function createApp() {
  const app = express();
  app.use(helmet());
  app.use(express.json({ limit: "1mb" }));

  // Health is public so the app's "test connection" works before a key is set.
  app.get("/api/health", (_req, res) => res.json({ ok: true }));

  // --- auth: shared-secret bearer key on everything below ------------------
  const API_KEY = process.env.APP_API_KEY;
  app.use("/api", (req, res, next) => {
    if (!API_KEY) return res.status(500).json({ error: "APP_API_KEY not configured on server" });
    const header = req.get("authorization") || "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : null;
    if (token !== API_KEY) return res.status(401).json({ error: "unauthorized" });
    next();
  });

  app.use("/api", rateLimit({ windowMs: 60_000, max: 60 }));

  // Parse a receipt image/PDF -> structured JSON. No Fakturoid side effects.
  app.post(
    "/api/receipts/parse",
    upload.single("file"),
    wrap(async (req, res) => {
      if (!req.file) return res.status(400).json({ error: "missing file field 'file'" });
      const receipt = await extractReceipt(req.file.buffer, req.file.mimetype);
      res.json(receipt);
    }),
  );

  // Supplier search for the review screen.
  app.get(
    "/api/subjects",
    wrap(async (req, res) => {
      const subjects = await searchSubjects(req.query.query ?? "");
      res.json(subjects);
    }),
  );

  // Create the expense (naklad) from a (reviewed) receipt + chosen supplier.
  app.post(
    "/api/expenses",
    wrap(async (req, res) => {
      const { receipt, subjectId, vatRate } = req.body || {};
      const parsed = Receipt.safeParse(receipt);
      if (!parsed.success) {
        return res.status(422).json({ error: "invalid receipt", details: parsed.error.issues });
      }

      // Use an explicit subjectId if given, otherwise resolve by IČO (create if missing).
      let subject;
      if (subjectId) {
        subject = { id: Number(subjectId), matchedBy: "explicit" };
      } else {
        subject = await findOrCreateSubjectByIco({
          ico: parsed.data.supplier_ico,
          dic: parsed.data.supplier_dic,
          name: parsed.data.supplier_name || parsed.data.merchant,
        });
      }

      const expense = await createExpense(parsed.data, { subjectId: subject.id, vatRate });
      const slug = process.env.FAKTUROID_ACCOUNT_SLUG;
      res.json({
        id: expense.id,
        number: expense.number ?? null,
        url: slug ? `https://app.fakturoid.cz/${slug}/expenses/${expense.id}` : null,
        subject,
      });
    }),
  );

  // Error middleware (multer + thrown errors).
  // eslint-disable-next-line no-unused-vars
  app.use((err, _req, res, _next) => {
    const status = err.code === "LIMIT_FILE_SIZE" ? 413 : 400;
    console.error("[api]", err.message);
    res.status(status).json({ error: err.message });
  });

  return app;
}
