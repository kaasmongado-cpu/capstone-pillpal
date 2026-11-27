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
  Platform,
  Alert,
} from "react-native";
import { useRouter } from "expo-router";
import { CameraView, useCameraPermissions } from "expo-camera";
import * as ImagePicker from "expo-image-picker";
import {
  X,
  Zap,
  ZapOff,
  Scan,
  FileText,
  Pill,
  Keyboard,
  ImagePlus,
} from "lucide-react-native";
import * as Haptics from "expo-haptics";
import { type ExtractedPrescription } from "@/services/ocr/parser";
import {
  recognizeTextFromImage,
  setPendingCapturedPhotoBase64,
  compressWebImageFile,
} from "@/services/ocr/recognizer";

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");

export default function OcrScannerModal() {
  const router = useRouter();
  const [permission, requestPermission] = useCameraPermissions();
  const [torch, setTorch] = useState(false);
  const [mode, setMode] = useState<"BOTTLE" | "SLIP">("BOTTLE");
  const [processing, setProcessing] = useState(false);
  const [processingStatus, setProcessingStatus] = useState("Reading Photo...");
  const [manualTextVisible, setManualTextVisible] = useState(false);
  const [manualInput, setManualInput] = useState("");
  const cameraRef = useRef<any>(null);

  function openReview(
    rawText: string,
    imageUri?: string,
    ocrEngine: string = "manual-fallback",
    structuredMedications?: ExtractedPrescription[],
    errorCode?: string | null,
  ) {
    const hasStructured = Boolean(structuredMedications && structuredMedications.length > 0);
    router.push({
      pathname: "/modal/ocr-review",
      params: {
        medications: hasStructured ? JSON.stringify(structuredMedications) : "",
        rawText,
        imageUri: imageUri || "",
        ocrEngine,
        errorCode: errorCode || "",
      },
    });
  }

  async function processPhotoForOcr(uri: string, base64?: string, mimeType = "image/jpeg") {
    setProcessing(true);
    setProcessingStatus("Scanning medication photo...");
    try {
      if (base64) {
        setPendingCapturedPhotoBase64(base64);
      }
      const ocrResult = await recognizeTextFromImage(
        uri,
        base64,
        mimeType,
        (status, percent) => {
          setProcessingStatus(
            typeof percent === "number" ? `${status} (${percent}%)` : status,
          );
        },
      );
      openReview(
        ocrResult.text || "",
        uri,
        ocrResult.engine,
        ocrResult.medications,
        ocrResult.errorCode,
      );
    } catch {
      openReview("", uri, "manual-fallback", undefined, "offline");
    } finally {
      setProcessing(false);
      setProcessingStatus("Reading Photo...");
    }
  }

  async function handleCapture() {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {});
    setProcessing(true);
    setProcessingStatus("Capturing label photo...");

    let capturedUri: string | undefined;
    let extractedText: string | null = null;
    let structuredMeds: ExtractedPrescription[] | undefined;
    let engine = "manual-fallback";
    let errorCode: string | null = null;

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
          const ocrResult = await recognizeTextFromImage(
            capturedUri,
            photo?.base64,
            "image/jpeg",
            (status, percent) => {
              setProcessingStatus(
                typeof percent === "number" ? `${status} (${percent}%)` : status,
              );
            },
          );
          extractedText = ocrResult.text;
          structuredMeds = ocrResult.medications;
          engine = ocrResult.engine;
          errorCode = ocrResult.errorCode || null;
        }
      }
    } catch {
      // Fall back to honest manual review without injecting fake medication names
    } finally {
      setProcessing(false);
      setProcessingStatus("Reading Photo...");
    }

    openReview(extractedText || "", capturedUri, engine, structuredMeds, errorCode);
  }

  async function handleUploadPhoto() {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});

    // Web: native file dialog with client-side JPEG compression
    if (Platform.OS === "web" && typeof document !== "undefined") {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = "image/*";
      input.onchange = async () => {
        const file = input.files?.[0];
        if (!file) return;
        setProcessing(true);
        try {
          const { uri, base64, mimeType } = await compressWebImageFile(file);
          await processPhotoForOcr(uri, base64, mimeType);
        } catch (err: any) {
          setProcessing(false);
          globalThis.alert?.(err?.message || "Could not read selected image.");
        }
      };
      input.click();
      return;
    }

    // Native iOS / Android: Expo Image Picker
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        Alert.alert(
          "Photo Library Permission Needed",
          "Please allow PILLPAL to access your photo library to upload prescription or bottle photos.",
        );
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsEditing: false,
        quality: 0.72,
        base64: true,
      });

      if (result.canceled || !result.assets?.[0]) {
        return;
      }

      const asset = result.assets[0];
      const mimeType = asset.mimeType || "image/jpeg";
      await processPhotoForOcr(asset.uri, asset.base64 ?? undefined, mimeType);
    } catch (err: any) {
      Alert.alert("Upload Error", err?.message || "Unable to open photo library.");
    }
  }

  function simulatePreset(sample: string) {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setPendingCapturedPhotoBase64(null);
    openReview(sample, undefined, "sample-preset");
  }

  const manualTextModal = (
    <Modal visible={manualTextVisible} animationType="slide" transparent>
      <View style={styles.modalBackdrop}>
        <View style={styles.modalSheet}>
          <Text style={styles.modalTitle}>Type or Paste Medicine Label Text</Text>
          <Text style={styles.modalHint}>
            Example: &quot;BIOGESIC Paracetamol 500mg 1 tab q4h prn&quot; or &quot;AM0XIC1LLIN 500mg
            TID&quot;
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
  );

  if (!permission) {
    return <View style={styles.permissionContainer} />;
  }

  if (!permission.granted) {
    return (
      <View style={styles.permissionContainer}>
        <Scan size={48} color="#10b981" />
        <Text style={styles.permTitle}>Scan or Upload Medication Label</Text>
        <Text style={styles.permDesc}>
          Use your camera to scan live, or upload an existing photo of your prescription slip or
          medicine bottle from your device.
        </Text>

        {/* Primary Upload Photo Option (works even without camera access!) */}
        <TouchableOpacity
          style={[styles.grantBtn, styles.uploadPrimaryBtn]}
          onPress={() => void handleUploadPhoto()}
          disabled={processing}
        >
          {processing ? (
            <ActivityIndicator color="#ffffff" size="small" />
          ) : (
            <ImagePlus size={18} color="#ffffff" />
          )}
          <Text style={styles.grantBtnText}>
            {processing ? processingStatus : "Upload Prescription / Bottle Photo"}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.grantBtn, styles.cameraSecondaryBtn]}
          onPress={requestPermission}
        >
          <Text style={[styles.grantBtnText, { color: "#047857" }]}>Grant Camera Permission</Text>
        </TouchableOpacity>

        {/* Manual Entry & Quick Presets */}
        <View style={{ marginTop: 26, alignItems: "center", gap: 8 }}>
          <Text style={{ fontSize: 11, fontWeight: "700", color: "#64748b" }}>
            OR TYPE LABEL TEXT / TEST PRESETS
          </Text>
          <View
            style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 8 }}
          >
            <TouchableOpacity
              style={[styles.grantBtn, { backgroundColor: "#047857", paddingVertical: 9 }]}
              onPress={() => setManualTextVisible(true)}
            >
              <Text style={styles.grantBtnText}>Type / Paste Label Text</Text>
            </TouchableOpacity>
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
          </View>
        </View>

        <TouchableOpacity style={styles.closeTextBtn} onPress={() => router.back()}>
          <Text style={styles.closeTextBtnText}>Cancel</Text>
        </TouchableOpacity>

        {manualTextModal}
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <CameraView
        ref={cameraRef}
        style={StyleSheet.absoluteFillObject}
        enableTorch={torch}
        facing="back"
      >
        <View style={styles.overlay}>
          {/* Top Bar Controls */}
          <View style={styles.topBar}>
            <TouchableOpacity style={styles.topIconBtn} onPress={() => router.back()}>
              <X size={22} color="#ffffff" />
            </TouchableOpacity>

            <View style={styles.topBadge}>
              <Text style={styles.topBadgeText}>MEDICATION OCR SCANNER</Text>
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
                {processing
                  ? processingStatus
                  : mode === "BOTTLE"
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

            {/* Upload Gallery + Shutter Capture + Type Text Controls */}
            <View style={styles.captureControlsRow}>
              <TouchableOpacity
                style={styles.sideActionBtn}
                onPress={() => void handleUploadPhoto()}
                disabled={processing}
              >
                <ImagePlus size={22} color="#ffffff" />
                <Text style={styles.sideActionLabel}>Upload</Text>
              </TouchableOpacity>

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

              <TouchableOpacity
                style={styles.sideActionBtn}
                onPress={() => setManualTextVisible(true)}
                disabled={processing}
              >
                <Keyboard size={22} color="#ffffff" />
                <Text style={styles.sideActionLabel}>Type</Text>
              </TouchableOpacity>
            </View>

            {/* Sample Presets */}
            <View style={styles.presetRow}>
              <TouchableOpacity
                style={styles.presetBtn}
                onPress={() => simulatePreset("Amoxicillin 500 mg capsules. TID pc for 7 days.")}
              >
                <Text style={styles.presetBtnText}>Demo: Amoxicillin</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.presetBtn}
                onPress={() => simulatePreset("Cetirizine 10mg tablet once daily bedtime")}
              >
                <Text style={styles.presetBtnText}>Demo: Cetirizine</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </CameraView>

      {manualTextModal}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#000000" },
  permissionContainer: {
    flex: 1,
    backgroundColor: "#f8fafc",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  permTitle: { fontSize: 18, fontWeight: "900", color: "#0f172a", marginTop: 14, textAlign: "center" },
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
  uploadPrimaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    width: "100%",
    maxWidth: 320,
    marginBottom: 10,
  },
  cameraSecondaryBtn: {
    backgroundColor: "#ecfdf5",
    borderWidth: 1,
    borderColor: "#a7f3d0",
    width: "100%",
    maxWidth: 320,
    alignItems: "center",
  },
  grantBtnText: { color: "#ffffff", fontSize: 14, fontWeight: "800" },
  closeTextBtn: { marginTop: 18 },
  closeTextBtnText: { color: "#64748b", fontSize: 13, fontWeight: "700" },
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "space-between",
    alignItems: "center",
    paddingTop: 54,
    paddingBottom: 32,
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
  topBadgeText: { color: "#a7f3d0", fontSize: 10, fontWeight: "800", letterSpacing: 0.5 },
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
  bottleReticle: { height: SCREEN_HEIGHT * 0.4 },
  slipReticle: { height: SCREEN_HEIGHT * 0.46 },
  corner: { position: "absolute", width: 26, height: 26, borderColor: "#10b981" },
  topLeft: { top: -2, left: -2, borderTopWidth: 4, borderLeftWidth: 4, borderTopLeftRadius: 18 },
  topRight: { top: -2, right: -2, borderTopWidth: 4, borderRightWidth: 4, borderTopRightRadius: 18 },
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
  reticleHintText: { color: "#ffffff", fontSize: 11, fontWeight: "700", textAlign: "center" },
  bottomArea: { width: "100%", alignItems: "center", gap: 14 },
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
  modeTabActive: { backgroundColor: "#10b981" },
  modeText: { fontSize: 12, fontWeight: "700", color: "#ffffff" },
  modeTextActive: { color: "#064e3b", fontWeight: "800" },
  captureControlsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 28,
  },
  sideActionBtn: {
    width: 60,
    height: 60,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.18)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.3)",
    alignItems: "center",
    justifyContent: "center",
    gap: 3,
  },
  sideActionLabel: { color: "#ffffff", fontSize: 10, fontWeight: "800" },
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
  },
  presetBtn: {
    backgroundColor: "rgba(255,255,255,0.16)",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
  },
  presetBtnText: { color: "#ffffff", fontSize: 10, fontWeight: "700" },
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
  modalTitle: { fontSize: 16, fontWeight: "900", color: "#0f172a" },
  modalHint: { fontSize: 11, color: "#64748b", marginTop: 4, marginBottom: 12 },
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
