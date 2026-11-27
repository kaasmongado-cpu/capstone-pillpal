export type OfflineOcrProgressCb = (status: string, percent?: number) => void;

export interface OfflineOcrResult {
  text: string;
  engine: "mlkit-offline" | "tesseract-offline";
}

async function preprocessImageForTesseract(dataUrl: string): Promise<string> {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return dataUrl;
  }

  return new Promise((resolve) => {
    const img = new window.Image();
    img.crossOrigin = "anonymous";
    img.onerror = () => resolve(dataUrl);
    img.onload = () => {
      const targetMax = 1800;
      const targetMin = 1000;
      let width = img.width;
      let height = img.height;
      const longest = Math.max(width, height);

      if (longest > targetMax) {
        const ratio = targetMax / longest;
        width = Math.round(width * ratio);
        height = Math.round(height * ratio);
      } else if (longest < targetMin && longest > 0) {
        const ratio = Math.min(2, targetMin / longest);
        width = Math.round(width * ratio);
        height = Math.round(height * ratio);
      }

      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        resolve(dataUrl);
        return;
      }

      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, width, height);
      ctx.drawImage(img, 0, 0, width, height);

      try {
        const imageData = ctx.getImageData(0, 0, width, height);
        const data = imageData.data;
        const contrast = 1.45;
        const intercept = 128 * (1 - contrast);

        for (let i = 0; i < data.length; i += 4) {
          const gray =
            0.2126 * data[i]! + 0.7152 * data[i + 1]! + 0.0722 * data[i + 2]!;
          const boosted = Math.max(
            0,
            Math.min(255, Math.round(gray * contrast + intercept)),
          );
          data[i] = boosted;
          data[i + 1] = boosted;
          data[i + 2] = boosted;
        }
        ctx.putImageData(imageData, 0, 0);
        resolve(canvas.toDataURL("image/png"));
      } catch {
        resolve(dataUrl);
      }
    };
    img.src = dataUrl;
  });
}

let cachedWorkerPromise: Promise<any> | null = null;
let activeProgressCb: OfflineOcrProgressCb | null = null;

function formatStatus(raw: string): string {
  const s = raw.toLowerCase();
  if (s.includes("loading tesseract core")) return "Loading local OCR engine...";
  if (s.includes("loading language")) return "Loading English OCR model...";
  if (s.includes("recognizing text")) return "Reading label locally (Tesseract)...";
  return "Running offline browser OCR...";
}

async function getOrCreateWorker() {
  if (!cachedWorkerPromise) {
    cachedWorkerPromise = (async () => {
      const { createWorker } = await import("tesseract.js");
      return createWorker("eng", 1, {
        logger: (msg) => {
          if (!activeProgressCb) return;
          const pct =
            typeof msg?.progress === "number"
              ? Math.max(0, Math.min(100, Math.round(msg.progress * 100)))
              : undefined;
          activeProgressCb(formatStatus(msg?.status || ""), pct);
        },
      });
    })().catch((err) => {
      cachedWorkerPromise = null;
      throw err;
    });
  }
  return cachedWorkerPromise;
}

/**
 * Mobile Web offline browser OCR via lazy-loaded Tesseract.js.
 * Works offline once the English language data caches in browser IndexedDB.
 */
export async function runOfflineOcr(
  imageUri: string,
  onProgress?: OfflineOcrProgressCb,
): Promise<OfflineOcrResult | null> {
  if (!imageUri) return null;
  activeProgressCb = onProgress || null;
  try {
    onProgress?.("Enhancing label contrast...", 10);
    const preprocessed = await preprocessImageForTesseract(imageUri);
    const worker = await getOrCreateWorker();
    const result = await worker.recognize(preprocessed, { rotateAuto: true });
    const raw = typeof result?.data?.text === "string" ? result.data.text : "";
    const cleaned = raw
      .replace(/[|¦~`_^]/g, " ")
      .replace(/[ \t]{2,}/g, " ")
      .replace(/\n{3,}/g, "\n\n")
      .trim();

    if (cleaned.length >= 3) {
      onProgress?.("Local OCR complete", 100);
      return {
        text: cleaned,
        engine: "tesseract-offline",
      };
    }
    return null;
  } catch {
    return null;
  } finally {
    activeProgressCb = null;
  }
}
