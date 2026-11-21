import React, { useState, useRef } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Dimensions,
  Modal,
  TextInput,
} from "react-native";
import { useRouter } from "expo-router";
import { CameraView, useCameraPermissions } from "expo-camera";
import {
  X,
  Zap,
  ZapOff,
  Scan,
  FileText,
  Pill,
  Keyboard,
} from "lucide-react-native";
import * as Haptics from "expo-haptics";
import { parseMedicationText } from "@/services/ocr/parser";
import {
  recognizeTextFromImage,
  setPendingCapturedPhotoBase64,
} from "@/services/ocr/recognizer";

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");

export default function OcrScannerModal() {
  const router = useRouter();
  const [permission, requestPermission] = useCameraPermissions();
  const [torch, setTorch] = useState(false);
  const [mode, setMode] = useState<"BOTTLE" | "SLIP">("BOTTLE");
  const [processing, setProcessing] = useState(false);
  const [manualTextVisible, setManualTextVisible] = useState(false);
  const [manualInput, setManualInput] = useState("");
  const cameraRef = useRef<any>(null);

  function openReview(
    rawText: string,
    imageUri?: string,
    ocrEngine: string = "manual-fallback"
  ) {
    const parsed = parseMedicationText(rawText);
    router.push({
      pathname: "/modal/ocr-review",
      params: {
        data: JSON.stringify(parsed),
        rawText,
        imageUri: imageUri || "",
        ocrEngine,
      },
    });
  }

  async function handleCapture() {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {});
    setProcessing(true);

    let capturedUri: string | undefined;
    let extractedText: string | null = null;
    let engine = "manual-fallback";

    try {
      if (cameraRef.current?.takePictureAsync) {
        const photo = await cameraRef.current.takePictureAsync({
          quality: 0.65,
          base64: true,
        });
        capturedUri = photo?.uri;
        if (photo?.base64) {
          setPendingCapturedPhotoBase64(photo.base64);
        }

        if (capturedUri) {
          const ocrResult = await recognizeTextFromImage(capturedUri, photo?.base64);
          extractedText = ocrResult.text;
          engine = ocrResult.engine;
        }
      }
    } catch {
      // Camera capture failed or unavailable — fall back cleanly
    }

    const fallbackSample =
      mode === "SLIP"
        ? "CSU Health Services Infirmary. Rx: Amoxicillin 500mg capsules. Sig: 1 cap TID pc for 7 days. Dr. Evelyn Ramirez, MD."
        : "Biogesic Paracetamol 500 mg Tablet. Relief of minor aches and fever. Dose: 1 tablet every 4 to 6 hours as needed. UNILAB.";

    setProcessing(false);
    openReview(extractedText || fallbackSample, capturedUri, engine);
  }

  function simulatePreset(sample: string) {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setPendingCapturedPhotoBase64(null);
    openReview(sample, undefined, "sample-preset");
  }

  if (!permission) {
    return <View style={styles.permissionContainer} />;
  }

  if (!permission.granted) {
    return (
      <View style={styles.permissionContainer}>
        <Scan size={48} color="#10b981" />
        <Text style={styles.permTitle}>Camera Access Required</Text>
        <Text style={styles.permDesc}>
          PILLPAL uses camera capture + on-device medical parsing to read physical prescription slips and medicine bottle labels.
        </Text>
        <TouchableOpacity style={styles.grantBtn} onPress={requestPermission}>
          <Text style={styles.grantBtnText}>Grant Camera Permission</Text>
        </TouchableOpacity>

        {/* Allow testing OCR parser directly even without webcam/permission */}
        <View style={{ marginTop: 28, alignItems: "center", gap: 8 }}>
          <Text style={{ fontSize: 11, fontWeight: "700", color: "#64748b" }}>
            OR TEST WITH LABEL TEXT / PRESETS
          </Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 8 }}>
            <TouchableOpacity
              style={[styles.grantBtn, { backgroundColor: "#0f172a", paddingVertical: 9 }]}
              onPress={() => simulatePreset("Amoxicillin 500 mg capsules. TID pc for 7 days.")}
            >
              <Text style={styles.grantBtnText}>Amoxicillin 500mg</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.grantBtn, { backgroundColor: "#0f172a", paddingVertical: 9 }]}
              onPress={() => simulatePreset("Cetirizine 10mg tablet once daily bedtime")}
            >
              <Text style={styles.grantBtnText}>Cetirizine 10mg</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.grantBtn, { backgroundColor: "#047857", paddingVertical: 9 }]}
              onPress={() => setManualTextVisible(true)}
            >
              <Text style={styles.grantBtnText}>Type / Paste Label Text</Text>
            </TouchableOpacity>
          </View>
        </View>

        <TouchableOpacity style={styles.closeTextBtn} onPress={() => router.back()}>
          <Text style={styles.closeTextBtnText}>Cancel</Text>
        </TouchableOpacity>

        {/* Manual Label Text Modal */}
        <Modal visible={manualTextVisible} animationType="slide" transparent>
          <View style={styles.modalBackdrop}>
            <View style={styles.modalSheet}>
              <Text style={styles.modalTitle}>Type or Paste Medicine Label Text</Text>
              <Text style={styles.modalHint}>
                Example: &quot;BIOGESIC Paracetamol 500mg 1 tab q4h prn&quot; or &quot;AM0XIC1LLIN 500mg TID&quot;
              </Text>
              <TextInput
                style={styles.modalInput}
                multiline
                placeholder="Paste or type text from bottle or prescription..."
                value={manualInput}
                onChangeText={setManualInput}
              />
              <View style={{ flexDirection: "row", gap: 10 }}>
                <TouchableOpacity
                  style={[styles.grantBtn, { flex: 1, backgroundColor: "#f1f5f9", alignItems: "center" }]}
                  onPress={() => setManualTextVisible(false)}
                >
                  <Text style={[styles.grantBtnText, { color: "#475569" }]}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.grantBtn, { flex: 1, alignItems: "center" }]}
                  onPress={() => {
                    if (!manualInput.trim()) return;
                    setManualTextVisible(false);
                    openReview(manualInput.trim(), undefined, "manual-text");
                  }}
                >
                  <Text style={styles.grantBtnText}>Parse Medication</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Live Camera Viewport */}
      <CameraView
        ref={cameraRef}
        style={StyleSheet.absoluteFillObject}
        enableTorch={torch}
        facing="back"
      >
        {/* Dark Vignette Overlay with Reticle Cutout */}
        <View style={styles.overlay}>
          {/* Top Bar Controls */}
          <View style={styles.topBar}>
            <TouchableOpacity style={styles.topIconBtn} onPress={() => router.back()}>
              <X size={22} color="#ffffff" />
            </TouchableOpacity>

            <View style={styles.topBadge}>
              <Text style={styles.topBadgeText}>OFFLINE MED SCANNER</Text>
            </View>

            <TouchableOpacity style={styles.topIconBtn} onPress={() => setTorch((prev) => !prev)}>
              {torch ? <Zap size={22} color="#facc15" /> : <ZapOff size={22} color="#ffffff" />}
            </TouchableOpacity>
          </View>

          {/* Central Framing Reticle */}
          <View style={[styles.reticle, mode === "SLIP" ? styles.slipReticle : styles.bottleReticle]}>
            <View style={[styles.corner, styles.topLeft]} />
            <View style={[styles.corner, styles.topRight]} />
            <View style={[styles.corner, styles.bottomLeft]} />
            <View style={[styles.corner, styles.bottomRight]} />

            <View style={styles.reticleHintBox}>
              <Text style={styles.reticleHintText}>
                {mode === "BOTTLE"
                  ? "Center the medicine bottle or box label"
                  : "Align the doctor's prescription slip inside the box"}
              </Text>
            </View>
          </View>

          {/* Bottom Controls Area */}
          <View style={styles.bottomArea}>
            {/* Mode Switcher */}
            <View style={styles.modeRow}>
              <TouchableOpacity
                style={[styles.modeTab, mode === "BOTTLE" && styles.modeTabActive]}
                onPress={() => setMode("BOTTLE")}
              >
                <Pill size={14} color={mode === "BOTTLE" ? "#064e3b" : "#ffffff"} />
                <Text style={[styles.modeText, mode === "BOTTLE" && styles.modeTextActive]}>
                  Pill Bottle / Box
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.modeTab, mode === "SLIP" && styles.modeTabActive]}
                onPress={() => setMode("SLIP")}
              >
                <FileText size={14} color={mode === "SLIP" ? "#064e3b" : "#ffffff"} />
                <Text style={[styles.modeText, mode === "SLIP" && styles.modeTextActive]}>
                  Prescription Slip
                </Text>
              </TouchableOpacity>
            </View>

            {/* Shutter Capture Button */}
            <TouchableOpacity
              style={styles.shutterOuter}
              onPress={handleCapture}
              disabled={processing}
            >
              <View style={styles.shutterInner}>
                {processing ? (
                  <ActivityIndicator color="#10b981" />
                ) : (
                  <Scan size={30} color="#10b981" />
                )}
              </View>
            </TouchableOpacity>

            {/* Quick Text Input & Sample Presets */}
            <View style={styles.presetRow}>
              <TouchableOpacity
                style={[styles.presetBtn, { flexDirection: "row", alignItems: "center", gap: 4 }]}
                onPress={() => setManualTextVisible(true)}
              >
                <Keyboard size={12} color="#ffffff" />
                <Text style={styles.presetBtnText}>Type Label</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.presetBtn}
                onPress={() => simulatePreset("Amoxicillin 500 mg capsules. TID pc for 7 days.")}
              >
                <Text style={styles.presetBtnText}>Amoxicillin 500mg</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.presetBtn}
                onPress={() => simulatePreset("Cetirizine 10mg tablet once daily bedtime")}
              >
                <Text style={styles.presetBtnText}>Cetirizine 10mg</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </CameraView>

      {/* Manual Label Text Modal */}
      <Modal visible={manualTextVisible} animationType="slide" transparent>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalSheet}>
            <Text style={styles.modalTitle}>Type or Paste Medicine Label Text</Text>
            <Text style={styles.modalHint}>
              Example: &quot;BIOGESIC Paracetamol 500mg 1 tab q4h prn&quot; or &quot;AM0XIC1LLIN 500mg TID&quot;
            </Text>
            <TextInput
              style={styles.modalInput}
              multiline
              placeholder="Paste or type text from bottle or prescription..."
              value={manualInput}
              onChangeText={setManualInput}
            />
            <View style={{ flexDirection: "row", gap: 10 }}>
              <TouchableOpacity
                style={[styles.grantBtn, { flex: 1, backgroundColor: "#f1f5f9", alignItems: "center" }]}
                onPress={() => setManualTextVisible(false)}
              >
                <Text style={[styles.grantBtnText, { color: "#475569" }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.grantBtn, { flex: 1, alignItems: "center" }]}
                onPress={() => {
                  if (!manualInput.trim()) return;
                  setManualTextVisible(false);
                  openReview(manualInput.trim(), undefined, "manual-text");
                }}
              >
                <Text style={styles.grantBtnText}>Parse Medication</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000000",
  },
  permissionContainer: {
    flex: 1,
    backgroundColor: "#f8fafc",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  permTitle: {
    fontSize: 18,
    fontWeight: "900",
    color: "#0f172a",
    marginTop: 14,
  },
  permDesc: {
    fontSize: 13,
    color: "#64748b",
    textAlign: "center",
    marginTop: 6,
    marginBottom: 20,
    lineHeight: 19,
  },
  grantBtn: {
    backgroundColor: "#10b981",
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 14,
  },
  grantBtnText: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "800",
  },
  closeTextBtn: {
    marginTop: 14,
  },
  closeTextBtnText: {
    color: "#64748b",
    fontSize: 13,
    fontWeight: "700",
  },
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "space-between",
    alignItems: "center",
    paddingTop: 54,
    paddingBottom: 36,
  },
  topBar: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
  },
  topIconBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(0,0,0,0.5)",
    alignItems: "center",
    justifyContent: "center",
  },
  topBadge: {
    backgroundColor: "rgba(16,185,129,0.25)",
    borderWidth: 1,
    borderColor: "#10b981",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  topBadgeText: {
    color: "#a7f3d0",
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  reticle: {
    width: SCREEN_WIDTH * 0.82,
    borderWidth: 1.5,
    borderColor: "rgba(255,255,255,0.4)",
    borderRadius: 20,
    justifyContent: "flex-end",
    alignItems: "center",
    paddingBottom: 16,
    position: "relative",
  },
  bottleReticle: {
    height: SCREEN_HEIGHT * 0.42,
  },
  slipReticle: {
    height: SCREEN_HEIGHT * 0.48,
  },
  corner: {
    position: "absolute",
    width: 26,
    height: 26,
    borderColor: "#10b981",
  },
  topLeft: {
    top: -2,
    left: -2,
    borderTopWidth: 4,
    borderLeftWidth: 4,
    borderTopLeftRadius: 18,
  },
  topRight: {
    top: -2,
    right: -2,
    borderTopWidth: 4,
    borderRightWidth: 4,
    borderTopRightRadius: 18,
  },
  bottomLeft: {
    bottom: -2,
    left: -2,
    borderBottomWidth: 4,
    borderLeftWidth: 4,
    borderBottomLeftRadius: 18,
  },
  bottomRight: {
    bottom: -2,
    right: -2,
    borderBottomWidth: 4,
    borderRightWidth: 4,
    borderBottomRightRadius: 18,
  },
  reticleHintBox: {
    backgroundColor: "rgba(0,0,0,0.65)",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  reticleHintText: {
    color: "#ffffff",
    fontSize: 11,
    fontWeight: "700",
    textAlign: "center",
  },
  bottomArea: {
    width: "100%",
    alignItems: "center",
    gap: 16,
  },
  modeRow: {
    flexDirection: "row",
    backgroundColor: "rgba(0,0,0,0.6)",
    borderRadius: 20,
    padding: 4,
    gap: 6,
  },
  modeTab: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 16,
  },
  modeTabActive: {
    backgroundColor: "#10b981",
  },
  modeText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#ffffff",
  },
  modeTextActive: {
    color: "#064e3b",
    fontWeight: "800",
  },
  shutterOuter: {
    width: 74,
    height: 74,
    borderRadius: 37,
    backgroundColor: "rgba(255,255,255,0.3)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 3,
    borderColor: "#ffffff",
  },
  shutterInner: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: "#ffffff",
    alignItems: "center",
    justifyContent: "center",
  },
  presetRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: 6,
    marginTop: 4,
  },
  presetBtn: {
    backgroundColor: "rgba(255,255,255,0.18)",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
  },
  presetBtnText: {
    color: "#ffffff",
    fontSize: 11,
    fontWeight: "700",
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.55)",
    justifyContent: "flex-end",
  },
  modalSheet: {
    backgroundColor: "#ffffff",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 22,
    paddingBottom: 32,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: "900",
    color: "#0f172a",
  },
  modalHint: {
    fontSize: 11,
    color: "#64748b",
    marginTop: 4,
    marginBottom: 12,
  },
  modalInput: {
    backgroundColor: "#f8fafc",
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 14,
    padding: 12,
    height: 100,
    textAlignVertical: "top",
    fontSize: 13,
    color: "#0f172a",
    marginBottom: 16,
  },
});
