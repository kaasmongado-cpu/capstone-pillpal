import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Alert,
  Platform,
  Image,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
  CheckCircle2,
  X,
  Pill,
  Clock,
  Calendar,
  ShieldCheck,
  Sparkles,
  RefreshCw,
} from "lucide-react-native";
import * as Haptics from "expo-haptics";
import { ExtractedPrescription, parseMedicationText } from "@/services/ocr/parser";
import {
  savePrescriptionPhotoLocally,
  deleteTempPhoto,
} from "@/services/ocr/recognizer";
import { saveLocalPrescription } from "@/services/db/database";
import { schedulePrescriptionAlarms } from "@/services/notifications/alarms";
import { getCachedUser } from "@/services/auth/session";

export default function OcrReviewModal() {
  const router = useRouter();
  const { data, rawText: initialRawText, imageUri, ocrEngine } =
    useLocalSearchParams<{
      data?: string;
      rawText?: string;
      imageUri?: string;
      ocrEngine?: string;
    }>();

  const initial: ExtractedPrescription = data
    ? JSON.parse(data)
    : {
        genericName: "Amoxicillin",
        dosage: "500 mg",
        form: "Capsule",
        frequency: "Three times daily",
        scheduleTimes: ["08:00 AM", "02:00 PM", "08:00 PM"],
        instructions: "Take after meals. Complete full course.",
        confidenceScore: 0.9,
      };

  const [name, setName] = useState(initial.genericName);
  const [dosage, setDosage] = useState(initial.dosage);
  const [form, setForm] = useState(initial.form);
  const [frequency, setFrequency] = useState(initial.frequency);
  const [instructions, setInstructions] = useState(initial.instructions);
  const [scheduleTimes, setScheduleTimes] = useState<string[]>(initial.scheduleTimes);
  const [confidenceScore, setConfidenceScore] = useState(initial.confidenceScore || 0.85);
  const [rawText, setRawText] = useState(initialRawText || "");
  const [saving, setSaving] = useState(false);

  function handleReparse() {
    if (!rawText.trim()) return;
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    const reparsed = parseMedicationText(rawText);
    setName(reparsed.genericName);
    setDosage(reparsed.dosage);
    setForm(reparsed.form);
    setFrequency(reparsed.frequency);
    setInstructions(reparsed.instructions);
    setScheduleTimes(reparsed.scheduleTimes);
    setConfidenceScore(reparsed.confidenceScore);
  }

  async function handleDiscard() {
    await deleteTempPhoto(imageUri);
    router.back();
  }

  async function handleConfirm() {
    setSaving(true);
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});

    try {
      const user = await getCachedUser();
      const newRxId = `rx_ocr_${Date.now()}`;

      // Option B: Copy captured photo from temp cache to persistent app storage
      const persistedImageUri = await savePrescriptionPhotoLocally(imageUri, newRxId);

      const newRx = {
        id: newRxId,
        patient_id: user?.id || "local_patient",
        doctor_name: "CSU Health Infirmary (Scanned)",
        name: name.trim(),
        dosage: dosage.trim(),
        form: form.trim(),
        instructions: instructions.trim(),
        frequency: frequency.trim(),
        schedule_times: scheduleTimes,
        start_date: new Date().toISOString(),
        status: "ACTIVE",
        is_local_draft: 1,
        image_uri: persistedImageUri,
      };

      // 1. Save to local SQLite / storage (0ms latency, works offline)
      await saveLocalPrescription(newRx);

      // 2. Schedule native phone notification alarms (works in airplane mode)
      await schedulePrescriptionAlarms(newRx);

      if (Platform.OS === "web") {
        router.replace("/(tabs)");
      } else {
        Alert.alert(
          "Medication Regimen Saved",
          `${newRx.name} (${newRx.dosage}) has been added to your daily schedule${
            persistedImageUri ? " with your scanned photo saved locally" : ""
          } and phone intake alarms have been set.`,
          [
            {
              text: "View Schedule",
              onPress: () => {
                router.dismissAll();
                router.replace("/(tabs)");
              },
            },
          ]
        );
      }
    } catch (err: any) {
      Alert.alert("Error Saving", err.message || "Could not save prescription.");
    } finally {
      setSaving(false);
    }
  }

  const engineLabel =
    ocrEngine === "mlkit-offline"
      ? "On-Device ML Kit"
      : ocrEngine === "cloud-vision"
        ? "Vision OCR"
        : "Fuzzy Lexicon";

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.confidenceBadge}>
          <Sparkles size={14} color="#059669" />
          <Text style={styles.confidenceText}>
            {engineLabel} • {Math.round(confidenceScore * 100)}% Match
          </Text>
        </View>

        <TouchableOpacity style={styles.closeBtn} onPress={handleDiscard}>
          <X size={20} color="#64748b" />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>Verify Scanned Medication</Text>
        <Text style={styles.subtitle}>
          Review the extracted details below. Your scanned photo will be saved privately inside the app for offline reference.
        </Text>

        {/* Captured Photo Preview Thumbnail */}
        {Boolean(imageUri) && (
          <View style={styles.photoPreviewCard}>
            <Image source={{ uri: imageUri }} style={styles.photoThumb} resizeMode="cover" />
            <View style={{ flex: 1 }}>
              <Text style={styles.photoLabel}>Captured Label Photo</Text>
              <Text style={styles.photoHint}>
                Stored locally in private app storage (not uploaded to cloud).
              </Text>
            </View>
          </View>
        )}

        {/* Editable Raw Text + Re-Parse */}
        {Boolean(rawText) && (
          <View style={styles.rawTextBox}>
            <View style={styles.rawTextHeader}>
              <Text style={styles.rawTextLabel}>SCANNED / RAW LABEL TEXT</Text>
              <TouchableOpacity style={styles.reparseBtn} onPress={handleReparse}>
                <RefreshCw size={12} color="#047857" />
                <Text style={styles.reparseBtnText}>Re-Parse</Text>
              </TouchableOpacity>
            </View>
            <TextInput
              style={styles.rawTextInput}
              value={rawText}
              onChangeText={setRawText}
              multiline
              placeholder="Edit scanned label text and tap Re-Parse..."
            />
          </View>
        )}

        {/* Medication Name */}
        <Text style={styles.label}>Medication / Generic Name</Text>
        <View style={styles.inputWrapper}>
          <Pill size={18} color="#94a3b8" />
          <TextInput style={styles.input} value={name} onChangeText={setName} />
        </View>

        {/* Dosage & Form in 2 Columns */}
        <View style={styles.row}>
          <View style={{ flex: 1 }}>
            <Text style={styles.label}>Dosage Strength</Text>
            <View style={styles.inputWrapper}>
              <TextInput style={styles.input} value={dosage} onChangeText={setDosage} />
            </View>
          </View>

          <View style={{ flex: 1 }}>
            <Text style={styles.label}>Form</Text>
            <View style={styles.inputWrapper}>
              <TextInput style={styles.input} value={form} onChangeText={setForm} />
            </View>
          </View>
        </View>

        {/* Frequency */}
        <Text style={styles.label}>Frequency</Text>
        <View style={styles.inputWrapper}>
          <Calendar size={18} color="#94a3b8" />
          <TextInput style={styles.input} value={frequency} onChangeText={setFrequency} />
        </View>

        {/* Schedule Times */}
        <Text style={styles.label}>Daily Intake Schedule Times</Text>
        <View style={styles.timesContainer}>
          {scheduleTimes.map((t, idx) => (
            <View key={idx} style={styles.timeChip}>
              <Clock size={12} color="#047857" />
              <Text style={styles.timeChipText}>{t}</Text>
            </View>
          ))}
        </View>

        {/* Instructions */}
        <Text style={styles.label}>Clinical Instructions</Text>
        <View style={[styles.inputWrapper, { height: 70, alignItems: "flex-start", paddingTop: 8 }]}>
          <ShieldCheck size={18} color="#94a3b8" style={{ marginTop: 2 }} />
          <TextInput
            style={[styles.input, { height: 50, textAlignVertical: "top" }]}
            value={instructions}
            onChangeText={setInstructions}
            multiline
          />
        </View>

        {/* Confirm Action Button */}
        <TouchableOpacity
          style={[styles.confirmBtn, saving && styles.disabledBtn]}
          onPress={handleConfirm}
          disabled={saving}
        >
          <CheckCircle2 size={20} color="#ffffff" />
          <Text style={styles.confirmBtnText}>
            {saving ? "Saving & Scheduling Alarms..." : "Confirm & Save Regimen"}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.rescanBtn} onPress={handleDiscard}>
          <Text style={styles.rescanBtnText}>Discard & Rescan</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#ffffff",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: 24,
    paddingHorizontal: 20,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#f1f5f9",
  },
  confidenceBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#ecfdf5",
    borderWidth: 1,
    borderColor: "#a7f3d0",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
  },
  confidenceText: {
    fontSize: 11,
    fontWeight: "800",
    color: "#047857",
  },
  closeBtn: {
    padding: 6,
  },
  content: {
    padding: 20,
    paddingBottom: 40,
  },
  title: {
    fontSize: 20,
    fontWeight: "900",
    color: "#0f172a",
  },
  subtitle: {
    fontSize: 12,
    color: "#64748b",
    lineHeight: 18,
    marginTop: 4,
    marginBottom: 16,
  },
  photoPreviewCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: "#f8fafc",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 14,
    padding: 10,
    marginBottom: 14,
  },
  photoThumb: {
    width: 64,
    height: 64,
    borderRadius: 10,
    backgroundColor: "#cbd5e1",
  },
  photoLabel: {
    fontSize: 13,
    fontWeight: "800",
    color: "#0f172a",
  },
  photoHint: {
    fontSize: 11,
    color: "#64748b",
    marginTop: 2,
    lineHeight: 15,
  },
  rawTextBox: {
    backgroundColor: "#f8fafc",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 14,
    padding: 10,
    marginBottom: 10,
  },
  rawTextHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 6,
  },
  rawTextLabel: {
    fontSize: 10,
    fontWeight: "800",
    color: "#64748b",
    letterSpacing: 0.5,
  },
  reparseBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#ecfdf5",
    borderWidth: 1,
    borderColor: "#a7f3d0",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  reparseBtnText: {
    fontSize: 11,
    fontWeight: "800",
    color: "#047857",
  },
  rawTextInput: {
    fontSize: 12,
    color: "#334155",
    minHeight: 42,
    textAlignVertical: "top",
  },
  label: {
    fontSize: 12,
    fontWeight: "700",
    color: "#334155",
    marginBottom: 6,
    marginTop: 10,
  },
  row: {
    flexDirection: "row",
    gap: 12,
  },
  inputWrapper: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "#f8fafc",
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 14,
    paddingHorizontal: 14,
    height: 48,
  },
  input: {
    flex: 1,
    fontSize: 13,
    color: "#0f172a",
    fontWeight: "600",
  },
  timesContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 4,
  },
  timeChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#ecfdf5",
    borderWidth: 1,
    borderColor: "#a7f3d0",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
  },
  timeChipText: {
    fontSize: 12,
    fontWeight: "800",
    color: "#065f46",
  },
  confirmBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#10b981",
    paddingVertical: 15,
    borderRadius: 16,
    marginTop: 24,
    shadowColor: "#10b981",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 4,
  },
  disabledBtn: {
    opacity: 0.7,
  },
  confirmBtnText: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "800",
  },
  rescanBtn: {
    alignItems: "center",
    paddingVertical: 12,
    marginTop: 6,
  },
  rescanBtnText: {
    color: "#64748b",
    fontSize: 13,
    fontWeight: "700",
  },
});
