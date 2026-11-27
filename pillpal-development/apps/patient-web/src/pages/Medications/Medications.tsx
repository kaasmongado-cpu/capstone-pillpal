import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Pill,
  Clock,
  Stethoscope,
  Search,
  Calendar,
  ShieldCheck,
  Trash2,
  Printer,
  MessageSquare,
  AlertCircle,
  Lock,
  ScanLine,
  Upload,
  X,
  RefreshCw,
  AlertTriangle,
  Plus,
  CheckCircle2,
  RotateCw,
  Copy,
  Info,
  Store,
  PackageCheck,
} from "lucide-react";
import { fetchWithAuth } from "@/lib/api";
import {
  type ExtractedPrescription,
  checkAllergyConflict,
  compressImageFileToBase64,
  findDuplicateActiveMedication,
  lookupMedicationPurpose,
  parseMedicationText,
  parseMultipleMedications,
  recognizeTextWithTesseract,
  rotateImageDataUrl90,
} from "@/lib/ocr";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type PrescriptionStatus = "ACTIVE" | "PAUSED" | "COMPLETED" | "DISCONTINUED";

type FulfillmentStatus =
  | "CLINIC_DISPENSED"
  | "PARTIAL_EXTERNAL"
  | "EXTERNAL_PHARMACY"
  | "AWAITING_DISPENSE"
  | "UNAVAILABLE_IN_CLINIC"
  | "SELF_SCANNED";

type PrescriptionItem = {
  id: string;
  name: string;
  dosage: string;
  form?: string;
  frequency: string;
  instructions: string | null;
  cleanInstructions?: string | null;
  externalPharmacyNote?: string | null;
  fulfillmentStatus?: FulfillmentStatus;
  dispensedUnits?: number;
  scheduleTimes: string[];
  startDate: string;
  endDate: string | null;
  status: PrescriptionStatus;
  doctorId?: string | null;
  source?: "CLINIC_RX" | "PATIENT_SCANNED";
  prescribedBy: string;
};

type FilterTab = "ACTIVE" | "PAUSED" | "COMPLETED" | "DISCONTINUED" | "ALL";

interface WebDraftMedication {
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
  allergyOverride: boolean;
}

function createDraftFromExtracted(item?: ExtractedPrescription): WebDraftMedication {
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
    allergyOverride: false,
  };
}

function computeEndDateIso(durationDaysStr: string): string | null {
  const days = Number(durationDaysStr.trim());
  if (!Number.isFinite(days) || days <= 0 || days > 365) return null;
  const end = new Date();
  end.setDate(end.getDate() + Math.round(days));
  return end.toISOString();
}

const QUICK_TIMES = [
  "06:00 AM",
  "08:00 AM",
  "12:00 PM",
  "02:00 PM",
  "06:00 PM",
  "08:00 PM",
  "09:00 PM",
];

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function getDaysRemaining(endDate: string | null): number | null {
  if (!endDate) return null;
  const end = new Date(endDate);
  if (isNaN(end.getTime())) return null;
  const diffMs = end.getTime() - Date.now();
  return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
}

export function Medications() {
  const navigate = useNavigate();
  const [prescriptions, setPrescriptions] = useState<PrescriptionItem[]>([]);
  const [patientAllergies, setPatientAllergies] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<FilterTab>("ACTIVE");
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);

  // Upload OCR Modal State (3-Step Human-in-the-Loop Confirmation Flow)
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadStep, setUploadStep] = useState<"SELECT" | "CONFIRM_OCR" | "REVIEW">("SELECT");
  const [isDragging, setIsDragging] = useState(false);
  const [ocrProcessing, setOcrProcessing] = useState(false);
  const [ocrProgress, setOcrProgress] = useState<{ percent: number; status: string } | null>(
    null,
  );
  const [ocrError, setOcrError] = useState("");
  const [ocrEngineNotice, setOcrEngineNotice] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [rawText, setRawText] = useState("");
  const [pendingOcrMeds, setPendingOcrMeds] = useState<ExtractedPrescription[]>([]);
  const [editingPendingText, setEditingPendingText] = useState(false);
  const [accuracyConfirmed, setAccuracyConfirmed] = useState(false);

  // Review Form State (supports 1 or multiple medications per prescription slip)
  const [drafts, setDrafts] = useState<WebDraftMedication[]>([createDraftFromExtracted()]);
  const [activeDraftIdx, setActiveDraftIdx] = useState(0);
  const [customTime, setCustomTime] = useState("");
  const [rotatingPhoto, setRotatingPhoto] = useState(false);
  const [savingRx, setSavingRx] = useState(false);

  const currentDraft = drafts[activeDraftIdx] || drafts[0] || createDraftFromExtracted();
  const selectedDrafts = drafts.filter((d) => d.selected);
  const allergyCheck = checkAllergyConflict(currentDraft.name, patientAllergies);
  const activePrescriptions = prescriptions.filter((p) => p.status === "ACTIVE");
  const duplicateCheck = findDuplicateActiveMedication(currentDraft.name, activePrescriptions);
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
  const hasUnconfirmedAllergy = selectedDrafts.some((d) => {
    const check = checkAllergyConflict(d.name, patientAllergies);
    return check.hasConflict && !d.allergyOverride;
  });

  function updateCurrentDraft(patch: Partial<WebDraftMedication>) {
    if (patch.name !== undefined || patch.dosage !== undefined) {
      setAccuracyConfirmed(false);
    }
    setDrafts((prev) =>
      prev.map((d, i) => {
        if (i !== activeDraftIdx) return d;
        const nameChanged = patch.name !== undefined && patch.name !== d.name;
        return {
          ...d,
          ...patch,
          ...(nameChanged ? { allergyOverride: false } : {}),
        };
      }),
    );
  }

  async function loadPrescriptions() {
    setLoading(true);
    setActionError(null);
    try {
      const [medRes, meRes] = await Promise.all([
        fetchWithAuth("/medications"),
        fetchWithAuth("/me"),
      ]);
      if (medRes.ok) {
        const data = await medRes.json();
        setPrescriptions(data);
      }
      if (meRes.ok) {
        const me = await meRes.json();
        setPatientAllergies(me?.patientProfile?.allergies || null);
      }
    } catch (err) {
      console.error("Failed to load prescriptions:", err);
      setActionError("Unable to load your medications right now.");
    } finally {
      setLoading(false);
    }
  }

  function resetUploadModal() {
    setUploadStep("SELECT");
    setOcrError("");
    setOcrEngineNotice(null);
    setPreviewUrl(null);
    setRawText("");
    setPendingOcrMeds([]);
    setEditingPendingText(false);
    setAccuracyConfirmed(false);
    setDrafts([createDraftFromExtracted()]);
    setActiveDraftIdx(0);
    setCustomTime("");
    setRotatingPhoto(false);
    setOcrProcessing(false);
    setOcrProgress(null);
    setSavingRx(false);
  }

  function buildPreviewFromText(text: string): ExtractedPrescription[] {
    const multi = parseMultipleMedications(text);
    if (multi.length > 0) return multi;
    const single = parseMedicationText(text);
    return single.genericName || single.dosage ? [single] : [];
  }

  function applyParsedFields(text: string) {
    const parsedList = buildPreviewFromText(text);
    setAccuracyConfirmed(false);
    if (parsedList.length > 0) {
      setDrafts(parsedList.map((m) => createDraftFromExtracted(m)));
      setActiveDraftIdx(0);
      return;
    }
    setDrafts([createDraftFromExtracted(parseMedicationText(text))]);
    setActiveDraftIdx(0);
  }

  function handleAcceptOcrPreview() {
    const toApply =
      pendingOcrMeds.length > 0
        ? pendingOcrMeds
        : rawText.trim()
          ? buildPreviewFromText(rawText)
          : [];
    setOcrError("");
    setAccuracyConfirmed(false);
    setDrafts(
      toApply.length > 0
        ? toApply.map((m) => createDraftFromExtracted(m))
        : [createDraftFromExtracted()],
    );
    setActiveDraftIdx(0);
    setUploadStep("REVIEW");
  }

  function handleUpdatePendingPreviewFromEditedText() {
    setOcrError("");
    const reparsed = buildPreviewFromText(rawText);
    setPendingOcrMeds(reparsed);
    setEditingPendingText(false);
    if (reparsed.length === 0) {
      setOcrEngineNotice(
        "No standard medication pattern matched the edited text — you can still edit again or switch to manual entry.",
      );
    } else {
      setOcrEngineNotice(
        `Updated preview from your edited text (${reparsed.length} medication${reparsed.length > 1 ? "s" : ""} detected) — confirm if accurate below.`,
      );
    }
  }

  function handleDiscardParseEnterManually() {
    setOcrError("");
    setPendingOcrMeds([]);
    setEditingPendingText(false);
    setAccuracyConfirmed(false);
    setDrafts([createDraftFromExtracted()]);
    setActiveDraftIdx(0);
    setOcrEngineNotice(
      "OCR parse discarded — enter your medication details cleanly below using your photo as reference.",
    );
    setUploadStep("REVIEW");
  }

  async function runVisionExtract(
    imageDataUrl: string,
    base64: string,
    mimeType: string,
  ): Promise<"CONFIRM_OCR" | "REVIEW"> {
    let extractedText = "";
    let structuredMeds: ExtractedPrescription[] = [];
    let cloudUnavailableReason: string | null = null;

    setOcrProgress({ percent: 15, status: "Checking Cloud Vision OCR..." });
    try {
      const res = await fetchWithAuth("/ocr/extract", {
        method: "POST",
        body: JSON.stringify({ imageBase64: base64, mimeType }),
      });

      if (res.ok) {
        const data = await res.json();
        structuredMeds = Array.isArray(data?.medications) ? data.medications : [];
        if (data?.text) extractedText = data.text;

        if (structuredMeds.length > 0) {
          setOcrEngineNotice(
            structuredMeds.length > 1
              ? `Gemini Vision AI detected ${structuredMeds.length} medications — confirm below whether the parse matches your photo before continuing.`
              : "Gemini Vision AI read your photo — confirm below whether the parse is accurate before continuing.",
          );
        } else if (extractedText) {
          setOcrEngineNotice(
            "Vision OCR extracted text from your photo — confirm below whether the parse is accurate.",
          );
        } else {
          cloudUnavailableReason =
            data?.errorCode || (data?.configured === false ? "missing_key" : "unreadable_image");
        }
      } else {
        cloudUnavailableReason = "server_error";
      }
    } catch {
      cloudUnavailableReason = "offline";
    }

    // Automatic local browser OCR fallback via Tesseract.js when Cloud Vision returns nothing
    if (structuredMeds.length === 0 && !extractedText.trim()) {
      try {
        const tessResult = await recognizeTextWithTesseract(
          imageDataUrl,
          (percent, status) => setOcrProgress({ percent, status }),
        );
        if (tessResult.text.trim().length >= 3) {
          extractedText = tessResult.text.trim();
          const parsedList = buildPreviewFromText(extractedText);
          const confPct = Math.round(tessResult.confidence);
          setOcrEngineNotice(
            parsedList.length > 1
              ? `Tesseract.js (${confPct}% OCR confidence) detected ${parsedList.length} medications — confirm below if accurate before continuing.`
              : `Tesseract.js (${confPct}% OCR confidence) read your label locally — confirm below if accurate before continuing.`,
          );
        }
      } catch (tessErr) {
        console.warn("[OCR] Tesseract.js local fallback failed:", tessErr);
      }
    }

    setOcrProgress(null);
    setRawText(extractedText);
    setEditingPendingText(false);
    setAccuracyConfirmed(false);

    const previewMeds =
      structuredMeds.length > 0
        ? structuredMeds
        : extractedText.trim()
          ? buildPreviewFromText(extractedText)
          : [];

    // Do NOT auto-populate final form drafts yet — hold in pendingOcrMeds for explicit user confirmation
    if (previewMeds.length > 0 || extractedText.trim().length > 0) {
      setPendingOcrMeds(previewMeds);
      return "CONFIRM_OCR";
    }

    // Unreadable photo -> skip Confirm step and open clean blank manual form with photo pinned
    setPendingOcrMeds([]);
    setDrafts([createDraftFromExtracted()]);
    setActiveDraftIdx(0);
    if (cloudUnavailableReason === "missing_key") {
      setOcrEngineNotice(
        "Photo uploaded! Local browser OCR couldn't read clear text from this image — try 'Rotate 90° & Re-Scan', enter details manually below, or paste label text to auto-parse.",
      );
    } else if (cloudUnavailableReason === "quota_exceeded") {
      setOcrEngineNotice(
        "Photo uploaded! Vision OCR hit its rate limit and local OCR couldn't read this photo — enter details manually below or retry shortly.",
      );
    } else {
      setOcrEngineNotice(
        "Photo uploaded! Automatic OCR could not read clear text — try 'Rotate 90° & Re-Scan' or enter details from your photo below.",
      );
    }
    return "REVIEW";
  }

  async function handleImageFileSelected(file: File) {
    if (!file.type.startsWith("image/")) {
      setOcrError("Please select a valid image file (JPG, PNG, or WEBP).");
      return;
    }

    setOcrError("");
    setOcrEngineNotice(null);
    setOcrProcessing(true);

    try {
      const { previewUrl: dataUrl, base64, mimeType } = await compressImageFileToBase64(file);
      setPreviewUrl(dataUrl);
      const nextStep = await runVisionExtract(dataUrl, base64, mimeType);
      setUploadStep(nextStep);
    } catch (err: any) {
      setOcrError(err?.message || "Could not process the selected image.");
    } finally {
      setOcrProcessing(false);
      setOcrProgress(null);
    }
  }

  async function handleRotateAndRescan() {
    if (!previewUrl || rotatingPhoto) return;
    setOcrError("");
    setRotatingPhoto(true);
    try {
      const { previewUrl: rotatedUrl, base64, mimeType } = await rotateImageDataUrl90(previewUrl);
      setPreviewUrl(rotatedUrl);
      const nextStep = await runVisionExtract(rotatedUrl, base64, mimeType);
      setUploadStep(nextStep);
    } catch (err: any) {
      setOcrError(err?.message || "Unable to rotate and re-scan photo.");
    } finally {
      setRotatingPhoto(false);
      setOcrProgress(null);
    }
  }

  function handleParseRawTextStep1() {
    if (!rawText.trim()) {
      setOcrError("Please upload an image or paste/type medication label text first.");
      return;
    }
    setOcrError("");
    const previewList = buildPreviewFromText(rawText);
    setPendingOcrMeds(previewList);
    setEditingPendingText(false);
    setAccuracyConfirmed(false);
    setOcrEngineNotice(
      "Preview parsed using the offline Philippine medication lexicon — confirm below if accurate.",
    );
    setUploadStep("CONFIRM_OCR");
  }

  function toggleScheduleTime(timeStr: string) {
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
      setOcrError('Please enter a valid time like "07:30 AM" or "09:30 PM".');
      return;
    }
    setOcrError("");
    if (!currentDraft.scheduleTimes.includes(clean)) {
      updateCurrentDraft({ scheduleTimes: [...currentDraft.scheduleTimes, clean] });
    }
    setCustomTime("");
  }

  async function handleSaveUploadedRegimen(e: React.FormEvent) {
    e.preventDefault();
    setOcrError("");

    if (selectedDrafts.length === 0) {
      setOcrError("Please select at least one medication to save.");
      return;
    }

    for (let i = 0; i < drafts.length; i++) {
      const d = drafts[i]!;
      if (!d.selected) continue;
      if (!d.name.trim() || !d.dosage.trim()) {
        setActiveDraftIdx(i);
        setOcrError(
          `Medication Name and Dosage Strength are required for "${
            d.name.trim() || `Medication #${i + 1}`
          }".`,
        );
        return;
      }
      const check = checkAllergyConflict(d.name, patientAllergies);
      if (check.hasConflict && !d.allergyOverride) {
        setActiveDraftIdx(i);
        setOcrError(
          `Please acknowledge the Drug Allergy Safety Alert for "${d.name.trim()}" before saving.`,
        );
        return;
      }
    }

    setSavingRx(true);
    try {
      const baseTs = Date.now();
      for (let i = 0; i < selectedDrafts.length; i++) {
        const d = selectedDrafts[i]!;
        const res = await fetchWithAuth("/medications/patient-regimen", {
          method: "POST",
          body: JSON.stringify({
            id: `rx_ocr_web_${baseTs}_${i}`,
            name: d.name.trim(),
            dosage: d.dosage.trim(),
            form: d.form.trim() || "Tablet",
            frequency: d.frequency.trim() || `${d.scheduleTimes.length}x daily`,
            scheduleTimes: d.scheduleTimes.length > 0 ? d.scheduleTimes : ["08:00 AM"],
            instructions: d.instructions.trim() || "Uploaded via Patient Portal OCR",
            startDate: new Date().toISOString(),
            endDate: computeEndDateIso(d.durationDays),
          }),
        });

        const body = await res.json().catch(() => null);
        if (!res.ok) {
          throw new Error(body?.message || `Failed to save ${d.name.trim()}.`);
        }
      }

      const successLabel =
        selectedDrafts.length === 1
          ? `${selectedDrafts[0]!.name.trim()} (${selectedDrafts[0]!.dosage.trim()}) added to your daily schedule!`
          : `${selectedDrafts.length} medications added to your daily schedule!`;

      setUploadOpen(false);
      resetUploadModal();
      setActionSuccess(successLabel);
      setTimeout(() => setActionSuccess(null), 4000);
      setStatusFilter("ACTIVE");
      void loadPrescriptions();
    } catch (err: any) {
      setOcrError(err?.message || "Unable to save medication right now.");
    } finally {
      setSavingRx(false);
    }
  }

  async function handleDeletePrescription(item: PrescriptionItem) {
    if (item.source === "CLINIC_RX" || item.doctorId) {
      setActionError(
        "Clinic-issued prescriptions cannot be deleted. Contact CSU Health Services if your regimen changed.",
      );
      return;
    }

    if (
      !window.confirm(
        `Remove your self-scanned medication "${item.name}" from your personal schedule?`,
      )
    ) {
      return;
    }

    setRemovingId(item.id);
    setActionError(null);
    try {
      const res = await fetchWithAuth(`/medications/${item.id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.message || "Failed to remove medication.");
      }
      setPrescriptions((prev) => prev.filter((p) => p.id !== item.id));
    } catch (err: any) {
      setActionError(err?.message || "Could not remove medication.");
    } finally {
      setRemovingId(null);
    }
  }

  function handlePrintSchedule() {
    const activeItems = prescriptions.filter((p) => p.status === "ACTIVE");
    const itemsToPrint = activeItems.length > 0 ? activeItems : prescriptions;

    const rowsHtml = itemsToPrint
      .map(
        (p) => `
          <tr>
            <td><strong>${escapeHtml(p.name)}</strong><br/><span style="color:#475569;font-size:11px;">${escapeHtml(p.dosage)} • ${escapeHtml(p.form || "Tablet")}</span>${
              p.fulfillmentStatus === "EXTERNAL_PHARMACY" || p.fulfillmentStatus === "PARTIAL_EXTERNAL"
                ? `<br/><span style="color:#b45309;font-size:10px;font-weight:700;">${escapeHtml(p.fulfillmentStatus === "PARTIAL_EXTERNAL" ? "Partial Clinic + External Pharmacy" : "Buy at External Pharmacy")}</span>`
                : ""
            }</td>
            <td>${escapeHtml(p.frequency)}<br/><span style="font-family:monospace;font-size:11px;">${escapeHtml(p.scheduleTimes.join(", "))}</span></td>
            <td>${escapeHtml(p.cleanInstructions || p.instructions || "Take as directed")}${
              p.externalPharmacyNote
                ? `<br/><span style="color:#b45309;font-size:11px;">${escapeHtml(p.externalPharmacyNote)}</span>`
                : ""
            }</td>
            <td>${escapeHtml(p.prescribedBy)}<br/><span style="color:#64748b;font-size:11px;">Since ${escapeHtml(new Date(p.startDate).toLocaleDateString())}${p.endDate ? ` until ${escapeHtml(new Date(p.endDate).toLocaleDateString())}` : ""}</span></td>
          </tr>
        `,
      )
      .join("");

    const printWindow = window.open("", "_blank", "width=840,height=700");
    if (!printWindow) return;

    printWindow.document.write(`
      <!doctype html>
      <html>
        <head>
          <title>CSU University Center for Health and Wellness — Daily Medication Schedule</title>
          <style>
            body { font-family: system-ui, -apple-system, sans-serif; color: #0f172a; padding: 28px; }
            .header { border-bottom: 2px solid #059669; padding-bottom: 12px; margin-bottom: 18px; display: flex; justify-content: space-between; align-items: flex-end; }
            h1 { margin: 0; font-size: 18px; color: #065f46; }
            .sub { font-size: 12px; color: #475569; margin-top: 4px; }
            table { width: 100%; border-collapse: collapse; font-size: 12px; }
            th, td { border: 1px solid #cbd5e1; padding: 10px; text-align: left; vertical-align: top; }
            th { background: #ecfdf5; color: #065f46; font-size: 11px; text-transform: uppercase; letter-spacing: 0.04em; }
            .footer { margin-top: 20px; font-size: 11px; color: #64748b; border-top: 1px solid #e2e8f0; padding-top: 10px; }
          </style>
        </head>
        <body>
          <div class="header">
            <div>
              <h1>CSU University Center for Health and Wellness</h1>
              <div class="sub">Personal Daily Medication Schedule (${activeItems.length > 0 ? "Active Regimens" : "All Recorded Regimens"})</div>
            </div>
            <div class="sub">Printed: ${escapeHtml(new Date().toLocaleString())}</div>
          </div>
          ${
            itemsToPrint.length === 0
              ? "<p>No prescriptions recorded.</p>"
              : `<table>
                  <thead>
                    <tr>
                      <th>Medication</th>
                      <th>Frequency &amp; Timings</th>
                      <th>Clinical Instructions</th>
                      <th>Prescriber &amp; Duration</th>
                    </tr>
                  </thead>
                  <tbody>${rowsHtml}</tbody>
                </table>`
          }
          <div class="footer">
            CSU Health Infirmary Hotline: (085) 341-2786 • clinic@carsu.edu.ph. Take medications strictly as directed by your attending physician.
          </div>
        </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
  }

  useEffect(() => {
    void loadPrescriptions();
  }, []);

  const counts = {
    ACTIVE: prescriptions.filter((p) => p.status === "ACTIVE").length,
    PAUSED: prescriptions.filter((p) => p.status === "PAUSED").length,
    COMPLETED: prescriptions.filter((p) => p.status === "COMPLETED").length,
    DISCONTINUED: prescriptions.filter((p) => p.status === "DISCONTINUED").length,
    ALL: prescriptions.length,
  };

  const filtered = prescriptions.filter((p) => {
    const q = search.trim().toLowerCase();
    const matchesSearch =
      !q ||
      p.name.toLowerCase().includes(q) ||
      p.dosage.toLowerCase().includes(q) ||
      p.prescribedBy.toLowerCase().includes(q);
    const matchesStatus = statusFilter === "ALL" ? true : p.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const tabs: { key: FilterTab; label: string }[] = [
    { key: "ACTIVE", label: `Active (${counts.ACTIVE})` },
    { key: "PAUSED", label: `Paused (${counts.PAUSED})` },
    { key: "COMPLETED", label: `Completed (${counts.COMPLETED})` },
    { key: "DISCONTINUED", label: `Discontinued (${counts.DISCONTINUED})` },
    { key: "ALL", label: `All (${counts.ALL})` },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-slate-900">
            My Medications &amp; Prescriptions
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Review your doctor-prescribed regimens, upload prescription/bottle photos, and track
            dosage schedules.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              resetUploadModal();
              setUploadOpen(true);
            }}
            className="rounded-xl text-xs font-bold gap-1.5 border-emerald-200 bg-emerald-50/70 text-emerald-800 hover:bg-emerald-100 cursor-pointer"
          >
            <Upload className="h-3.5 w-3.5" />
            Upload Rx / Label
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handlePrintSchedule}
            disabled={prescriptions.length === 0}
            className="rounded-xl text-xs font-bold gap-1.5 cursor-pointer"
          >
            <Printer className="h-3.5 w-3.5" />
            Print Schedule
          </Button>
          <Link to="/app/appointments">
            <Button
              size="sm"
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-xs gap-1.5 cursor-pointer"
            >
              <Calendar className="h-4 w-4" />
              Request Refill / Visit
            </Button>
          </Link>
        </div>
      </div>

      {/* Safety Notice */}
      <div className="rounded-2xl border border-emerald-100 bg-emerald-50/50 p-4 text-xs flex items-center gap-2.5">
        <ShieldCheck className="h-5 w-5 text-emerald-600 shrink-0" />
        <p className="text-emerald-900 font-medium">
          Verified CSU Clinic prescriptions are protected clinical records managed by your
          attending physician. Uploaded/self-scanned OTC reminders sync across web and mobile and
          can be removed anytime.
        </p>
      </div>

      {actionSuccess && (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-3.5 text-xs font-semibold text-emerald-800 flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
          <span>{actionSuccess}</span>
        </div>
      )}

      {actionError && (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-3.5 text-xs font-semibold text-red-700 flex items-center gap-2">
          <AlertCircle className="h-4 w-4 text-red-600 shrink-0" />
          <span>{actionError}</span>
        </div>
      )}

      {/* Filter & Search Bar */}
      <div className="flex flex-col lg:flex-row gap-3 items-stretch lg:items-center justify-between">
        <div className="relative w-full lg:w-72">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <Input
            placeholder="Search medicine, dosage, or doctor..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 text-xs rounded-xl"
          />
        </div>

        <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl overflow-x-auto">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setStatusFilter(tab.key)}
              className={`shrink-0 px-3 py-1.5 text-xs font-bold rounded-lg transition-colors cursor-pointer ${
                statusFilter === tab.key
                  ? "bg-white text-slate-900 shadow-2xs"
                  : "text-slate-500 hover:text-slate-800"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Prescriptions List */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 animate-pulse">
          <div className="h-64 rounded-3xl bg-white border border-slate-200/80" />
          <div className="h-64 rounded-3xl bg-white border border-slate-200/80" />
        </div>
      ) : filtered.length === 0 ? (
        <Card className="rounded-3xl border border-slate-200/80 p-12 text-center bg-white space-y-2">
          <Pill className="h-8 w-8 text-slate-300 mx-auto" />
          <p className="text-sm font-bold text-slate-700">No prescriptions in this view</p>
          <p className="text-xs text-slate-400">
            {search
              ? "Try clearing your search query or switching status tabs."
              : "Prescriptions issued by CSU Clinic physicians or uploaded via OCR will appear here."}
          </p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {filtered.map((item) => {
            const isClinicRx = item.source === "CLINIC_RX" || Boolean(item.doctorId);
            const daysRemaining =
              item.status === "ACTIVE" ? getDaysRemaining(item.endDate) : null;

            return (
              <Card
                key={item.id}
                className="rounded-3xl border border-slate-200/80 bg-white shadow-xs hover:shadow-md transition-shadow flex flex-col justify-between overflow-hidden"
              >
                <div>
                  <CardHeader className="pb-3 border-b border-slate-100 bg-slate-50/40">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-3 min-w-0">
                        <div
                          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl font-bold ${
                            isClinicRx
                              ? "bg-emerald-50 text-emerald-700"
                              : "bg-sky-50 text-[#0284c7]"
                          }`}
                        >
                          <Pill className="h-5 w-5" />
                        </div>
                        <div className="min-w-0">
                          <CardTitle className="text-base font-black text-slate-900 truncate">
                            {item.name}
                          </CardTitle>
                          <div className="flex flex-wrap items-center gap-1.5 mt-0.5">
                            <span className="text-xs font-bold text-emerald-700">
                              {item.dosage} • {item.form || "Tablet"}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="flex flex-col items-end gap-1 shrink-0">
                        <span
                          className={`rounded-full px-2.5 py-0.5 text-[10px] font-black ${
                            item.status === "ACTIVE"
                              ? "bg-emerald-100 text-emerald-800"
                              : item.status === "PAUSED"
                                ? "bg-amber-100 text-amber-800"
                                : item.status === "DISCONTINUED"
                                  ? "bg-red-100 text-red-700"
                                  : "bg-slate-100 text-slate-600"
                          }`}
                        >
                          {item.status}
                        </span>
                        <span
                          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-extrabold ${
                            isClinicRx
                              ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                              : "bg-sky-50 text-[#0369a1] border border-sky-200"
                          }`}
                        >
                          {isClinicRx ? (
                            <>
                              <ShieldCheck className="h-2.5 w-2.5" />
                              CSU Clinic Rx
                            </>
                          ) : (
                            <>
                              <ScanLine className="h-2.5 w-2.5" />
                              Self-Scanned
                            </>
                          )}
                        </span>
                      </div>
                    </div>
                  </CardHeader>

                  <CardContent className="space-y-4 pt-4 text-xs">
                    {(() => {
                      const medInfo = lookupMedicationPurpose(item.name);
                      if (!medInfo) return null;
                      return (
                        <div className="rounded-xl border border-sky-200/80 bg-sky-50/70 p-2.5 space-y-1">
                          <div className="flex items-center justify-between gap-2">
                            <span className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-wide text-sky-900">
                              <Info className="h-3 w-3 text-sky-600" />
                              What It&apos;s For
                            </span>
                            <span className="rounded-full bg-white border border-sky-200 px-2 py-0.5 text-[9px] font-extrabold text-sky-800">
                              {medInfo.drugClass}
                            </span>
                          </div>
                          <p className="text-[11px] leading-snug text-sky-950 font-medium">
                            {medInfo.usedFor}
                          </p>
                        </div>
                      );
                    })()}

                    {isClinicRx &&
                      (item.fulfillmentStatus === "EXTERNAL_PHARMACY" ||
                        item.fulfillmentStatus === "PARTIAL_EXTERNAL" ||
                        item.fulfillmentStatus === "CLINIC_DISPENSED") && (
                        <div
                          className={`rounded-xl border p-2.5 flex items-start gap-2 ${
                            item.fulfillmentStatus === "CLINIC_DISPENSED"
                              ? "border-emerald-200/80 bg-emerald-50/70 text-emerald-900"
                              : "border-amber-200 bg-amber-50/80 text-amber-950"
                          }`}
                        >
                          {item.fulfillmentStatus === "CLINIC_DISPENSED" ? (
                            <PackageCheck className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
                          ) : (
                            <Store className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                          )}
                          <div className="space-y-0.5">
                            <p className="text-[11px] font-extrabold">
                              {item.fulfillmentStatus === "CLINIC_DISPENSED"
                                ? `Dispensed by CSU Clinic (${item.dispensedUnits || 1} unit${(item.dispensedUnits || 1) === 1 ? "" : "s"})`
                                : item.fulfillmentStatus === "PARTIAL_EXTERNAL"
                                  ? `Partial Clinic Supply (${item.dispensedUnits || 0} units) — Buy Balance Outside`
                                  : "Purchase at External Pharmacy"}
                            </p>
                            {item.fulfillmentStatus !== "CLINIC_DISPENSED" && (
                              <p className="text-[11px] leading-snug text-amber-900/90">
                                {item.externalPharmacyNote ||
                                  "Not currently available in CSU Clinic stock. Present your CSU prescription slip at a licensed pharmacy; your dose reminders are active."}
                              </p>
                            )}
                          </div>
                        </div>
                      )}

                    <div className="space-y-1">
                      <span className="text-[10px] font-bold uppercase text-slate-400">
                        Intake Instructions
                      </span>
                      <p className="text-slate-700 font-semibold bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                        {item.cleanInstructions || item.instructions || item.frequency}
                      </p>
                    </div>

                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-bold uppercase text-slate-400">
                          Scheduled Timings ({item.frequency})
                        </span>
                        {daysRemaining !== null && (
                          <span
                            className={`rounded-md px-2 py-0.5 text-[10px] font-bold ${
                              daysRemaining <= 0
                                ? "bg-amber-100 text-amber-800"
                                : daysRemaining <= 2
                                  ? "bg-amber-50 text-amber-700 border border-amber-200"
                                  : "bg-emerald-50 text-emerald-700"
                            }`}
                          >
                            {daysRemaining <= 0
                              ? "Course ending today"
                              : `${daysRemaining} day${daysRemaining === 1 ? "" : "s"} left`}
                          </span>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {item.scheduleTimes.map((time, idx) => (
                          <span
                            key={idx}
                            className="inline-flex items-center gap-1 rounded-lg bg-white border border-slate-200 px-2.5 py-1 text-xs font-mono font-bold text-slate-700 shadow-2xs"
                          >
                            <Clock className="h-3 w-3 text-emerald-600" />
                            {time}
                          </span>
                        ))}
                      </div>
                    </div>

                    <div className="pt-2 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500">
                      <span className="flex items-center gap-1 font-medium">
                        <Stethoscope className="h-3.5 w-3.5 text-[#0284c7]" />
                        {isClinicRx ? `Prescribed by ${item.prescribedBy}` : item.prescribedBy}
                      </span>
                      <span className="font-mono text-[10px]">
                        {new Date(item.startDate).toLocaleDateString()}
                        {item.endDate
                          ? ` → ${new Date(item.endDate).toLocaleDateString()}`
                          : " • Ongoing"}
                      </span>
                    </div>
                  </CardContent>
                </div>

                <div className="p-4 bg-slate-50/70 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2">
                  {isClinicRx ? (
                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-400">
                      <Lock className="h-3 w-3" />
                      Managed by CSU Clinic
                    </span>
                  ) : (
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={removingId === item.id}
                      onClick={() => handleDeletePrescription(item)}
                      className="h-8 text-xs font-bold text-red-600 hover:text-red-700 hover:bg-red-50 rounded-xl gap-1 cursor-pointer"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      {removingId === item.id ? "Removing..." : "Remove"}
                    </Button>
                  )}

                  <div className="flex items-center gap-1.5">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() =>
                        navigate("/app/messages", {
                          state: {
                            prefillPrompt: `Doctor, I have a question regarding my ${item.name} (${item.dosage}) prescription.`,
                          },
                        })
                      }
                      className="h-8 text-xs font-bold rounded-xl text-slate-600 hover:bg-slate-200/70 gap-1 cursor-pointer"
                    >
                      <MessageSquare className="h-3.5 w-3.5" />
                      Ask Clinician
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        navigate("/app/appointments", {
                          state: {
                            prefillReason: `Prescription Refill / Follow-up: ${item.name} ${item.dosage}`,
                          },
                        })
                      }
                      className="h-8 text-xs font-bold rounded-xl text-emerald-700 hover:bg-emerald-50 border-emerald-200 cursor-pointer"
                    >
                      Request Refill
                    </Button>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* UPLOAD RX / LABEL OCR MODAL */}
      {uploadOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/55 backdrop-blur-xs p-4">
          <div className="w-full max-w-2xl rounded-3xl bg-white p-6 shadow-2xl border border-slate-100 space-y-4 max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700">
                  <Upload className="h-4 w-4" />
                </div>
                <div>
                  <h2 className="text-base font-black text-slate-900">
                    Upload Prescription or Pill Bottle Photo
                  </h2>
                  <p className="text-xs text-slate-500">
                    {uploadStep === "SELECT"
                      ? "Step 1 of 3 — Upload a photo to read via OCR, or paste label text."
                      : uploadStep === "CONFIRM_OCR"
                        ? "Step 2 of 3 — Confirm whether the OCR parse is accurate before filling your schedule."
                        : "Step 3 of 3 — Verify final medication details, allergy safety, and daily dosing schedule."}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setUploadOpen(false)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* 3-Step Visual Stepper */}
            <div className="flex items-center gap-2 text-[11px] font-bold">
              {(
                [
                  { id: "SELECT", label: "1. Upload" },
                  { id: "CONFIRM_OCR", label: "2. Confirm OCR" },
                  { id: "REVIEW", label: "3. Verify & Save" },
                ] as const
              ).map((s, idx) => {
                const stepOrder = { SELECT: 0, CONFIRM_OCR: 1, REVIEW: 2 };
                const activeOrder = stepOrder[uploadStep];
                const isDone = idx < activeOrder;
                const isCurrent = idx === activeOrder;
                return (
                  <div key={s.id} className="flex items-center gap-2 flex-1">
                    <div
                      className={`flex-1 rounded-xl px-2.5 py-1.5 text-center border transition-all ${
                        isCurrent
                          ? "bg-emerald-600 text-white border-emerald-600 shadow-2xs"
                          : isDone
                            ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                            : "bg-slate-50 text-slate-400 border-slate-200"
                      }`}
                    >
                      {s.label}
                    </div>
                  </div>
                );
              })}
            </div>

            {ocrError && (
              <div className="rounded-xl bg-red-50 border border-red-200 p-3 text-xs font-semibold text-red-700 flex items-center gap-2">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{ocrError}</span>
              </div>
            )}

            {uploadStep === "SELECT" ? (
              <div className="space-y-4">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) void handleImageFileSelected(file);
                    e.target.value = "";
                  }}
                />

                {/* Drag & Drop Zone */}
                <div
                  onDragOver={(e) => {
                    e.preventDefault();
                    setIsDragging(true);
                  }}
                  onDragLeave={() => setIsDragging(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setIsDragging(false);
                    const file = e.dataTransfer.files?.[0];
                    if (file) void handleImageFileSelected(file);
                  }}
                  onClick={() => !ocrProcessing && fileInputRef.current?.click()}
                  className={`rounded-2xl border-2 border-dashed p-8 text-center transition-all cursor-pointer space-y-3 ${
                    isDragging
                      ? "border-emerald-500 bg-emerald-50/70"
                      : "border-slate-300 bg-slate-50/60 hover:border-emerald-400 hover:bg-emerald-50/30"
                  }`}
                >
                  <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700">
                    <Upload className="h-6 w-6" />
                  </div>
                  <div>
                    <p className="text-sm font-black text-slate-900">
                      {ocrProcessing
                        ? ocrProgress?.status || "Reading medication photo..."
                        : "Click to choose a photo or drag & drop here"}
                    </p>
                    <p className="text-xs text-slate-500 mt-1">
                      Supports JPG, PNG, and WEBP photos — uses Vision AI with automatic local
                      Tesseract.js browser OCR fallback.
                    </p>
                  </div>
                  {ocrProcessing && ocrProgress && (
                    <div className="mx-auto max-w-xs space-y-1">
                      <div className="h-1.5 w-full rounded-full bg-emerald-100 overflow-hidden">
                        <div
                          className="h-full rounded-full bg-emerald-600 transition-all duration-200"
                          style={{ width: `${Math.max(8, ocrProgress.percent)}%` }}
                        />
                      </div>
                      <p className="text-[11px] font-bold text-emerald-700">
                        {ocrProgress.percent}%
                      </p>
                    </div>
                  )}
                  <Button
                    type="button"
                    size="sm"
                    disabled={ocrProcessing}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold cursor-pointer"
                  >
                    {ocrProcessing ? "Processing Image..." : "Browse Device Files"}
                  </Button>
                </div>

                {/* Or Paste Label Text */}
                <div className="space-y-2 pt-2 border-t border-slate-100">
                  <Label className="text-xs">Or Type / Paste Label Text Directly</Label>
                  <textarea
                    rows={3}
                    value={rawText}
                    onChange={(e) => setRawText(e.target.value)}
                    placeholder='e.g. "Biogesic Paracetamol 500mg Tablet. Take 1 tablet every 6 hours as needed"'
                    className="w-full rounded-xl border border-slate-200 p-3 text-xs text-slate-800"
                  />
                  <div className="flex justify-end gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setUploadOpen(false)}
                      className="rounded-xl text-xs cursor-pointer"
                    >
                      Cancel
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      disabled={!rawText.trim() || ocrProcessing}
                      onClick={handleParseRawTextStep1}
                      className="rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold gap-1.5 cursor-pointer"
                    >
                      Parse Text &amp; Continue
                    </Button>
                  </div>
                </div>
              </div>
            ) : uploadStep === "CONFIRM_OCR" ? (
              <div className="space-y-4 text-xs">
                {rotatingPhoto && ocrProgress && (
                  <div className="rounded-xl bg-sky-50 border border-sky-200 p-3 space-y-1.5">
                    <div className="flex items-center justify-between text-xs font-bold text-sky-900">
                      <span>{ocrProgress.status}</span>
                      <span>{ocrProgress.percent}%</span>
                    </div>
                    <div className="h-1.5 w-full rounded-full bg-sky-100 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-sky-600 transition-all duration-200"
                        style={{ width: `${Math.max(8, ocrProgress.percent)}%` }}
                      />
                    </div>
                  </div>
                )}

                {ocrEngineNotice && (
                  <div className="rounded-xl bg-amber-50 border border-amber-200 p-3 text-xs font-medium text-amber-900 flex items-start gap-2">
                    <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                    <span>{ocrEngineNotice}</span>
                  </div>
                )}

                {/* Photo + Raw OCR Text Side-by-Side */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {previewUrl && (
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-2.5 flex flex-col items-center justify-center gap-2">
                      <img
                        src={previewUrl}
                        alt="Uploaded prescription or label"
                        className="max-h-48 rounded-xl object-contain"
                      />
                      <div className="flex items-center justify-between w-full px-1">
                        <span className="text-[10px] text-slate-400">Compare against photo</span>
                        <button
                          type="button"
                          disabled={rotatingPhoto}
                          onClick={() => void handleRotateAndRescan()}
                          className="inline-flex items-center gap-1 rounded-lg bg-white border border-slate-200 px-2 py-1 text-[10px] font-bold text-slate-700 hover:bg-slate-100 cursor-pointer disabled:opacity-50"
                        >
                          <RotateCw
                            className={`h-3 w-3 ${rotatingPhoto ? "animate-spin" : ""}`}
                          />
                          {rotatingPhoto ? "Re-Scanning..." : "Rotate 90° & Re-Scan"}
                        </button>
                      </div>
                    </div>
                  )}

                  <div className={previewUrl ? "space-y-1.5" : "sm:col-span-2 space-y-1.5"}>
                    <div className="flex items-center justify-between">
                      <Label className="text-[11px] text-slate-600 font-bold">
                        Raw OCR Text {editingPendingText ? "(Editing)" : "(Read-Only Preview)"}
                      </Label>
                      {!editingPendingText ? (
                        <button
                          type="button"
                          onClick={() => setEditingPendingText(true)}
                          className="inline-flex items-center gap-1 rounded-lg bg-slate-100 border border-slate-200 px-2 py-0.5 text-[10px] font-bold text-slate-700 hover:bg-slate-200 cursor-pointer"
                        >
                          Edit Text
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={handleUpdatePendingPreviewFromEditedText}
                          className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-0.5 text-[10px] font-bold text-white hover:bg-emerald-700 cursor-pointer"
                        >
                          <RefreshCw className="h-3 w-3" />
                          Update Preview
                        </button>
                      )}
                    </div>
                    <textarea
                      rows={6}
                      readOnly={!editingPendingText}
                      value={rawText}
                      onChange={(e) => setRawText(e.target.value)}
                      placeholder="Raw text extracted from your photo..."
                      className={`w-full rounded-xl border p-2.5 text-xs ${
                        editingPendingText
                          ? "border-emerald-400 bg-white text-slate-900"
                          : "border-slate-200 bg-slate-50 text-slate-700"
                      }`}
                    />
                  </div>
                </div>

                {/* Unconfirmed Parsed Preview Cards */}
                <div className="rounded-2xl border-2 border-dashed border-amber-300 bg-amber-50/40 p-3.5 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-black uppercase tracking-wider text-amber-900">
                      Unconfirmed OCR Preview — Is This Parse Correct?
                    </span>
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-extrabold text-amber-800">
                      Not Saved Yet
                    </span>
                  </div>

                  {pendingOcrMeds.length === 0 ? (
                    <p className="text-xs text-amber-900">
                      The text above did not match a standard medication format yet. Click{" "}
                      <strong>Edit Text</strong> to fix OCR typos and click{" "}
                      <strong>Update Preview</strong>, or choose{" "}
                      <strong>Wrong Parse — Enter Manually</strong>.
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {pendingOcrMeds.map((med, idx) => {
                        const pct = Math.round((med.confidenceScore || 0) * 100);
                        const confTone =
                          pct >= 85
                            ? "bg-emerald-100 text-emerald-800 border-emerald-200"
                            : pct >= 60
                              ? "bg-amber-100 text-amber-800 border-amber-200"
                              : "bg-red-100 text-red-800 border-red-200";
                        const curatedInfo = lookupMedicationPurpose(med.genericName);
                        const resolvedClass = curatedInfo?.drugClass || med.drugClass;
                        const resolvedUsedFor = curatedInfo?.usedFor || med.usedFor;
                        return (
                          <div
                            key={idx}
                            className="rounded-xl border border-slate-200 bg-white p-3 space-y-1.5"
                          >
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="text-xs font-black text-slate-900">
                                  {med.genericName || "(Name not detected)"}
                                </span>
                                {med.brandName && (
                                  <span className="text-[11px] text-slate-500">
                                    ({med.brandName})
                                  </span>
                                )}
                                {resolvedClass && (
                                  <span className="rounded-full bg-sky-50 border border-sky-200 px-2 py-0.5 text-[10px] font-bold text-sky-800">
                                    {resolvedClass}
                                  </span>
                                )}
                              </div>
                              <span
                                className={`rounded-full border px-2 py-0.5 text-[10px] font-extrabold ${confTone}`}
                              >
                                {pct >= 85
                                  ? `High Match • ${pct}%`
                                  : pct >= 60
                                    ? `Check Carefully • ${pct}%`
                                    : `Low Match • ${pct}%`}
                              </span>
                            </div>
                            {resolvedUsedFor && (
                              <div className="rounded-lg bg-sky-50/70 border border-sky-100 px-2.5 py-1.5 text-[11px] text-sky-950 flex items-start gap-1.5">
                                <Info className="h-3.5 w-3.5 text-sky-600 shrink-0 mt-0.5" />
                                <span>
                                  <strong>Used for:</strong> {resolvedUsedFor}
                                  {med.prescribedFor ? ` (Slip notes: "${med.prescribedFor}")` : ""}
                                </span>
                              </div>
                            )}
                            <div className="flex flex-wrap gap-2 text-[11px] text-slate-600">
                              <span>
                                <strong>Strength:</strong>{" "}
                                {med.dosage ? (
                                  med.dosage
                                ) : (
                                  <span className="font-bold text-amber-700">
                                    Not detected (required)
                                  </span>
                                )}
                              </span>
                              <span>•</span>
                              <span>
                                <strong>Form:</strong> {med.form}
                              </span>
                              <span>•</span>
                              <span>
                                <strong>Frequency:</strong> {med.frequency}
                              </span>
                              {med.durationDays && (
                                <>
                                  <span>•</span>
                                  <span>
                                    <strong>Duration:</strong> {med.durationDays} days
                                  </span>
                                </>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Explicit Confirmation Actions */}
                <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100">
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setUploadStep("SELECT")}
                      className="rounded-xl text-xs font-bold cursor-pointer"
                    >
                      Retake / Upload Another
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handleDiscardParseEnterManually}
                      className="rounded-xl border-amber-300 bg-amber-50 text-amber-900 hover:bg-amber-100 text-xs font-bold cursor-pointer"
                    >
                      Wrong Parse — Enter Manually
                    </Button>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {!editingPendingText && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setEditingPendingText(true)}
                        className="rounded-xl text-xs font-bold cursor-pointer"
                      >
                        No, Edit Text &amp; Re-Parse
                      </Button>
                    )}
                    <Button
                      type="button"
                      size="sm"
                      disabled={pendingOcrMeds.length === 0 || editingPendingText}
                      onClick={handleAcceptOcrPreview}
                      className="rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold gap-1.5 cursor-pointer"
                    >
                      <CheckCircle2 className="h-4 w-4" />
                      Yes, Parse is Correct → Continue
                    </Button>
                  </div>
                </div>
              </div>
            ) : (
              <form onSubmit={handleSaveUploadedRegimen} className="space-y-4 text-xs">
                {rotatingPhoto && ocrProgress && (
                  <div className="rounded-xl bg-sky-50 border border-sky-200 p-3 space-y-1.5">
                    <div className="flex items-center justify-between text-xs font-bold text-sky-900">
                      <span>{ocrProgress.status}</span>
                      <span>{ocrProgress.percent}%</span>
                    </div>
                    <div className="h-1.5 w-full rounded-full bg-sky-100 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-sky-600 transition-all duration-200"
                        style={{ width: `${Math.max(8, ocrProgress.percent)}%` }}
                      />
                    </div>
                  </div>
                )}

                {ocrEngineNotice && (
                  <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-3 text-xs font-medium text-emerald-900 flex items-center gap-2">
                    <span>{ocrEngineNotice}</span>
                  </div>
                )}

                {/* Multi-Medication Selector Strip (shown when 2+ medications detected) */}
                {drafts.length > 1 && (
                  <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-black uppercase tracking-wide text-slate-600">
                        Detected Medications ({selectedDrafts.length}/{drafts.length} Selected)
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          setDrafts((prev) => [...prev, createDraftFromExtracted()]);
                          setActiveDraftIdx(drafts.length);
                        }}
                        className="inline-flex items-center gap-1 rounded-lg bg-emerald-50 border border-emerald-200 px-2 py-0.5 text-[10px] font-bold text-emerald-700 hover:bg-emerald-100 cursor-pointer"
                      >
                        <Plus className="h-3 w-3" />
                        Add Another
                      </button>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {drafts.map((d, idx) => {
                        const isActive = idx === activeDraftIdx;
                        const dAllergy = checkAllergyConflict(d.name, patientAllergies);
                        return (
                          <div
                            key={idx}
                            className={`inline-flex items-center gap-1.5 rounded-xl border px-2.5 py-1.5 text-xs font-bold transition-all ${
                              isActive
                                ? "border-emerald-500 bg-emerald-50 text-emerald-900 shadow-2xs"
                                : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
                            } ${!d.selected ? "opacity-55" : ""}`}
                          >
                            <input
                              type="checkbox"
                              checked={d.selected}
                              onChange={() =>
                                setDrafts((prev) =>
                                  prev.map((item, i) =>
                                    i === idx ? { ...item, selected: !item.selected } : item,
                                  ),
                                )
                              }
                              className="h-3.5 w-3.5 accent-emerald-600 cursor-pointer"
                            />
                            <button
                              type="button"
                              onClick={() => setActiveDraftIdx(idx)}
                              className="inline-flex items-center gap-1 cursor-pointer"
                            >
                              <span>{d.name.trim() || `Medication #${idx + 1}`}</span>
                              {dAllergy.hasConflict && (
                                <AlertTriangle className="h-3.5 w-3.5 text-red-600" />
                              )}
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Duplicate Active Regimen Warning */}
                {duplicateCheck.isDuplicate && (
                  <div className="rounded-2xl bg-amber-50 border border-amber-300 p-3.5 flex items-start gap-2.5">
                    <Copy className="h-4 w-4 text-amber-700 shrink-0 mt-0.5" />
                    <div>
                      <p className="text-xs font-black text-amber-900 uppercase">
                        Already in Your Active Schedule
                      </p>
                      <p className="text-xs text-amber-800 mt-0.5">
                        You already have an active{" "}
                        {duplicateCheck.isClinicRx ? "CSU Clinic prescription" : "schedule"} for{" "}
                        <strong>{duplicateCheck.existingName}</strong>. Avoid saving duplicates to
                        prevent double-dosing.
                      </p>
                    </div>
                  </div>
                )}

                {/* Drug Allergy Contraindication Warning */}
                {allergyCheck.hasConflict && (
                  <div className="rounded-2xl bg-red-50 border-2 border-red-300 p-4 space-y-2.5">
                    <div className="flex items-start gap-2.5">
                      <AlertTriangle className="h-5 w-5 text-red-600 shrink-0 mt-0.5" />
                      <div>
                        <p className="text-xs font-black text-red-900 uppercase">
                          Drug Allergy Safety Alert
                        </p>
                        <p className="text-xs font-medium text-red-800 mt-0.5">
                          {allergyCheck.warningMessage}
                        </p>
                      </div>
                    </div>
                    <label className="flex items-center gap-2 text-xs font-bold text-red-900 cursor-pointer pt-1">
                      <input
                        type="checkbox"
                        checked={currentDraft.allergyOverride}
                        onChange={(e) =>
                          updateCurrentDraft({ allergyOverride: e.target.checked })
                        }
                        className="h-4 w-4 accent-red-600"
                      />
                      I have confirmed with a CSU physician or pharmacist that this medication is
                      safe for me.
                    </label>
                  </div>
                )}

                {/* Uploaded Photo Preview + Raw Text Re-Parse */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {previewUrl && (
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-2 flex flex-col items-center justify-center gap-2">
                      <img
                        src={previewUrl}
                        alt="Uploaded prescription or label"
                        className="max-h-40 rounded-xl object-contain"
                      />
                      <div className="flex items-center justify-between w-full px-1">
                        <span className="text-[10px] text-slate-400">
                          Private browser preview
                        </span>
                        <button
                          type="button"
                          disabled={rotatingPhoto}
                          onClick={() => void handleRotateAndRescan()}
                          className="inline-flex items-center gap-1 rounded-lg bg-white border border-slate-200 px-2 py-1 text-[10px] font-bold text-slate-700 hover:bg-slate-100 cursor-pointer disabled:opacity-50"
                        >
                          <RotateCw
                            className={`h-3 w-3 ${rotatingPhoto ? "animate-spin" : ""}`}
                          />
                          {rotatingPhoto ? "Re-Scanning..." : "Rotate 90° & Re-Scan"}
                        </button>
                      </div>
                    </div>
                  )}

                  <div className={previewUrl ? "space-y-1.5" : "sm:col-span-2 space-y-1.5"}>
                    <div className="flex items-center justify-between">
                      <Label className="text-[11px] text-slate-500">Extracted / Raw Text</Label>
                      <button
                        type="button"
                        onClick={() => rawText.trim() && applyParsedFields(rawText)}
                        className="inline-flex items-center gap-1 rounded-lg bg-emerald-50 border border-emerald-200 px-2 py-0.5 text-[10px] font-bold text-emerald-700 hover:bg-emerald-100 cursor-pointer"
                      >
                        <RefreshCw className="h-3 w-3" />
                        Re-Parse
                      </button>
                    </div>
                    <textarea
                      rows={5}
                      value={rawText}
                      onChange={(e) => setRawText(e.target.value)}
                      placeholder="Type or edit label text (supports multiple medications on separate lines) and click Re-Parse..."
                      className="w-full rounded-xl border border-slate-200 p-2.5 text-xs text-slate-800"
                    />
                  </div>
                </div>

                {/* Structured Fields */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Medication / Generic Name *</Label>
                    <Input
                      required
                      value={currentDraft.name}
                      onChange={(e) => updateCurrentDraft({ name: e.target.value })}
                      placeholder="e.g. Paracetamol"
                      className="rounded-xl text-xs h-9"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Dosage Strength *</Label>
                    <Input
                      required
                      value={currentDraft.dosage}
                      onChange={(e) => updateCurrentDraft({ dosage: e.target.value })}
                      placeholder="e.g. 500 mg"
                      className="rounded-xl text-xs h-9"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Dosage Form</Label>
                    <Input
                      value={currentDraft.form}
                      onChange={(e) => updateCurrentDraft({ form: e.target.value })}
                      placeholder="Tablet / Capsule / Syrup"
                      className="rounded-xl text-xs h-9"
                    />
                  </div>
                  <div className="grid grid-cols-5 gap-2">
                    <div className="col-span-3 space-y-1">
                      <Label className="text-xs">Frequency</Label>
                      <Input
                        value={currentDraft.frequency}
                        onChange={(e) => updateCurrentDraft({ frequency: e.target.value })}
                        placeholder="e.g. Three times daily"
                        className="rounded-xl text-xs h-9"
                      />
                    </div>
                    <div className="col-span-2 space-y-1">
                      <Label className="text-xs">Days (Opt.)</Label>
                      <Input
                        type="number"
                        min={1}
                        max={365}
                        value={currentDraft.durationDays}
                        onChange={(e) => updateCurrentDraft({ durationDays: e.target.value })}
                        placeholder="e.g. 7"
                        className="rounded-xl text-xs h-9"
                      />
                    </div>
                  </div>
                </div>

                {/* Live "What This Medicine Is For" Clinical Guide Card */}
                {currentDraft.name.trim().length >= 3 && (
                  <div className="rounded-2xl border border-sky-200 bg-sky-50/70 p-3.5 space-y-1.5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="inline-flex items-center gap-1.5 text-[11px] font-black uppercase tracking-wide text-sky-900">
                        <Info className="h-3.5 w-3.5 text-sky-600" />
                        What This Medicine Is For
                      </span>
                      {currentPurpose ? (
                        <span className="rounded-full bg-white border border-sky-200 px-2.5 py-0.5 text-[10px] font-extrabold text-sky-800">
                          {currentPurpose.drugClass}
                          {currentPurpose.source === "ai-vision" ? " • AI Info" : ""}
                        </span>
                      ) : (
                        <span className="rounded-full bg-white border border-slate-200 px-2 py-0.5 text-[10px] font-bold text-slate-500">
                          Not in offline guide
                        </span>
                      )}
                    </div>
                    {currentPurpose ? (
                      <>
                        <p className="text-xs font-medium text-sky-950 leading-snug">
                          {currentPurpose.usedFor}
                          {currentDraft.prescribedFor
                            ? ` (Slip notes: "${currentDraft.prescribedFor}")`
                            : ""}
                        </p>
                        {currentPurpose.keyReminder && (
                          <p className="text-[11px] font-semibold text-sky-800">
                            Key tip: {currentPurpose.keyReminder}
                          </p>
                        )}
                        <p className="text-[10px] text-sky-700/80 italic">
                          General medication info only — always follow your CSU physician&apos;s
                          specific reason for prescribing.
                        </p>
                      </>
                    ) : (
                      <p className="text-[11px] text-slate-600">
                        This medication isn&apos;t in the offline 43-drug guide — confirm its
                        purpose with your CSU physician or pharmacist.
                      </p>
                    )}
                  </div>
                )}

                {/* Editable Schedule Times */}
                <div className="space-y-2">
                  <Label className="text-xs">Daily Intake Schedule Times</Label>
                  <div className="flex flex-wrap gap-1.5">
                    {currentDraft.scheduleTimes.map((t) => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => toggleScheduleTime(t)}
                        className="inline-flex items-center gap-1 rounded-lg bg-emerald-50 border border-emerald-200 px-2.5 py-1 text-xs font-mono font-bold text-emerald-800 hover:bg-emerald-100 cursor-pointer"
                      >
                        <Clock className="h-3 w-3" />
                        {t}
                        {currentDraft.scheduleTimes.length > 1 && <X className="h-3 w-3 ml-0.5" />}
                      </button>
                    ))}
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {QUICK_TIMES.filter((q) => !currentDraft.scheduleTimes.includes(q)).map(
                      (preset) => (
                        <button
                          key={preset}
                          type="button"
                          onClick={() => toggleScheduleTime(preset)}
                          className="inline-flex items-center gap-1 rounded-lg bg-slate-100 hover:bg-slate-200 px-2 py-1 text-[11px] font-semibold text-slate-600 cursor-pointer"
                        >
                          <Plus className="h-3 w-3" />
                          {preset}
                        </button>
                      ),
                    )}
                  </div>
                  <div className="flex items-center gap-2 max-w-xs">
                    <Input
                      value={customTime}
                      onChange={(e) => setCustomTime(e.target.value)}
                      placeholder="Custom time (e.g. 07:30 AM)"
                      className="rounded-xl text-xs h-8"
                    />
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={handleAddCustomTime}
                      className="h-8 rounded-xl text-xs font-bold cursor-pointer"
                    >
                      Add
                    </Button>
                  </div>
                </div>

                <div className="space-y-1">
                  <Label className="text-xs">Clinical Instructions</Label>
                  <Input
                    value={currentDraft.instructions}
                    onChange={(e) => updateCurrentDraft({ instructions: e.target.value })}
                    placeholder="e.g. Take after meals with water"
                    className="rounded-xl text-xs h-9"
                  />
                </div>

                {/* Required Human Verification Attestation */}
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50/70 p-3.5">
                  <label className="flex items-start gap-2.5 text-xs font-bold text-emerald-950 cursor-pointer leading-snug">
                    <input
                      type="checkbox"
                      checked={accuracyConfirmed}
                      onChange={(e) => setAccuracyConfirmed(e.target.checked)}
                      className="mt-0.5 h-4 w-4 shrink-0 accent-emerald-600 cursor-pointer"
                    />
                    <span>
                      I have checked the medication name, dosage strength, and daily intake
                      schedule against my physical prescription or medicine bottle and confirm they
                      are accurate.
                    </span>
                  </label>
                </div>

                <div className="flex flex-wrap justify-between items-center gap-2 pt-3 border-t border-slate-100">
                  <div className="flex flex-wrap gap-2">
                    {(pendingOcrMeds.length > 0 || rawText.trim().length > 0) && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setUploadStep("CONFIRM_OCR")}
                        className="rounded-xl text-xs font-bold cursor-pointer"
                      >
                        ← Back to OCR Preview
                      </Button>
                    )}
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setUploadStep("SELECT")}
                      className="rounded-xl text-xs font-bold cursor-pointer"
                    >
                      Upload Another Photo
                    </Button>
                  </div>
                  <Button
                    type="submit"
                    size="sm"
                    disabled={
                      savingRx ||
                      selectedDrafts.length === 0 ||
                      hasUnconfirmedAllergy ||
                      !accuracyConfirmed
                    }
                    className="rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold gap-1.5 cursor-pointer"
                  >
                    <CheckCircle2 className="h-4 w-4" />
                    {savingRx
                      ? "Saving..."
                      : selectedDrafts.length > 1
                        ? `Save ${selectedDrafts.length} Selected Medications`
                        : "Save to My Schedule"}
                  </Button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
