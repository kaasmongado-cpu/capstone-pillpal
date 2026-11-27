import React, { useEffect, useState } from "react";
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
  Modal,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
  CheckCircle2,
  X,
  Pill,
  Clock,
  Calendar,
  ShieldCheck,
  RefreshCw,
  AlertTriangle,
  Plus,
  Check,
  Copy,
  ArrowLeft,
  Pencil,
  Info,
} from "lucide-react-native";
import * as Haptics from "expo-haptics";
import {
  ExtractedPrescription,
  findDuplicateActiveMedication,
  lookupMedicationPurpose,
  parseMedicationText,
  parseMultipleMedications,
} from "@/services/ocr/parser";
import { savePrescriptionPhotoLocally, deleteTempPhoto } from "@/services/ocr/recognizer";
import {
  getLocalPrescriptions,
  LocalPrescription,
  saveLocalPrescription,
} from "@/services/db/database";
import { schedulePrescriptionAlarms } from "@/services/notifications/alarms";
import { getAuthToken, getCachedUser } from "@/services/auth/session";
import { flushOutbox } from "@/services/sync/sync-worker";
import { checkAllergyConflict } from "@/constants/registration";

const QUICK_TIMES = [
  "06:00 AM",
  "08:00 AM",
  "12:00 PM",
  "02:00 PM",
  "06:00 PM",
  "08:00 PM",
  "09:00 PM",
];

interface DraftMedication {
  selected: boolean;
  name: string;
  dosage: string;
  form: string;
  frequency: string;
  scheduleTimes: string[];
  durationDays: string;
  instructions: string;
  drugClass?: string;
  usedFor?: string;
  keyReminder?: string;
  prescribedFor?: string;
  confidenceScore: number;
  allergyOverride: boolean;
}

function toDraft(item?: ExtractedPrescription): DraftMedication {
  return {
    selected: true,
    name: item?.genericName || "",
    dosage: item?.dosage || "",
    form: item?.form || "Tablet",
    frequency: item?.frequency || "Once daily",
    scheduleTimes: item?.scheduleTimes?.length ? item.scheduleTimes : ["08:00 AM"],
    durationDays:
      item?.durationDays && item.durationDays > 0 ? String(item.durationDays) : "",
    instructions: item?.instructions || "",
    drugClass: item?.drugClass,
    usedFor: item?.usedFor,
    keyReminder: item?.keyReminder,
    prescribedFor: item?.prescribedFor,
    confidenceScore: item?.confidenceScore || 0,
    allergyOverride: false,
  };
}

function buildPreviewFromText(text: string): ExtractedPrescription[] {
  const multi = parseMultipleMedications(text);
  if (multi.length > 0) return multi;
  const single = parseMedicationText(text);
  return single.genericName || single.dosage ? [single] : [];
}

function computeEndDateIso(durationDaysStr: string): string | null {
  const days = Number(durationDaysStr.trim());
  if (!Number.isFinite(days) || days <= 0 || days > 365) return null;
  const end = new Date();
  end.setDate(end.getDate() + Math.round(days));
  return end.toISOString();
}

export default function OcrReviewModal() {
  const router = useRouter();
  const {
    data,
    medications: medicationsParam,
    rawText: initialRawText,
    imageUri,
    ocrEngine,
    errorCode,
  } = useLocalSearchParams<{
    data?: string;
    medications?: string;
    rawText?: string;
    imageUri?: string;
    ocrEngine?: string;
    errorCode?: string;
  }>();

  const initialRaw = (initialRawText || "").trim();

  // Compute unconfirmed preview WITHOUT auto-committing into final medication drafts
  const initialPendingMeds: ExtractedPrescription[] = (() => {
    try {
      if (medicationsParam) {
        const list = JSON.parse(medicationsParam) as ExtractedPrescription[];
        if (Array.isArray(list) && list.length > 0) {
          return list;
        }
      }
      if (initialRaw.length > 0) {
        return buildPreviewFromText(initialRaw);
      }
      if (data) {
        const parsed = JSON.parse(data) as ExtractedPrescription;
        if (parsed?.genericName || parsed?.dosage) return [parsed];
      }
    } catch {
      // fall through
    }
    return [];
  })();

  const hasOcrOutputToConfirm = initialRaw.length > 0 || initialPendingMeds.length > 0;

  // Stage 1: CONFIRM_OCR (Human-in-the-loop gate) -> Stage 2: REVIEW (Editable + Attestation)
  const [stage, setStage] = useState<"CONFIRM_OCR" | "REVIEW">(
    hasOcrOutputToConfirm ? "CONFIRM_OCR" : "REVIEW",
  );
  const [pendingMeds, setPendingMeds] = useState<ExtractedPrescription[]>(initialPendingMeds);
  const [editingPendingText, setEditingPendingText] = useState(false);

  // Final editable drafts (only populated once user explicitly confirms or enters manually)
  const [drafts, setDrafts] = useState<DraftMedication[]>([toDraft()]);
  const [activeIdx, setActiveIdx] = useState(0);
  const [customTime, setCustomTime] = useState("");
  const [rawText, setRawText] = useState(initialRawText || "");
  const [accuracyConfirmed, setAccuracyConfirmed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [photoZoomVisible, setPhotoZoomVisible] = useState(false);

  // Patient clinical safety context
  const [patientAllergies, setPatientAllergies] = useState<string | null>(null);
  const [activePrescriptions, setActivePrescriptions] = useState<LocalPrescription[]>([]);

  useEffect(() => {
    void getCachedUser().then((u) => {
      setPatientAllergies(u?.allergies || null);
    });
    void getLocalPrescriptions()
      .then((list: LocalPrescription[]) => setActivePrescriptions(list))
      .catch(() => {});
  }, []);

  const currentDraft = drafts[activeIdx] || drafts[0] || toDraft();
  const allergyCheck = checkAllergyConflict(currentDraft.name, patientAllergies);
  const duplicateCheck = findDuplicateActiveMedication(
    currentDraft.name,
    activePrescriptions,
  );
  const currentPurpose = (() => {
    const curated = lookupMedicationPurpose(currentDraft.name);
    if (curated) return curated;
    if (currentDraft.usedFor) {
      return {
        genericName: currentDraft.name,
        drugClass: currentDraft.drugClass || "Medication",
        usedFor: currentDraft.usedFor,
        keyReminder: currentDraft.keyReminder || "",
        source: "ai-vision" as const,
      };
    }
    return null;
  })();

  function updateCurrentDraft(patch: Partial<DraftMedication>) {
    if (patch.name !== undefined || patch.dosage !== undefined) {
      setAccuracyConfirmed(false);
    }
    setDrafts((prev) =>
      prev.map((d, i) => {
        if (i !== activeIdx) return d;
        const nameChanged = patch.name !== undefined && patch.name !== d.name;
        return {
          ...d,
          ...patch,
          ...(nameChanged ? { allergyOverride: false } : {}),
        };
      }),
    );
  }

  function handleAcceptOcrPreview() {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    const sourceList =
      pendingMeds.length > 0
        ? pendingMeds
        : rawText.trim()
          ? buildPreviewFromText(rawText)
          : [];
    setDrafts(
      sourceList.length > 0 ? sourceList.map((m) => toDraft(m)) : [toDraft()],
    );
    setActiveIdx(0);
    setAccuracyConfirmed(false);
    setStage("REVIEW");
  }

  function handleUpdatePendingPreview() {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    const reparsed = buildPreviewFromText(rawText);
    setPendingMeds(reparsed);
    setEditingPendingText(false);
  }

  function handleDiscardParseEnterManually() {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setPendingMeds([]);
    setEditingPendingText(false);
    setDrafts([toDraft()]);
    setActiveIdx(0);
    setAccuracyConfirmed(false);
    setStage("REVIEW");
  }

  function toggleDraftSelection(idx: number) {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setDrafts((prev) =>
      prev.map((d, i) => (i === idx ? { ...d, selected: !d.selected } : d)),
    );
  }

  function handleAddBlankMedication() {
    setDrafts((prev) => [...prev, toDraft()]);
    setActiveIdx(drafts.length);
    setAccuracyConfirmed(false);
  }

  function handleReparse() {
    if (!rawText.trim()) return;
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    const reparsed = buildPreviewFromText(rawText);
    setPendingMeds(reparsed);
    setEditingPendingText(false);
    setAccuracyConfirmed(false);
    setStage("CONFIRM_OCR");
  }

  function toggleTimeChip(timeStr: string) {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    const prevTimes = currentDraft.scheduleTimes;
    if (prevTimes.includes(timeStr)) {
      if (prevTimes.length <= 1) return;
      updateCurrentDraft({ scheduleTimes: prevTimes.filter((t) => t !== timeStr) });
    } else {
      updateCurrentDraft({ scheduleTimes: [...prevTimes, timeStr] });
    }
  }

  function handleAddCustomTime() {
    const clean = customTime.trim().toUpperCase();
    if (!/^\d{1,2}:\d{2}\s*(AM|PM)$/.test(clean)) {
      if (Platform.OS === "web") {
        globalThis.alert?.('Enter a valid time format like "07:30 AM" or "09:30 PM".');
      } else {
        Alert.alert("Invalid Time", 'Please enter a time like "07:30 AM" or "09:30 PM".');
      }
      return;
    }
    if (!currentDraft.scheduleTimes.includes(clean)) {
      updateCurrentDraft({ scheduleTimes: [...currentDraft.scheduleTimes, clean] });
    }
    setCustomTime("");
  }

  async function handleDiscard() {
    await deleteTempPhoto(imageUri);
    router.back();
  }

  const selectedDrafts = drafts.filter((d) => d.selected);
  const hasUnconfirmedAllergy = selectedDrafts.some((d) => {
    const check = checkAllergyConflict(d.name, patientAllergies);
    return check.hasConflict && !d.allergyOverride;
  });

  async function handleConfirm() {
    if (selectedDrafts.length === 0) {
      const msg = "Please select at least one medication to save.";
      if (Platform.OS === "web") globalThis.alert?.(msg);
      else Alert.alert("No Medication Selected", msg);
      return;
    }

    if (!accuracyConfirmed) {
      const msg =
        "Please confirm that you checked the medication name, dosage strength, and schedule against your physical label or prescription.";
      if (Platform.OS === "web") globalThis.alert?.(msg);
      else Alert.alert("Verification Required", msg);
      return;
    }

    for (let i = 0; i < drafts.length; i++) {
      const d = drafts[i]!;
      if (!d.selected) continue;
      if (!d.name.trim() || !d.dosage.trim()) {
        setActiveIdx(i);
        const msg = `Please enter both Medication Name and Dosage Strength for "${
          d.name.trim() || `Medication #${i + 1}`
        }".`;
        if (Platform.OS === "web") globalThis.alert?.(msg);
        else Alert.alert("Missing Information", msg);
        return;
      }

      const check = checkAllergyConflict(d.name, patientAllergies);
      if (check.hasConflict && !d.allergyOverride) {
        setActiveIdx(i);
        const msg = `Please review the Drug Allergy Warning for "${d.name.trim()}" and confirm clinical clearance before saving.`;
        if (Platform.OS === "web") globalThis.alert?.(msg);
        else Alert.alert("Allergy Safety Confirmation Required", msg);
        return;
      }
    }

    setSaving(true);
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});

    try {
      const [user, token] = await Promise.all([getCachedUser(), getAuthToken()]);
      const baseTs = Date.now();
      const persistedImageUri = await savePrescriptionPhotoLocally(
        imageUri,
        `rx_ocr_${baseTs}`,
      );

      for (let i = 0; i < selectedDrafts.length; i++) {
        const d = selectedDrafts[i]!;
        const newRxId = `rx_ocr_${baseTs}_${i}`;
        const endDate = computeEndDateIso(d.durationDays);

        const newRx = {
          id: newRxId,
          patient_id: user?.id || "local_patient",
          doctor_id: null,
          doctor_name: "Self-Scanned / OTC",
          name: d.name.trim(),
          dosage: d.dosage.trim(),
          form: d.form.trim() || "Tablet",
          instructions: d.instructions.trim() || "Take as directed",
          frequency: d.frequency.trim() || `${d.scheduleTimes.length}x daily`,
          schedule_times: d.scheduleTimes.length > 0 ? d.scheduleTimes : ["08:00 AM"],
          start_date: new Date().toISOString(),
          end_date: endDate,
          status: "ACTIVE",
          is_local_draft: 1,
          image_uri: persistedImageUri,
        };

        await saveLocalPrescription(newRx);
        await schedulePrescriptionAlarms(newRx);
      }

      if (token) {
        void flushOutbox(token).catch(() => {});
      }

      if (Platform.OS === "web") {
        router.replace("/(tabs)");
      } else {
        const summary =
          selectedDrafts.length === 1
            ? `${selectedDrafts[0]!.name.trim()} (${selectedDrafts[0]!.dosage.trim()}) has been added to your daily schedule`
            : `${selectedDrafts.length} medications have been added to your daily schedule`;
        Alert.alert(
          "Medication Regimen Saved",
          `${summary}${
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
          ],
        );
      }
    } catch (err: any) {
      Alert.alert("Error Saving", err.message || "Could not save prescription.");
    } finally {
      setSaving(false);
    }
  }

  const isManualFallback = ocrEngine === "manual-fallback" && !rawText.trim();
  const engineLabel =
    ocrEngine === "mlkit-offline"
      ? "On-Device ML Kit (Offline)"
      : ocrEngine === "tesseract-offline"
        ? "Tesseract Offline"
        : ocrEngine === "cloud-vision"
          ? "Vision AI"
          : ocrEngine === "tesseract-server"
            ? "Tesseract OCR"
            : isManualFallback
              ? "Manual Entry"
              : "PH Drug Lexicon";

  const fallbackDetailText = (() => {
    if (errorCode === "missing_key") {
      return "Cloud Vision OCR (GEMINI_API_KEY) is not configured on the API server yet and local OCR couldn't read this photo. Tap the photo to zoom in, enter details below, or type label text and tap Re-Parse.";
    }
    if (errorCode === "invalid_key") {
      return "The configured GEMINI_API_KEY was rejected by Google (401/403). Check your key in .env and restart the API server, or enter details manually below.";
    }
    if (errorCode === "quota_exceeded") {
      return "Cloud Vision OCR temporarily hit its rate limit. Tap the photo to zoom in and enter details below, or try again shortly.";
    }
    if (errorCode === "model_error") {
      return "The OCR backend returned an error — check the API terminal logs or restart the API server after updating .env.";
    }
    if (errorCode === "offline") {
      return Platform.OS === "web"
        ? "You are offline and local browser OCR couldn't read this photo yet (visit online once to cache the model). Tap the photo to zoom in, or type label text and tap Re-Parse."
        : "You are offline. On-device ML Kit OCR runs automatically in installed Android/iOS APK builds (not Expo Go). Tap the photo below to zoom in, or type label text and tap Re-Parse offline.";
    }
    return "Automatic OCR couldn't read clear text from this photo. Tap the photo below to zoom in, or type the label text in the box below and tap Re-Parse.";
  })();

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.confidenceBadge}>
          <Text style={styles.confidenceText}>{engineLabel}</Text>
        </View>

        <TouchableOpacity style={styles.closeBtn} onPress={handleDiscard}>
          <X size={20} color="#64748b" />
        </TouchableOpacity>
      </View>

      {/* 2-Stage Stepper Bar */}
      <View style={styles.stepperRow}>
        <View
          style={[
            styles.stepPill,
            stage === "CONFIRM_OCR" ? styles.stepPillActive : styles.stepPillDone,
          ]}
        >
          <Text
            style={[
              styles.stepPillText,
              stage === "CONFIRM_OCR" ? styles.stepPillTextActive : styles.stepPillTextDone,
            ]}
          >
            1. Confirm OCR
          </Text>
        </View>
        <View style={styles.stepDivider} />
        <View
          style={[
            styles.stepPill,
            stage === "REVIEW" ? styles.stepPillActive : styles.stepPillIdle,
          ]}
        >
          <Text
            style={[
              styles.stepPillText,
              stage === "REVIEW" ? styles.stepPillTextActive : styles.stepPillTextIdle,
            ]}
          >
            2. Verify &amp; Save
          </Text>
        </View>
      </View>

      {stage === "CONFIRM_OCR" ? (
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Text style={styles.title}>Is This OCR Parse Correct?</Text>
          <Text style={styles.subtitle}>
            Nothing is added to your schedule yet. Compare the extracted text and parsed preview
            against your photo before continuing.
          </Text>

          {/* Tappable Photo Preview */}
          {Boolean(imageUri) && (
            <TouchableOpacity
              style={styles.photoPreviewCard}
              activeOpacity={0.85}
              onPress={() => setPhotoZoomVisible(true)}
            >
              <Image source={{ uri: imageUri }} style={styles.photoThumb} resizeMode="cover" />
              <View style={{ flex: 1 }}>
                <Text style={styles.photoLabel}>Scanned Label / Prescription Photo</Text>
                <Text style={styles.photoHint}>
                  Tap to zoom fullscreen and verify every number &amp; drug name.
                </Text>
              </View>
            </TouchableOpacity>
          )}

          {/* Unconfirmed Parsed Preview Cards */}
          <View style={styles.previewCardBox}>
            <View style={styles.previewBoxHeader}>
              <Text style={styles.previewBoxTitle}>UNCONFIRMED OCR PREVIEW</Text>
              <View style={styles.unconfirmedTag}>
                <Text style={styles.unconfirmedTagText}>Needs Confirmation</Text>
              </View>
            </View>

            {pendingMeds.length === 0 ? (
              <Text style={styles.previewEmptyText}>
                No standard medication pattern matched the text below. Tap{" "}
                <Text style={{ fontWeight: "800" }}>Edit Text &amp; Re-Parse</Text> to fix typos,
                or choose{" "}
                <Text style={{ fontWeight: "800" }}>Wrong Parse — Enter Manually</Text>.
              </Text>
            ) : (
              pendingMeds.map((med, idx) => {
                const pct = Math.round((med.confidenceScore || 0) * 100);
                const confBg =
                  pct >= 85 ? "#d1fae5" : pct >= 60 ? "#fef3c7" : "#fee2e2";
                const confFg =
                  pct >= 85 ? "#065f46" : pct >= 60 ? "#92400e" : "#991b1b";
                const confLabel =
                  pct >= 85
                    ? `High Match • ${pct}%`
                    : pct >= 60
                      ? `Check Carefully • ${pct}%`
                      : `Low Match • ${pct}%`;
                const curatedInfo = lookupMedicationPurpose(med.genericName);
                const resolvedClass = curatedInfo?.drugClass || med.drugClass;
                const resolvedUsedFor = curatedInfo?.usedFor || med.usedFor;

                return (
                  <View key={idx} style={styles.previewItemCard}>
                    <View style={styles.previewItemTop}>
                      <Text style={styles.previewMedName} numberOfLines={2}>
                        {med.genericName || "(Name not detected)"}
                        {med.brandName ? ` (${med.brandName})` : ""}
                      </Text>
                      <View style={[styles.confBadge, { backgroundColor: confBg }]}>
                        <Text style={[styles.confBadgeText, { color: confFg }]}>
                          {confLabel}
                        </Text>
                      </View>
                    </View>
                    {resolvedClass && (
                      <View style={styles.purposeClassChip}>
                        <Info size={11} color="#0369a1" />
                        <Text style={styles.purposeClassText}>{resolvedClass}</Text>
                      </View>
                    )}
                    {resolvedUsedFor && (
                      <Text style={styles.previewPurposeText}>
                        Used for: {resolvedUsedFor}
                        {med.prescribedFor ? ` (Slip: "${med.prescribedFor}")` : ""}
                      </Text>
                    )}
                    <Text style={styles.previewMedMeta}>
                      Strength:{" "}
                      <Text
                        style={{
                          fontWeight: "800",
                          color: med.dosage ? "#0f172a" : "#b45309",
                        }}
                      >
                        {med.dosage || "Not detected (required)"}
                      </Text>{" "}
                      • {med.form}
                    </Text>
                    <Text style={styles.previewMedMeta}>
                      Frequency: <Text style={{ fontWeight: "700" }}>{med.frequency}</Text>
                      {med.durationDays ? ` • ${med.durationDays} days` : ""}
                    </Text>
                  </View>
                );
              })
            )}
          </View>

          {/* Raw OCR Text Box (Read-Only until user chooses Edit) */}
          <View style={styles.rawTextBox}>
            <View style={styles.rawTextHeader}>
              <Text style={styles.rawTextLabel}>
                RAW OCR TEXT {editingPendingText ? "(EDITING)" : "(READ-ONLY)"}
              </Text>
              {!editingPendingText ? (
                <TouchableOpacity
                  style={styles.reparseBtn}
                  onPress={() => setEditingPendingText(true)}
                >
                  <Pencil size={12} color="#047857" />
                  <Text style={styles.reparseBtnText}>Edit Text</Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  style={[styles.reparseBtn, { backgroundColor: "#047857" }]}
                  onPress={handleUpdatePendingPreview}
                >
                  <RefreshCw size={12} color="#ffffff" />
                  <Text style={[styles.reparseBtnText, { color: "#ffffff" }]}>
                    Update Preview
                  </Text>
                </TouchableOpacity>
              )}
            </View>
            <TextInput
              style={[
                styles.rawTextInput,
                editingPendingText && {
                  backgroundColor: "#ffffff",
                  borderWidth: 1,
                  borderColor: "#10b981",
                  borderRadius: 10,
                  padding: 8,
                  minHeight: 72,
                },
              ]}
              editable={editingPendingText}
              value={rawText}
              onChangeText={setRawText}
              multiline
              placeholder="Raw OCR text..."
              placeholderTextColor="#94a3b8"
            />
          </View>

          {/* Explicit Confirmation Action Buttons */}
          <TouchableOpacity
            style={[
              styles.confirmBtn,
              (pendingMeds.length === 0 || editingPendingText) && styles.disabledBtn,
            ]}
            disabled={pendingMeds.length === 0 || editingPendingText}
            onPress={handleAcceptOcrPreview}
          >
            <CheckCircle2 size={20} color="#ffffff" />
            <Text style={styles.confirmBtnText}>Yes, Parse is Correct → Continue</Text>
          </TouchableOpacity>

          {!editingPendingText && (
            <TouchableOpacity
              style={styles.secondaryActionBtn}
              onPress={() => setEditingPendingText(true)}
            >
              <Pencil size={16} color="#0f172a" />
              <Text style={styles.secondaryActionBtnText}>No, Edit Text &amp; Re-Parse</Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity
            style={styles.manualFallbackBtn}
            onPress={handleDiscardParseEnterManually}
          >
            <AlertTriangle size={16} color="#92400e" />
            <Text style={styles.manualFallbackBtnText}>Wrong Parse — Enter Manually</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.rescanBtn} onPress={handleDiscard}>
            <Text style={styles.rescanBtnText}>Discard &amp; Retake Photo</Text>
          </TouchableOpacity>
        </ScrollView>
      ) : (
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          {(pendingMeds.length > 0 || rawText.trim().length > 0) && (
            <TouchableOpacity
              style={styles.backToPreviewLink}
              onPress={() => setStage("CONFIRM_OCR")}
            >
              <ArrowLeft size={14} color="#047857" />
              <Text style={styles.backToPreviewText}>Back to OCR Confirmation Preview</Text>
            </TouchableOpacity>
          )}

          <Text style={styles.title}>
            {drafts.length > 1
              ? `Verify ${drafts.length} Detected Medications`
              : "Verify Medication Details"}
          </Text>
          <Text style={styles.subtitle}>
            Review and adjust every field below. Your photo is saved privately inside the app for
            offline reference.
          </Text>

          {isManualFallback && (
            <View style={styles.amberBanner}>
              <Text style={styles.amberBannerTitle}>Photo loaded — enter details manually</Text>
              <Text style={styles.amberBannerBody}>{fallbackDetailText}</Text>
            </View>
          )}

          {/* Multi-Medication Selector Strip */}
          {drafts.length > 1 && (
            <View style={styles.multiMedSection}>
              <View style={styles.multiMedHeader}>
                <Text style={styles.multiMedTitle}>
                  DETECTED ON SLIP ({selectedDrafts.length}/{drafts.length} SELECTED)
                </Text>
                <TouchableOpacity onPress={handleAddBlankMedication} style={styles.addAnotherPill}>
                  <Plus size={12} color="#047857" />
                  <Text style={styles.addAnotherText}>Add</Text>
                </TouchableOpacity>
              </View>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ gap: 8, paddingVertical: 4 }}
              >
                {drafts.map((d, idx) => {
                  const isActive = idx === activeIdx;
                  const dAllergy = checkAllergyConflict(d.name, patientAllergies);
                  return (
                    <View
                      key={idx}
                      style={[
                        styles.medTabChip,
                        isActive && styles.medTabChipActive,
                        !d.selected && { opacity: 0.55 },
                      ]}
                    >
                      <TouchableOpacity
                        onPress={() => toggleDraftSelection(idx)}
                        style={[
                          styles.medCheckBox,
                          d.selected && styles.medCheckBoxSelected,
                        ]}
                      >
                        {d.selected && <Check size={11} color="#ffffff" />}
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={() => setActiveIdx(idx)}
                        style={{ flexDirection: "row", alignItems: "center", gap: 4 }}
                      >
                        <Text
                          style={[
                            styles.medTabText,
                            isActive && styles.medTabTextActive,
                          ]}
                          numberOfLines={1}
                        >
                          {d.name.trim() || `Med #${idx + 1}`}
                        </Text>
                        {dAllergy.hasConflict && <AlertTriangle size={12} color="#dc2626" />}
                      </TouchableOpacity>
                    </View>
                  );
                })}
              </ScrollView>
            </View>
          )}

          {/* Duplicate Active Regimen Warning */}
          {duplicateCheck.isDuplicate && (
            <View style={styles.duplicateCard}>
              <Copy size={18} color="#b45309" style={{ marginTop: 2 }} />
              <View style={{ flex: 1 }}>
                <Text style={styles.duplicateTitle}>ALREADY IN YOUR ACTIVE SCHEDULE</Text>
                <Text style={styles.duplicateBody}>
                  You already have an active{" "}
                  {duplicateCheck.isClinicRx ? "CSU Clinic prescription" : "schedule"} for{" "}
                  {duplicateCheck.existingName}. Avoid saving duplicates so you don&apos;t
                  accidentally double-dose.
                </Text>
              </View>
            </View>
          )}

          {/* Live Drug-Allergy Contraindication Alert */}
          {allergyCheck.hasConflict && (
            <View style={styles.allergyAlertCard}>
              <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 10 }}>
                <AlertTriangle size={20} color="#dc2626" style={{ marginTop: 2 }} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.allergyAlertTitle}>DRUG ALLERGY SAFETY ALERT</Text>
                  <Text style={styles.allergyAlertBody}>{allergyCheck.warningMessage}</Text>
                </View>
              </View>

              <TouchableOpacity
                style={styles.overrideRow}
                onPress={() =>
                  updateCurrentDraft({ allergyOverride: !currentDraft.allergyOverride })
                }
              >
                <View
                  style={[
                    styles.checkbox,
                    currentDraft.allergyOverride && styles.checkboxChecked,
                  ]}
                >
                  {currentDraft.allergyOverride && <CheckCircle2 size={14} color="#ffffff" />}
                </View>
                <Text style={styles.overrideText}>
                  I have verified with a CSU physician or pharmacist that this medication is safe
                  for me.
                </Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Captured / Uploaded Photo Preview Thumbnail (Tappable to Zoom) */}
          {Boolean(imageUri) && (
            <TouchableOpacity
              style={styles.photoPreviewCard}
              activeOpacity={0.85}
              onPress={() => setPhotoZoomVisible(true)}
            >
              <Image source={{ uri: imageUri }} style={styles.photoThumb} resizeMode="cover" />
              <View style={{ flex: 1 }}>
                <Text style={styles.photoLabel}>Uploaded / Captured Label Photo</Text>
                <Text style={styles.photoHint}>
                  Tap to zoom fullscreen • Saved locally in private app storage.
                </Text>
              </View>
            </TouchableOpacity>
          )}

          {/* Editable Raw Text + Re-Parse (sends back to Confirm OCR preview!) */}
          <View style={styles.rawTextBox}>
            <View style={styles.rawTextHeader}>
              <Text style={styles.rawTextLabel}>LABEL TEXT (OPTIONAL AUTO-PARSE)</Text>
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
              placeholder="Paste or type label text (supports multiple lines) and tap Re-Parse..."
              placeholderTextColor="#94a3b8"
            />
          </View>

          {/* Medication Name */}
          <Text style={styles.label}>Medication / Generic Name *</Text>
          <View style={styles.inputWrapper}>
            <Pill size={18} color="#94a3b8" />
            <TextInput
              style={styles.input}
              value={currentDraft.name}
              onChangeText={(val) => updateCurrentDraft({ name: val })}
              placeholder="e.g. Paracetamol, Cetirizine"
            />
          </View>

          {/* Live "What This Medicine Is For" Clinical Guide Card */}
          {currentDraft.name.trim().length >= 3 && (
            <View style={styles.purposeCard}>
              <View style={styles.purposeHeaderRow}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                  <Info size={14} color="#0284c7" />
                  <Text style={styles.purposeCardTitle}>WHAT THIS MEDICINE IS FOR</Text>
                </View>
                {currentPurpose && (
                  <View style={styles.purposeClassChip}>
                    <Text style={styles.purposeClassText}>
                      {currentPurpose.drugClass}
                      {currentPurpose.source === "ai-vision" ? " • AI" : ""}
                    </Text>
                  </View>
                )}
              </View>
              {currentPurpose ? (
                <>
                  <Text style={styles.purposeCardBody}>
                    {currentPurpose.usedFor}
                    {currentDraft.prescribedFor
                      ? ` (Slip notes: "${currentDraft.prescribedFor}")`
                      : ""}
                  </Text>
                  {Boolean(currentPurpose.keyReminder) && (
                    <Text style={styles.purposeCardTip}>
                      Key tip: {currentPurpose.keyReminder}
                    </Text>
                  )}
                  <Text style={styles.purposeDisclaimer}>
                    General medication info only — always follow your CSU physician&apos;s
                    specific advice.
                  </Text>
                </>
              ) : (
                <Text style={styles.purposeCardBody}>
                  Not in the offline 43-drug guide — confirm what this medicine is for with your
                  CSU physician or pharmacist.
                </Text>
              )}
            </View>
          )}

          {/* Dosage & Form in 2 Columns */}
          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>Dosage Strength *</Text>
              <View style={styles.inputWrapper}>
                <TextInput
                  style={styles.input}
                  value={currentDraft.dosage}
                  onChangeText={(val) => updateCurrentDraft({ dosage: val })}
                  placeholder="e.g. 500 mg"
                />
              </View>
            </View>

            <View style={{ flex: 1 }}>
              <Text style={styles.label}>Form</Text>
              <View style={styles.inputWrapper}>
                <TextInput
                  style={styles.input}
                  value={currentDraft.form}
                  onChangeText={(val) => updateCurrentDraft({ form: val })}
                  placeholder="Tablet / Capsule"
                />
              </View>
            </View>
          </View>

          {/* Frequency & Duration in 2 Columns */}
          <View style={styles.row}>
            <View style={{ flex: 1.5 }}>
              <Text style={styles.label}>Frequency</Text>
              <View style={styles.inputWrapper}>
                <Calendar size={16} color="#94a3b8" />
                <TextInput
                  style={styles.input}
                  value={currentDraft.frequency}
                  onChangeText={(val) => updateCurrentDraft({ frequency: val })}
                  placeholder="e.g. Twice daily"
                />
              </View>
            </View>

            <View style={{ flex: 0.9 }}>
              <Text style={styles.label}>Duration (Days)</Text>
              <View style={styles.inputWrapper}>
                <TextInput
                  style={styles.input}
                  value={currentDraft.durationDays}
                  onChangeText={(val) =>
                    updateCurrentDraft({ durationDays: val.replace(/[^0-9]/g, "") })
                  }
                  keyboardType="number-pad"
                  maxLength={3}
                  placeholder="e.g. 7"
                />
              </View>
            </View>
          </View>

          {/* Editable Schedule Times */}
          <Text style={styles.label}>Daily Intake Schedule Times (Tap to toggle)</Text>
          <View style={styles.timesContainer}>
            {currentDraft.scheduleTimes.map((t) => (
              <TouchableOpacity
                key={t}
                style={styles.timeChip}
                onPress={() => toggleTimeChip(t)}
              >
                <Clock size={12} color="#047857" />
                <Text style={styles.timeChipText}>{t}</Text>
                {currentDraft.scheduleTimes.length > 1 && <X size={12} color="#047857" />}
              </TouchableOpacity>
            ))}
          </View>

          {/* Quick Time Presets */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: 6, paddingVertical: 6 }}
          >
            {QUICK_TIMES.filter((q) => !currentDraft.scheduleTimes.includes(q)).map((preset) => (
              <TouchableOpacity
                key={preset}
                style={styles.presetChip}
                onPress={() => toggleTimeChip(preset)}
              >
                <Plus size={11} color="#475569" />
                <Text style={styles.presetChipText}>{preset}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {/* Custom Time Input */}
          <View style={styles.customTimeRow}>
            <TextInput
              style={styles.customTimeInput}
              placeholder="Custom time (e.g. 07:30 AM)"
              placeholderTextColor="#94a3b8"
              value={customTime}
              onChangeText={setCustomTime}
            />
            <TouchableOpacity style={styles.addTimeBtn} onPress={handleAddCustomTime}>
              <Plus size={15} color="#ffffff" />
              <Text style={styles.addTimeBtnText}>Add</Text>
            </TouchableOpacity>
          </View>

          {/* Instructions */}
          <Text style={styles.label}>Clinical Instructions</Text>
          <View
            style={[styles.inputWrapper, { height: 70, alignItems: "flex-start", paddingTop: 8 }]}
          >
            <ShieldCheck size={18} color="#94a3b8" style={{ marginTop: 2 }} />
            <TextInput
              style={[styles.input, { height: 50, textAlignVertical: "top" }]}
              value={currentDraft.instructions}
              onChangeText={(val) => updateCurrentDraft({ instructions: val })}
              placeholder="e.g. Take after meals"
              multiline
            />
          </View>

          {/* Required Human Verification Attestation */}
          <TouchableOpacity
            style={styles.attestationCard}
            activeOpacity={0.85}
            onPress={() => setAccuracyConfirmed((v) => !v)}
          >
            <View
              style={[
                styles.attestationBox,
                accuracyConfirmed && styles.attestationBoxChecked,
              ]}
            >
              {accuracyConfirmed && <Check size={13} color="#ffffff" />}
            </View>
            <Text style={styles.attestationText}>
              I have checked the medication name, dosage strength, and daily intake schedule
              against my physical prescription or bottle label and confirm they are accurate.
            </Text>
          </TouchableOpacity>

          {/* Confirm Action Button */}
          <TouchableOpacity
            style={[
              styles.confirmBtn,
              (saving ||
                selectedDrafts.length === 0 ||
                hasUnconfirmedAllergy ||
                !accuracyConfirmed) &&
                styles.disabledBtn,
            ]}
            onPress={handleConfirm}
            disabled={
              saving ||
              selectedDrafts.length === 0 ||
              hasUnconfirmedAllergy ||
              !accuracyConfirmed
            }
          >
            <CheckCircle2 size={20} color="#ffffff" />
            <Text style={styles.confirmBtnText}>
              {saving
                ? "Saving & Scheduling Alarms..."
                : selectedDrafts.length > 1
                  ? `Save ${selectedDrafts.length} Selected Medications`
                  : "Confirm & Save Regimen"}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.rescanBtn} onPress={handleDiscard}>
            <Text style={styles.rescanBtnText}>Discard &amp; Rescan</Text>
          </TouchableOpacity>
        </ScrollView>
      )}

      {/* Fullscreen Zoom Photo Preview */}
      <Modal visible={photoZoomVisible} animationType="fade" transparent>
        <View
          style={{
            flex: 1,
            backgroundColor: "rgba(0,0,0,0.92)",
            justifyContent: "center",
            alignItems: "center",
          }}
        >
          <TouchableOpacity
            style={{
              position: "absolute",
              top: 48,
              right: 20,
              zIndex: 10,
              width: 44,
              height: 44,
              borderRadius: 22,
              backgroundColor: "rgba(255,255,255,0.2)",
              alignItems: "center",
              justifyContent: "center",
            }}
            onPress={() => setPhotoZoomVisible(false)}
          >
            <X size={24} color="#ffffff" />
          </TouchableOpacity>
          {Boolean(imageUri) && (
            <Image
              source={{ uri: imageUri }}
              style={{ width: "92%", height: "78%" }}
              resizeMode="contain"
            />
          )}
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#ffffff" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: 24,
    paddingHorizontal: 20,
    paddingBottom: 10,
  },
  stepperRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#f1f5f9",
    gap: 8,
  },
  stepPill: {
    flex: 1,
    borderRadius: 10,
    paddingVertical: 7,
    alignItems: "center",
    borderWidth: 1,
  },
  stepPillActive: { backgroundColor: "#059669", borderColor: "#059669" },
  stepPillDone: { backgroundColor: "#ecfdf5", borderColor: "#a7f3d0" },
  stepPillIdle: { backgroundColor: "#f8fafc", borderColor: "#e2e8f0" },
  stepPillText: { fontSize: 11, fontWeight: "800" },
  stepPillTextActive: { color: "#ffffff" },
  stepPillTextDone: { color: "#047857" },
  stepPillTextIdle: { color: "#94a3b8" },
  stepDivider: { width: 14, height: 2, backgroundColor: "#e2e8f0" },
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
  confidenceText: { fontSize: 11, fontWeight: "800", color: "#047857" },
  closeBtn: { padding: 6 },
  content: { padding: 20, paddingBottom: 40 },
  title: { fontSize: 20, fontWeight: "900", color: "#0f172a" },
  subtitle: { fontSize: 12, color: "#64748b", lineHeight: 18, marginTop: 4, marginBottom: 14 },
  backToPreviewLink: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 10,
  },
  backToPreviewText: { fontSize: 12, fontWeight: "800", color: "#047857" },
  previewCardBox: {
    backgroundColor: "#fffbeb",
    borderWidth: 1.5,
    borderStyle: "dashed",
    borderColor: "#fcd34d",
    borderRadius: 16,
    padding: 12,
    marginBottom: 14,
    gap: 8,
  },
  previewBoxHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  previewBoxTitle: { fontSize: 10, fontWeight: "900", color: "#92400e", letterSpacing: 0.4 },
  unconfirmedTag: {
    backgroundColor: "#fef3c7",
    borderRadius: 99,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  unconfirmedTagText: { fontSize: 10, fontWeight: "800", color: "#92400e" },
  previewEmptyText: { fontSize: 12, color: "#92400e", lineHeight: 17 },
  previewItemCard: {
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 12,
    padding: 11,
    gap: 4,
  },
  previewItemTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  previewMedName: { flex: 1, fontSize: 13, fontWeight: "900", color: "#0f172a" },
  confBadge: { borderRadius: 99, paddingHorizontal: 8, paddingVertical: 3 },
  confBadgeText: { fontSize: 10, fontWeight: "800" },
  previewMedMeta: { fontSize: 11, color: "#475569", lineHeight: 16 },
  purposeClassChip: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#e0f2fe",
    borderWidth: 1,
    borderColor: "#bae6fd",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 99,
    marginTop: 2,
  },
  purposeClassText: { fontSize: 10, fontWeight: "800", color: "#0369a1" },
  previewPurposeText: {
    fontSize: 11,
    color: "#0c4a6e",
    backgroundColor: "#f0f9ff",
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 5,
    lineHeight: 16,
    marginTop: 2,
  },
  purposeCard: {
    backgroundColor: "#f0f9ff",
    borderWidth: 1,
    borderColor: "#bae6fd",
    borderRadius: 14,
    padding: 12,
    marginTop: 10,
    gap: 4,
  },
  purposeHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    flexWrap: "wrap",
    gap: 6,
  },
  purposeCardTitle: { fontSize: 10, fontWeight: "900", color: "#0369a1", letterSpacing: 0.4 },
  purposeCardBody: { fontSize: 12, fontWeight: "600", color: "#0c4a6e", lineHeight: 17 },
  purposeCardTip: { fontSize: 11, fontWeight: "700", color: "#0369a1", lineHeight: 16 },
  purposeDisclaimer: { fontSize: 10, fontStyle: "italic", color: "#0369a1", opacity: 0.85 },
  secondaryActionBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#f1f5f9",
    borderWidth: 1,
    borderColor: "#cbd5e1",
    paddingVertical: 13,
    borderRadius: 14,
    marginTop: 10,
  },
  secondaryActionBtnText: { fontSize: 13, fontWeight: "800", color: "#0f172a" },
  manualFallbackBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#fffbeb",
    borderWidth: 1,
    borderColor: "#fcd34d",
    paddingVertical: 13,
    borderRadius: 14,
    marginTop: 10,
  },
  manualFallbackBtnText: { fontSize: 13, fontWeight: "800", color: "#92400e" },
  attestationCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    backgroundColor: "#ecfdf5",
    borderWidth: 1,
    borderColor: "#a7f3d0",
    borderRadius: 14,
    padding: 12,
    marginTop: 18,
  },
  attestationBox: {
    width: 20,
    height: 20,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: "#059669",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#ffffff",
    marginTop: 1,
  },
  attestationBoxChecked: { backgroundColor: "#059669" },
  attestationText: {
    flex: 1,
    fontSize: 11,
    fontWeight: "700",
    color: "#064e3b",
    lineHeight: 16,
  },
  amberBanner: {
    backgroundColor: "#fffbeb",
    borderWidth: 1,
    borderColor: "#fde68a",
    borderRadius: 14,
    padding: 12,
    marginBottom: 14,
  },
  amberBannerTitle: { fontSize: 12, fontWeight: "800", color: "#92400e" },
  amberBannerBody: { fontSize: 11, color: "#b45309", marginTop: 2, lineHeight: 16 },
  multiMedSection: {
    backgroundColor: "#f8fafc",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 14,
    padding: 10,
    marginBottom: 14,
  },
  multiMedHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 6,
  },
  multiMedTitle: { fontSize: 10, fontWeight: "800", color: "#475569", letterSpacing: 0.4 },
  addAnotherPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: "#ecfdf5",
    borderWidth: 1,
    borderColor: "#a7f3d0",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  addAnotherText: { fontSize: 11, fontWeight: "800", color: "#047857" },
  medTabChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#cbd5e1",
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 10,
    maxWidth: 170,
  },
  medTabChipActive: {
    backgroundColor: "#ecfdf5",
    borderColor: "#10b981",
  },
  medCheckBox: {
    width: 17,
    height: 17,
    borderRadius: 5,
    borderWidth: 1.5,
    borderColor: "#94a3b8",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#ffffff",
  },
  medCheckBoxSelected: {
    backgroundColor: "#10b981",
    borderColor: "#10b981",
  },
  medTabText: { fontSize: 12, fontWeight: "700", color: "#334155", maxWidth: 115 },
  medTabTextActive: { color: "#065f46", fontWeight: "800" },
  duplicateCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    backgroundColor: "#fffbeb",
    borderWidth: 1.5,
    borderColor: "#fcd34d",
    borderRadius: 14,
    padding: 12,
    marginBottom: 14,
  },
  duplicateTitle: { fontSize: 10, fontWeight: "900", color: "#92400e", letterSpacing: 0.4 },
  duplicateBody: { fontSize: 11, fontWeight: "600", color: "#92400e", marginTop: 2, lineHeight: 16 },
  allergyAlertCard: {
    backgroundColor: "#fef2f2",
    borderWidth: 1.5,
    borderColor: "#fca5a5",
    borderRadius: 16,
    padding: 14,
    marginBottom: 14,
    gap: 10,
  },
  allergyAlertTitle: { fontSize: 11, fontWeight: "900", color: "#991b1b", letterSpacing: 0.4 },
  allergyAlertBody: { fontSize: 12, fontWeight: "600", color: "#b91c1c", marginTop: 2, lineHeight: 17 },
  overrideRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingTop: 4 },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: "#dc2626",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#ffffff",
  },
  checkboxChecked: { backgroundColor: "#dc2626" },
  overrideText: { flex: 1, fontSize: 11, fontWeight: "700", color: "#7f1d1d", lineHeight: 15 },
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
  photoThumb: { width: 64, height: 64, borderRadius: 10, backgroundColor: "#cbd5e1" },
  photoLabel: { fontSize: 13, fontWeight: "800", color: "#0f172a" },
  photoHint: { fontSize: 11, color: "#64748b", marginTop: 2, lineHeight: 15 },
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
  rawTextLabel: { fontSize: 10, fontWeight: "800", color: "#64748b", letterSpacing: 0.5 },
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
  reparseBtnText: { fontSize: 11, fontWeight: "800", color: "#047857" },
  rawTextInput: { fontSize: 12, color: "#334155", minHeight: 42, textAlignVertical: "top" },
  label: { fontSize: 12, fontWeight: "700", color: "#334155", marginBottom: 6, marginTop: 10 },
  row: { flexDirection: "row", gap: 12 },
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
  input: { flex: 1, fontSize: 13, color: "#0f172a", fontWeight: "600" },
  timesContainer: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 4 },
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
  timeChipText: { fontSize: 12, fontWeight: "800", color: "#065f46" },
  presetChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#f1f5f9",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 9,
  },
  presetChipText: { fontSize: 11, fontWeight: "700", color: "#475569" },
  customTimeRow: { flexDirection: "row", gap: 8, marginTop: 4 },
  customTimeInput: {
    flex: 1,
    backgroundColor: "#f8fafc",
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 40,
    fontSize: 12,
    color: "#0f172a",
  },
  addTimeBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#047857",
    paddingHorizontal: 14,
    borderRadius: 12,
    justifyContent: "center",
  },
  addTimeBtnText: { color: "#ffffff", fontSize: 12, fontWeight: "800" },
  confirmBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#10b981",
    paddingVertical: 15,
    borderRadius: 16,
    marginTop: 18,
    shadowColor: "#10b981",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 4,
  },
  disabledBtn: { opacity: 0.5 },
  confirmBtnText: { color: "#ffffff", fontSize: 14, fontWeight: "800" },
  rescanBtn: { alignItems: "center", paddingVertical: 12, marginTop: 6 },
  rescanBtnText: { color: "#64748b", fontSize: 13, fontWeight: "700" },
});
