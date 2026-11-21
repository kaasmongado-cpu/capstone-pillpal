import type { IncomingMessage, ServerResponse } from "node:http";
import { supabase } from "@pillpal/auth";

async function isAuthenticatedRequest(req: IncomingMessage): Promise<boolean> {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) return false;
  const token = authHeader.replace("Bearer ", "").trim();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser(token);
  return Boolean(!error && user);
}

function readJsonBody(req: IncomingMessage): Promise<any> {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk.toString();
      if (body.length > 10 * 1024 * 1024) {
        reject(new Error("Payload too large"));
      }
    });
    req.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (err) {
        reject(err);
      }
    });
  });
}

function sendJson(res: ServerResponse, status: number, data: any) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(data));
}

export async function ocrRoute(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (req.method !== "POST" || req.url !== "/ocr/extract") {
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
    const { imageBase64, mimeType = "image/jpeg" } = body;

    if (!imageBase64 || typeof imageBase64 !== "string") {
      sendJson(res, 400, { message: "imageBase64 is required" });
      return;
    }

    const geminiKey = process.env.GEMINI_API_KEY;
    if (!geminiKey) {
      // Gracefully inform client that cloud Vision fallback is unconfigured so on-device/manual fallback takes over
      sendJson(res, 200, {
        configured: false,
        text: null,
        engine: "none",
      });
      return;
    }

    const cleanBase64 = imageBase64.replace(/^data:image\/\w+;base64,/, "");
    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  text: "Transcribe all visible medication names, strengths (mg/ml), dosage forms, frequencies, and doctor instructions from this medicine label or prescription slip as plain text.",
                },
                {
                  inline_data: {
                    mime_type: mimeType,
                    data: cleanBase64,
                  },
                },
              ],
            },
          ],
        }),
      }
    );

    if (!geminiRes.ok) {
      sendJson(res, 200, {
        configured: true,
        text: null,
        engine: "cloud-error",
      });
      return;
    }

    const payload = await geminiRes.json();
    const extractedText =
      payload?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || null;

    sendJson(res, 200, {
      configured: true,
      text: extractedText,
      engine: "gemini-vision",
    });
  } catch (err: any) {
    console.error("POST /ocr/extract error:", err);
    sendJson(res, 500, { message: err.message || "OCR extraction failed" });
  }
}

