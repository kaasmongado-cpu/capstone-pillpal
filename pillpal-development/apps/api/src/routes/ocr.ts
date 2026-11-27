import type { IncomingMessage, ServerResponse } from "node:http";
import os from "node:os";
import path from "node:path";
import { getAuthenticatedUser } from "../services/auth.js";

const MAX_BODY_BYTES = 12 * 1024 * 1024; // ~8-9 MB raw image encoded as base64

class PayloadTooLargeError extends Error {
  constructor() {
    super("Image is too large. Please upload a photo under 8 MB.");
    this.name = "PayloadTooLargeError";
  }
}

export interface StructuredOcrMedication {
  genericName: string;
  brandName?: string | undefined;
  dosage: string;
  form: string;
  frequency: string;
  scheduleTimes: string[];
  durationDays?: number | null | undefined;
  instructions: string;
  drugClass?: string | undefined;
  usedFor?: string | undefined;
  keyReminder?: string | undefined;
  prescribedFor?: string | undefined;
  confidenceScore: number;
}

async function isAuthenticatedRequest(req: IncomingMessage): Promise<boolean> {
  const user = await getAuthenticatedUser(req);
  return Boolean(user);
}

function readJsonBody(req: IncomingMessage): Promise<any> {
  return new Promise((resolve, reject) => {
    let body = "";
    let exceeded = false;
    req.on("data", (chunk) => {
      if (exceeded) return;
      body += chunk.toString();
      if (body.length > MAX_BODY_BYTES) {
        exceeded = true;
        reject(new PayloadTooLargeError());
      }
    });
    req.on("end", () => {
      if (exceeded) return;
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (err) {
        reject(err);
      }
    });
    req.on("error", reject);
  });
}

function sendJson(res: ServerResponse, status: number, data: any) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(data));
}

const ALLOWED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
]);

function normalizeScheduleTime(raw: string): string | null {
  const trimmed = raw.trim().toUpperCase();
  const match12 = trimmed.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/);
  if (match12) {
    const hh = String(Math.min(12, Math.max(1, Number(match12[1])))).padStart(2, "0");
    const mm = match12[2];
    return `${hh}:${mm} ${match12[3]}`;
  }
  const match24 = trimmed.match(/^(\d{1,2}):(\d{2})$/);
  if (match24) {
    const h = Number(match24[1]);
    const mm = match24[2];
    if (h >= 0 && h <= 23) {
      const period = h >= 12 ? "PM" : "AM";
      const h12 = h % 12 === 0 ? 12 : h % 12;
      return `${String(h12).padStart(2, "0")}:${mm} ${period}`;
    }
  }
  return null;
}

function defaultTimesForFrequency(frequency: string): string[] {
  const lower = frequency.toLowerCase();
  if (/4\s*times|four\s*times|qid|every\s*6\s*h|q6h/.test(lower)) {
    return ["08:00 AM", "12:00 PM", "04:00 PM", "08:00 PM"];
  }
  if (/3\s*times|three\s*times|tid|every\s*8\s*h|q8h/.test(lower)) {
    return ["08:00 AM", "02:00 PM", "08:00 PM"];
  }
  if (/2\s*times|2x|twice|bid|every\s*12\s*h|q12h/.test(lower)) {
    return ["08:00 AM", "08:00 PM"];
  }
  if (/bedtime|night|hs/.test(lower)) {
    return ["09:00 PM"];
  }
  return ["08:00 AM"];
}

function sanitizeMedications(rawList: unknown): StructuredOcrMedication[] {
  if (!Array.isArray(rawList)) return [];

  const cleaned: StructuredOcrMedication[] = [];
  for (const item of rawList) {
    if (!item || typeof item !== "object") continue;
    const rec = item as Record<string, unknown>;
    const genericName =
      typeof rec.genericName === "string" ? rec.genericName.trim() : "";
    const brandName =
      typeof rec.brandName === "string" && rec.brandName.trim()
        ? rec.brandName.trim()
        : undefined;

    if (!genericName && !brandName) continue;

    // Never fabricate a dosage if the label didn't clearly show one
    const dosage = typeof rec.dosage === "string" ? rec.dosage.trim() : "";
    const form =
      typeof rec.form === "string" && rec.form.trim() ? rec.form.trim() : "Tablet";
    const frequency =
      typeof rec.frequency === "string" && rec.frequency.trim()
        ? rec.frequency.trim()
        : "Once daily";

    const rawTimes = Array.isArray(rec.scheduleTimes) ? rec.scheduleTimes : [];
    const normalizedTimes = Array.from(
      new Set(
        rawTimes
          .filter((t): t is string => typeof t === "string")
          .map(normalizeScheduleTime)
          .filter((t): t is string => Boolean(t)),
      ),
    );

    const scheduleTimes =
      normalizedTimes.length > 0
        ? normalizedTimes
        : defaultTimesForFrequency(frequency);

    const parsedDuration =
      typeof rec.durationDays === "number" &&
      Number.isFinite(rec.durationDays) &&
      rec.durationDays > 0 &&
      rec.durationDays <= 365
        ? Math.round(rec.durationDays)
        : null;

    const instructions =
      typeof rec.instructions === "string" ? rec.instructions.trim() : "";
    const drugClass =
      typeof rec.drugClass === "string" && rec.drugClass.trim()
        ? rec.drugClass.trim()
        : undefined;
    const usedFor =
      typeof rec.usedFor === "string" && rec.usedFor.trim()
        ? rec.usedFor.trim()
        : undefined;
    const keyReminder =
      typeof rec.keyReminder === "string" && rec.keyReminder.trim()
        ? rec.keyReminder.trim()
        : undefined;
    const prescribedFor =
      typeof rec.prescribedFor === "string" && rec.prescribedFor.trim()
        ? rec.prescribedFor.trim()
        : undefined;

    const rawConfidence =
      typeof rec.confidenceScore === "number" && Number.isFinite(rec.confidenceScore)
        ? rec.confidenceScore
        : 0.85;
    const confidenceScore = Math.max(0.1, Math.min(1, rawConfidence));

    cleaned.push({
      genericName: genericName || brandName || "",
      brandName:
        brandName && brandName.toLowerCase() !== genericName.toLowerCase()
          ? brandName
          : undefined,
      dosage,
      form,
      frequency,
      scheduleTimes,
      durationDays: parsedDuration,
      instructions,
      drugClass,
      usedFor,
      keyReminder,
      prescribedFor,
      confidenceScore,
    });
  }

  return cleaned;
}

const GEMINI_RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    rawText: {
      type: "STRING",
      description:
        "Clean plain-text transcription of all visible medication names, strengths, quantities, frequencies, and doctor instructions from the photo.",
    },
    prescriberName: {
      type: "STRING",
      description: "Doctor or clinic name if visible on the prescription slip, otherwise empty string.",
    },
    medications: {
      type: "ARRAY",
      description:
        "List of every distinct medication found on the label or prescription slip. Return an empty array if no medication text is readable.",
      items: {
        type: "OBJECT",
        properties: {
          genericName: {
            type: "STRING",
            description:
              "Standard generic drug name (e.g. Paracetamol, Amoxicillin, Azithromycin, Levocetirizine, Cefalexin).",
          },
          brandName: {
            type: "STRING",
            description: "Brand name printed on the box/prescription if present, otherwise empty string.",
          },
          dosage: {
            type: "STRING",
            description:
              "Exact strength printed (e.g. '500 mg', '200 mg/5 mL', '2.5 mg/5 mL'). Leave as empty string '' if strength is not visible — NEVER guess.",
          },
          form: {
            type: "STRING",
            description:
              "Dosage form such as Tablet, Capsule, Syrup, Suspension, Inhaler, Drops, Sachet, or Cream.",
          },
          frequency: {
            type: "STRING",
            description:
              "Human-readable frequency matching the label (e.g. 'Twice daily', 'Three times daily', 'Once daily at bedtime').",
          },
          scheduleTimes: {
            type: "ARRAY",
            items: { type: "STRING" },
            description:
              "Suggested daily intake slots in 12-hour format like '08:00 AM', '08:00 PM' matching the frequency.",
          },
          durationDays: {
            type: "INTEGER",
            description:
              "Treatment duration in days if stated (e.g. 'x 7 days' -> 7, 'x 2 weeks' -> 14), or 0 if not specified.",
          },
          instructions: {
            type: "STRING",
            description:
              "Concise patient instructions (e.g. 'Give 10 mL twice daily for 7 days').",
          },
          drugClass: {
            type: "STRING",
            description:
              "Short therapeutic category (e.g. 'Antibiotic', 'Antihistamine (Allergy)', 'Pain & Fever Reliever', 'Antihypertensive', 'Mucolytic (Cough)').",
          },
          usedFor: {
            type: "STRING",
            description:
              "1 concise plain-English sentence explaining what this medicine is commonly used to treat or relieve (educational info only, never diagnosing the patient).",
          },
          keyReminder: {
            type: "STRING",
            description:
              "1 brief practical safety reminder for the patient (e.g. 'Finish the full prescribed course.' or 'Take after meals.').",
          },
          prescribedFor: {
            type: "STRING",
            description:
              "Specific reason written explicitly on the prescription slip if present (e.g. 'for fever', 'for toothache'), otherwise empty string.",
          },
          confidenceScore: {
            type: "NUMBER",
            description: "Extraction confidence between 0.0 and 1.0.",
          },
        },
        required: [
          "genericName",
          "dosage",
          "form",
          "frequency",
          "scheduleTimes",
          "instructions",
          "confidenceScore",
        ],
      },
    },
  },
  required: ["rawText", "medications"],
};

const EXTRACTION_PROMPT = [
  "You are a clinical pharmacy OCR assistant for a Philippine university health center (Caraga State University).",
  "Carefully examine this photo of a medicine box, blister pack, bottle label, or handwritten/printed doctor's prescription slip.",
  "Extract EVERY distinct medication visible in the photo (a prescription slip may list 1 to 5 medications).",
  "Return ONLY valid JSON with keys: rawText (string), prescriberName (string), medications (array of { genericName, brandName, dosage, form, frequency, scheduleTimes, durationDays, instructions, drugClass, usedFor, keyReminder, prescribedFor, confidenceScore }).",
  "Rules:",
  "1. Map common Philippine brand names to their generic names (e.g. Biogesic -> Paracetamol, Alaxan -> Ibuprofen + Paracetamol, Ponstan/Dolfenal -> Mefenamic Acid, Allerzet -> Levocetirizine, Zenith -> Azithromycin, Neozep/Bioflu -> Phenylephrine + Chlorphenamine + Paracetamol, Solmux -> Carbocisteine).",
  "2. Interpret Philippine medical abbreviations accurately: OD (Once daily), BID / 2x a day (Twice daily), TID / 3x a day (Three times daily), QID / 4x a day (Four times daily), HS (At bedtime), PRN (As needed), pc (after meals), ac (before meals), x 7 days (7), x 2 weeks (14).",
  "3. For each identified drug, include concise educational drugClass, usedFor (what the medicine is commonly used to treat/relieve), and keyReminder. If the slip explicitly states a reason like 'for fever' or 'for cough', set prescribedFor.",
  "4. CRITICAL SAFETY RULE: NEVER guess or invent a dosage strength if it is not clearly legible in the photo — return '' for dosage when unreadable.",
  "5. If the image does not show any readable medication or prescription, return rawText: '' and medications: [].",
].join("\n");

async function callGeminiVision(
  model: string,
  apiKey: string,
  mimeType: string,
  cleanBase64: string,
  useStrictSchema: boolean,
): Promise<Response> {
  const generationConfig: Record<string, unknown> = {
    temperature: 0.1,
    responseMimeType: "application/json",
  };
  if (useStrictSchema) {
    generationConfig.responseSchema = GEMINI_RESPONSE_SCHEMA;
  }

  return fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: EXTRACTION_PROMPT },
              {
                inline_data: {
                  mime_type: mimeType,
                  data: cleanBase64,
                },
              },
            ],
          },
        ],
        generationConfig,
      }),
    },
  );
}

// Reusable server-side Tesseract.js worker (zero-cost fallback for both mobile & web clients)
let serverTesseractWorkerPromise: Promise<any> | null = null;

async function recognizeWithServerTesseract(cleanBase64: string): Promise<string | null> {
  try {
    if (!serverTesseractWorkerPromise) {
      serverTesseractWorkerPromise = (async () => {
        const { createWorker } = await import("tesseract.js");
        const cachePath = path.join(os.tmpdir(), "pillpal-tesseract-cache");
        return createWorker("eng", 1, { cachePath });
      })().catch((err) => {
        serverTesseractWorkerPromise = null;
        throw err;
      });
    }

    const worker = await serverTesseractWorkerPromise;
    const buffer = Buffer.from(cleanBase64, "base64");
    const result = await worker.recognize(buffer);
    const raw = typeof result?.data?.text === "string" ? result.data.text : "";
    const cleaned = raw
      .replace(/[|¦~`_^]/g, " ")
      .replace(/[ \t]{2,}/g, " ")
      .replace(/\n{3,}/g, "\n\n")
      .trim();

    return cleaned.length >= 3 ? cleaned : null;
  } catch (err) {
    console.error("[OCR] Server-side Tesseract.js fallback error:", err);
    return null;
  }
}

export async function ocrRoute(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const pathname = new URL(req.url || "/", "http://localhost:4000").pathname;
  if (req.method !== "POST" || pathname !== "/ocr/extract") {
    sendJson(res, 404, { message: "OCR endpoint not found" });
    return;
  }

  const authorized = await isAuthenticatedRequest(req);
  if (!authorized) {
    sendJson(res, 401, { message: "Unauthorized" });
    return;
  }

  try {
    const body = await readJsonBody(req);
    const { imageBase64, mimeType } = body;

    if (!imageBase64 || typeof imageBase64 !== "string") {
      sendJson(res, 400, { message: "imageBase64 is required" });
      return;
    }

    // Auto-detect MIME from data URL if present, otherwise use provided mimeType or default to image/jpeg
    const dataUrlMatch = imageBase64.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,/);
    const rawMime = (dataUrlMatch?.[1] || mimeType || "image/jpeg").toLowerCase();
    const resolvedMime =
      rawMime === "image/jpg"
        ? "image/jpeg"
        : ALLOWED_MIME_TYPES.has(rawMime)
          ? rawMime
          : "image/jpeg";

    const cleanBase64 = imageBase64.replace(/^data:image\/[a-zA-Z0-9.+-]+;base64,/, "");
    const geminiKey = process.env.GEMINI_API_KEY?.trim();

    let geminiErrorCode: string | null = geminiKey ? null : "missing_key";

    // 1. Try Gemini Vision Structured OCR when GEMINI_API_KEY is configured
    if (geminiKey) {
      const primaryModel = process.env.GEMINI_OCR_MODEL?.trim() || "gemini-2.5-flash";
      const fallbackModels = primaryModel === "gemini-2.0-flash" ? [] : ["gemini-2.0-flash"];
      const modelsToTry = [primaryModel, ...fallbackModels];

      let geminiRes: Response | null = null;
      let usedModel = primaryModel;
      let lastErrorStatus = 0;

      for (const model of modelsToTry) {
        usedModel = model;
        let attempt = await callGeminiVision(model, geminiKey, resolvedMime, cleanBase64, true);

        // If strict responseSchema returns 400, retry once with JSON-only generationConfig
        if (attempt.status === 400) {
          const errText = await attempt.text().catch(() => "");
          console.warn(
            `[OCR] Gemini "${model}" returned 400 with strict schema, retrying relaxed JSON:`,
            errText.slice(0, 300),
          );
          attempt = await callGeminiVision(model, geminiKey, resolvedMime, cleanBase64, false);
        }

        if (attempt.ok) {
          geminiRes = attempt;
          break;
        }

        lastErrorStatus = attempt.status;
        const lastErrorText = await attempt.text().catch(() => "");
        console.error(
          `[OCR] Gemini model "${model}" failed (${attempt.status}):`,
          lastErrorText.slice(0, 500),
        );

        if (attempt.status !== 404 && attempt.status !== 503 && attempt.status !== 500) {
          break;
        }
      }

      if (geminiRes) {
        const payload = await geminiRes.json();
        const rawCandidateText =
          payload?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "";

        if (rawCandidateText) {
          let extractedText = "";
          let medications: StructuredOcrMedication[] = [];
          let prescriberName: string | null = null;

          try {
            const cleanedJson = rawCandidateText
              .replace(/^```json\s*/i, "")
              .replace(/^```\s*/i, "")
              .replace(/\s*```$/, "");
            const parsed = JSON.parse(cleanedJson);
            extractedText = typeof parsed?.rawText === "string" ? parsed.rawText.trim() : "";
            prescriberName =
              typeof parsed?.prescriberName === "string" && parsed.prescriberName.trim()
                ? parsed.prescriberName.trim()
                : null;
            medications = sanitizeMedications(parsed?.medications);
          } catch (parseErr) {
            console.warn("[OCR] Structured JSON parse fallback to raw text:", parseErr);
            extractedText = rawCandidateText;
          }

          if (extractedText || medications.length > 0) {
            sendJson(res, 200, {
              configured: true,
              text: extractedText || null,
              medications,
              prescriberName,
              engine: "gemini-vision",
              model: usedModel,
              errorCode: null,
            });
            return;
          }
        }
        geminiErrorCode = "unreadable_image";
      } else {
        geminiErrorCode =
          lastErrorStatus === 429
            ? "quota_exceeded"
            : lastErrorStatus === 401 || lastErrorStatus === 403
              ? "invalid_key"
              : "model_error";
      }
    }

    // 2. Automatic Free Server-Side Tesseract.js Fallback (works for BOTH patient-mobile & patient-web!)
    const tesseractText = await recognizeWithServerTesseract(cleanBase64);
    if (tesseractText) {
      sendJson(res, 200, {
        configured: Boolean(geminiKey),
        text: tesseractText,
        medications: [],
        prescriberName: null,
        engine: "tesseract-server",
        errorCode: null,
      });
      return;
    }

    // 3. Neither Vision nor Tesseract extracted text
    sendJson(res, 200, {
      configured: Boolean(geminiKey),
      text: null,
      medications: [],
      prescriberName: null,
      engine: geminiKey ? "cloud-error" : "none",
      errorCode: geminiErrorCode || "unreadable_image",
    });
  } catch (err: any) {
    if (err instanceof PayloadTooLargeError) {
      sendJson(res, 413, { message: err.message });
      return;
    }
    console.error("POST /ocr/extract error:", err);
    sendJson(res, 500, { message: err.message || "OCR extraction failed" });
  }
}
