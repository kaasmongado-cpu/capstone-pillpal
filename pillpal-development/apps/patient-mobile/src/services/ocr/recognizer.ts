import { NativeModules, Platform } from "react-native";
import { requireOptionalNativeModule } from "expo";
import { fetchWithAuth } from "../api/client";
import { getAuthToken } from "../auth/session";

export type OcrEngineType = "mlkit-offline" | "cloud-vision" | "manual-fallback";

export interface OcrRecognitionResult {
  text: string | null;
  engine: OcrEngineType;
}

// Temporary in-memory handoff for large web base64/blob photos between scanner & review modal
let pendingCapturedPhotoBase64: string | null = null;

export function setPendingCapturedPhotoBase64(b64: string | null): void {
  pendingCapturedPhotoBase64 = b64;
}

export function consumePendingCapturedPhotoBase64(): string | null {
  const val = pendingCapturedPhotoBase64;
  pendingCapturedPhotoBase64 = null;
  return val;
}

function getExponentFileSystem(): any {
  if (Platform.OS === "web") return null;
  return (
    requireOptionalNativeModule("ExponentFileSystem") ||
    NativeModules.ExponentFileSystem ||
    null
  );
}

/**
 * Recognizes text from a captured medication photo URI / base64.
 * Priority:
 * 1. On-device native ML Kit module (available in EAS Dev Build / APK, 100% offline)
 * 2. Optional Cloud Vision fallback endpoint (`POST /ocr/extract`) if authenticated & online
 * 3. Graceful fallback so user can inspect captured photo & enter/edit text manually
 */
export async function recognizeTextFromImage(
  imageUri: string,
  base64?: string
): Promise<OcrRecognitionResult> {
  // 1. Attempt On-Device Native ML Kit (via NativeModules to remain 100% Expo Go & Web safe)
  if (Platform.OS !== "web") {
    try {
      const mlkitModule =
        NativeModules.RNMLKitTextRecognition || NativeModules.TextRecognition;
      if (mlkitModule && typeof mlkitModule.recognize === "function") {
        const result = await mlkitModule.recognize(imageUri);
        const extracted = typeof result === "string" ? result : result?.text;
        if (extracted && extracted.trim().length > 0) {
          return { text: extracted.trim(), engine: "mlkit-offline" };
        }
      }
    } catch {
      // Native ML Kit not linked in Expo Go — continue to cloud/fallback
    }
  }

  // 2. Attempt Backend Vision OCR Endpoint when authenticated & base64 available
  if (base64) {
    try {
      const token = await getAuthToken();
      if (token) {
        const res = await fetchWithAuth("/ocr/extract", {
          method: "POST",
          body: JSON.stringify({ imageBase64: base64 }),
        });
        if (res.ok) {
          const data = await res.json();
          if (data?.text) {
            return { text: data.text, engine: "cloud-vision" };
          }
        }
      }
    } catch {
      // Offline or API unreachable — fall back cleanly
    }
  }

  // 3. Fallback for Expo Go / Offline Browser Preview
  return { text: null, engine: "manual-fallback" };
}

/**
 * Option B: Persist captured bottle/Rx photo inside private app storage
 * so patients can review the original medication photo offline anytime.
 */
export async function savePrescriptionPhotoLocally(
  tempUri: string | undefined,
  rxId: string
): Promise<string | null> {
  const b64 = consumePendingCapturedPhotoBase64();
  if (!tempUri && !b64) return null;

  // Web Preview fallback: persist compact data URI if available
  if (Platform.OS === "web") {
    if (b64) {
      return b64.startsWith("data:") ? b64 : `data:image/jpeg;base64,${b64}`;
    }
    return tempUri || null;
  }

  // Native iOS / Android: copy from temp cache to persistent documentDirectory/prescriptions/
  if (!tempUri) return null;
  const fs = getExponentFileSystem();
  if (!fs || !fs.documentDirectory) {
    return tempUri;
  }

  try {
    const baseDir = fs.documentDirectory.replace(/\/*$/, "") + "/";
    const targetDir = `${baseDir}prescriptions/`;
    await fs.makeDirectoryAsync(targetDir, { intermediates: true });

    const destUri = `${targetDir}${rxId}.jpg`;
    await fs.copyAsync({ from: tempUri, to: destUri });

    // Remove the temporary camera cache file now that it's safely stored
    await fs.deleteAsync(tempUri, { idempotent: true }).catch(() => {});
    return destUri;
  } catch {
    return tempUri;
  }
}

/**
 * Delete temporary photo when the user discards/retakes a scan.
 */
export async function deleteTempPhoto(tempUri?: string | null): Promise<void> {
  setPendingCapturedPhotoBase64(null);
  if (!tempUri) return;

  if (Platform.OS === "web") {
    if (tempUri.startsWith("blob:")) {
      try {
        URL.revokeObjectURL(tempUri);
      } catch {
        // ignore
      }
    }
    return;
  }

  try {
    const fs = getExponentFileSystem();
    if (fs?.deleteAsync) {
      await fs.deleteAsync(tempUri, { idempotent: true });
    }
  } catch {
    // ignore cleanup errors
  }
}
