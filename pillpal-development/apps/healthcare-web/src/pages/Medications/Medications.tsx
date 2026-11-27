import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  Activity,
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  ArrowRightLeft,
  Ban,
  BellRing,
  CheckCircle2,
  Clock,
  FileText,
  LayoutGrid,
  List,
  Mail,
  MessageSquare,
  PackageCheck,
  PackageX,
  PauseCircle,
  Phone,
  Pill,
  PlayCircle,
  Plus,
  Printer,
  RefreshCw,
  ScanLine,
  Search,
  Send,
  ShieldAlert,
  Stethoscope,
  Store,
  Trash2,
  User,
  Users,
  X,
} from "lucide-react";
import { fetchWithAuth } from "@/lib/api";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  DOSAGE_FORMS,
  FREQUENCY_PRESETS,
  checkAllergyConflict,
  getTodayIsoDate,
  hasDocumentedDrugAllergy,
} from "@/lib/clinical";

type MedicationStatus = "ACTIVE" | "PAUSED" | "COMPLETED" | "DISCONTINUED";

type FulfillmentStatus =
  | "CLINIC_DISPENSED"
  | "PARTIAL_EXTERNAL"
  | "EXTERNAL_PHARMACY"
  | "AWAITING_DISPENSE"
  | "UNAVAILABLE_IN_CLINIC"
  | "SELF_SCANNED";

type FulfillmentMode =
  | "CLINIC_DISPENSE"
  | "PARTIAL_EXTERNAL"
  | "EXTERNAL_PHARMACY"
  | "CLINIC_NO_DISPENSE";

type InventoryStockOption = {
  id: string;
  name: string;
  brandName: string | null;
  strength: string;
  form: string;
  category: string;
  currentStock: number;
  status: string;
};

type MedicationItem = {
  id: string;
  patientId: string;
  patientName: string;
  idNumber: string;
  patientDepartment?: string | null;
  patientAllergies?: string | null;
  name: string;
  dosage: string;
  form: string;
  frequency: string;
  instructions: string | null;
  cleanInstructions?: string | null;
  externalPharmacyNote?: string | null;
  fulfillmentStatus?: FulfillmentStatus;
  dispensedUnits?: number;
  clinicStockMatch?: InventoryStockOption | null;
  scheduleTimes: string[];
  startDate: string;
  endDate: string | null;
  doctorId?: string | null;
  source?: "CLINIC_RX" | "PATIENT_SCANNED";
  prescribedBy: string;
  doctorSpecialization?: string | null;
  status: MedicationStatus;
};

type PatientRegimenGroup = {
  patientId: string;
  patientName: string;
  idNumber: string;
  patientDepartment: string | null;
  patientAllergies: string | null;
  medications: MedicationItem[];
  activeCount: number;
  clinicRxList: MedicationItem[];
};

function isSelfScannedMedication(med: MedicationItem): boolean {
  return (
    med.source === "PATIENT_SCANNED" ||
    med.fulfillmentStatus === "SELF_SCANNED" ||
    (!med.doctorId && med.prescribedBy === "Self-Scanned / OTC")
  );
}

type PatientOption = {
  id: string;
  name: string;
  idNumber: string;
  department: string;
  allergies: string | null;
  medicalConditions: string | null;
};

type PatientChartRecord = {
  id: string;
  userId: string;
  name: string;
  email: string;
  phone: string | null;
  idNumber: string;
  department: string;
  type: string;
  dateOfBirth: string | null;
  gender: string | null;
  bloodType: string | null;
  allergies: string | null;
  medicalConditions: string | null;
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
  adherence: {
    rate: number | null;
    total: number;
    taken: number;
    missed: number;
    skipped: number;
  };
  dispensations: {
    id: string;
    medicationName: string;
    strength: string;
    form: string;
    quantity: number;
    type: string;
    batchNumber: string | null;
    reason: string | null;
    performedBy: string;
    createdAt: string;
  }[];
};

function formatPatientAge(dobIso: string | null): string | null {
  if (!dobIso) return null;
  const dob = new Date(dobIso);
  if (Number.isNaN(dob.getTime())) return null;
  const today = new Date();
  let age = today.getFullYear() - dob.getFullYear();
  const m = today.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) age--;
  return age >= 0 ? `${age} yrs` : null;
}

function normalizeDrugToken(value: string | null | undefined): string {
  return (value || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function isDrugNameMatchingInventory(rxName: string, item: InventoryStockOption | undefined): boolean {
  if (!item) return false;
  const a = normalizeDrugToken(rxName);
  const b = normalizeDrugToken(item.name);
  const brand = normalizeDrugToken(item.brandName);
  if (!a || !b) return false;
  return (
    a === b ||
    a.includes(b) ||
    b.includes(a) ||
    (brand.length >= 3 && (a === brand || a.includes(brand) || brand.includes(a)))
  );
}

function addDaysToIso(startIso: string, days: number): string {
  const base = startIso ? new Date(`${startIso}T00:00:00`) : new Date();
  if (Number.isNaN(base.getTime())) return "";
  base.setDate(base.getDate() + days);
  const yyyy = base.getFullYear();
  const mm = String(base.getMonth() + 1).padStart(2, "0");
  const dd = String(base.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function getStatusPillClasses(status: MedicationStatus): string {
  switch (status) {
    case "ACTIVE":
      return "bg-emerald-50 text-emerald-700 border border-emerald-200/70";
    case "PAUSED":
      return "bg-amber-50 text-amber-700 border border-amber-200/70";
    case "COMPLETED":
      return "bg-sky-50 text-[#0284c7] border border-sky-200/70";
    case "DISCONTINUED":
      return "bg-rose-50 text-rose-700 border border-rose-200/70";
    default:
      return "bg-slate-100 text-slate-600";
  }
}

function createInitialRxForm(patientId = "") {
  return {
    patientId,
    inventoryItemId: "",
    name: "",
    dosage: "",
    form: "Tablet",
    frequency: "Once daily morning",
    scheduleTimesStr: "08:00 AM",
    instructions: "",
    startDate: getTodayIsoDate(),
    endDate: "",
    fulfillmentMode: "CLINIC_NO_DISPENSE" as FulfillmentMode,
    dispenseQuantity: 10,
    externalQuantity: 10,
    requestRestock: false,
  };
}

export function Medications() {
  const location = useLocation();
  const navigate = useNavigate();
  const patientDialogRef = useRef<HTMLDialogElement>(null);
  const patientDialogTitleId = useId();
  const [medications, setMedications] = useState<MedicationItem[]>([]);
  const [patients, setPatients] = useState<PatientOption[]>([]);
  const [inventoryStock, setInventoryStock] = useState<InventoryStockOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"ALL" | MedicationStatus>("ALL");
  const [sourceFilter, setSourceFilter] = useState<"ALL" | "CLINIC_RX" | "PATIENT_SCANNED">("ALL");
  const [viewMode, setViewMode] = useState<"patients" | "medications">("patients");
  const [displayLayout, setDisplayLayout] = useState<"cards" | "list">(() => {
    try {
      return localStorage.getItem("pillpal_medications_display_layout") === "list"
        ? "list"
        : "cards";
    } catch {
      return "cards";
    }
  });
  const handleDisplayLayoutChange = (nextLayout: "cards" | "list") => {
    setDisplayLayout(nextLayout);
    try {
      localStorage.setItem("pillpal_medications_display_layout", nextLayout);
    } catch {
      // ignore storage quota/privacy mode errors
    }
  };
  const [userRole, setUserRole] = useState<string>("DOCTOR");
  const [actionBusyId, setActionBusyId] = useState<string | null>(null);
  const [bannerError, setBannerError] = useState("");
  const [bannerSuccess, setBannerSuccess] = useState("");
  const [restockBusyKey, setRestockBusyKey] = useState<string | null>(null);

  // Patient Record Modal State
  const [activePatientId, setActivePatientId] = useState<string | null>(null);
  const [recordModalTab, setRecordModalTab] = useState<"medications" | "clinical">("medications");
  const [patientChart, setPatientChart] = useState<PatientChartRecord | null>(null);
  const [patientChartLoading, setPatientChartLoading] = useState(false);

  // Issue New Prescription Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalLoading, setModalLoading] = useState(false);
  const [modalError, setModalError] = useState("");
  const [modalSuccess, setModalSuccess] = useState<string | false>(false);
  const [allergyOverrideConfirmed, setAllergyOverrideConfirmed] = useState(false);
  const [formData, setFormData] = useState(() => createInitialRxForm());
  const [queuedDrafts, setQueuedDrafts] = useState<ReturnType<typeof createInitialRxForm>[]>([]);

  // Dispense Dose Modal State
  const [isDispenseModalOpen, setIsDispenseModalOpen] = useState(false);
  const [selectedMedication, setSelectedMedication] = useState<MedicationItem | null>(null);
  const [dispenseForm, setDispenseForm] = useState({
    inventoryItemId: "",
    quantity: 1,
    reason: "",
  });
  const [dispenseMismatchConfirmed, setDispenseMismatchConfirmed] = useState(false);
  const [dispenseLoading, setDispenseLoading] = useState(false);
  const [dispenseError, setDispenseError] = useState("");
  const [dispenseSuccess, setDispenseSuccess] = useState("");

  async function loadData() {
    setLoading(true);
    setBannerError("");
    try {
      const [medRes, patRes, meRes, invRes] = await Promise.all([
        fetchWithAuth("/medications"),
        fetchWithAuth("/patients"),
        fetchWithAuth("/me"),
        fetchWithAuth("/inventory"),
      ]);

      if (medRes.ok) {
        const data = await medRes.json();
        setMedications(data);
      }

      if (patRes.ok) {
        const pData = await patRes.json();
        setPatients(
          pData.map((p: any) => ({
            id: p.id,
            name: p.name,
            idNumber: p.idNumber,
            department: p.department,
            allergies: p.allergies || null,
            medicalConditions: p.medicalConditions || null,
          })),
        );
      }

      if (invRes.ok) {
        const iData = await invRes.json();
        const items = Array.isArray(iData) ? iData : iData.items || [];
        setInventoryStock(
          items.map((i: any) => ({
            id: i.id,
            name: i.name,
            brandName: i.brandName || null,
            strength: i.strength,
            form: i.form || "Tablet",
            category: i.category || "General",
            currentStock: i.currentStock,
            status: i.status,
          })),
        );
      }

      if (meRes.ok) {
        const u = await meRes.json();
        setUserRole(u.role || "DOCTOR");
      }
    } catch (err) {
      console.error("Failed to load medications data:", err);
      setBannerError("Unable to load prescriptions from the server.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadData();
  }, []);

  // Deep-link handoff from Patient Directory ("Prescribe Medication" button)
  useEffect(() => {
    const deepLinkPatientId = (location.state as { prescribeForPatientId?: string } | null)
      ?.prescribeForPatientId;
    if (deepLinkPatientId && patients.some((p) => p.id === deepLinkPatientId)) {
      setFormData(createInitialRxForm(deepLinkPatientId));
      setAllergyOverrideConfirmed(false);
      setModalError("");
      setModalSuccess(false);
      setIsModalOpen(true);
      window.history.replaceState({}, document.title);
    }
  }, [location.state, patients]);

  const selectedPatient = useMemo(
    () => patients.find((p) => p.id === formData.patientId) || null,
    [patients, formData.patientId],
  );

  const allergyConflict = useMemo(
    () => checkAllergyConflict(formData.name, selectedPatient?.allergies),
    [formData.name, selectedPatient?.allergies],
  );

  // Reset allergy override whenever patient or medication name changes
  useEffect(() => {
    setAllergyOverrideConfirmed(false);
  }, [formData.patientId, formData.name]);

  // Live clinic stock matching (works for both Quick Pick dropdown and manually typed drug names)
  const matchedFormStockItem = useMemo(() => {
    if (formData.inventoryItemId) {
      return inventoryStock.find((i) => i.id === formData.inventoryItemId) || null;
    }
    const typed = normalizeDrugToken(formData.name);
    if (typed.length < 3) return null;
    const candidates = inventoryStock.filter((i) => isDrugNameMatchingInventory(formData.name, i));
    if (candidates.length === 0) return null;
    const typedDosage = normalizeDrugToken(formData.dosage);
    candidates.sort((a, b) => {
      const score = (item: InventoryStockOption) => {
        let s = 0;
        if (normalizeDrugToken(item.name) === typed) s += 4;
        if (typedDosage && normalizeDrugToken(item.strength) === typedDosage) s += 3;
        if (item.currentStock > 0) s += 2;
        return s;
      };
      return score(b) - score(a);
    });
    return candidates[0] || null;
  }, [formData.inventoryItemId, formData.name, formData.dosage, inventoryStock]);

  const formStockState: "EMPTY" | "IN_STOCK" | "OUT_OF_STOCK" | "UNLISTED" = useMemo(() => {
    if (!formData.name.trim() && !formData.inventoryItemId) return "EMPTY";
    if (!matchedFormStockItem) return "UNLISTED";
    return matchedFormStockItem.currentStock > 0 ? "IN_STOCK" : "OUT_OF_STOCK";
  }, [formData.name, formData.inventoryItemId, matchedFormStockItem]);

  // Suggest in-stock therapeutic alternatives from the same category when selected drug is out of stock
  const inStockAlternatives = useMemo(() => {
    if (formStockState !== "OUT_OF_STOCK" || !matchedFormStockItem) return [];
    return inventoryStock
      .filter(
        (i) =>
          i.id !== matchedFormStockItem.id &&
          i.currentStock > 0 &&
          i.category.toLowerCase() === matchedFormStockItem.category.toLowerCase(),
      )
      .slice(0, 4);
  }, [formStockState, matchedFormStockItem, inventoryStock]);

  // Auto-keep fulfillment mode clinically valid when stock state changes
  useEffect(() => {
    if (formStockState === "OUT_OF_STOCK" || formStockState === "UNLISTED") {
      setFormData((prev) => {
        const nextMode: FulfillmentMode = "EXTERNAL_PHARMACY";
        const nextRestock = formStockState === "OUT_OF_STOCK" ? true : prev.requestRestock;
        if (prev.fulfillmentMode === nextMode && prev.requestRestock === nextRestock) {
          return prev;
        }
        return {
          ...prev,
          fulfillmentMode: nextMode,
          requestRestock: nextRestock,
        };
      });
    } else if (formStockState === "IN_STOCK" && matchedFormStockItem) {
      setFormData((prev) => {
        const clampedQty = Math.max(1, Math.min(prev.dispenseQuantity || 1, matchedFormStockItem.currentStock));
        if (prev.dispenseQuantity === clampedQty && prev.inventoryItemId === matchedFormStockItem.id) {
          return prev;
        }
        return {
          ...prev,
          inventoryItemId: prev.inventoryItemId || matchedFormStockItem.id,
          dispenseQuantity: clampedQty,
        };
      });
    }
  }, [formStockState, matchedFormStockItem]);

  async function handleRequestRestock(params: {
    key: string;
    medicationName: string;
    dosage?: string;
    form?: string;
    inventoryItemId?: string | null;
    notes?: string;
  }) {
    setRestockBusyKey(params.key);
    setBannerError("");
    setBannerSuccess("");
    try {
      const res = await fetchWithAuth("/inventory/restock-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          medicationName: params.medicationName,
          dosage: params.dosage || "",
          form: params.form || "",
          inventoryItemId: params.inventoryItemId || undefined,
          urgency: "ROUTINE",
          notes: params.notes || undefined,
        }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(body?.message || "Failed to send restock alert.");
      }
      setBannerSuccess(
        body?.message || `Restock alert sent to Admin & Pharmacy Staff for ${params.medicationName}.`,
      );
      setTimeout(() => setBannerSuccess(""), 5000);
    } catch (err: any) {
      setBannerError(err?.message || "Could not submit restock request.");
    } finally {
      setRestockBusyKey(null);
    }
  }

  function handleQueueAnotherDrug() {
    setModalError("");
    if (!formData.patientId) {
      setModalError("Please select a CSU patient first.");
      return;
    }
    if (!formData.name.trim() || !formData.dosage.trim()) {
      setModalError("Enter medication name and dosage before adding another drug.");
      return;
    }
    if (allergyConflict.hasConflict && !allergyOverrideConfirmed) {
      setModalError(
        "Acknowledge the allergy contraindication alert for this drug before queuing it.",
      );
      return;
    }
    const scheduleTimes = formData.scheduleTimesStr
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
    if (scheduleTimes.length === 0) {
      setModalError("Please specify at least one schedule time before adding another drug.");
      return;
    }

    const wantsClinicDispense =
      formData.fulfillmentMode === "CLINIC_DISPENSE" ||
      formData.fulfillmentMode === "PARTIAL_EXTERNAL";
    if (wantsClinicDispense) {
      if (!matchedFormStockItem || matchedFormStockItem.currentStock <= 0) {
        setModalError(
          "This medication is unavailable in CSU Clinic stock. Switch to External Rx before queuing.",
        );
        return;
      }
      if (
        formData.dispenseQuantity < 1 ||
        formData.dispenseQuantity > matchedFormStockItem.currentStock
      ) {
        setModalError(
          `Cannot dispense ${formData.dispenseQuantity} unit(s). Only ${matchedFormStockItem.currentStock} available.`,
        );
        return;
      }
    }

    setQueuedDrafts((prev) => [
      ...prev,
      {
        ...formData,
        inventoryItemId: matchedFormStockItem?.id || formData.inventoryItemId,
      },
    ]);
    setAllergyOverrideConfirmed(false);
    setFormData(createInitialRxForm(formData.patientId));
  }

  function buildPayloadFromDraft(draft: ReturnType<typeof createInitialRxForm>) {
    const scheduleTimes = draft.scheduleTimesStr
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
    const wantsClinicDispense =
      draft.fulfillmentMode === "CLINIC_DISPENSE" ||
      draft.fulfillmentMode === "PARTIAL_EXTERNAL";

    const payload: any = {
      patientId: draft.patientId,
      name: draft.name.trim(),
      dosage: draft.dosage.trim(),
      form: draft.form,
      frequency: draft.frequency,
      scheduleTimes,
      instructions: draft.instructions.trim() || undefined,
      startDate: draft.startDate,
      endDate: draft.endDate || undefined,
      fulfillmentMode: draft.fulfillmentMode,
      requestRestock: draft.requestRestock,
    };

    if (wantsClinicDispense && draft.inventoryItemId) {
      payload.inventoryItemId = draft.inventoryItemId;
      payload.dispenseQuantity = Number(draft.dispenseQuantity || 1);
    } else if (draft.inventoryItemId) {
      payload.inventoryItemId = draft.inventoryItemId;
    }

    if (
      (draft.fulfillmentMode === "EXTERNAL_PHARMACY" ||
        draft.fulfillmentMode === "PARTIAL_EXTERNAL") &&
      Number(draft.externalQuantity) > 0
    ) {
      payload.externalQuantity = Number(draft.externalQuantity);
    }

    return payload;
  }

  async function handleCreatePrescription(e: React.FormEvent) {
    e.preventDefault();
    setModalError("");

    if (!formData.patientId) {
      setModalError("Please select a CSU patient.");
      return;
    }

    const currentHasDrug = Boolean(formData.name.trim() || formData.dosage.trim());
    if (!currentHasDrug && queuedDrafts.length === 0) {
      setModalError("Please enter at least one medication name and dosage.");
      return;
    }

    const draftsToSubmit: ReturnType<typeof createInitialRxForm>[] = [...queuedDrafts];

    if (currentHasDrug) {
      if (!formData.name.trim() || !formData.dosage.trim()) {
        setModalError("Both medication name and dosage are required.");
        return;
      }

      if (allergyConflict.hasConflict && !allergyOverrideConfirmed) {
        setModalError(
          "Allergy contraindication detected. Acknowledge clinical review before issuing this prescription.",
        );
        return;
      }

      const scheduleTimes = formData.scheduleTimesStr
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);

      if (scheduleTimes.length === 0) {
        setModalError("Please specify at least one schedule time (e.g. 08:00 AM).");
        return;
      }

      const wantsClinicDispense =
        formData.fulfillmentMode === "CLINIC_DISPENSE" ||
        formData.fulfillmentMode === "PARTIAL_EXTERNAL";

      if (wantsClinicDispense) {
        if (!matchedFormStockItem || matchedFormStockItem.currentStock <= 0) {
          setModalError(
            "This medication is unavailable in CSU Clinic stock. Issue it as an External Pharmacy Rx instead.",
          );
          return;
        }
        if (
          formData.dispenseQuantity < 1 ||
          formData.dispenseQuantity > matchedFormStockItem.currentStock
        ) {
          setModalError(
            `Cannot dispense ${formData.dispenseQuantity} unit(s). Only ${matchedFormStockItem.currentStock} available in clinic stock.`,
          );
          return;
        }
      }

      draftsToSubmit.push({
        ...formData,
        inventoryItemId: matchedFormStockItem?.id || formData.inventoryItemId,
      });
    }

    setModalLoading(true);
    try {
      let anyRestockRequested = false;
      for (const draft of draftsToSubmit) {
        const payload = buildPayloadFromDraft({
          ...draft,
          patientId: formData.patientId,
        });
        const res = await fetchWithAuth("/medications", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

        const created = await res.json().catch(() => null);
        if (!res.ok) {
          throw new Error(created?.message || `Failed to create prescription for ${draft.name}`);
        }
        if (created?.restockRequested) anyRestockRequested = true;
      }

      const count = draftsToSubmit.length;
      const successText =
        count > 1
          ? `${count} prescriptions issued for this patient${anyRestockRequested ? " (restock alert sent)" : ""}!`
          : formData.fulfillmentMode === "EXTERNAL_PHARMACY"
            ? anyRestockRequested
              ? "External Pharmacy Rx issued & restock alert sent to Admin/Pharmacy!"
              : "External Pharmacy Rx issued! You can now print the slip for the patient."
            : formData.fulfillmentMode === "PARTIAL_EXTERNAL"
              ? `Partial supply (${formData.dispenseQuantity} units) dispensed & external balance noted!`
              : formData.fulfillmentMode === "CLINIC_DISPENSE"
                ? "Prescription issued and clinic stock dispensed successfully!"
                : "Prescription issued successfully!";

      setModalSuccess(successText);
      setTimeout(() => {
        setModalSuccess(false);
        setIsModalOpen(false);
        setAllergyOverrideConfirmed(false);
        setQueuedDrafts([]);
        setFormData(createInitialRxForm());
        void loadData();
      }, 1100);
    } catch (err: any) {
      setModalError(err.message || "Failed to issue prescription.");
    } finally {
      setModalLoading(false);
    }
  }

  async function handleStatusUpdate(med: MedicationItem, nextStatus: MedicationStatus) {
    if (
      nextStatus === "DISCONTINUED" &&
      !window.confirm(
        `Discontinue ${med.name} (${med.dosage}) for ${med.patientName}? This stops active reminders and blocks further dispensing.`,
      )
    ) {
      return;
    }

    setActionBusyId(med.id);
    setBannerError("");
    try {
      const res = await fetchWithAuth(`/medications/${med.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || "Failed to update prescription status.");
      }

      await loadData();
    } catch (err: any) {
      setBannerError(err?.message || "Unable to update prescription status.");
    } finally {
      setActionBusyId(null);
    }
  }

  function handlePrintRxSlip(med: MedicationItem) {
    const printWin = window.open("", "_blank", "width=760,height=860");
    if (!printWin) return;

    const issuedDate = new Date(med.startDate).toLocaleDateString("en-PH", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
    const endDateStr = med.endDate
      ? new Date(med.endDate).toLocaleDateString("en-PH", {
          year: "numeric",
          month: "long",
          day: "numeric",
        })
      : "As directed";

    printWin.document.write(`
      <!doctype html>
      <html>
        <head>
          <meta charset="utf-8" />
          <title>CSU Prescription Slip — ${escapeHtml(med.patientName)}</title>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: #0f172a; padding: 32px; max-width: 680px; margin: 0 auto; }
            .header { border-bottom: 2px solid #0284c7; padding-bottom: 14px; margin-bottom: 20px; display: flex; justify-content: space-between; align-items: flex-end; }
            .univ { font-size: 16px; font-weight: 900; letter-spacing: 0.3px; }
            .sub { font-size: 12px; color: #475569; margin-top: 2px; }
            .rx-mark { font-size: 36px; font-weight: 900; color: #0284c7; line-height: 1; }
            .meta { display: grid; grid-template-columns: 1fr 1fr; gap: 10px 24px; font-size: 12px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 14px; margin-bottom: 22px; }
            .meta span.lbl { color: #64748b; display: block; font-size: 10px; text-transform: uppercase; font-weight: 700; }
            .meta strong { font-size: 13px; }
            .allergy { background: #fef2f2; border: 1px solid #fecaca; color: #991b1b; padding: 8px 12px; border-radius: 8px; font-size: 12px; margin-bottom: 18px; }
            .drug-box { border: 1px solid #cbd5e1; border-radius: 12px; padding: 18px; margin-bottom: 28px; }
            .drug-name { font-size: 18px; font-weight: 800; }
            .drug-dosage { font-size: 13px; color: #0284c7; font-weight: 700; margin-top: 2px; }
            .drug-meta { margin-top: 12px; font-size: 12px; line-height: 1.7; }
            .sig { margin-top: 48px; display: flex; justify-content: flex-end; }
            .sig-block { text-align: center; min-width: 240px; }
            .sig-line { border-top: 1px solid #334155; padding-top: 6px; font-size: 13px; font-weight: 700; }
            .sig-sub { font-size: 11px; color: #64748b; }
            .footer { margin-top: 36px; border-top: 1px dashed #cbd5e1; padding-top: 10px; font-size: 10px; color: #64748b; display: flex; justify-content: space-between; }
          </style>
        </head>
        <body>
          <div class="header">
            <div>
              <div class="univ">CARAGA STATE UNIVERSITY</div>
              <div class="sub">CSU University Center for Health and Wellness • PILLPAL Clinical System</div>
              <div class="sub">Ampayon, Butuan City • Hotline: (085) 341-2786</div>
            </div>
            <div class="rx-mark">℞</div>
          </div>

          <div class="meta">
            <div><span class="lbl">Patient Name</span><strong>${escapeHtml(med.patientName)}</strong></div>
            <div><span class="lbl">CSU ID Number</span><strong>${escapeHtml(med.idNumber)}</strong></div>
            <div><span class="lbl">College / Unit</span><strong>${escapeHtml(med.patientDepartment || "Caraga State University")}</strong></div>
            <div><span class="lbl">Date Issued</span><strong>${escapeHtml(issuedDate)}</strong></div>
          </div>

          ${
            hasDocumentedDrugAllergy(med.patientAllergies)
              ? `<div class="allergy"><strong>Documented Drug Allergies:</strong> ${escapeHtml(med.patientAllergies || "")}</div>`
              : ""
          }

          ${
            med.fulfillmentStatus === "EXTERNAL_PHARMACY" ||
            med.fulfillmentStatus === "UNAVAILABLE_IN_CLINIC" ||
            med.fulfillmentStatus === "PARTIAL_EXTERNAL"
              ? `<div style="background:#fffbeb;border:1px solid #fcd34d;color:#92400e;padding:10px 14px;border-radius:10px;font-size:12px;margin-bottom:18px;">
                  <strong>${
                    med.fulfillmentStatus === "PARTIAL_EXTERNAL"
                      ? `PARTIAL CLINIC DISPENSE (${med.dispensedUnits || 0} units provided by CSU Clinic):`
                      : "EXTERNAL PHARMACY PRESCRIPTION:"
                  }</strong>
                  ${escapeHtml(
                    med.externalPharmacyNote ||
                      "Medication is currently unavailable in CSU Clinic stock. Please present this signed prescription at any licensed pharmacy.",
                  )}
                </div>`
              : ""
          }

          <div class="drug-box">
            <div class="drug-name">${escapeHtml(med.name)}</div>
            <div class="drug-dosage">${escapeHtml(med.dosage)} • ${escapeHtml(med.form || "Tablet")}</div>
            <div class="drug-meta">
              <div><strong>Frequency:</strong> ${escapeHtml(med.frequency)}</div>
              <div><strong>Schedule Times:</strong> ${escapeHtml(med.scheduleTimes.join(", "))}</div>
              <div><strong>Course End Date:</strong> ${escapeHtml(endDateStr)}</div>
              <div><strong>Instructions (Sig.):</strong> ${escapeHtml(med.cleanInstructions || med.instructions || "Take as directed by physician.")}</div>
              <div><strong>Status:</strong> ${escapeHtml(med.status)}</div>
            </div>
          </div>

          <div class="sig">
            <div class="sig-block">
              <div class="sig-line">${escapeHtml(med.prescribedBy)}</div>
              <div class="sig-sub">${escapeHtml(med.doctorSpecialization || "Attending Physician")} • CSU Health Services</div>
            </div>
          </div>

          <div class="footer">
            <span>Generated via PILLPAL CSU Clinical Portal</span>
            <span>Printed: ${escapeHtml(new Date().toLocaleString("en-PH"))}</span>
          </div>
          <script>window.onload = () => { window.print(); };</script>
        </body>
      </html>
    `);
    printWin.document.close();
  }

  function handlePrintCombinedRxSlip(group: PatientRegimenGroup) {
    const clinicMeds = group.clinicRxList.filter((m) => m.status === "ACTIVE" || m.status === "PAUSED");
    const medsToPrint = clinicMeds.length > 0 ? clinicMeds : group.clinicRxList;
    if (medsToPrint.length === 0) return;
    if (medsToPrint.length === 1 && medsToPrint[0]) {
      handlePrintRxSlip(medsToPrint[0]);
      return;
    }

    const printWin = window.open("", "_blank", "width=780,height=900");
    if (!printWin) return;

    const latestDoctor = medsToPrint[0]?.prescribedBy || "CSU Attending Physician";
    const latestSpec = medsToPrint[0]?.doctorSpecialization || "Attending Physician";
    const issuedDate = new Date().toLocaleDateString("en-PH", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });

    const drugsHtml = medsToPrint
      .map((med, idx) => {
        const endDateStr = med.endDate
          ? new Date(med.endDate).toLocaleDateString("en-PH", {
              year: "numeric",
              month: "short",
              day: "numeric",
            })
          : "As directed";
        const extBadge =
          med.fulfillmentStatus === "EXTERNAL_PHARMACY" ||
          med.fulfillmentStatus === "UNAVAILABLE_IN_CLINIC"
            ? `<span style="background:#fef3c7;color:#92400e;font-size:10px;font-weight:800;padding:2px 7px;border-radius:99px;margin-left:8px;">EXTERNAL PHARMACY</span>`
            : med.fulfillmentStatus === "PARTIAL_EXTERNAL"
              ? `<span style="background:#fef3c7;color:#92400e;font-size:10px;font-weight:800;padding:2px 7px;border-radius:99px;margin-left:8px;">PARTIAL CLINIC + EXTERNAL</span>`
              : "";
        return `
          <div class="drug-box">
            <div class="drug-name">${idx + 1}. ${escapeHtml(med.name)}${extBadge}</div>
            <div class="drug-dosage">${escapeHtml(med.dosage)} • ${escapeHtml(med.form || "Tablet")}</div>
            <div class="drug-meta">
              <div><strong>Frequency:</strong> ${escapeHtml(med.frequency)} (${escapeHtml(med.scheduleTimes.join(", "))})</div>
              <div><strong>Sig.:</strong> ${escapeHtml(med.cleanInstructions || med.instructions || "Take as directed by physician.")}</div>
              <div><strong>Course End:</strong> ${escapeHtml(endDateStr)} • <strong>Prescribed by:</strong> ${escapeHtml(med.prescribedBy)}</div>
              ${med.externalPharmacyNote ? `<div style="color:#92400e;margin-top:4px;"><strong>Pharmacy Note:</strong> ${escapeHtml(med.externalPharmacyNote)}</div>` : ""}
            </div>
          </div>
        `;
      })
      .join("");

    printWin.document.write(`
      <!doctype html>
      <html>
        <head>
          <meta charset="utf-8" />
          <title>CSU Combined Prescription Slip — ${escapeHtml(group.patientName)}</title>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: #0f172a; padding: 32px; max-width: 700px; margin: 0 auto; }
            .header { border-bottom: 2px solid #0284c7; padding-bottom: 14px; margin-bottom: 18px; display: flex; justify-content: space-between; align-items: flex-end; }
            .univ { font-size: 16px; font-weight: 900; }
            .sub { font-size: 11px; color: #475569; margin-top: 2px; }
            .rx-mark { font-size: 36px; font-weight: 900; color: #0284c7; line-height: 1; }
            .meta { display: grid; grid-template-columns: 1fr 1fr; gap: 10px 24px; font-size: 12px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 14px; margin-bottom: 18px; }
            .meta span.lbl { color: #64748b; display: block; font-size: 10px; text-transform: uppercase; font-weight: 700; }
            .allergy { background: #fef2f2; border: 1px solid #fecaca; color: #991b1b; padding: 8px 12px; border-radius: 8px; font-size: 12px; margin-bottom: 16px; }
            .drug-box { border: 1px solid #cbd5e1; border-radius: 12px; padding: 14px; margin-bottom: 12px; }
            .drug-name { font-size: 15px; font-weight: 800; }
            .drug-dosage { font-size: 12px; color: #0284c7; font-weight: 700; margin-top: 2px; }
            .drug-meta { margin-top: 8px; font-size: 11px; line-height: 1.6; }
            .sig { margin-top: 38px; display: flex; justify-content: flex-end; }
            .sig-block { text-align: center; min-width: 240px; }
            .sig-line { border-top: 1px solid #334155; padding-top: 6px; font-size: 13px; font-weight: 700; }
            .sig-sub { font-size: 11px; color: #64748b; }
            .footer { margin-top: 28px; border-top: 1px dashed #cbd5e1; padding-top: 10px; font-size: 10px; color: #64748b; display: flex; justify-content: space-between; }
          </style>
        </head>
        <body>
          <div class="header">
            <div>
              <div class="univ">CARAGA STATE UNIVERSITY</div>
              <div class="sub">CSU University Center for Health and Wellness • Combined Prescription Slip</div>
              <div class="sub">Ampayon, Butuan City • Hotline: (085) 341-2786</div>
            </div>
            <div class="rx-mark">℞</div>
          </div>
          <div class="meta">
            <div><span class="lbl">Patient Name</span><strong>${escapeHtml(group.patientName)}</strong></div>
            <div><span class="lbl">CSU ID Number</span><strong>${escapeHtml(group.idNumber)}</strong></div>
            <div><span class="lbl">College / Unit</span><strong>${escapeHtml(group.patientDepartment || "Caraga State University")}</strong></div>
            <div><span class="lbl">Date Issued</span><strong>${escapeHtml(issuedDate)}</strong></div>
          </div>
          ${
            hasDocumentedDrugAllergy(group.patientAllergies)
              ? `<div class="allergy"><strong>Documented Drug Allergies:</strong> ${escapeHtml(group.patientAllergies || "")}</div>`
              : ""
          }
          ${drugsHtml}
          <div class="sig">
            <div class="sig-block">
              <div class="sig-line">${escapeHtml(latestDoctor)}</div>
              <div class="sig-sub">${escapeHtml(latestSpec)} • CSU Health Services</div>
            </div>
          </div>
          <div class="footer">
            <span>Generated via PILLPAL CSU Clinical Portal (${medsToPrint.length} medications)</span>
            <span>Printed: ${escapeHtml(new Date().toLocaleString("en-PH"))}</span>
          </div>
          <script>window.onload = () => { window.print(); };</script>
        </body>
      </html>
    `);
    printWin.document.close();
  }

  function openDispenseModal(med: MedicationItem) {
    setSelectedMedication(med);
    setDispenseError("");
    setDispenseSuccess("");
    setDispenseMismatchConfirmed(false);

    // Match by name (preferring exact strength & in-stock items). NEVER silently fall back to an unrelated drug!
    const candidates = inventoryStock.filter((i) => isDrugNameMatchingInventory(med.name, i));
    candidates.sort((a, b) => {
      const score = (item: InventoryStockOption) => {
        let s = 0;
        if (normalizeDrugToken(item.name) === normalizeDrugToken(med.name)) s += 4;
        if (normalizeDrugToken(item.strength) === normalizeDrugToken(med.dosage)) s += 3;
        if (item.currentStock > 0) s += 2;
        return s;
      };
      return score(b) - score(a);
    });
    const match = candidates[0] || null;

    setDispenseForm({
      inventoryItemId: match?.id || "",
      quantity: 1,
      reason: `Direct dose handover / prescribed refill for ${med.name} (${med.dosage})`,
    });
    setIsDispenseModalOpen(true);
  }

  async function handleDispensePrescription(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedMedication) return;
    setDispenseError("");

    const chosenItem = inventoryStock.find((i) => i.id === dispenseForm.inventoryItemId);
    if (!chosenItem) {
      setDispenseError(
        `No matching clinic inventory item selected for ${selectedMedication.name}. Print an external prescription slip or request a restock instead.`,
      );
      return;
    }

    if (chosenItem.currentStock <= 0) {
      setDispenseError(
        `${chosenItem.name} (${chosenItem.strength}) is currently out of stock (0 units).`,
      );
      return;
    }

    if (Number(dispenseForm.quantity) > chosenItem.currentStock) {
      setDispenseError(
        `Requested ${dispenseForm.quantity} units exceeds available clinic stock (${chosenItem.currentStock}).`,
      );
      return;
    }

    const hasDrugMismatch = !isDrugNameMatchingInventory(selectedMedication.name, chosenItem);
    if (hasDrugMismatch && !dispenseMismatchConfirmed) {
      setDispenseError(
        `Selected stock item (${chosenItem.name}) does not match prescribed drug (${selectedMedication.name}). Confirm clinical substitution before dispensing.`,
      );
      return;
    }

    setDispenseLoading(true);

    try {
      const res = await fetchWithAuth(`/medications/${selectedMedication.id}/dispense`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          inventoryItemId: dispenseForm.inventoryItemId,
          quantity: Number(dispenseForm.quantity),
          reason: dispenseForm.reason,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "Failed to dispense medication to patient");
      }

      const resData = await res.json();
      setDispenseSuccess(resData.message || "Medication successfully dispensed to patient!");
      setTimeout(() => {
        setDispenseSuccess("");
        setIsDispenseModalOpen(false);
        void loadData();
      }, 1000);
    } catch (err: any) {
      setDispenseError(err.message || "Failed to dispense medication.");
    } finally {
      setDispenseLoading(false);
    }
  }

  const statusCounts = useMemo(() => {
    const counts: Record<"ALL" | MedicationStatus, number> = {
      ALL: medications.length,
      ACTIVE: 0,
      PAUSED: 0,
      COMPLETED: 0,
      DISCONTINUED: 0,
    };
    for (const m of medications) {
      if (counts[m.status] !== undefined) counts[m.status]++;
    }
    return counts;
  }, [medications]);

  const filtered = medications.filter((m) => {
    const q = search.toLowerCase();
    const matchesSearch =
      m.name.toLowerCase().includes(q) ||
      m.patientName.toLowerCase().includes(q) ||
      m.idNumber.toLowerCase().includes(q);
    const matchesStatus = statusFilter === "ALL" || m.status === statusFilter;
    const isSelfScanned = isSelfScannedMedication(m);
    const matchesSource =
      sourceFilter === "ALL" ||
      (sourceFilter === "CLINIC_RX" && !isSelfScanned) ||
      (sourceFilter === "PATIENT_SCANNED" && isSelfScanned);
    return matchesSearch && matchesStatus && matchesSource;
  });

  const groupedByPatient = useMemo<PatientRegimenGroup[]>(() => {
    const map = new Map<string, PatientRegimenGroup>();
    for (const med of filtered) {
      const existing = map.get(med.patientId);
      if (existing) {
        existing.medications.push(med);
        if (med.status === "ACTIVE") existing.activeCount += 1;
        if (!isSelfScannedMedication(med)) existing.clinicRxList.push(med);
      } else {
        map.set(med.patientId, {
          patientId: med.patientId,
          patientName: med.patientName,
          idNumber: med.idNumber,
          patientDepartment: med.patientDepartment || null,
          patientAllergies: med.patientAllergies || null,
          medications: [med],
          activeCount: med.status === "ACTIVE" ? 1 : 0,
          clinicRxList: isSelfScannedMedication(med) ? [] : [med],
        });
      }
    }
    return Array.from(map.values());
  }, [filtered]);

  // Active patient group shown inside the Patient Record Modal (keeps live sync when actions run)
  const activePatientGroup = useMemo<PatientRegimenGroup | null>(() => {
    if (!activePatientId) return null;
    const fromFiltered = groupedByPatient.find((g) => g.patientId === activePatientId);
    if (fromFiltered) return fromFiltered;

    const allForPatient = medications.filter((m) => m.patientId === activePatientId);
    if (allForPatient.length === 0) return null;
    const first = allForPatient[0]!;
    return {
      patientId: first.patientId,
      patientName: first.patientName,
      idNumber: first.idNumber,
      patientDepartment: first.patientDepartment || null,
      patientAllergies: first.patientAllergies || null,
      medications: allForPatient,
      activeCount: allForPatient.filter((m) => m.status === "ACTIVE").length,
      clinicRxList: allForPatient.filter((m) => !isSelfScannedMedication(m)),
    };
  }, [activePatientId, groupedByPatient, medications]);

  // Sync native <dialog> showModal() / close() with activePatientId
  useEffect(() => {
    const dialog = patientDialogRef.current;
    if (!dialog) return;

    if (activePatientId) {
      if (!dialog.open) {
        dialog.showModal();
      }
    } else if (dialog.open) {
      dialog.close();
    }
  }, [activePatientId]);

  // Fallback light-dismiss for browsers without native <dialog closedby="any"> (e.g. Safari)
  useEffect(() => {
    const dialog = patientDialogRef.current;
    if (!dialog || typeof HTMLDialogElement === "undefined") return;
    if ("closedBy" in HTMLDialogElement.prototype) return;

    const isOutside = (e: PointerEvent) => {
      const r = dialog.getBoundingClientRect();
      return (
        e.clientX < r.left ||
        e.clientX > r.right ||
        e.clientY < r.top ||
        e.clientY > r.bottom
      );
    };

    let pressedOutside = false;
    const handlePointerDown = (e: PointerEvent) => {
      pressedOutside = isOutside(e);
    };
    const handlePointerUp = (e: PointerEvent) => {
      if (pressedOutside && isOutside(e)) {
        dialog.close();
      }
      pressedOutside = false;
    };

    dialog.addEventListener("pointerdown", handlePointerDown);
    dialog.addEventListener("pointerup", handlePointerUp);
    return () => {
      dialog.removeEventListener("pointerdown", handlePointerDown);
      dialog.removeEventListener("pointerup", handlePointerUp);
    };
  }, []);

  // Fetch full clinical chart details from GET /patients/:id when opening Patient Record modal
  useEffect(() => {
    if (!activePatientId) {
      setPatientChart(null);
      return;
    }

    let cancelled = false;
    setPatientChartLoading(true);
    setPatientChart(null);

    void (async () => {
      try {
        const res = await fetchWithAuth(`/patients/${activePatientId}`);
        if (res.ok && !cancelled) {
          const detail = await res.json();
          setPatientChart(detail);
        }
      } catch (err) {
        console.error("Failed to fetch patient chart:", err);
      } finally {
        if (!cancelled) setPatientChartLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [activePatientId]);

  function openPatientRecordModal(patientId: string) {
    setRecordModalTab("medications");
    setActivePatientId(patientId);
  }

  function closePatientRecordModal() {
    const dialog = patientDialogRef.current;
    if (dialog?.open) {
      dialog.close();
    }
    setActivePatientId(null);
  }

  const selectedInventoryStockItem = inventoryStock.find(
    (i) => i.id === dispenseForm.inventoryItemId,
  );
  const dispenseDrugMismatch = Boolean(
    selectedMedication &&
      selectedInventoryStockItem &&
      !isDrugNameMatchingInventory(selectedMedication.name, selectedInventoryStockItem),
  );
  const canPrescribe = userRole === "DOCTOR" || userRole === "ADMIN";

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-slate-900">
            Medications &amp; Prescriptions
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Prescribe regimens with drug-allergy safety screening, dispense clinic stock, and manage active treatments.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => void loadData()}
            disabled={loading}
            className="gap-1.5 rounded-xl text-xs font-bold cursor-pointer"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          {canPrescribe ? (
            <Button
              onClick={() => {
                setModalError("");
                setModalSuccess(false);
                setAllergyOverrideConfirmed(false);
                setQueuedDrafts([]);
                setFormData(createInitialRxForm());
                setIsModalOpen(true);
              }}
              className="gap-2 rounded-xl text-xs font-bold bg-[#0284c7] hover:bg-[#0369a1] shadow-xs cursor-pointer"
            >
              <Plus className="h-4 w-4" />
              Issue &amp; Dispense Prescription
            </Button>
          ) : (
            <span className="text-[11px] text-slate-400 bg-slate-100 px-3 py-1.5 rounded-xl font-medium">
              Doctor authorization required to issue new prescriptions
            </span>
          )}
        </div>
      </div>

      {bannerSuccess && (
        <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-3 text-xs font-semibold text-emerald-800 flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
          <span>{bannerSuccess}</span>
        </div>
      )}

      {bannerError && (
        <div className="rounded-xl bg-red-50 border border-red-200 p-3 text-xs font-semibold text-red-700 flex items-center gap-2">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{bannerError}</span>
        </div>
      )}

      {/* Search, View Switcher, Source Filter & Status Filter Bar */}
      <Card className="rounded-2xl border border-slate-100 shadow-xs">
        <CardContent className="p-4 space-y-3">
          <div className="flex flex-col lg:flex-row gap-3 items-stretch lg:items-center justify-between">
            <div className="relative w-full lg:w-80">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <Input
                placeholder="Search medication name, patient, or CSU ID..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 text-xs rounded-xl"
              />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {/* View Mode Switcher */}
              <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl">
                <button
                  type="button"
                  onClick={() => setViewMode("patients")}
                  className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-[11px] font-bold transition-colors cursor-pointer ${
                    viewMode === "patients"
                      ? "bg-white text-[#0284c7] shadow-2xs"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  <Users className="h-3.5 w-3.5" />
                  By Patient ({groupedByPatient.length})
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode("medications")}
                  className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-[11px] font-bold transition-colors cursor-pointer ${
                    viewMode === "medications"
                      ? "bg-white text-[#0284c7] shadow-2xs"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  <Pill className="h-3.5 w-3.5" />
                  All Meds ({filtered.length})
                </button>
              </div>

              {/* Display Layout Switcher (Cards | List) */}
              <div
                className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl"
                role="group"
                aria-label="Display layout"
              >
                <button
                  type="button"
                  aria-pressed={displayLayout === "cards"}
                  onClick={() => handleDisplayLayoutChange("cards")}
                  className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-[11px] font-bold transition-colors cursor-pointer ${
                    displayLayout === "cards"
                      ? "bg-white text-[#0284c7] shadow-2xs"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  <LayoutGrid className="h-3.5 w-3.5" />
                  Cards
                </button>
                <button
                  type="button"
                  aria-pressed={displayLayout === "list"}
                  onClick={() => handleDisplayLayoutChange("list")}
                  className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-[11px] font-bold transition-colors cursor-pointer ${
                    displayLayout === "list"
                      ? "bg-white text-[#0284c7] shadow-2xs"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  <List className="h-3.5 w-3.5" />
                  List
                </button>
              </div>

              {/* Source Filter */}
              <select
                value={sourceFilter}
                onChange={(e) => setSourceFilter(e.target.value as any)}
                aria-label="Filter by prescription source"
                className="h-8 rounded-xl border border-slate-200 bg-white px-2.5 text-[11px] font-semibold text-slate-700"
              >
                <option value="ALL">All Sources</option>
                <option value="CLINIC_RX">CSU Clinic Rx Only</option>
                <option value="PATIENT_SCANNED">Self-Scanned / OTC Only</option>
              </select>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-1 bg-slate-50 p-1 rounded-xl border border-slate-100 w-fit">
            {(["ALL", "ACTIVE", "PAUSED", "COMPLETED", "DISCONTINUED"] as const).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setStatusFilter(s)}
                className={`rounded-lg px-2.5 py-1 text-[11px] font-semibold transition-colors cursor-pointer ${
                  statusFilter === s
                    ? "bg-white text-[#0284c7] shadow-2xs font-bold"
                    : "text-slate-500 hover:text-slate-900"
                }`}
              >
                {s === "ALL" ? "All" : s.charAt(0) + s.slice(1).toLowerCase()} ({statusCounts[s]})
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Medications View: Grouped By Patient (Default) OR Flat All-Medications Grid */}
      {loading ? (
        <div className="p-12 text-center text-xs text-slate-400">
          Loading prescriptions and treatments...
        </div>
      ) : filtered.length === 0 ? (
        <div className="p-12 text-center text-xs text-slate-400 bg-white rounded-2xl border border-slate-100">
          No prescriptions found matching your filter.
        </div>
      ) : viewMode === "patients" ? (
        displayLayout === "list" ? (
          <Card className="rounded-2xl border-slate-100 shadow-xs bg-white overflow-hidden">
            <div
              tabIndex={0}
              role="region"
              aria-label="Patients medication list"
              className="card-scroll-area max-h-[540px] overflow-auto focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[#0284c7]/40"
            >
              <table className="w-full min-w-[780px] text-left border-collapse">
                <thead className="sticky top-0 z-10 border-b border-slate-200/80 bg-slate-50/95 backdrop-blur-xs text-[11px] font-bold uppercase tracking-wider text-slate-500">
                  <tr>
                    <th className="py-3 pl-5 pr-3">Patient</th>
                    <th className="py-3 px-3">College / Unit</th>
                    <th className="py-3 px-3">Medications</th>
                    <th className="py-3 px-3">Source</th>
                    <th className="py-3 pl-3 pr-5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs">
                  {groupedByPatient.map((group) => {
                    const hasAllergy = hasDocumentedDrugAllergy(group.patientAllergies);
                    const clinicCount = group.clinicRxList.length;
                    const selfScannedCount = group.medications.length - clinicCount;

                    return (
                      <tr
                        key={group.patientId}
                        onClick={() => openPatientRecordModal(group.patientId)}
                        className="group hover:bg-sky-50/40 transition-colors cursor-pointer"
                      >
                        {/* Patient */}
                        <td className="py-3 pl-5 pr-3 align-middle">
                          <div className="flex items-center gap-2.5 min-w-0">
                            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-sky-50 text-[#0284c7] font-black text-[11px] group-hover:bg-[#0284c7] group-hover:text-white transition-colors">
                              {(group.patientName[0] || "P").toUpperCase()}
                            </div>
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="font-bold text-slate-900 truncate max-w-[200px]">
                                  {group.patientName}
                                </span>
                                {hasAllergy && (
                                  <span
                                    title={`Allergies: ${group.patientAllergies}`}
                                    className="inline-flex items-center gap-0.5 rounded bg-red-50 border border-red-200 px-1.5 py-0.5 text-[9px] font-extrabold text-red-700"
                                  >
                                    <AlertTriangle className="h-2.5 w-2.5" />
                                    Allergy
                                  </span>
                                )}
                              </div>
                              <p className="font-mono text-[10px] font-semibold text-slate-400">
                                {group.idNumber}
                              </p>
                            </div>
                          </div>
                        </td>

                        {/* College / Unit */}
                        <td className="py-3 px-3 align-middle max-w-[180px]">
                          <span
                            title={group.patientDepartment || "CSU Patient"}
                            className="block truncate text-[11px] font-medium text-slate-600"
                          >
                            {group.patientDepartment || "CSU Patient"}
                          </span>
                        </td>

                        {/* Medications */}
                        <td className="py-3 px-3 align-middle">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="shrink-0 rounded-full bg-emerald-50 border border-emerald-200/80 px-2 py-0.5 text-[10px] font-extrabold text-emerald-700">
                              {group.activeCount > 0
                                ? `${group.activeCount} Active`
                                : `${group.medications.length} Total`}
                            </span>
                            {group.medications.slice(0, 2).map((med) => {
                              const selfScanned = isSelfScannedMedication(med);
                              return (
                                <span
                                  key={med.id}
                                  className={`inline-flex items-center gap-1 rounded-lg border px-2 py-0.5 text-[10px] font-bold max-w-[170px] truncate ${
                                    selfScanned
                                      ? "border-slate-200 bg-slate-50 text-slate-600"
                                      : "border-sky-200/80 bg-sky-50/70 text-[#0369a1]"
                                  }`}
                                >
                                  {selfScanned ? (
                                    <ScanLine className="h-2.5 w-2.5 shrink-0" />
                                  ) : (
                                    <Pill className="h-2.5 w-2.5 shrink-0" />
                                  )}
                                  <span className="truncate">
                                    {med.name} {med.dosage}
                                  </span>
                                </span>
                              );
                            })}
                            {group.medications.length > 2 && (
                              <span className="inline-flex items-center rounded-lg bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-500">
                                +{group.medications.length - 2} more
                              </span>
                            )}
                          </div>
                        </td>

                        {/* Source */}
                        <td className="py-3 px-3 align-middle whitespace-nowrap">
                          <div className="flex flex-col gap-1 text-[10px] font-semibold text-slate-500">
                            {clinicCount > 0 && (
                              <span className="inline-flex items-center gap-1 text-[#0369a1]">
                                <Stethoscope className="h-3 w-3" />
                                {clinicCount} Clinic Rx
                              </span>
                            )}
                            {selfScannedCount > 0 && (
                              <span className="inline-flex items-center gap-1 text-slate-500">
                                <ScanLine className="h-3 w-3" />
                                {selfScannedCount} Self-Scanned
                              </span>
                            )}
                          </div>
                        </td>

                        {/* Actions */}
                        <td className="py-3 pl-3 pr-5 align-middle text-right whitespace-nowrap">
                          <div className="inline-flex items-center justify-end gap-1.5">
                            {clinicCount > 0 && (
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                title="Print Combined CSU Clinic Prescription Slip"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handlePrintCombinedRxSlip(group);
                                }}
                                className="h-7 rounded-lg px-2 text-[11px] font-bold gap-1 cursor-pointer bg-white"
                              >
                                <Printer className="h-3 w-3" />
                                Print Rx
                              </Button>
                            )}
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={(e) => {
                                e.stopPropagation();
                                openPatientRecordModal(group.patientId);
                              }}
                              className="h-7 rounded-lg px-2.5 text-[11px] font-bold gap-1 border-sky-200 bg-sky-50/70 text-[#0284c7] hover:bg-[#0284c7] hover:text-white hover:border-[#0284c7] cursor-pointer"
                            >
                              View Record
                              <ArrowRight className="h-3 w-3" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {groupedByPatient.map((group) => {
            const hasAllergy = hasDocumentedDrugAllergy(group.patientAllergies);
            const clinicCount = group.clinicRxList.length;
            const selfScannedCount = group.medications.length - clinicCount;

            return (
              <button
                key={group.patientId}
                type="button"
                onClick={() => openPatientRecordModal(group.patientId)}
                className="group text-left rounded-2xl border border-slate-200/80 bg-white p-4 shadow-xs hover:shadow-md hover:border-[#0284c7]/40 transition-all cursor-pointer flex flex-col justify-between gap-3 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[#0284c7]"
              >
                <div className="space-y-2.5">
                  {/* Top Row: Avatar, Name, CSU ID, Active Count */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-sky-50 text-[#0284c7] font-black text-xs group-hover:bg-[#0284c7] group-hover:text-white transition-colors">
                        {(group.patientName[0] || "P").toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-black text-slate-900 truncate leading-tight">
                          {group.patientName}
                        </p>
                        <p className="font-mono text-[10px] font-semibold text-slate-400 mt-0.5">
                          {group.idNumber}
                        </p>
                      </div>
                    </div>

                    <span className="shrink-0 rounded-full bg-emerald-50 border border-emerald-200/80 px-2 py-0.5 text-[10px] font-extrabold text-emerald-700">
                      {group.activeCount > 0
                        ? `${group.activeCount} Active`
                        : `${group.medications.length} Total`}
                    </span>
                  </div>

                  {/* Department + Allergy Badge */}
                  <div className="flex items-center justify-between gap-2 text-[11px]">
                    <span className="text-slate-500 truncate">
                      {group.patientDepartment || "CSU Patient"}
                    </span>
                    {hasAllergy && (
                      <span
                        title={`Allergies: ${group.patientAllergies}`}
                        className="shrink-0 inline-flex items-center gap-0.5 rounded bg-red-50 border border-red-200 px-1.5 py-0.5 text-[9px] font-extrabold text-red-700"
                      >
                        <AlertTriangle className="h-2.5 w-2.5" />
                        Allergy
                      </span>
                    )}
                  </div>

                  {/* Compact Medication Preview Chips (Max 2 + "+N more") */}
                  <div className="flex flex-wrap gap-1.5 pt-0.5">
                    {group.medications.slice(0, 2).map((med) => {
                      const selfScanned = isSelfScannedMedication(med);
                      return (
                        <span
                          key={med.id}
                          className={`inline-flex items-center gap-1 rounded-lg border px-2 py-0.5 text-[10px] font-bold max-w-full truncate ${
                            selfScanned
                              ? "border-slate-200 bg-slate-50 text-slate-600"
                              : "border-sky-200/80 bg-sky-50/70 text-[#0369a1]"
                          }`}
                        >
                          {selfScanned ? (
                            <ScanLine className="h-2.5 w-2.5 shrink-0" />
                          ) : (
                            <Pill className="h-2.5 w-2.5 shrink-0" />
                          )}
                          <span className="truncate">
                            {med.name} {med.dosage}
                          </span>
                        </span>
                      );
                    })}
                    {group.medications.length > 2 && (
                      <span className="inline-flex items-center rounded-lg bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-500">
                        +{group.medications.length - 2} more
                      </span>
                    )}
                  </div>
                </div>

                {/* Card Footer */}
                <div className="pt-2.5 border-t border-slate-100 flex items-center justify-between gap-2 text-[10px]">
                  <div className="flex items-center gap-1.5 text-slate-400 font-semibold">
                    {clinicCount > 0 && (
                      <span>
                        {clinicCount} Clinic Rx
                      </span>
                    )}
                    {clinicCount > 0 && selfScannedCount > 0 && <span>•</span>}
                    {selfScannedCount > 0 && (
                      <span>
                        {selfScannedCount} Self-Scanned
                      </span>
                    )}
                  </div>

                  <span className="inline-flex items-center gap-1 font-bold text-[#0284c7] group-hover:translate-x-0.5 transition-transform">
                    View Record
                    <ArrowRight className="h-3 w-3" />
                  </span>
                </div>
              </button>
            );
          })}
        </div>
        )
      ) : displayLayout === "list" ? (
        <Card className="rounded-2xl border-slate-100 shadow-xs bg-white overflow-hidden">
          <div
            tabIndex={0}
            role="region"
            aria-label="All medications ledger"
            className="card-scroll-area max-h-[540px] overflow-auto focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[#0284c7]/40"
          >
            <table className="w-full min-w-[940px] text-left border-collapse">
              <thead className="sticky top-0 z-10 border-b border-slate-200/80 bg-slate-50/95 backdrop-blur-xs text-[11px] font-bold uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="py-3 pl-5 pr-3">Medication</th>
                  <th className="py-3 px-3">Patient</th>
                  <th className="py-3 px-3">Schedule</th>
                  <th className="py-3 px-3">Status &amp; Fulfillment</th>
                  <th className="py-3 pl-3 pr-5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {filtered.map((med) => {
                  const isActive = med.status === "ACTIVE";
                  const isPaused = med.status === "PAUSED";
                  const isBusy = actionBusyId === med.id;
                  const isSelfScanned = isSelfScannedMedication(med);
                  const hasAllergy = hasDocumentedDrugAllergy(med.patientAllergies);

                  return (
                    <tr
                      key={med.id}
                      className={`hover:bg-slate-50/80 transition-colors ${
                        med.status === "DISCONTINUED" ? "bg-slate-50/40" : "bg-white"
                      }`}
                    >
                      {/* Medication */}
                      <td className="py-3 pl-5 pr-3 align-top">
                        <div className="flex items-start gap-2.5">
                          <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-sky-50 text-[#0284c7]">
                            {isSelfScanned ? (
                              <ScanLine className="h-4 w-4 text-slate-500" />
                            ) : (
                              <Pill className="h-4 w-4" />
                            )}
                          </div>
                          <div className="min-w-0">
                            <p className="font-bold text-slate-900 leading-tight">{med.name}</p>
                            <p className="text-[11px] font-semibold text-[#0284c7]">
                              {med.dosage} • {med.form || "Tablet"}
                            </p>
                            <p className="mt-0.5 inline-flex items-center gap-1 text-[10px] font-medium text-slate-500">
                              {isSelfScanned ? (
                                <>
                                  <ScanLine className="h-2.5 w-2.5 text-slate-400" />
                                  Self-Scanned / OTC
                                </>
                              ) : (
                                <>
                                  <Stethoscope className="h-2.5 w-2.5 text-[#0284c7]" />
                                  {med.prescribedBy}
                                </>
                              )}
                            </p>
                          </div>
                        </div>
                      </td>

                      {/* Patient (clickable -> Patient Record Modal) */}
                      <td className="py-3 px-3 align-top">
                        <button
                          type="button"
                          onClick={() => openPatientRecordModal(med.patientId)}
                          className="group text-left cursor-pointer focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[#0284c7] rounded-md"
                        >
                          <p className="font-bold text-slate-900 group-hover:text-[#0284c7] group-hover:underline leading-tight">
                            {med.patientName}
                          </p>
                          <p className="font-mono text-[10px] text-slate-500 mt-0.5">
                            {med.idNumber}
                          </p>
                        </button>
                        {hasAllergy && (
                          <span
                            title={`Allergies: ${med.patientAllergies}`}
                            className="mt-1 inline-flex items-center gap-0.5 rounded bg-red-50 border border-red-200 px-1.5 py-0.5 text-[9px] font-extrabold text-red-700"
                          >
                            <AlertTriangle className="h-2.5 w-2.5" />
                            Allergy
                          </span>
                        )}
                      </td>

                      {/* Schedule */}
                      <td className="py-3 px-3 align-top">
                        <p className="text-[11px] font-semibold text-slate-700">{med.frequency}</p>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {med.scheduleTimes.map((time, idx) => (
                            <span
                              key={idx}
                              className="inline-flex items-center gap-0.5 rounded bg-slate-50 border border-slate-200 px-1.5 py-0.5 text-[10px] font-bold text-slate-700"
                            >
                              <Clock className="h-2.5 w-2.5 text-slate-400" />
                              {time}
                            </span>
                          ))}
                        </div>
                        <p className="mt-1 text-[10px] text-slate-400">
                          {new Date(med.startDate).toLocaleDateString()} →{" "}
                          {med.endDate ? new Date(med.endDate).toLocaleDateString() : "Ongoing"}
                        </p>
                      </td>

                      {/* Status & Fulfillment */}
                      <td className="py-3 px-3 align-top">
                        <div className="flex flex-col items-start gap-1.5">
                          <span
                            className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${getStatusPillClasses(med.status)}`}
                          >
                            {med.status}
                          </span>

                          {isSelfScanned ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 border border-slate-200 px-2 py-0.5 text-[10px] font-bold text-slate-600">
                              <ScanLine className="h-2.5 w-2.5" />
                              Patient-Logged
                            </span>
                          ) : med.fulfillmentStatus === "CLINIC_DISPENSED" ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 border border-emerald-200/80 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
                              <PackageCheck className="h-2.5 w-2.5" />
                              Clinic Dispensed ({med.dispensedUnits || 1}u)
                            </span>
                          ) : med.fulfillmentStatus === "PARTIAL_EXTERNAL" ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 border border-amber-200 px-2 py-0.5 text-[10px] font-bold text-amber-800">
                              <Store className="h-2.5 w-2.5" />
                              Partial ({med.dispensedUnits || 0}u) + External
                            </span>
                          ) : med.fulfillmentStatus === "EXTERNAL_PHARMACY" ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 border border-amber-200 px-2 py-0.5 text-[10px] font-bold text-amber-800">
                              <Store className="h-2.5 w-2.5" />
                              External Pharmacy Rx
                            </span>
                          ) : med.fulfillmentStatus === "UNAVAILABLE_IN_CLINIC" ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 border border-rose-200 px-2 py-0.5 text-[10px] font-bold text-rose-700">
                              <PackageX className="h-2.5 w-2.5" />
                              Out of Clinic Stock
                            </span>
                          ) : med.fulfillmentStatus === "AWAITING_DISPENSE" ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-sky-50 border border-sky-200 px-2 py-0.5 text-[10px] font-bold text-[#0284c7]">
                              <PackageCheck className="h-2.5 w-2.5" />
                              In Clinic Stock ({med.clinicStockMatch?.currentStock ?? 0}u)
                            </span>
                          ) : null}
                        </div>
                      </td>

                      {/* Actions */}
                      <td className="py-3 pl-3 pr-5 align-top text-right">
                        <div className="flex flex-col items-end gap-1.5">
                          <div className="inline-flex items-center gap-1.5">
                            {isSelfScanned ? (
                              <span className="inline-flex items-center gap-1 rounded-lg bg-slate-100 border border-slate-200 px-2 py-1 text-[10px] font-bold text-slate-600">
                                <ScanLine className="h-3 w-3" />
                                Read-Only (OTC)
                              </span>
                            ) : (
                              <>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  title="Print CSU Prescription Slip"
                                  onClick={() => handlePrintRxSlip(med)}
                                  className="h-7 text-[11px] font-bold rounded-lg px-2 gap-1 cursor-pointer bg-white"
                                >
                                  <Printer className="h-3 w-3" />
                                  Print
                                </Button>

                                {isActive &&
                                  (userRole === "DOCTOR" ||
                                    userRole === "HEALTH_STAFF" ||
                                    userRole === "ADMIN") &&
                                  (med.fulfillmentStatus === "EXTERNAL_PHARMACY" ||
                                  med.fulfillmentStatus === "UNAVAILABLE_IN_CLINIC" ? (
                                    <Button
                                      type="button"
                                      size="sm"
                                      variant="outline"
                                      disabled={restockBusyKey === `list_${med.id}`}
                                      onClick={() =>
                                        void handleRequestRestock({
                                          key: `list_${med.id}`,
                                          medicationName: med.name,
                                          dosage: med.dosage,
                                          form: med.form,
                                          inventoryItemId: med.clinicStockMatch?.id ?? null,
                                          notes: `Needed for active prescription (${med.patientName}, ${med.idNumber})`,
                                        })
                                      }
                                      title="Notify Admin & Pharmacy Staff to restock or procure this drug"
                                      className="h-7 text-[11px] font-bold border-amber-300 bg-amber-50 hover:bg-amber-100 text-amber-900 rounded-lg px-2 gap-1 cursor-pointer"
                                    >
                                      <BellRing className="h-3 w-3" />
                                      {restockBusyKey === `list_${med.id}`
                                        ? "Sending..."
                                        : "Restock"}
                                    </Button>
                                  ) : (
                                    <Button
                                      type="button"
                                      size="sm"
                                      onClick={() => openDispenseModal(med)}
                                      className="h-7 text-[11px] font-bold bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg px-2.5 shadow-2xs gap-1 cursor-pointer"
                                    >
                                      <PackageCheck className="h-3 w-3" />
                                      Dispense
                                    </Button>
                                  ))}
                              </>
                            )}
                          </div>

                          {/* Doctor Lifecycle Controls */}
                          {canPrescribe && (isActive || isPaused) && (
                            <div className="inline-flex items-center gap-1">
                              {isActive ? (
                                <button
                                  type="button"
                                  disabled={isBusy}
                                  onClick={() => void handleStatusUpdate(med, "PAUSED")}
                                  className="inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-[10px] font-bold text-amber-700 hover:bg-amber-50 cursor-pointer disabled:opacity-50"
                                >
                                  <PauseCircle className="h-3 w-3" />
                                  Pause
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  disabled={isBusy}
                                  onClick={() => void handleStatusUpdate(med, "ACTIVE")}
                                  className="inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-[10px] font-bold text-emerald-700 hover:bg-emerald-50 cursor-pointer disabled:opacity-50"
                                >
                                  <PlayCircle className="h-3 w-3" />
                                  Resume
                                </button>
                              )}

                              <button
                                type="button"
                                disabled={isBusy}
                                onClick={() => void handleStatusUpdate(med, "COMPLETED")}
                                className="inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-[10px] font-bold text-[#0284c7] hover:bg-sky-50 cursor-pointer disabled:opacity-50"
                              >
                                <CheckCircle2 className="h-3 w-3" />
                                Done
                              </button>

                              <button
                                type="button"
                                disabled={isBusy}
                                onClick={() => void handleStatusUpdate(med, "DISCONTINUED")}
                                className="inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-[10px] font-bold text-rose-700 hover:bg-rose-50 cursor-pointer disabled:opacity-50"
                              >
                                <Ban className="h-3 w-3" />
                                Stop
                              </button>
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((med) => {
            const isActive = med.status === "ACTIVE";
            const isPaused = med.status === "PAUSED";
            const isBusy = actionBusyId === med.id;
            const isSelfScanned = isSelfScannedMedication(med);

            return (
              <Card
                key={med.id}
                className={`rounded-2xl border shadow-xs hover:shadow-md transition-shadow flex flex-col justify-between ${
                  med.status === "DISCONTINUED"
                    ? "border-slate-200/80 bg-slate-50/40"
                    : "border-slate-100 bg-white"
                }`}
              >
                <div>
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-sky-50 text-[#0284c7] font-bold">
                          <Pill className="h-5 w-5" />
                        </div>
                        <div className="min-w-0">
                          <CardTitle className="text-sm font-bold text-slate-900 truncate">
                            {med.name}
                          </CardTitle>
                          <span className="text-xs font-semibold text-[#0284c7]">
                            {med.dosage} • {med.form || "Tablet"}
                          </span>
                        </div>
                      </div>

                      <span
                        className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${getStatusPillClasses(med.status)}`}
                      >
                        {med.status}
                      </span>
                    </div>
                  </CardHeader>

                  <CardContent className="space-y-3 pt-0">
                    <div className="rounded-xl bg-slate-50 p-2.5 text-xs">
                      <p className="text-[10px] font-semibold text-slate-400 uppercase">Patient</p>
                      <div className="flex items-center justify-between mt-0.5">
                        <span className="font-bold text-slate-900">{med.patientName}</span>
                        <span className="font-mono text-[11px] text-slate-500">
                          {med.idNumber}
                        </span>
                      </div>
                      {hasDocumentedDrugAllergy(med.patientAllergies) && (
                        <p className="mt-1 text-[10px] font-bold text-red-700 flex items-center gap-1">
                          <AlertTriangle className="h-3 w-3 shrink-0" />
                          Allergies: {med.patientAllergies}
                        </p>
                      )}
                    </div>

                    <div>
                      {/* Fulfillment & Clinic Stock Pill */}
                      {med.fulfillmentStatus && med.fulfillmentStatus !== "SELF_SCANNED" && (
                        <div className="mb-2 flex flex-wrap items-center gap-1.5">
                          {med.fulfillmentStatus === "CLINIC_DISPENSED" && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 border border-emerald-200/80 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
                              <PackageCheck className="h-3 w-3" />
                              Clinic Dispensed ({med.dispensedUnits || 1}u)
                            </span>
                          )}
                          {med.fulfillmentStatus === "PARTIAL_EXTERNAL" && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 border border-amber-200 px-2 py-0.5 text-[10px] font-bold text-amber-800">
                              <Store className="h-3 w-3" />
                              Partial ({med.dispensedUnits || 0}u clinic) + External Rx
                            </span>
                          )}
                          {med.fulfillmentStatus === "EXTERNAL_PHARMACY" && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 border border-amber-200 px-2 py-0.5 text-[10px] font-bold text-amber-800">
                              <Store className="h-3 w-3" />
                              External Pharmacy Rx
                            </span>
                          )}
                          {med.fulfillmentStatus === "UNAVAILABLE_IN_CLINIC" && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 border border-rose-200 px-2 py-0.5 text-[10px] font-bold text-rose-700">
                              <PackageX className="h-3 w-3" />
                              Out of Clinic Stock
                            </span>
                          )}
                          {med.fulfillmentStatus === "AWAITING_DISPENSE" && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-sky-50 border border-sky-200 px-2 py-0.5 text-[10px] font-bold text-[#0284c7]">
                              <PackageCheck className="h-3 w-3" />
                              In Clinic Stock ({med.clinicStockMatch?.currentStock ?? 0}u)
                            </span>
                          )}
                        </div>
                      )}

                      <p className="text-[11px] text-slate-600 font-medium">{med.frequency}</p>
                      {(med.cleanInstructions || med.instructions) && (
                        <p className="text-[11px] text-slate-400 italic mt-0.5">
                          &ldquo;{med.cleanInstructions || med.instructions}&rdquo;
                        </p>
                      )}
                      {med.externalPharmacyNote && (
                        <p className="mt-1 rounded-lg bg-amber-50/70 border border-amber-200/70 px-2 py-1 text-[10px] font-medium text-amber-900">
                          {med.externalPharmacyNote}
                        </p>
                      )}
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {med.scheduleTimes.map((time, idx) => (
                          <span
                            key={idx}
                            className="inline-flex items-center gap-1 rounded-md bg-white border border-slate-200 px-2 py-0.5 text-[10px] font-bold text-slate-700 shadow-2xs"
                          >
                            <Clock className="h-3 w-3 text-slate-400" />
                            {time}
                          </span>
                        ))}
                      </div>
                    </div>
                  </CardContent>
                </div>

                <div>
                  <div className="px-5 py-2.5 bg-slate-50/60 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2">
                    <span className="text-[11px] text-slate-500 flex items-center gap-1 font-medium">
                      <Stethoscope className="h-3 w-3 text-[#0284c7]" />
                      {med.prescribedBy}
                    </span>

                    <div className="flex items-center gap-1.5">
                      {isSelfScanned ? (
                        <span className="inline-flex items-center gap-1 rounded-lg bg-slate-100 border border-slate-200 px-2 py-1 text-[10px] font-bold text-slate-600">
                          <ScanLine className="h-3 w-3" />
                          Patient-Logged (External)
                        </span>
                      ) : (
                        <>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            title="Print CSU Prescription Slip"
                            onClick={() => handlePrintRxSlip(med)}
                            className="h-7 text-[11px] font-bold rounded-lg px-2 gap-1 cursor-pointer"
                          >
                            <Printer className="h-3 w-3" />
                            Print Rx
                          </Button>

                          {isActive &&
                            (userRole === "DOCTOR" ||
                              userRole === "HEALTH_STAFF" ||
                              userRole === "ADMIN") && (
                              med.fulfillmentStatus === "EXTERNAL_PHARMACY" ||
                              med.fulfillmentStatus === "UNAVAILABLE_IN_CLINIC" ? (
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  disabled={restockBusyKey === `card_${med.id}`}
                                  onClick={() =>
                                    void handleRequestRestock({
                                      key: `card_${med.id}`,
                                      medicationName: med.name,
                                      dosage: med.dosage,
                                      form: med.form,
                                      inventoryItemId: med.clinicStockMatch?.id ?? null,
                                      notes: `Needed for active prescription (${med.patientName}, ${med.idNumber})`,
                                    })
                                  }
                                  title="Notify Admin & Pharmacy Staff to restock or procure this drug"
                                  className="h-7 text-[11px] font-bold border-amber-300 bg-amber-50 hover:bg-amber-100 text-amber-900 rounded-lg px-2 gap-1 cursor-pointer"
                                >
                                  <BellRing className="h-3 w-3" />
                                  {restockBusyKey === `card_${med.id}` ? "Sending..." : "Restock Alert"}
                                </Button>
                              ) : (
                                <Button
                                  size="sm"
                                  onClick={() => openDispenseModal(med)}
                                  className="h-7 text-[11px] font-bold bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg px-2.5 shadow-2xs gap-1 cursor-pointer"
                                >
                                  <PackageCheck className="h-3.5 w-3.5" />
                                  Dispense
                                </Button>
                              )
                            )}
                        </>
                      )}
                    </div>
                  </div>

                  {/* Doctor Lifecycle Controls */}
                  {canPrescribe && (isActive || isPaused) && (
                    <div className="px-5 py-2 border-t border-slate-100 flex items-center justify-end gap-1.5 bg-white">
                      {isActive ? (
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => void handleStatusUpdate(med, "PAUSED")}
                          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-bold text-amber-700 hover:bg-amber-50 cursor-pointer disabled:opacity-50"
                        >
                          <PauseCircle className="h-3 w-3" />
                          Pause
                        </button>
                      ) : (
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => void handleStatusUpdate(med, "ACTIVE")}
                          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-bold text-emerald-700 hover:bg-emerald-50 cursor-pointer disabled:opacity-50"
                        >
                          <PlayCircle className="h-3 w-3" />
                          Resume
                        </button>
                      )}

                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => void handleStatusUpdate(med, "COMPLETED")}
                        className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-bold text-[#0284c7] hover:bg-sky-50 cursor-pointer disabled:opacity-50"
                      >
                        <CheckCircle2 className="h-3 w-3" />
                        Complete
                      </button>

                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => void handleStatusUpdate(med, "DISCONTINUED")}
                        className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-bold text-rose-700 hover:bg-rose-50 cursor-pointer disabled:opacity-50"
                      >
                        <Ban className="h-3 w-3" />
                        Discontinue
                      </button>
                    </div>
                  )}

                  <div className="px-5 py-2 border-t border-slate-100 flex items-center justify-between text-[10px] text-slate-400">
                    <span>Start: {new Date(med.startDate).toLocaleDateString()}</span>
                    <span>
                      {med.endDate
                        ? `End: ${new Date(med.endDate).toLocaleDateString()}`
                        : "Ongoing"}
                    </span>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* MODAL 1: NEW PRESCRIPTION WITH ALLERGY SAFETY SCREENING */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl border border-slate-100 max-h-[90vh] overflow-y-auto space-y-4 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h2 className="text-base font-black text-slate-900">
                  Issue Clinical Prescription
                </h2>
                <p className="text-xs text-slate-500">
                  Prescribe medication regimen with automatic patient allergy screening.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {modalError && (
              <div className="rounded-xl bg-red-50 border border-red-200 p-3 text-xs text-red-700 font-semibold flex items-center gap-2">
                <AlertCircle className="h-4 w-4 shrink-0" />
                {modalError}
              </div>
            )}

            {modalSuccess && (
              <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-3 text-xs text-emerald-700 font-semibold flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 shrink-0" />
                {modalSuccess}
              </div>
            )}

            <form onSubmit={handleCreatePrescription} className="space-y-4 text-xs">
              <div className="space-y-1">
                <Label className="text-xs">Select CSU Patient *</Label>
                <select
                  required
                  value={formData.patientId}
                  onChange={(e) => setFormData({ ...formData, patientId: e.target.value })}
                  className="w-full h-9 rounded-xl border border-slate-200 px-2.5 text-xs bg-white text-slate-800 font-medium"
                >
                  <option value="" disabled>
                    -- Select CSU Patient --
                  </option>
                  {patients.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.idNumber} — {p.department})
                    </option>
                  ))}
                </select>
              </div>

              {/* Clinical Safety Context Banner for Selected Patient */}
              {selectedPatient && (
                <div
                  className={`rounded-xl border p-3 space-y-1 text-[11px] ${
                    hasDocumentedDrugAllergy(selectedPatient.allergies)
                      ? "border-red-200 bg-red-50/70 text-red-900"
                      : "border-emerald-200 bg-emerald-50/60 text-emerald-900"
                  }`}
                >
                  <div className="flex items-center gap-1.5 font-bold">
                    {hasDocumentedDrugAllergy(selectedPatient.allergies) ? (
                      <AlertTriangle className="h-3.5 w-3.5 text-red-600 shrink-0" />
                    ) : (
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                    )}
                    <span>
                      Known Drug Allergies:{" "}
                      {selectedPatient.allergies || "Not screened yet"}
                    </span>
                  </div>
                  <p className="text-slate-600 pl-5">
                    <strong>Medical Conditions:</strong>{" "}
                    {selectedPatient.medicalConditions || "None recorded"}
                  </p>
                </div>
              )}

              {/* Real-Time Allergy Contraindication Alert */}
              {allergyConflict.hasConflict && (
                <div className="rounded-xl border-2 border-red-400 bg-red-50 p-3.5 space-y-2.5 text-xs text-red-900">
                  <div className="flex items-start gap-2">
                    <ShieldAlert className="h-5 w-5 text-red-600 shrink-0 mt-0.5" />
                    <div>
                      <p className="font-black text-red-800 uppercase tracking-wide text-[11px]">
                        Drug-Allergy Contraindication Alert
                      </p>
                      <p className="mt-0.5 leading-relaxed font-medium">
                        {allergyConflict.warningMessage}
                      </p>
                    </div>
                  </div>
                  <label className="flex items-start gap-2 pt-1.5 border-t border-red-200 cursor-pointer font-bold text-red-900 text-[11px]">
                    <input
                      type="checkbox"
                      checked={allergyOverrideConfirmed}
                      onChange={(e) => setAllergyOverrideConfirmed(e.target.checked)}
                      className="mt-0.5 h-3.5 w-3.5 rounded accent-red-600"
                    />
                    <span>
                      I have clinically reviewed this allergy risk and confirm I still want to
                      issue this prescription.
                    </span>
                  </label>
                </div>
              )}

              {/* Queued Multi-Drug Regimen List (when prescribing >1 medication in one consultation) */}
              {queuedDrafts.length > 0 && (
                <div className="rounded-xl border border-sky-200 bg-sky-50/50 p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-black text-[#0369a1] uppercase tracking-wide">
                      Queued Medications for This Patient ({queuedDrafts.length})
                    </span>
                    <span className="text-[10px] text-slate-500">
                      Will all be issued together
                    </span>
                  </div>
                  <div className="space-y-1.5">
                    {queuedDrafts.map((q, idx) => (
                      <div
                        key={idx}
                        className="flex items-center justify-between gap-2 rounded-lg bg-white border border-sky-100 px-2.5 py-1.5 text-[11px]"
                      >
                        <div className="min-w-0">
                          <span className="font-bold text-slate-900">{q.name}</span>{" "}
                          <span className="text-[#0284c7] font-semibold">
                            {q.dosage} • {q.form}
                          </span>
                          <span className="text-slate-400 ml-1.5">({q.frequency})</span>
                        </div>
                        <button
                          type="button"
                          onClick={() =>
                            setQueuedDrafts((prev) => prev.filter((_, i) => i !== idx))
                          }
                          title="Remove from queue"
                          className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600 cursor-pointer"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {inventoryStock.length > 0 && (
                <div className="space-y-2.5 bg-sky-50/50 p-3 rounded-xl border border-sky-100">
                  <div className="flex items-center justify-between">
                    <Label className="text-[11px] font-bold text-[#0284c7]">
                      Quick Pick from CSU Clinic Stock (Optional)
                    </Label>
                    <span className="text-[10px] text-slate-500">Live Inventory</span>
                  </div>
                  <select
                    value={formData.inventoryItemId}
                    onChange={(e) => {
                      const selected = inventoryStock.find((i) => i.id === e.target.value);
                      if (selected) {
                        setFormData((prev) => ({
                          ...prev,
                          inventoryItemId: selected.id,
                          name: selected.name,
                          dosage: selected.strength,
                          form: selected.form || prev.form,
                          fulfillmentMode:
                            selected.currentStock > 0
                              ? prev.fulfillmentMode === "EXTERNAL_PHARMACY"
                                ? "CLINIC_DISPENSE"
                                : prev.fulfillmentMode
                              : "EXTERNAL_PHARMACY",
                          dispenseQuantity:
                            selected.currentStock > 0
                              ? Math.min(prev.dispenseQuantity || 10, selected.currentStock)
                              : 1,
                          requestRestock: selected.currentStock === 0,
                        }));
                      } else {
                        setFormData((prev) => ({
                          ...prev,
                          inventoryItemId: "",
                          fulfillmentMode: prev.name.trim()
                            ? "EXTERNAL_PHARMACY"
                            : "CLINIC_NO_DISPENSE",
                        }));
                      }
                    }}
                    className="w-full h-9 rounded-lg border border-slate-200 px-2 text-xs bg-white text-slate-800"
                  >
                    <option value="">
                      -- Type any medication manually below, or pick from CSU clinic stock --
                    </option>
                    {inventoryStock.map((inv) => (
                      <option key={inv.id} value={inv.id}>
                        {inv.name} ({inv.strength}) •{" "}
                        {inv.currentStock > 0
                          ? `${inv.currentStock} in stock`
                          : "0 in stock (OUT OF STOCK — External Rx)"}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="space-y-1 sm:col-span-1">
                  <Label className="text-xs">
                    Medication Name {queuedDrafts.length === 0 ? "*" : ""}
                  </Label>
                  <Input
                    required={queuedDrafts.length === 0}
                    placeholder="e.g. Amoxicillin"
                    value={formData.name}
                    onChange={(e) => {
                      const nextName = e.target.value;
                      setFormData((prev) => ({
                        ...prev,
                        name: nextName,
                        inventoryItemId:
                          prev.inventoryItemId &&
                          !isDrugNameMatchingInventory(
                            nextName,
                            inventoryStock.find((i) => i.id === prev.inventoryItemId),
                          )
                            ? ""
                            : prev.inventoryItemId,
                      }));
                    }}
                    className="rounded-xl text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">
                    Dosage {queuedDrafts.length === 0 ? "*" : ""}
                  </Label>
                  <Input
                    required={queuedDrafts.length === 0}
                    placeholder="e.g. 500 mg"
                    value={formData.dosage}
                    onChange={(e) => setFormData({ ...formData, dosage: e.target.value })}
                    className="rounded-xl text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Dosage Form</Label>
                  <select
                    value={formData.form}
                    onChange={(e) => setFormData({ ...formData, form: e.target.value })}
                    className="w-full h-9 rounded-xl border border-slate-200 px-2 text-xs bg-white text-slate-800"
                  >
                    {DOSAGE_FORMS.map((f) => (
                      <option key={f} value={f}>
                        {f}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* LIVE INVENTORY AVAILABILITY & FULFILLMENT WORKFLOW */}
              {formStockState !== "EMPTY" && (
                <div
                  className={`rounded-xl border p-3.5 space-y-3 ${
                    formStockState === "IN_STOCK"
                      ? "border-emerald-200 bg-emerald-50/40"
                      : "border-amber-200 bg-amber-50/60"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-start gap-2">
                      {formStockState === "IN_STOCK" ? (
                        <PackageCheck className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
                      ) : (
                        <Store className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                      )}
                      <div>
                        <p
                          className={`text-[11px] font-black uppercase tracking-wide ${
                            formStockState === "IN_STOCK" ? "text-emerald-800" : "text-amber-900"
                          }`}
                        >
                          {formStockState === "IN_STOCK"
                            ? `Available in CSU Clinic (${matchedFormStockItem?.currentStock ?? 0} units)`
                            : formStockState === "OUT_OF_STOCK"
                              ? "Out of Stock in CSU Clinic (0 units) — External Rx Mode"
                              : "Not in CSU Clinic Inventory — External Rx Mode"}
                        </p>
                        <p className="text-[11px] text-slate-600 mt-0.5">
                          {formStockState === "IN_STOCK"
                            ? `${matchedFormStockItem?.name} ${matchedFormStockItem?.strength} (${matchedFormStockItem?.category}) is ready to dispense or prescribe.`
                            : "You can still issue this prescription! The patient will receive active dose reminders and a printable External Pharmacy Rx slip."}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* In-stock therapeutic alternatives when drug is OUT_OF_STOCK */}
                  {inStockAlternatives.length > 0 && (
                    <div className="rounded-lg bg-white/90 border border-amber-200/80 p-2.5 space-y-1.5">
                      <p className="text-[10px] font-extrabold uppercase tracking-wide text-slate-600 flex items-center gap-1">
                        <ArrowRightLeft className="h-3 w-3 text-[#0284c7]" />
                        In-Stock Alternatives ({matchedFormStockItem?.category})
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {inStockAlternatives.map((alt) => (
                          <button
                            key={alt.id}
                            type="button"
                            onClick={() =>
                              setFormData((prev) => ({
                                ...prev,
                                inventoryItemId: alt.id,
                                name: alt.name,
                                dosage: alt.strength,
                                form: alt.form || prev.form,
                                fulfillmentMode: "CLINIC_DISPENSE",
                                dispenseQuantity: Math.min(10, alt.currentStock),
                                requestRestock: false,
                              }))
                            }
                            className="inline-flex items-center gap-1 rounded-lg border border-sky-200 bg-sky-50 hover:bg-sky-100 px-2 py-1 text-[10px] font-bold text-[#0369a1] transition-colors cursor-pointer"
                          >
                            <span>
                              {alt.name} {alt.strength}
                            </span>
                            <span className="text-emerald-700">({alt.currentStock}u)</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Fulfillment Mode Selector */}
                  {formStockState === "IN_STOCK" && matchedFormStockItem ? (
                    <div className="space-y-2.5">
                      <div className="grid grid-cols-3 gap-1.5">
                        {(
                          [
                            {
                              id: "CLINIC_DISPENSE",
                              label: "Dispense Now",
                              sub: "Hand over clinic stock",
                            },
                            {
                              id: "PARTIAL_EXTERNAL",
                              label: "Partial + External",
                              sub: "Starter + buy balance",
                            },
                            {
                              id: "EXTERNAL_PHARMACY",
                              label: "External Rx",
                              sub: "Buy outside clinic",
                            },
                          ] as const
                        ).map((opt) => (
                          <button
                            key={opt.id}
                            type="button"
                            onClick={() =>
                              setFormData((prev) => ({
                                ...prev,
                                fulfillmentMode: opt.id,
                                dispenseQuantity: Math.min(
                                  Math.max(1, prev.dispenseQuantity || 1),
                                  matchedFormStockItem.currentStock,
                                ),
                              }))
                            }
                            className={`rounded-lg border p-2 text-left transition-colors cursor-pointer ${
                              formData.fulfillmentMode === opt.id
                                ? "border-[#0284c7] bg-sky-50 text-[#0369a1]"
                                : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                            }`}
                          >
                            <div className="text-[11px] font-bold">{opt.label}</div>
                            <div className="text-[9px] text-slate-500">{opt.sub}</div>
                          </button>
                        ))}
                      </div>

                      {(formData.fulfillmentMode === "CLINIC_DISPENSE" ||
                        formData.fulfillmentMode === "PARTIAL_EXTERNAL") && (
                        <div className="flex flex-wrap items-center gap-3 pt-1">
                          <div className="flex items-center gap-1.5">
                            <Label className="text-[11px] text-slate-700 whitespace-nowrap">
                              Clinic Units:
                            </Label>
                            <Input
                              type="number"
                              min={1}
                              max={matchedFormStockItem.currentStock}
                              value={formData.dispenseQuantity}
                              onChange={(e) =>
                                setFormData({
                                  ...formData,
                                  dispenseQuantity: Number(e.target.value),
                                })
                              }
                              className="w-20 h-8 rounded-lg text-xs bg-white"
                            />
                            <span className="text-[10px] text-slate-500">
                              / {matchedFormStockItem.currentStock} max
                            </span>
                          </div>

                          {formData.fulfillmentMode === "PARTIAL_EXTERNAL" && (
                            <div className="flex items-center gap-1.5">
                              <Label className="text-[11px] text-amber-800 whitespace-nowrap">
                                Buy Outside:
                              </Label>
                              <Input
                                type="number"
                                min={1}
                                value={formData.externalQuantity}
                                onChange={(e) =>
                                  setFormData({
                                    ...formData,
                                    externalQuantity: Number(e.target.value),
                                  })
                                }
                                className="w-20 h-8 rounded-lg text-xs bg-white"
                              />
                              <span className="text-[10px] text-amber-700">units</span>
                            </div>
                          )}
                        </div>
                      )}

                      {formData.fulfillmentMode === "PARTIAL_EXTERNAL" && (
                        <label className="flex items-center gap-2 cursor-pointer text-[11px] font-semibold text-amber-900">
                          <input
                            type="checkbox"
                            checked={formData.requestRestock}
                            onChange={(e) =>
                              setFormData({ ...formData, requestRestock: e.target.checked })
                            }
                            className="rounded accent-amber-600"
                          />
                          Notify Admin &amp; Pharmacy Staff that clinic stock is insufficient
                        </label>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-2 pt-1 border-t border-amber-200/70">
                      <div className="flex items-center gap-2">
                        <Label className="text-[11px] text-amber-900 whitespace-nowrap">
                          Quantity for External Pharmacy (Optional):
                        </Label>
                        <Input
                          type="number"
                          min={0}
                          value={formData.externalQuantity}
                          onChange={(e) =>
                            setFormData({
                              ...formData,
                              externalQuantity: Number(e.target.value),
                            })
                          }
                          className="w-20 h-8 rounded-lg text-xs bg-white"
                        />
                        <span className="text-[10px] text-amber-800">units</span>
                      </div>

                      <label className="flex items-center gap-2 cursor-pointer text-[11px] font-bold text-amber-900">
                        <input
                          type="checkbox"
                          checked={formData.requestRestock}
                          onChange={(e) =>
                            setFormData({ ...formData, requestRestock: e.target.checked })
                          }
                          className="rounded accent-amber-600"
                        />
                        Notify Admin &amp; Pharmacy Staff to restock / procure this medication
                      </label>
                    </div>
                  )}
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Dosing Frequency</Label>
                  <select
                    value={formData.frequency}
                    onChange={(e) => {
                      const nextFreq = e.target.value;
                      setFormData({
                        ...formData,
                        frequency: nextFreq,
                        scheduleTimesStr:
                          FREQUENCY_PRESETS[nextFreq] || formData.scheduleTimesStr,
                      });
                    }}
                    className="w-full h-9 rounded-xl border border-slate-200 px-2.5 text-xs bg-white text-slate-800"
                  >
                    {Object.keys(FREQUENCY_PRESETS).map((freq) => (
                      <option key={freq} value={freq}>
                        {freq}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Dose Timings *</Label>
                  <Input
                    required
                    placeholder="08:00 AM, 08:00 PM"
                    value={formData.scheduleTimesStr}
                    onChange={(e) =>
                      setFormData({ ...formData, scheduleTimesStr: e.target.value })
                    }
                    className="rounded-xl text-xs font-mono"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <Label className="text-xs">Clinical Intake Instructions (Sig.)</Label>
                <Input
                  placeholder="e.g. Take 1 tablet with a full glass of water after meals"
                  value={formData.instructions}
                  onChange={(e) => setFormData({ ...formData, instructions: e.target.value })}
                  className="rounded-xl text-xs"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Start Date</Label>
                  <Input
                    type="date"
                    value={formData.startDate}
                    onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                    className="rounded-xl text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs">End Date (Optional)</Label>
                    <div className="flex items-center gap-1">
                      {[5, 7, 14, 30].map((d) => (
                        <button
                          key={d}
                          type="button"
                          onClick={() =>
                            setFormData({
                              ...formData,
                              endDate: addDaysToIso(formData.startDate, d),
                            })
                          }
                          className="rounded bg-slate-100 hover:bg-sky-100 hover:text-[#0284c7] px-1.5 py-0.5 text-[9px] font-bold text-slate-600 cursor-pointer"
                        >
                          +{d}d
                        </button>
                      ))}
                    </div>
                  </div>
                  <Input
                    type="date"
                    min={formData.startDate}
                    value={formData.endDate}
                    onChange={(e) => setFormData({ ...formData, endDate: e.target.value })}
                    className="rounded-xl text-xs"
                  />
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-slate-100">
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleQueueAnotherDrug}
                  disabled={modalLoading || !formData.name.trim() || !formData.dosage.trim()}
                  className="rounded-xl text-xs font-bold text-[#0284c7] border-sky-200 hover:bg-sky-50 gap-1 cursor-pointer"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add Another Drug
                </Button>

                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setIsModalOpen(false)}
                    className="rounded-xl text-xs cursor-pointer"
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    disabled={
                      modalLoading ||
                      (allergyConflict.hasConflict && !allergyOverrideConfirmed)
                    }
                    className="rounded-xl bg-[#0284c7] hover:bg-[#0369a1] text-xs font-bold text-white cursor-pointer"
                  >
                    {modalLoading
                      ? "Issuing..."
                      : queuedDrafts.length > 0
                        ? `Issue ${queuedDrafts.length + (formData.name.trim() ? 1 : 0)} Prescriptions`
                        : formData.fulfillmentMode === "EXTERNAL_PHARMACY"
                          ? "Issue External Rx"
                          : formData.fulfillmentMode === "PARTIAL_EXTERNAL"
                            ? "Dispense Starter & Issue Rx"
                            : formData.fulfillmentMode === "CLINIC_DISPENSE"
                              ? "Issue & Dispense Rx"
                              : "Issue Prescription"}
                  </Button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: DISPENSE MEDICATION FOR ACTIVE PRESCRIPTION */}
      {isDispenseModalOpen && selectedMedication && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl border border-slate-100 space-y-4 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
                  <PackageCheck className="h-4 w-4" />
                </div>
                <div>
                  <h2 className="text-base font-black text-slate-900">Dispense Medication</h2>
                  <p className="text-[11px] text-slate-500">
                    Hand over physical dose from pharmacy inventory to patient.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsDispenseModalOpen(false)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {dispenseError && (
              <div className="rounded-xl bg-red-50 border border-red-200 p-3 text-xs text-red-700 font-semibold flex items-center gap-2">
                <AlertCircle className="h-4 w-4 shrink-0" />
                {dispenseError}
              </div>
            )}

            {dispenseSuccess && (
              <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-3 text-xs text-emerald-700 font-semibold flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 shrink-0" />
                {dispenseSuccess}
              </div>
            )}

            <div className="rounded-xl bg-slate-50 p-3 text-xs space-y-2 border border-slate-100">
              <div className="flex items-center justify-between">
                <span className="text-[10px] uppercase font-bold text-slate-400 flex items-center gap-1">
                  <User className="h-3 w-3" /> Patient
                </span>
                <span className="font-mono text-[11px] text-slate-500">
                  {selectedMedication.idNumber}
                </span>
              </div>
              <p className="font-bold text-slate-900 text-sm">
                {selectedMedication.patientName}
              </p>

              <div className="pt-2 border-t border-slate-200/60 flex items-center justify-between text-[11px]">
                <span className="font-semibold text-slate-700">
                  {selectedMedication.name}
                </span>
                <span className="font-bold text-[#0284c7]">
                  {selectedMedication.dosage} • {selectedMedication.form}
                </span>
              </div>
              <p className="text-[11px] text-slate-500">{selectedMedication.frequency}</p>
            </div>

            <form onSubmit={handleDispensePrescription} className="space-y-4 text-xs">
              {/* Alert when no matching clinic stock exists or stock is 0 */}
              {(!selectedInventoryStockItem || selectedInventoryStockItem.currentStock <= 0) && (
                <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 space-y-2 text-[11px] text-amber-950">
                  <div className="flex items-start gap-2">
                    <PackageX className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                    <div>
                      <p className="font-extrabold">
                        {!selectedInventoryStockItem
                          ? `No matching clinic inventory found for "${selectedMedication.name}"`
                          : `${selectedInventoryStockItem.name} (${selectedInventoryStockItem.strength}) is Out of Stock (0 units)`}
                      </p>
                      <p className="text-amber-900/90 mt-0.5">
                        Print the CSU prescription slip so the patient can purchase this at an external pharmacy, or notify Admin/Pharmacy to restock.
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2 pt-1">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => handlePrintRxSlip(selectedMedication)}
                      className="h-7 text-[11px] font-bold bg-white border-amber-300 text-amber-900 hover:bg-amber-100 rounded-lg gap-1 cursor-pointer"
                    >
                      <Printer className="h-3 w-3" />
                      Print External Rx Slip
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      disabled={restockBusyKey === `dispense_${selectedMedication.id}`}
                      onClick={() =>
                        void handleRequestRestock({
                          key: `dispense_${selectedMedication.id}`,
                          medicationName: selectedMedication.name,
                          dosage: selectedMedication.dosage,
                          form: selectedMedication.form,
                          inventoryItemId: selectedInventoryStockItem?.id ?? null,
                          notes: `Dispense blocked due to unavailable stock (${selectedMedication.patientName})`,
                        })
                      }
                      className="h-7 text-[11px] font-bold bg-amber-600 hover:bg-amber-700 text-white rounded-lg gap-1 cursor-pointer"
                    >
                      <BellRing className="h-3 w-3" />
                      {restockBusyKey === `dispense_${selectedMedication.id}`
                        ? "Sending..."
                        : "Request Restock"}
                    </Button>
                  </div>
                </div>
              )}

              <div className="space-y-1">
                <Label className="text-xs">Clinic Inventory Stock Item</Label>
                <select
                  value={dispenseForm.inventoryItemId}
                  onChange={(e) => {
                    setDispenseMismatchConfirmed(false);
                    setDispenseForm({ ...dispenseForm, inventoryItemId: e.target.value });
                  }}
                  className="w-full h-9 rounded-xl border border-slate-200 px-2.5 text-xs bg-white text-slate-800 font-medium"
                >
                  <option value="">-- Select matching clinic stock item --</option>
                  {inventoryStock.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name} ({item.strength}) •{" "}
                      {item.currentStock > 0
                        ? `Available: ${item.currentStock} units`
                        : "OUT OF STOCK (0 units)"}
                    </option>
                  ))}
                </select>
                {selectedInventoryStockItem && (
                  <p className="text-[10px] text-slate-500">
                    Current clinic stock:{" "}
                    <span className="font-bold text-slate-800">
                      {selectedInventoryStockItem.currentStock} units
                    </span>{" "}
                    (Deducted via FEFO batch expiry).
                  </p>
                )}
              </div>

              {/* Clinical Safety Guard if selected stock item doesn't match the prescribed drug name */}
              {dispenseDrugMismatch && selectedInventoryStockItem && (
                <div className="rounded-xl border-2 border-red-300 bg-red-50 p-3 space-y-2 text-[11px] text-red-900">
                  <div className="flex items-start gap-2">
                    <ShieldAlert className="h-4 w-4 text-red-600 shrink-0 mt-0.5" />
                    <p className="font-semibold">
                      <strong>Drug Mismatch Guard:</strong> Prescription is for{" "}
                      <strong>{selectedMedication.name}</strong>, but selected stock is{" "}
                      <strong>
                        {selectedInventoryStockItem.name} ({selectedInventoryStockItem.strength})
                      </strong>
                      .
                    </p>
                  </div>
                  <label className="flex items-start gap-2 cursor-pointer font-bold">
                    <input
                      type="checkbox"
                      checked={dispenseMismatchConfirmed}
                      onChange={(e) => setDispenseMismatchConfirmed(e.target.checked)}
                      className="mt-0.5 rounded accent-red-600"
                    />
                    <span>
                      I confirm this is an approved generic/therapeutic substitution authorized by the physician.
                    </span>
                  </label>
                </div>
              )}

              <div className="space-y-1">
                <Label className="text-xs">
                  Quantity to Dispense (Units / Tablets / Vials)
                </Label>
                <Input
                  type="number"
                  min={1}
                  max={Math.max(1, selectedInventoryStockItem?.currentStock ?? 1)}
                  disabled={!selectedInventoryStockItem || selectedInventoryStockItem.currentStock <= 0}
                  value={dispenseForm.quantity}
                  onChange={(e) =>
                    setDispenseForm({ ...dispenseForm, quantity: Number(e.target.value) })
                  }
                  required
                  className="rounded-xl text-xs"
                />
              </div>

              <div className="space-y-1">
                <Label className="text-xs">Dispensing Reason / Clinical Notes</Label>
                <Input
                  value={dispenseForm.reason}
                  onChange={(e) =>
                    setDispenseForm({ ...dispenseForm, reason: e.target.value })
                  }
                  placeholder="e.g. Regular dosage refill handed over directly"
                  className="rounded-xl text-xs"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsDispenseModalOpen(false)}
                  className="rounded-xl text-xs cursor-pointer"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={
                    dispenseLoading ||
                    !selectedInventoryStockItem ||
                    selectedInventoryStockItem.currentStock <= 0 ||
                    dispenseForm.quantity > selectedInventoryStockItem.currentStock ||
                    (dispenseDrugMismatch && !dispenseMismatchConfirmed)
                  }
                  className="rounded-xl bg-emerald-600 hover:bg-emerald-700 text-xs font-bold text-white cursor-pointer shadow-xs gap-1.5"
                >
                  <Send className="h-3.5 w-3.5" />
                  {dispenseLoading ? "Dispensing..." : "Confirm & Dispense Meds"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 3: NATIVE <dialog> PATIENT RECORD & REGIMENS MODAL */}
      <dialog
        ref={patientDialogRef}
        {...({ closedby: "any" } as any)}
        aria-labelledby={patientDialogTitleId}
        onClose={(e) => {
          e.currentTarget.returnValue = "";
          setActivePatientId(null);
        }}
        className="patient-record-dialog m-auto w-[min(94vw,48rem)] max-h-[88vh] rounded-2xl border border-slate-200 bg-white p-0 shadow-2xl overflow-hidden text-slate-900"
      >
        {activePatientGroup && (
          <>
            {/* Pinned Patient Modal Header */}
            <div className="shrink-0 border-b border-slate-100 bg-slate-50/80 px-6 py-4 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#0284c7] text-white font-black text-base shadow-xs">
                    {(activePatientGroup.patientName[0] || "P").toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h1
                        id={patientDialogTitleId}
                        className="text-base font-black text-slate-900 truncate"
                      >
                        {activePatientGroup.patientName}
                      </h1>
                      <span className="rounded-md bg-white border border-slate-200 px-2 py-0.5 font-mono text-[11px] font-bold text-slate-600">
                        {activePatientGroup.idNumber}
                      </span>
                      {patientChart?.type && (
                        <span className="rounded-md bg-sky-50 border border-sky-200 px-2 py-0.5 text-[10px] font-bold text-[#0284c7]">
                          {patientChart.type}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {activePatientGroup.patientDepartment || "CSU Patient"}
                      {patientChart?.gender ? ` • ${patientChart.gender}` : ""}
                      {formatPatientAge(patientChart?.dateOfBirth || null)
                        ? ` • ${formatPatientAge(patientChart?.dateOfBirth || null)}`
                        : ""}
                      {patientChart?.bloodType ? ` • Blood: ${patientChart.bloodType}` : ""}
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  autoFocus
                  onClick={closePatientRecordModal}
                  aria-label="Close patient record"
                  className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-200/70 hover:text-slate-700 cursor-pointer shrink-0"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* Clinical Safety & Quick Actions Bar */}
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  {hasDocumentedDrugAllergy(
                    patientChart?.allergies ?? activePatientGroup.patientAllergies,
                  ) ? (
                    <span className="inline-flex items-center gap-1 rounded-lg bg-red-50 border border-red-200 px-2.5 py-1 text-[11px] font-bold text-red-700">
                      <AlertTriangle className="h-3.5 w-3.5 text-red-600 shrink-0" />
                      Allergies: {patientChart?.allergies ?? activePatientGroup.patientAllergies}
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded-lg bg-emerald-50 border border-emerald-200 px-2.5 py-1 text-[11px] font-bold text-emerald-700">
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                      No Known Drug Allergies
                    </span>
                  )}

                  {patientChart?.adherence && patientChart.adherence.rate !== null && (
                    <span
                      className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-[11px] font-bold ${
                        patientChart.adherence.rate >= 80
                          ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                          : "bg-amber-50 text-amber-800 border border-amber-200"
                      }`}
                    >
                      <Activity className="h-3.5 w-3.5" />
                      {patientChart.adherence.rate}% Adherence
                    </span>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-1.5">
                  {activePatientGroup.clinicRxList.length > 0 && (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => handlePrintCombinedRxSlip(activePatientGroup)}
                      className="h-7 rounded-lg px-2.5 text-[11px] font-bold gap-1 bg-white cursor-pointer"
                    >
                      <Printer className="h-3 w-3 text-[#0284c7]" />
                      {activePatientGroup.clinicRxList.length > 1
                        ? `Print Combined Rx (${activePatientGroup.clinicRxList.length})`
                        : "Print Rx"}
                    </Button>
                  )}

                  {patientChart?.userId && (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        const uid = patientChart.userId;
                        closePatientRecordModal();
                        navigate("/app/messages", { state: { recipientUserId: uid } });
                      }}
                      className="h-7 rounded-lg px-2.5 text-[11px] font-bold gap-1 bg-white cursor-pointer"
                    >
                      <MessageSquare className="h-3 w-3 text-[#0284c7]" />
                      Message
                    </Button>
                  )}

                  {canPrescribe && (
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => {
                        const pid = activePatientGroup.patientId;
                        closePatientRecordModal();
                        setModalError("");
                        setModalSuccess(false);
                        setAllergyOverrideConfirmed(false);
                        setQueuedDrafts([]);
                        setFormData(createInitialRxForm(pid));
                        setIsModalOpen(true);
                      }}
                      className="h-7 rounded-lg px-2.5 text-[11px] font-bold bg-[#0284c7] hover:bg-[#0369a1] text-white gap-1 cursor-pointer"
                    >
                      <Plus className="h-3 w-3" />
                      Add Rx
                    </Button>
                  )}
                </div>
              </div>

              {/* Modal Tab Switcher */}
              <div className="flex items-center gap-1.5 pt-1">
                <button
                  type="button"
                  onClick={() => setRecordModalTab("medications")}
                  className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition-colors cursor-pointer ${
                    recordModalTab === "medications"
                      ? "bg-white text-[#0284c7] shadow-2xs border border-slate-200"
                      : "text-slate-500 hover:text-slate-900"
                  }`}
                >
                  <Pill className="h-3.5 w-3.5" />
                  Medications &amp; Regimens ({activePatientGroup.medications.length})
                </button>
                <button
                  type="button"
                  onClick={() => setRecordModalTab("clinical")}
                  className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition-colors cursor-pointer ${
                    recordModalTab === "clinical"
                      ? "bg-white text-[#0284c7] shadow-2xs border border-slate-200"
                      : "text-slate-500 hover:text-slate-900"
                  }`}
                >
                  <FileText className="h-3.5 w-3.5" />
                  Patient Record &amp; Dispense History
                </button>
              </div>
            </div>

            {/* Scrollable Modal Body */}
            <div className="flex-1 card-scroll-area overflow-y-auto">
              {recordModalTab === "medications" ? (
                <div className="divide-y divide-slate-100">
                  {activePatientGroup.medications.map((med) => {
                    const isActive = med.status === "ACTIVE";
                    const isPaused = med.status === "PAUSED";
                    const isBusy = actionBusyId === med.id;
                    const isSelfScanned = isSelfScannedMedication(med);

                    return (
                      <div
                        key={med.id}
                        className={`p-5 space-y-2.5 transition-colors ${
                          med.status === "DISCONTINUED"
                            ? "bg-slate-50/60 opacity-80"
                            : "hover:bg-slate-50/40"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2.5 min-w-0">
                            <div
                              className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${
                                isSelfScanned
                                  ? "bg-slate-100 text-slate-500"
                                  : "bg-sky-50 text-[#0284c7]"
                              }`}
                            >
                              {isSelfScanned ? (
                                <ScanLine className="h-4 w-4" />
                              ) : (
                                <Pill className="h-4 w-4" />
                              )}
                            </div>
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-1.5">
                                <span className="text-sm font-bold text-slate-900">
                                  {med.name}
                                </span>
                                <span className="text-xs font-semibold text-[#0284c7]">
                                  {med.dosage} • {med.form || "Tablet"}
                                </span>
                              </div>
                              <div className="flex flex-wrap items-center gap-1.5 mt-0.5 text-[10px] text-slate-500">
                                <span className="inline-flex items-center gap-1 font-medium">
                                  <Stethoscope className="h-3 w-3 text-[#0284c7]" />
                                  {med.prescribedBy}
                                </span>
                                <span>•</span>
                                <span>
                                  {new Date(med.startDate).toLocaleDateString()}
                                  {med.endDate
                                    ? ` → ${new Date(med.endDate).toLocaleDateString()}`
                                    : " • Ongoing"}
                                </span>
                              </div>
                            </div>
                          </div>

                          <span
                            className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${getStatusPillClasses(med.status)}`}
                          >
                            {med.status}
                          </span>
                        </div>

                        <div className="flex flex-wrap items-center gap-1.5">
                          {isSelfScanned ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 border border-slate-200 px-2 py-0.5 text-[10px] font-bold text-slate-600">
                              <ScanLine className="h-3 w-3" />
                              Patient-Logged (External / OTC)
                            </span>
                          ) : (
                            <>
                              {med.fulfillmentStatus === "CLINIC_DISPENSED" && (
                                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 border border-emerald-200/80 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
                                  <PackageCheck className="h-3 w-3" />
                                  Clinic Dispensed ({med.dispensedUnits || 1}u)
                                </span>
                              )}
                              {med.fulfillmentStatus === "PARTIAL_EXTERNAL" && (
                                <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 border border-amber-200 px-2 py-0.5 text-[10px] font-bold text-amber-800">
                                  <Store className="h-3 w-3" />
                                  Partial ({med.dispensedUnits || 0}u clinic) + External Rx
                                </span>
                              )}
                              {med.fulfillmentStatus === "EXTERNAL_PHARMACY" && (
                                <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 border border-amber-200 px-2 py-0.5 text-[10px] font-bold text-amber-800">
                                  <Store className="h-3 w-3" />
                                  External Pharmacy Rx
                                </span>
                              )}
                              {med.fulfillmentStatus === "UNAVAILABLE_IN_CLINIC" && (
                                <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 border border-rose-200 px-2 py-0.5 text-[10px] font-bold text-rose-700">
                                  <PackageX className="h-3 w-3" />
                                  Out of Clinic Stock
                                </span>
                              )}
                              {med.fulfillmentStatus === "AWAITING_DISPENSE" && (
                                <span className="inline-flex items-center gap-1 rounded-full bg-sky-50 border border-sky-200 px-2 py-0.5 text-[10px] font-bold text-[#0284c7]">
                                  <PackageCheck className="h-3 w-3" />
                                  In Clinic Stock ({med.clinicStockMatch?.currentStock ?? 0}u)
                                </span>
                              )}
                            </>
                          )}
                          <span className="text-[11px] text-slate-600 font-medium">
                            {med.frequency}
                          </span>
                        </div>

                        {(med.cleanInstructions || med.instructions) && (
                          <p className="text-[11px] text-slate-500 italic">
                            &ldquo;{med.cleanInstructions || med.instructions}&rdquo;
                          </p>
                        )}
                        {med.externalPharmacyNote && (
                          <p className="rounded-lg bg-amber-50/70 border border-amber-200/70 px-2.5 py-1.5 text-[10px] font-medium text-amber-900">
                            {med.externalPharmacyNote}
                          </p>
                        )}

                        <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                          <div className="flex flex-wrap gap-1.5">
                            {med.scheduleTimes.map((time, idx) => (
                              <span
                                key={idx}
                                className="inline-flex items-center gap-1 rounded-md bg-white border border-slate-200 px-2 py-0.5 text-[10px] font-bold text-slate-700 shadow-2xs"
                              >
                                <Clock className="h-3 w-3 text-slate-400" />
                                {time}
                              </span>
                            ))}
                          </div>

                          <div className="flex flex-wrap items-center gap-1.5">
                            {!isSelfScanned && (
                              <>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  onClick={() => handlePrintRxSlip(med)}
                                  className="h-7 text-[10px] font-bold rounded-lg px-2 gap-1 cursor-pointer"
                                >
                                  <Printer className="h-3 w-3" />
                                  Print
                                </Button>

                                {isActive &&
                                  (userRole === "DOCTOR" ||
                                    userRole === "HEALTH_STAFF" ||
                                    userRole === "ADMIN") && (
                                    med.fulfillmentStatus === "EXTERNAL_PHARMACY" ||
                                    med.fulfillmentStatus === "UNAVAILABLE_IN_CLINIC" ? (
                                      <Button
                                        type="button"
                                        size="sm"
                                        variant="outline"
                                        disabled={restockBusyKey === `modal_${med.id}`}
                                        onClick={() =>
                                          void handleRequestRestock({
                                            key: `modal_${med.id}`,
                                            medicationName: med.name,
                                            dosage: med.dosage,
                                            form: med.form,
                                            inventoryItemId: med.clinicStockMatch?.id ?? null,
                                            notes: `Needed for active prescription (${med.patientName}, ${med.idNumber})`,
                                          })
                                        }
                                        className="h-7 text-[10px] font-bold border-amber-300 bg-amber-50 hover:bg-amber-100 text-amber-900 rounded-lg px-2 gap-1 cursor-pointer"
                                      >
                                        <BellRing className="h-3 w-3" />
                                        {restockBusyKey === `modal_${med.id}`
                                          ? "Sending..."
                                          : "Restock Alert"}
                                      </Button>
                                    ) : (
                                      <Button
                                        size="sm"
                                        onClick={() => {
                                          closePatientRecordModal();
                                          openDispenseModal(med);
                                        }}
                                        className="h-7 text-[10px] font-bold bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg px-2.5 shadow-2xs gap-1 cursor-pointer"
                                      >
                                        <PackageCheck className="h-3 w-3" />
                                        Dispense
                                      </Button>
                                    )
                                  )}
                              </>
                            )}

                            {canPrescribe && (isActive || isPaused) && (
                              <div className="flex items-center gap-0.5 pl-1 border-l border-slate-200">
                                {isActive ? (
                                  <button
                                    type="button"
                                    disabled={isBusy}
                                    onClick={() => void handleStatusUpdate(med, "PAUSED")}
                                    className="inline-flex items-center gap-0.5 rounded-md px-1.5 py-1 text-[10px] font-bold text-amber-700 hover:bg-amber-50 cursor-pointer disabled:opacity-50"
                                  >
                                    <PauseCircle className="h-3 w-3" />
                                    Pause
                                  </button>
                                ) : (
                                  <button
                                    type="button"
                                    disabled={isBusy}
                                    onClick={() => void handleStatusUpdate(med, "ACTIVE")}
                                    className="inline-flex items-center gap-0.5 rounded-md px-1.5 py-1 text-[10px] font-bold text-emerald-700 hover:bg-emerald-50 cursor-pointer disabled:opacity-50"
                                  >
                                    <PlayCircle className="h-3 w-3" />
                                    Resume
                                  </button>
                                )}
                                <button
                                  type="button"
                                  disabled={isBusy}
                                  onClick={() => void handleStatusUpdate(med, "COMPLETED")}
                                  className="inline-flex items-center gap-0.5 rounded-md px-1.5 py-1 text-[10px] font-bold text-[#0284c7] hover:bg-sky-50 cursor-pointer disabled:opacity-50"
                                >
                                  <CheckCircle2 className="h-3 w-3" />
                                  Done
                                </button>
                                <button
                                  type="button"
                                  disabled={isBusy}
                                  onClick={() => void handleStatusUpdate(med, "DISCONTINUED")}
                                  className="inline-flex items-center gap-0.5 rounded-md px-1.5 py-1 text-[10px] font-bold text-rose-700 hover:bg-rose-50 cursor-pointer disabled:opacity-50"
                                >
                                  <Ban className="h-3 w-3" />
                                  Stop
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="p-6 space-y-5 text-xs">
                  {patientChartLoading ? (
                    <p className="py-10 text-center text-slate-400">
                      Loading clinical patient chart...
                    </p>
                  ) : !patientChart ? (
                    <p className="py-10 text-center text-slate-400">
                      Unable to load extended patient record details.
                    </p>
                  ) : (
                    <>
                      {/* Clinical Info Grid */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-3.5 space-y-1.5">
                          <p className="text-[10px] font-extrabold uppercase tracking-wide text-slate-400">
                            Contact Information
                          </p>
                          <p className="flex items-center gap-1.5 font-semibold text-slate-800">
                            <Mail className="h-3.5 w-3.5 text-slate-400" />
                            {patientChart.email}
                          </p>
                          <p className="flex items-center gap-1.5 font-semibold text-slate-800">
                            <Phone className="h-3.5 w-3.5 text-slate-400" />
                            {patientChart.phone || "No mobile number recorded"}
                          </p>
                        </div>

                        <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-3.5 space-y-1.5">
                          <p className="text-[10px] font-extrabold uppercase tracking-wide text-slate-400">
                            Emergency Contact
                          </p>
                          <p className="font-bold text-slate-900">
                            {patientChart.emergencyContactName || "Not recorded"}
                          </p>
                          <p className="text-slate-600">
                            {patientChart.emergencyContactPhone || "No emergency phone on file"}
                          </p>
                        </div>
                      </div>

                      {/* Medical Conditions & Adherence Summary */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="rounded-xl border border-slate-100 bg-white p-3.5 space-y-1">
                          <p className="text-[10px] font-extrabold uppercase tracking-wide text-slate-400">
                            Documented Medical Conditions
                          </p>
                          <p className="font-semibold text-slate-800">
                            {patientChart.medicalConditions || "None recorded"}
                          </p>
                        </div>

                        <div className="rounded-xl border border-slate-100 bg-white p-3.5 space-y-1">
                          <p className="text-[10px] font-extrabold uppercase tracking-wide text-slate-400">
                            Adherence Summary
                          </p>
                          {patientChart.adherence.total > 0 ? (
                            <p className="font-semibold text-slate-800">
                              <span className="font-black text-emerald-700">
                                {patientChart.adherence.rate}%
                              </span>{" "}
                              ({patientChart.adherence.taken} taken, {patientChart.adherence.missed}{" "}
                              missed, {patientChart.adherence.skipped} skipped)
                            </p>
                          ) : (
                            <p className="text-slate-400 italic">No adherence logs recorded yet</p>
                          )}
                        </div>
                      </div>

                      {/* Recent Clinic Dispensation History */}
                      <div className="space-y-2">
                        <p className="text-[11px] font-black uppercase tracking-wide text-slate-600">
                          Clinic Pharmacy Dispensation History ({patientChart.dispensations.length})
                        </p>
                        {patientChart.dispensations.length === 0 ? (
                          <div className="rounded-xl border border-slate-100 bg-slate-50/50 p-4 text-center text-slate-400 italic">
                            No clinic inventory stock has been dispensed to this patient yet.
                          </div>
                        ) : (
                          <div className="divide-y divide-slate-100 rounded-xl border border-slate-100 bg-white overflow-hidden">
                            {patientChart.dispensations.slice(0, 8).map((tx) => (
                              <div
                                key={tx.id}
                                className="p-3 flex items-center justify-between gap-3"
                              >
                                <div className="min-w-0">
                                  <p className="font-bold text-slate-900">
                                    {tx.medicationName} ({tx.strength} • {tx.form})
                                  </p>
                                  <p className="text-[10px] text-slate-500">
                                    By {tx.performedBy}
                                    {tx.reason ? ` — ${tx.reason}` : ""}
                                  </p>
                                </div>
                                <div className="text-right shrink-0">
                                  <span className="rounded-md bg-emerald-50 px-2 py-0.5 font-mono text-[11px] font-bold text-emerald-700">
                                    {tx.quantity} units
                                  </span>
                                  <p className="text-[10px] text-slate-400 mt-0.5">
                                    {new Date(tx.createdAt).toLocaleDateString()}
                                  </p>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          </>
        )}
      </dialog>
    </div>
  );
}
