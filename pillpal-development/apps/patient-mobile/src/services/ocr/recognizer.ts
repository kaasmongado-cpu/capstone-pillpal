import { NativeModules, Platform } from "react-native";
import { requireOptionalNativeModule } from "expo";
import NetInfo from "@react-native-community/netinfo";
import { fetchWithAuth } from "../api/client";
import { getAuthToken } from "../auth/session";
import type { ExtractedPrescription } from "./parser";
import { runOfflineOcr, type OfflineOcrProgressCb } from "./offline-engine";

export type OcrEngineType =
  | "mlkit-offline"
  | "tesseract-offline"
  | "cloud-vision"
  | "tesseract-server"
  | "manual-fallback";

export interface OcrRecognitionResult {
  text: string | null;
  medications?: ExtractedPrescription[];
  engine: OcrEngineType;
  errorCode?: string | null;
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

async function isDeviceOnline(): Promise<boolean> {
  if (Platform.OS === "web") {
    if (typeof navigator !== "undefined" && typeof navigator.onLine === "boolean") {
      return navigator.onLine;
    }
    return true;
  }
  try {
    const state = await NetInfo.fetch();
    return Boolean(state.isConnected !== false && state.isInternetReachable !== false);
  } catch {
    return true;
  }
}

/**
 * Downscales a browser File object on web (max 1600px, JPEG 0.8) so large photos
 * upload fast and never trip the API body limit.
 */
export async function compressWebImageFile(
  file: File,
): Promise<{ uri: string; base64: string; mimeType: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read selected image file."));
    reader.onload = () => {
      const dataUrl = typeof reader.result === "string" ? reader.result : "";
      if (!dataUrl) {
        reject(new Error("Empty image data."));
        return;
      }

      const img = new window.Image();
      img.onerror = () => {
        const b64 = dataUrl.replace(/^data:image\/[a-zA-Z0-9.+-]+;base64,/, "");
        resolve({ uri: dataUrl, base64: b64, mimeType: file.type || "image/jpeg" });
      };
      img.onload = () => {
        const maxDim = 1600;
        let width = img.width;
        let height = img.height;
        if (width > maxDim || height > maxDim) {
          const ratio = Math.min(maxDim / width, maxDim / height);
          width = Math.round(width * ratio);
          height = Math.round(height * ratio);
        }
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          const b64 = dataUrl.replace(/^data:image\/[a-zA-Z0-9.+-]+;base64,/, "");
          resolve({ uri: dataUrl, base64: b64, mimeType: file.type || "image/jpeg" });
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        const compressedUrl = canvas.toDataURL("image/jpeg", 0.82);
        const base64 = compressedUrl.replace(/^data:image\/jpeg;base64,/, "");
        resolve({ uri: compressedUrl, base64, mimeType: "image/jpeg" });
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
  });
}

async function tryBackendOcr(
  base64: string,
  mimeType: string,
  onProgress?: OfflineOcrProgressCb,
): Promise<{ result: OcrRecognitionResult | null; errorCode: string | null }> {
  try {
    const token = await getAuthToken();
    if (!token) {
      return { result: null, errorCode: "unauthenticated" };
    }

    onProgress?.("Reading with Cloud Vision AI...", 25);
    const res = await fetchWithAuth("/ocr/extract", {
      method: "POST",
      body: JSON.stringify({ imageBase64: base64, mimeType }),
    });

    if (res.ok) {
      const data = await res.json();
      const structuredMeds = Array.isArray(data?.medications)
        ? (data.medications as ExtractedPrescription[])
        : [];
      if (data?.text || structuredMeds.length > 0) {
        return {
          result: {
            text: data?.text || null,
            medications: structuredMeds.length > 0 ? structuredMeds : undefined,
            engine:
              data?.engine === "tesseract-server" ? "tesseract-server" : "cloud-vision",
            errorCode: null,
          },
          errorCode: null,
        };
      }
      return {
        result: null,
        errorCode:
          data?.errorCode || (data?.configured === false ? "missing_key" : "unreadable_image"),
      };
    }

    return {
      result: null,
      errorCode: res.status === 413 ? "image_too_large" : "model_error",
    };
  } catch {
    return { result: null, errorCode: "offline" };
  }
}

/**
 * Recognizes text from a captured or uploaded medication photo URI / base64.
 *
 * Native APK / EAS Build:
 *   1. On-device Google ML Kit (100% offline, ~100ms, $0)
 *   2. Cloud Vision / Server Tesseract fallback when online (e.g. cursive doctor handwriting or Expo Go)
 *   3. Graceful manual fallback with saved fullscreen photo
 *
 * Mobile Web:
 *   1. Cloud Vision / Server Tesseract when online & authenticated
 *   2. Local browser Tesseract.js (works offline once cached in IndexedDB)
 *   3. Graceful manual fallback
 */
export async function recognizeTextFromImage(
  imageUri: string,
  base64?: string,
  mimeType: string = "image/jpeg",
  onProgress?: OfflineOcrProgressCb,
): Promise<OcrRecognitionResult> {
  const online = await isDeviceOnline();

  // NATIVE iOS / ANDROID: Privacy-first & instant-offline ML Kit first
  if (Platform.OS !== "web") {
    if (imageUri) {
      const mlkitResult = await runOfflineOcr(imageUri, onProgress);
      if (mlkitResult && mlkitResult.text.trim().length >= 3) {
        return {
          text: mlkitResult.text,
          engine: mlkitResult.engine,
          errorCode: null,
        };
      }
    }

    if (!online) {
      return {
        text: null,
        medications: undefined,
        engine: "manual-fallback",
        errorCode: "offline",
      };
    }

    if (base64) {
      const { result, errorCode } = await tryBackendOcr(base64, mimeType, onProgress);
      if (result) return result;
      return {
        text: null,
        medications: undefined,
        engine: "manual-fallback",
        errorCode,
      };
    }

    return {
      text: null,
      medications: undefined,
      engine: "manual-fallback",
      errorCode: "unreadable_image",
    };
  }

  // MOBILE WEB: Try Cloud Vision when online, then fall back cleanly to local browser Tesseract.js
  let lastErrorCode: string | null = online ? null : "offline";
  if (online && base64) {
    const { result, errorCode } = await tryBackendOcr(base64, mimeType, onProgress);
    if (result) return result;
    lastErrorCode = errorCode;
  }

  // Run local browser Tesseract.js (works offline once cached!)
  if (imageUri) {
    const webOffline = await runOfflineOcr(imageUri, onProgress);
    if (webOffline && webOffline.text.trim().length >= 3) {
      return {
        text: webOffline.text,
        engine: webOffline.engine,
        errorCode: null,
      };
    }
  }

  return {
    text: null,
    medications: undefined,
    engine: "manual-fallback",
    errorCode: lastErrorCode || "unreadable_image",
  };
}

/**
 * Persist captured/uploaded bottle or Rx photo inside private app storage
 * so patients can review the original medication photo offline anytime.
 */
export async function savePrescriptionPhotoLocally(
  tempUri: string | undefined,
  rxId: string,
): Promise<string | null> {
  const b64 = consumePendingCapturedPhotoBase64();
  if (!tempUri && !b64) return null;

  if (Platform.OS === "web") {
    if (b64) {
      return b64.startsWith("data:") ? b64 : `data:image/jpeg;base64,${b64}`;
    }
    return tempUri || null;
  }

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

    // Only delete if it came from a temporary cache path (don't delete gallery source!)
    if (tempUri.toLowerCase().includes("cache")) {
      await fs.deleteAsync(tempUri, { idempotent: true }).catch(() => {});
    }
    return destUri;
  } catch {
    return tempUri;
  }
}

/**
 * Delete temporary camera photo when the user discards/retakes a scan.
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

  if (!tempUri.toLowerCase().includes("cache")) return;
  try {
    const fs = getExponentFileSystem();
    if (fs?.deleteAsync) {
      await fs.deleteAsync(tempUri, { idempotent: true });
    }
  } catch {
    // ignore cleanup errors
  }
}
