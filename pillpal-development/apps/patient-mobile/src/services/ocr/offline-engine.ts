import { NativeModules, Platform } from "react-native";

export type OfflineOcrProgressCb = (status: string, percent?: number) => void;

export interface OfflineOcrResult {
  text: string;
  engine: "mlkit-offline" | "tesseract-offline";
}

interface MlKitLine {
  text?: string;
  frame?: { top?: number; left?: number };
}

interface MlKitBlock {
  text?: string;
  frame?: { top?: number; left?: number };
  lines?: MlKitLine[];
}

function reconstructOrderedText(result: any): string {
  if (typeof result === "string") {
    return result.trim();
  }

  // Sort ML Kit text blocks & lines top-to-bottom so multi-drug prescription slips
  // preserve separate lines for parseMultipleMedications()
  const blocks: MlKitBlock[] = Array.isArray(result?.blocks) ? result.blocks : [];
  if (blocks.length > 0) {
    const allLines: { text: string; top: number; left: number }[] = [];

    for (const block of blocks) {
      const lines = Array.isArray(block.lines) ? block.lines : [];
      if (lines.length > 0) {
        for (const line of lines) {
          const t = (line.text || "").trim();
          if (!t) continue;
          allLines.push({
            text: t,
            top: line.frame?.top ?? block.frame?.top ?? 0,
            left: line.frame?.left ?? block.frame?.left ?? 0,
          });
        }
      } else if (block.text?.trim()) {
        allLines.push({
          text: block.text.trim(),
          top: block.frame?.top ?? 0,
          left: block.frame?.left ?? 0,
        });
      }
    }

    if (allLines.length > 0) {
      allLines.sort((a, b) => {
        if (Math.abs(a.top - b.top) > 12) return a.top - b.top;
        return a.left - b.left;
      });
      return allLines.map((l) => l.text).join("\n").trim();
    }
  }

  return typeof result?.text === "string" ? result.text.trim() : "";
}

/**
 * Native Android / iOS on-device Google ML Kit OCR (100% offline, ~100ms, $0).
 * Safely returns null inside Expo Go where custom native ML Kit modules are not linked.
 */
export async function runOfflineOcr(
  imageUri: string,
  onProgress?: OfflineOcrProgressCb,
): Promise<OfflineOcrResult | null> {
  if (Platform.OS === "web" || !imageUri) return null;

  // Guard against Expo Go (native ML Kit module only exists in EAS Dev Build / APK)
  const nativeModule =
    NativeModules.TextRecognition || NativeModules.RNMLKitTextRecognition;
  if (!nativeModule) {
    return null;
  }

  try {
    onProgress?.("Reading label on-device (ML Kit)...", 35);

    let rawResult: any = null;
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const mod = require("@react-native-ml-kit/text-recognition");
      const TextRecognition = mod?.default || mod;
      if (TextRecognition && typeof TextRecognition.recognize === "function") {
        rawResult = await TextRecognition.recognize(imageUri);
      }
    } catch {
      // Fallback directly to linked NativeModule if package wrapper isn't resolved
      if (typeof nativeModule.recognize === "function") {
        rawResult = await nativeModule.recognize(imageUri);
      }
    }

    const extracted = reconstructOrderedText(rawResult);
    if (extracted.length >= 3) {
      onProgress?.("On-device scan complete", 100);
      return {
        text: extracted,
        engine: "mlkit-offline",
      };
    }

    return null;
  } catch {
    return null;
  }
}
