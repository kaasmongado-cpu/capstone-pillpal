import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Activity,
  AlertCircle,
  AlertTriangle,
  Boxes,
  Calendar,
  CheckCircle2,
  Clock,
  FileText,
  HeartPulse,
  MessageSquare,
  Pencil,
  Phone,
  Pill,
  Printer,
  RefreshCw,
  Save,
  Search,
  ShieldCheck,
  Stethoscope,
  UserCheck,
  X,
  XCircle,
} from "lucide-react";
import { fetchWithAuth } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  BLOOD_TYPES,
  CSU_COLLEGES,
  EMPLOYEE_UNITS,
  GENDER_OPTIONS,
  formatDobWithAge,
  getTodayIsoDate,
  hasDocumentedDrugAllergy,
  isValidCsuId,
  isValidPhPhone,
} from "@/lib/clinical";

type PatientItem = {
  id: string;
  userId: string;
  name: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  idNumber: string;
  department: string;
  type: "STUDENT" | "EMPLOYEE";
  dateOfBirth: string | null;
  gender: string | null;
  bloodType: string | null;
  allergies: string | null;
  medicalConditions: string | null;
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
  activeMedicationsCount: number;
  prescriptions: { id: string; name: string; dosage: string }[];
  adherenceRate: number | null;
  totalLogs?: number;
  status: string;
};

type PatientChartDetail = {
  id: string;
  userId: string;
  name: string;
  firstName: string;
  lastName: string;
  email: string;
  emailVerified: boolean;
  status: string;
  phone: string | null;
  idNumber: string;
  department: string;
  type: "STUDENT" | "EMPLOYEE";
  dateOfBirth: string | null;
  gender: string | null;
  bloodType: string | null;
  allergies: string | null;
  medicalConditions: string | null;
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
  privacyConsentAt: string | null;
  registeredAt: string;
  prescriptions: {
    id: string;
    name: string;
    dosage: string;
    form: string;
    frequency: string;
    scheduleTimes: string[];
    instructions: string | null;
    startDate: string;
    endDate: string | null;
    status: "ACTIVE" | "PAUSED" | "COMPLETED" | "DISCONTINUED";
    prescribedBy: string;
    doctorSpecialization: string | null;
  }[];
  appointments: {
    id: string;
    scheduledAt: string;
    completedAt: string | null;
    type: "IN_PERSON" | "TELEHEALTH";
    status: string;
    reason: string;
    patientNotes: string | null;
    clinicalNotes: string | null;
    cancellationReason: string | null;
    rejectionReason: string | null;
    providerName: string;
    providerSpecialization: string | null;
  }[];
  adherence: {
    rate: number | null;
    total: number;
    taken: number;
    missed: number;
    skipped: number;
    logs: {
      id: string;
      medication: string;
      scheduledTime: string;
      takenTime: string | null;
      status: "TAKEN" | "MISSED" | "SKIPPED";
      notes: string | null;
    }[];
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

type ChartTab = "overview" | "medications" | "consultations" | "adherence";

const EMPTY_ENROL_FORM = {
  firstName: "",
  lastName: "",
  email: "",
  phone: "",
  idNumber: "",
  department: "",
  userType: "" as "" | "STUDENT" | "EMPLOYEE",
  dateOfBirth: "",
  gender: "",
  bloodType: "",
  allergies: "",
  medicalConditions: "",
  emergencyContactName: "",
  emergencyContactPhone: "",
};

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function getRxStatusBadge(status: string): string {
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

function getAptStatusBadge(status: string): string {
  switch (status) {
    case "COMPLETED":
      return "bg-emerald-50 text-emerald-700 border border-emerald-200/70";
    case "IN_PROGRESS":
      return "bg-sky-50 text-[#0284c7] border border-sky-200/70";
    case "WAITING":
      return "bg-indigo-50 text-indigo-700 border border-indigo-200/70";
    case "CONFIRMED":
      return "bg-blue-50 text-blue-700 border border-blue-200/70";
    case "PENDING":
      return "bg-amber-50 text-amber-700 border border-amber-200/70";
    case "NO_SHOW":
      return "bg-orange-50 text-orange-700 border border-orange-200/70";
    default:
      return "bg-rose-50 text-rose-700 border border-rose-200/70";
  }
}

export function Patients() {
  const navigate = useNavigate();
  const [patients, setPatients] = useState<PatientItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [userRole, setUserRole] = useState<string>("DOCTOR");
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState<"ALL" | "STUDENT" | "EMPLOYEE">("ALL");
  const [filterCollege, setFilterCollege] = useState<string>("ALL");

  // 4-Tab Clinical Chart Modal State
  const [selectedPatient, setSelectedPatient] = useState<PatientItem | null>(null);
  const [chartDetail, setChartDetail] = useState<PatientChartDetail | null>(null);
  const [chartLoading, setChartLoading] = useState(false);
  const [chartTab, setChartTab] = useState<ChartTab>("overview");
  const [isEditingPatient, setIsEditingPatient] = useState(false);
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState("");
  const [editSuccess, setEditSuccess] = useState("");
  const [editForm, setEditForm] = useState({ ...EMPTY_ENROL_FORM });

  // Enrol modal state
  const [isEnrolOpen, setIsEnrolOpen] = useState(false);
  const [enrolLoading, setEnrolLoading] = useState(false);
  const [enrolError, setEnrolError] = useState("");
  const [enrolSuccess, setEnrolSuccess] = useState(false);
  const [enrolNoAllergies, setEnrolNoAllergies] = useState(false);
  const [formData, setFormData] = useState({ ...EMPTY_ENROL_FORM });

  async function loadPatients() {
    setLoading(true);
    try {
      const [patRes, meRes] = await Promise.all([
        fetchWithAuth("/patients"),
        fetchWithAuth("/me"),
      ]);
      if (patRes.ok) {
        const data = await patRes.json();
        setPatients(data);
      }
      if (meRes.ok) {
        const me = await meRes.json();
        setUserRole(me.role || "DOCTOR");
      }
    } catch (err) {
      console.error("Failed to load patients:", err);
    } finally {
      setLoading(false);
    }
  }

  async function loadPatientChart(patientId: string) {
    setChartLoading(true);
    try {
      const res = await fetchWithAuth(`/patients/${patientId}`);
      if (res.ok) {
        const detail: PatientChartDetail = await res.json();
        setChartDetail(detail);
      }
    } catch (err) {
      console.error("Failed to load full patient chart:", err);
    } finally {
      setChartLoading(false);
    }
  }

  useEffect(() => {
    void loadPatients();
  }, []);

  function openPatientDetail(patient: PatientItem) {
    setSelectedPatient(patient);
    setChartDetail(null);
    setChartTab("overview");
    setIsEditingPatient(false);
    setEditError("");
    setEditSuccess("");
    void loadPatientChart(patient.id);
  }

  function startEditingPatient(patient: PatientItem) {
    setEditError("");
    setEditSuccess("");
    setEditForm({
      firstName: patient.firstName || "",
      lastName: patient.lastName || "",
      email: patient.email || "",
      phone: patient.phone || "",
      idNumber: patient.idNumber || "",
      department: patient.department || "",
      userType: patient.type || "STUDENT",
      dateOfBirth: patient.dateOfBirth
        ? new Date(patient.dateOfBirth).toISOString().slice(0, 10)
        : "",
      gender: patient.gender || "",
      bloodType: patient.bloodType || "",
      allergies: patient.allergies || "",
      medicalConditions: patient.medicalConditions || "",
      emergencyContactName: patient.emergencyContactName || "",
      emergencyContactPhone: patient.emergencyContactPhone || "",
    });
    setChartTab("overview");
    setIsEditingPatient(true);
  }

  async function handleSavePatientEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedPatient) return;
    setEditError("");
    setEditSuccess("");

    if (!isValidCsuId(editForm.idNumber)) {
      setEditError("Invalid CSU ID Number format (e.g. 221-00675 or 2022-04912).");
      return;
    }
    if (editForm.phone.trim() && !isValidPhPhone(editForm.phone)) {
      setEditError("Please enter a valid Philippine mobile number (e.g. 0912 345 6789).");
      return;
    }
    if (
      editForm.emergencyContactPhone.trim() &&
      !isValidPhPhone(editForm.emergencyContactPhone)
    ) {
      setEditError("Please enter a valid mobile number for the emergency contact.");
      return;
    }

    setEditSaving(true);
    try {
      const res = await fetchWithAuth(`/patients/${selectedPatient.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName: editForm.firstName.trim(),
          lastName: editForm.lastName.trim(),
          phone: editForm.phone.trim(),
          idNumber: editForm.idNumber.trim(),
          department: editForm.department,
          userType: editForm.userType || "STUDENT",
          dateOfBirth: editForm.dateOfBirth,
          gender: editForm.gender,
          bloodType: editForm.bloodType,
          allergies: editForm.allergies.trim(),
          medicalConditions: editForm.medicalConditions.trim(),
          emergencyContactName: editForm.emergencyContactName.trim(),
          emergencyContactPhone: editForm.emergencyContactPhone.trim(),
        }),
      });

      const updated = await res.json();
      if (!res.ok) {
        throw new Error(updated?.message || "Failed to update clinical record.");
      }

      setSelectedPatient(updated);
      setPatients((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
      setIsEditingPatient(false);
      setEditSuccess("Patient clinical record updated successfully.");
      void loadPatientChart(updated.id);
    } catch (err: any) {
      setEditError(err?.message || "Unable to save patient updates.");
    } finally {
      setEditSaving(false);
    }
  }

  function handlePrintPatientChart() {
    if (!selectedPatient) return;
    const printWin = window.open("", "_blank", "width=820,height=920");
    if (!printWin) return;

    const p = chartDetail || selectedPatient;
    const activeRx = (chartDetail?.prescriptions || []).filter((r) => r.status === "ACTIVE");
    const latestConsult = (chartDetail?.appointments || []).find(
      (a) => a.status === "COMPLETED" && a.clinicalNotes,
    );

    const activeRxRows =
      activeRx.length > 0
        ? activeRx
            .map(
              (r) => `
              <tr>
                <td><strong>${escapeHtml(r.name)}</strong> (${escapeHtml(r.dosage)} • ${escapeHtml(r.form)})</td>
                <td>${escapeHtml(r.frequency)}<br/><small>${escapeHtml(r.scheduleTimes.join(", "))}</small></td>
                <td>${escapeHtml(r.instructions || "Take as directed")}</td>
                <td>${escapeHtml(r.prescribedBy)}</td>
              </tr>`,
            )
            .join("")
        : `<tr><td colspan="4" style="color:#64748b;font-style:italic;">No active prescriptions on file.</td></tr>`;

    printWin.document.write(`
      <!doctype html>
      <html>
        <head>
          <meta charset="utf-8" />
          <title>CSU Patient Clinical Summary — ${escapeHtml(p.name)}</title>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: #0f172a; padding: 32px; max-width: 760px; margin: 0 auto; font-size: 12px; }
            .hdr { border-bottom: 2px solid #0284c7; padding-bottom: 12px; margin-bottom: 18px; display: flex; justify-content: space-between; align-items: flex-end; }
            .hdr h1 { margin: 0; font-size: 16px; font-weight: 900; }
            .hdr p { margin: 2px 0 0; color: #475569; font-size: 11px; }
            .badge { background: #e0f2fe; color: #0284c7; font-weight: 800; padding: 4px 10px; border-radius: 99px; font-size: 10px; }
            .grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 12px; margin-bottom: 16px; }
            .lbl { font-size: 9px; text-transform: uppercase; font-weight: 700; color: #64748b; display: block; }
            .val { font-size: 12px; font-weight: 700; color: #0f172a; }
            .allergy { background: #fef2f2; border: 1px solid #fecaca; color: #991b1b; padding: 10px 12px; border-radius: 8px; margin-bottom: 16px; }
            .sec { margin-top: 18px; }
            .sec h2 { font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; color: #0284c7; border-bottom: 1px solid #e2e8f0; padding-bottom: 4px; margin: 0 0 10px; }
            table { width: 100%; border-collapse: collapse; font-size: 11px; }
            th, td { border: 1px solid #e2e8f0; padding: 7px 8px; text-align: left; vertical-align: top; }
            th { background: #f8fafc; font-size: 10px; text-transform: uppercase; color: #475569; }
            .soap { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 10px; white-space: pre-line; font-family: ui-monospace, monospace; font-size: 11px; }
            .ftr { margin-top: 28px; border-top: 1px dashed #cbd5e1; padding-top: 8px; font-size: 10px; color: #64748b; display: flex; justify-content: space-between; }
          </style>
        </head>
        <body>
          <div class="hdr">
            <div>
              <h1>CSU UNIVERSITY CENTER FOR HEALTH AND WELLNESS</h1>
              <p>Official Patient Clinical Summary • Confidential Medical Record (RA 10173)</p>
            </div>
            <span class="badge">${escapeHtml(p.type)}</span>
          </div>

          <div class="grid">
            <div><span class="lbl">Patient Name</span><span class="val">${escapeHtml(p.name)}</span></div>
            <div><span class="lbl">CSU ID Number</span><span class="val">${escapeHtml(p.idNumber)}</span></div>
            <div><span class="lbl">College / Unit</span><span class="val">${escapeHtml(p.department)}</span></div>
            <div><span class="lbl">Date of Birth / Age</span><span class="val">${escapeHtml(formatDobWithAge(p.dateOfBirth))}</span></div>
            <div><span class="lbl">Sex / Blood Type</span><span class="val">${escapeHtml(p.gender || "Not set")} • ${escapeHtml(p.bloodType || "Not set")}</span></div>
            <div><span class="lbl">Mobile / Email</span><span class="val">${escapeHtml(p.phone || "Not set")}</span></div>
          </div>

          <div class="allergy">
            <strong>Known Drug Allergies:</strong> ${escapeHtml(p.allergies || "Not screened yet")}
            &nbsp;&nbsp;|&nbsp;&nbsp;
            <strong>Medical Conditions:</strong> ${escapeHtml(p.medicalConditions || "None recorded")}
          </div>

          <div class="sec">
            <h2>Emergency Contact</h2>
            <div><strong>${escapeHtml(p.emergencyContactName || "Not recorded")}</strong>${p.emergencyContactPhone ? ` — ${escapeHtml(p.emergencyContactPhone)}` : ""}</div>
          </div>

          <div class="sec">
            <h2>Active Medications (${activeRx.length})</h2>
            <table>
              <thead>
                <tr><th>Medication</th><th>Frequency / Times</th><th>Instructions</th><th>Prescribed By</th></tr>
              </thead>
              <tbody>${activeRxRows}</tbody>
            </table>
          </div>

          ${
            latestConsult
              ? `<div class="sec">
                  <h2>Latest Completed Consultation (${escapeHtml(new Date(latestConsult.completedAt || latestConsult.scheduledAt).toLocaleDateString("en-PH"))} — ${escapeHtml(latestConsult.providerName)})</h2>
                  <div class="soap">${escapeHtml(latestConsult.clinicalNotes || "")}</div>
                </div>`
              : ""
          }

          <div class="ftr">
            <span>Generated via PILLPAL CSU Healthcare Portal</span>
            <span>Printed: ${escapeHtml(new Date().toLocaleString("en-PH"))}</span>
          </div>
          <script>window.onload = () => { window.print(); };</script>
        </body>
      </html>
    `);
    printWin.document.close();
  }

  async function handleEnrol(e: React.FormEvent) {
    e.preventDefault();
    setEnrolError("");

    if (!formData.userType) {
      setEnrolError("Please select a patient classification (Student or Faculty / Staff).");
      return;
    }
    if (!isValidCsuId(formData.idNumber)) {
      setEnrolError("Invalid CSU ID Number format (e.g. 221-00675 or 2022-04912).");
      return;
    }
    if (!formData.department) {
      setEnrolError("Please select a college or university unit.");
      return;
    }
    if (formData.phone.trim() && !isValidPhPhone(formData.phone)) {
      setEnrolError("Please enter a valid Philippine mobile number (e.g. 0912 345 6789).");
      return;
    }
    if (
      formData.emergencyContactPhone.trim() &&
      !isValidPhPhone(formData.emergencyContactPhone)
    ) {
      setEnrolError("Please enter a valid mobile number for the emergency contact.");
      return;
    }

    setEnrolLoading(true);
    try {
      const resolvedAllergies = enrolNoAllergies
        ? "No Known Drug Allergies (NKA)"
        : formData.allergies.trim();

      const res = await fetchWithAuth("/patients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...formData,
          allergies: resolvedAllergies,
        }),
      });

      const resBody = await res.json();
      if (!res.ok) {
        throw new Error(resBody?.message || "Failed to enrol patient");
      }

      setEnrolSuccess(true);
      setTimeout(() => {
        setEnrolSuccess(false);
        setIsEnrolOpen(false);
        setEnrolNoAllergies(false);
        setFormData({ ...EMPTY_ENROL_FORM });
        void loadPatients();
      }, 1000);
    } catch (err: any) {
      setEnrolError(err?.message || "Failed to enrol patient.");
    } finally {
      setEnrolLoading(false);
    }
  }

  const enrolUnits = formData.userType === "EMPLOYEE" ? EMPLOYEE_UNITS : CSU_COLLEGES;
  const editUnits = editForm.userType === "EMPLOYEE" ? EMPLOYEE_UNITS : CSU_COLLEGES;

  const filtered = patients.filter((p) => {
    const q = search.toLowerCase();
    const matchesSearch =
      p.name.toLowerCase().includes(q) ||
      p.idNumber.toLowerCase().includes(q) ||
      p.email.toLowerCase().includes(q) ||
      p.department.toLowerCase().includes(q);

    const matchesType = filterType === "ALL" || p.type === filterType;
    const matchesCollege = filterCollege === "ALL" || p.department === filterCollege;
    return matchesSearch && matchesType && matchesCollege;
  });

  const activePrescriptionsInChart = (chartDetail?.prescriptions || []).filter(
    (r) => r.status === "ACTIVE",
  );
  const pastPrescriptionsInChart = (chartDetail?.prescriptions || []).filter(
    (r) => r.status !== "ACTIVE",
  );

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-slate-900">
            Patient Directory
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Manage CSU students and employees registered in the PILLPAL clinical health network.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => void loadPatients()}
            disabled={loading}
            className="gap-1.5 rounded-xl text-xs font-bold cursor-pointer"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <Button
            onClick={() => {
              setEnrolError("");
              setEnrolSuccess(false);
              setEnrolNoAllergies(false);
              setFormData({ ...EMPTY_ENROL_FORM });
              setIsEnrolOpen(true);
            }}
            className="gap-2 rounded-xl text-xs font-bold bg-[#0284c7] hover:bg-[#0369a1] shadow-xs cursor-pointer"
          >
            <UserCheck className="h-4 w-4" />
            Enrol CSU Patient
          </Button>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <Card className="rounded-2xl border border-slate-100 shadow-xs">
        <CardContent className="p-4">
          <div className="flex flex-col lg:flex-row gap-3 items-stretch lg:items-center justify-between">
            <div className="relative w-full lg:w-80">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <Input
                placeholder="Search by CSU ID, name, email, or college..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 text-xs rounded-xl"
              />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <select
                value={filterCollege}
                onChange={(e) => setFilterCollege(e.target.value)}
                className="h-8 rounded-xl border border-slate-200 px-2.5 text-xs bg-white text-slate-700 max-w-xs"
              >
                <option value="ALL">All Colleges / Units</option>
                {EMPLOYEE_UNITS.map((unit) => (
                  <option key={unit} value={unit}>
                    {unit}
                  </option>
                ))}
              </select>

              <div className="flex items-center gap-1 bg-slate-50 p-1 rounded-xl border border-slate-100">
                {(["ALL", "STUDENT", "EMPLOYEE"] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setFilterType(t)}
                    className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition-colors cursor-pointer ${
                      filterType === t
                        ? "bg-white text-[#0284c7] shadow-2xs font-bold"
                        : "text-slate-600 hover:text-slate-900"
                    }`}
                  >
                    {t === "ALL" ? "All" : t === "STUDENT" ? "Students" : "Employees"}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Patients Table */}
      <Card className="rounded-2xl border border-slate-100 shadow-xs overflow-hidden">
        <div
          tabIndex={0}
          role="region"
          aria-label="Patient directory table"
          className="card-scroll-area max-h-[520px] overflow-auto focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#0284c7]/50"
        >
          <table className="w-full text-left text-xs text-slate-700">
            <thead className="sticky top-0 z-10 border-b border-slate-200/80 bg-slate-50/95 backdrop-blur-xs text-[11px] font-bold text-slate-500 uppercase tracking-wider">
              <tr>
                <th className="px-6 py-3.5">Patient Details</th>
                <th className="px-6 py-3.5">ID / Classification</th>
                <th className="px-6 py-3.5">College / Unit</th>
                <th className="px-6 py-3.5">Active Meds</th>
                <th className="px-6 py-3.5">Adherence</th>
                <th className="px-6 py-3.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-xs text-slate-400">
                    Loading CSU clinical patient directory...
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-xs text-slate-400">
                    No registered CSU patients found matching your search.
                  </td>
                </tr>
              ) : (
                filtered.map((patient) => {
                  const hasAllergyAlert = hasDocumentedDrugAllergy(patient.allergies);
                  return (
                    <tr key={patient.id} className="hover:bg-slate-50/60 transition-colors">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-sky-50 text-[#0284c7] font-bold text-xs">
                            {(patient.name[0] || "P").toUpperCase()}
                          </div>
                          <div>
                            <div className="flex items-center gap-1.5">
                              <p className="font-bold text-slate-900">{patient.name}</p>
                              {hasAllergyAlert && (
                                <span
                                  title={`Drug allergy: ${patient.allergies}`}
                                  className="inline-flex items-center gap-0.5 rounded bg-red-50 border border-red-200 px-1.5 py-0.2 text-[9px] font-bold text-red-700"
                                >
                                  <AlertTriangle className="h-2.5 w-2.5" />
                                  Allergy
                                </span>
                              )}
                            </div>
                            <p className="text-[11px] text-slate-400">{patient.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className="font-mono text-xs font-semibold text-slate-800">
                          {patient.idNumber}
                        </span>
                        <span className="ml-2 rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600">
                          {patient.type}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-slate-600 font-medium max-w-[220px] truncate">
                        {patient.department}
                      </td>
                      <td className="px-6 py-4">
                        <span className="inline-flex items-center gap-1 rounded-md bg-indigo-50 px-2 py-0.5 text-xs font-bold text-indigo-700">
                          <Pill className="h-3.5 w-3.5" />
                          {patient.activeMedicationsCount} Active
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        {patient.adherenceRate === null ? (
                          <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-500">
                            — No logs
                          </span>
                        ) : (
                          <span
                            className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-bold ${
                              patient.adherenceRate >= 90
                                ? "bg-emerald-50 text-emerald-700"
                                : patient.adherenceRate >= 80
                                  ? "bg-blue-50 text-blue-700"
                                  : "bg-amber-100 text-amber-800"
                            }`}
                          >
                            <Activity className="h-3 w-3" />
                            {patient.adherenceRate}%
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => openPatientDetail(patient)}
                          className="rounded-lg text-xs font-semibold cursor-pointer"
                        >
                          View Profile
                        </Button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* ===================================================================== */}
      {/* UPGRADED 4-TAB CLINICAL PATIENT CHART MODAL                           */}
      {/* ===================================================================== */}
      {selectedPatient && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/55 backdrop-blur-xs p-4">
          <div className="w-full max-w-3xl rounded-2xl bg-white shadow-2xl border border-slate-100 max-h-[92vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95">
            {/* Pinned Chart Header */}
            <div className="px-6 pt-5 pb-4 border-b border-slate-100 space-y-3 bg-white">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex items-center gap-3.5">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-sky-50 text-[#0284c7] font-black text-base border border-sky-100">
                    {(selectedPatient.name[0] || "P").toUpperCase()}
                  </div>
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-lg font-black text-slate-900">
                        {selectedPatient.name}
                      </h2>
                      <span className="rounded-md bg-sky-50 px-2 py-0.5 text-[10px] font-bold text-[#0284c7] border border-sky-100">
                        {selectedPatient.type}
                      </span>
                      {chartDetail && (
                        <span
                          className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-bold ${
                            chartDetail.emailVerified
                              ? "bg-emerald-50 text-emerald-700"
                              : "bg-amber-50 text-amber-700"
                          }`}
                        >
                          <ShieldCheck className="h-3 w-3" />
                          {chartDetail.emailVerified ? "Portal Verified" : "Unverified Email"}
                        </span>
                      )}
                    </div>
                    <p className="font-mono text-xs text-slate-500 mt-0.5">
                      ID: {selectedPatient.idNumber} • {selectedPatient.department}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-1.5">
                  {!isEditingPatient && (
                    <>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={handlePrintPatientChart}
                        className="rounded-xl text-xs font-bold gap-1 cursor-pointer"
                      >
                        <Printer className="h-3.5 w-3.5" />
                        Print Chart
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => startEditingPatient(selectedPatient)}
                        className="rounded-xl text-xs font-bold gap-1 cursor-pointer"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                        Edit Record
                      </Button>
                    </>
                  )}
                  <button
                    type="button"
                    onClick={() => setSelectedPatient(null)}
                    className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 cursor-pointer"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>
              </div>

              {/* Persistent Clinical Allergy Safety Banner (Always Visible Across Tabs) */}
              {hasDocumentedDrugAllergy(selectedPatient.allergies) && !isEditingPatient && (
                <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800 font-semibold">
                  <AlertTriangle className="h-4 w-4 text-red-600 shrink-0" />
                  <span>
                    <strong>Drug Allergy Alert:</strong> {selectedPatient.allergies}
                  </span>
                </div>
              )}

              {/* 4-Tab Bar (hidden while editing) */}
              {!isEditingPatient && (
                <div className="flex flex-wrap items-center gap-1 bg-slate-100/80 p-1 rounded-xl">
                  {(
                    [
                      { key: "overview", label: "Overview", icon: HeartPulse },
                      {
                        key: "medications",
                        label: `Medications (${chartDetail ? chartDetail.prescriptions.length : selectedPatient.activeMedicationsCount})`,
                        icon: Pill,
                      },
                      {
                        key: "consultations",
                        label: `Consultations (${chartDetail ? chartDetail.appointments.length : "…"})`,
                        icon: FileText,
                      },
                      {
                        key: "adherence",
                        label: `Adherence & Dispensing`,
                        icon: Activity,
                      },
                    ] as const
                  ).map((t) => {
                    const Icon = t.icon;
                    return (
                      <button
                        key={t.key}
                        type="button"
                        onClick={() => setChartTab(t.key)}
                        className={`flex-1 min-w-[125px] inline-flex items-center justify-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11px] font-bold transition-colors cursor-pointer ${
                          chartTab === t.key
                            ? "bg-white text-[#0284c7] shadow-2xs"
                            : "text-slate-600 hover:text-slate-900"
                        }`}
                      >
                        <Icon className="h-3.5 w-3.5 shrink-0" />
                        <span>{t.label}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Scrollable Body */}
            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
              {editSuccess && (
                <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-3 text-xs text-emerald-700 font-semibold flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 shrink-0" />
                  <span>{editSuccess}</span>
                </div>
              )}

              {editError && (
                <div className="rounded-xl bg-red-50 border border-red-200 p-3 text-xs text-red-700 font-semibold flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <span>{editError}</span>
                </div>
              )}

              {isEditingPatient ? (
                <form onSubmit={handleSavePatientEdit} className="space-y-4 text-xs">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label className="text-xs">First Name *</Label>
                      <Input
                        required
                        value={editForm.firstName}
                        onChange={(e) =>
                          setEditForm({ ...editForm, firstName: e.target.value })
                        }
                        className="rounded-xl text-xs"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Last Name *</Label>
                      <Input
                        required
                        value={editForm.lastName}
                        onChange={(e) =>
                          setEditForm({ ...editForm, lastName: e.target.value })
                        }
                        className="rounded-xl text-xs"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    <div className="space-y-1">
                      <Label className="text-xs">CSU ID Number *</Label>
                      <Input
                        required
                        value={editForm.idNumber}
                        onChange={(e) =>
                          setEditForm({ ...editForm, idNumber: e.target.value })
                        }
                        className="rounded-xl text-xs font-mono"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Classification *</Label>
                      <select
                        required
                        value={editForm.userType}
                        onChange={(e) => {
                          const nextType = e.target.value as "STUDENT" | "EMPLOYEE";
                          const nextUnits =
                            nextType === "EMPLOYEE" ? EMPLOYEE_UNITS : CSU_COLLEGES;
                          setEditForm({
                            ...editForm,
                            userType: nextType,
                            department: (nextUnits as readonly string[]).includes(
                              editForm.department,
                            )
                              ? editForm.department
                              : "",
                          });
                        }}
                        className="w-full h-9 rounded-xl border border-slate-200 px-2.5 text-xs bg-white text-slate-800"
                      >
                        <option value="STUDENT">Student</option>
                        <option value="EMPLOYEE">Faculty / Staff</option>
                      </select>
                    </div>
                    <div className="space-y-1 col-span-2 sm:col-span-1">
                      <Label className="text-xs">Mobile Phone</Label>
                      <Input
                        type="tel"
                        placeholder="0912 345 6789"
                        value={editForm.phone}
                        onChange={(e) =>
                          setEditForm({ ...editForm, phone: e.target.value })
                        }
                        className="rounded-xl text-xs"
                      />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <Label className="text-xs">
                      {editForm.userType === "EMPLOYEE"
                        ? "College / University Office *"
                        : "College *"}
                    </Label>
                    <select
                      required
                      value={editForm.department}
                      onChange={(e) =>
                        setEditForm({ ...editForm, department: e.target.value })
                      }
                      className="w-full h-9 rounded-xl border border-slate-200 px-2.5 text-xs bg-white text-slate-800"
                    >
                      <option value="" disabled>
                        Select College / Unit
                      </option>
                      {editUnits.map((unit) => (
                        <option key={unit} value={unit}>
                          {unit}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="grid grid-cols-3 gap-3">
                    <div className="space-y-1">
                      <Label className="text-xs">Date of Birth</Label>
                      <Input
                        type="date"
                        max={getTodayIsoDate()}
                        value={editForm.dateOfBirth}
                        onChange={(e) =>
                          setEditForm({ ...editForm, dateOfBirth: e.target.value })
                        }
                        className="rounded-xl text-xs"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Sex</Label>
                      <select
                        value={editForm.gender}
                        onChange={(e) =>
                          setEditForm({ ...editForm, gender: e.target.value })
                        }
                        className="w-full h-9 rounded-xl border border-slate-200 px-2.5 text-xs bg-white text-slate-800"
                      >
                        <option value="">Select Sex</option>
                        {GENDER_OPTIONS.map((g) => (
                          <option key={g} value={g}>
                            {g}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Blood Type</Label>
                      <select
                        value={editForm.bloodType}
                        onChange={(e) =>
                          setEditForm({ ...editForm, bloodType: e.target.value })
                        }
                        className="w-full h-9 rounded-xl border border-slate-200 px-2.5 text-xs bg-white text-slate-800"
                      >
                        <option value="">Select Blood Type</option>
                        {BLOOD_TYPES.map((bt) => (
                          <option key={bt} value={bt}>
                            {bt}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label className="text-xs">Known Drug Allergies</Label>
                      <Input
                        placeholder="e.g. No Known Drug Allergies (NKA) or Penicillin"
                        value={editForm.allergies}
                        onChange={(e) =>
                          setEditForm({ ...editForm, allergies: e.target.value })
                        }
                        className="rounded-xl text-xs"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Medical Conditions</Label>
                      <Input
                        placeholder="e.g. Asthma, Hypertension"
                        value={editForm.medicalConditions}
                        onChange={(e) =>
                          setEditForm({ ...editForm, medicalConditions: e.target.value })
                        }
                        className="rounded-xl text-xs"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label className="text-xs">Emergency Contact Name</Label>
                      <Input
                        placeholder="e.g. Elena Reyes (Mother)"
                        value={editForm.emergencyContactName}
                        onChange={(e) =>
                          setEditForm({
                            ...editForm,
                            emergencyContactName: e.target.value,
                          })
                        }
                        className="rounded-xl text-xs"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Emergency Contact Phone</Label>
                      <Input
                        type="tel"
                        placeholder="09XX XXX XXXX"
                        value={editForm.emergencyContactPhone}
                        onChange={(e) =>
                          setEditForm({
                            ...editForm,
                            emergencyContactPhone: e.target.value,
                          })
                        }
                        className="rounded-xl text-xs"
                      />
                    </div>
                  </div>

                  <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                    <Button
                      type="button"
                      variant="outline"
                      disabled={editSaving}
                      onClick={() => setIsEditingPatient(false)}
                      className="rounded-xl text-xs cursor-pointer"
                    >
                      Cancel
                    </Button>
                    <Button
                      type="submit"
                      disabled={editSaving}
                      className="rounded-xl bg-[#0284c7] hover:bg-[#0369a1] text-xs font-bold text-white gap-1.5 cursor-pointer"
                    >
                      <Save className="h-3.5 w-3.5" />
                      {editSaving ? "Saving..." : "Save Clinical Record"}
                    </Button>
                  </div>
                </form>
              ) : chartTab === "overview" ? (
                /* TAB 1: OVERVIEW */
                <div className="space-y-5">
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="rounded-xl bg-slate-50 p-3 text-center border border-slate-100">
                      <p className="text-[10px] uppercase font-bold text-slate-400">
                        Date of Birth
                      </p>
                      <p className="text-xs font-black text-slate-900 mt-1">
                        {formatDobWithAge(selectedPatient.dateOfBirth)}
                      </p>
                    </div>
                    <div className="rounded-xl bg-slate-50 p-3 text-center border border-slate-100">
                      <p className="text-[10px] uppercase font-bold text-slate-400">Sex</p>
                      <p className="text-sm font-black text-slate-900 mt-0.5">
                        {selectedPatient.gender || "Not set"}
                      </p>
                    </div>
                    <div className="rounded-xl bg-slate-50 p-3 text-center border border-slate-100">
                      <p className="text-[10px] uppercase font-bold text-slate-400">
                        Blood Type
                      </p>
                      <p className="text-sm font-black text-slate-900 mt-0.5">
                        {selectedPatient.bloodType || "Not set"}
                      </p>
                    </div>
                    <div className="rounded-xl bg-slate-50 p-3 text-center border border-slate-100">
                      <p className="text-[10px] uppercase font-bold text-slate-400">
                        Adherence Rate
                      </p>
                      <p className="text-sm font-black text-emerald-600 mt-0.5">
                        {selectedPatient.adherenceRate !== null
                          ? `${selectedPatient.adherenceRate}%`
                          : "—"}
                      </p>
                    </div>
                  </div>

                  {/* Clinical Health Background */}
                  <div className="space-y-2.5">
                    <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                      <HeartPulse className="h-4 w-4 text-[#0284c7]" />
                      Clinical Background &amp; Allergies
                    </h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                      <div className="rounded-xl border border-slate-100 p-3 space-y-1">
                        <span className="font-bold text-slate-500">Medical Conditions:</span>
                        <p className="text-slate-800 font-semibold">
                          {selectedPatient.medicalConditions || "None recorded"}
                        </p>
                      </div>
                      <div
                        className={`rounded-xl border p-3 space-y-1 ${
                          hasDocumentedDrugAllergy(selectedPatient.allergies)
                            ? "border-red-200 bg-red-50/50"
                            : "border-slate-100 bg-slate-50/40"
                        }`}
                      >
                        <span
                          className={`font-bold ${
                            hasDocumentedDrugAllergy(selectedPatient.allergies)
                              ? "text-red-700"
                              : "text-slate-500"
                          }`}
                        >
                          Known Drug Allergies:
                        </span>
                        <p
                          className={`font-semibold ${
                            hasDocumentedDrugAllergy(selectedPatient.allergies)
                              ? "text-red-900"
                              : "text-slate-800"
                          }`}
                        >
                          {selectedPatient.allergies || "Not screened yet"}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Contact, Emergency & Consent */}
                  <div className="space-y-2.5">
                    <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                      <Phone className="h-4 w-4 text-[#0284c7]" />
                      Contact, Emergency &amp; Privacy Record
                    </h3>
                    <div className="rounded-xl border border-slate-100 p-3.5 space-y-2 text-xs">
                      <div className="flex items-center justify-between">
                        <span className="text-slate-500">Registered Email:</span>
                        <span className="font-semibold text-slate-800">
                          {selectedPatient.email}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-slate-500">Primary Mobile:</span>
                        <span className="font-semibold text-slate-800">
                          {selectedPatient.phone || "Not set"}
                        </span>
                      </div>
                      <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                        <span className="text-slate-500">Emergency Contact:</span>
                        <span className="font-bold text-slate-900">
                          {selectedPatient.emergencyContactName || "Not set"}
                          {selectedPatient.emergencyContactPhone
                            ? ` (${selectedPatient.emergencyContactPhone})`
                            : ""}
                        </span>
                      </div>
                      <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                        <span className="text-slate-500">RA 10173 Privacy Consent:</span>
                        <span className="font-semibold text-emerald-700">
                          {chartDetail?.privacyConsentAt
                            ? `Recorded ${new Date(chartDetail.privacyConsentAt).toLocaleDateString("en-PH")}`
                            : chartLoading
                              ? "Checking..."
                              : "Clinic enrolled"}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              ) : chartTab === "medications" ? (
                /* TAB 2: FULL MEDICATIONS & HISTORY */
                <div className="space-y-4">
                  {chartLoading && !chartDetail ? (
                    <div className="space-y-3">
                      <Skeleton className="h-20 w-full rounded-xl" />
                      <Skeleton className="h-20 w-full rounded-xl" />
                    </div>
                  ) : (chartDetail?.prescriptions.length ?? 0) === 0 ? (
                    <div className="rounded-xl border border-slate-100 bg-slate-50/60 p-8 text-center space-y-2">
                      <Pill className="h-6 w-6 text-slate-400 mx-auto" />
                      <p className="text-xs font-bold text-slate-700">
                        No prescriptions on file
                      </p>
                      <p className="text-[11px] text-slate-500">
                        Prescriptions issued to this patient will appear here with full regimen details.
                      </p>
                    </div>
                  ) : (
                    <>
                      <div className="space-y-2.5">
                        <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                          Active Regimens ({activePrescriptionsInChart.length})
                        </h3>
                        {activePrescriptionsInChart.length === 0 ? (
                          <p className="text-xs text-slate-400 italic">
                            No currently active medications.
                          </p>
                        ) : (
                          activePrescriptionsInChart.map((rx) => (
                            <div
                              key={rx.id}
                              className="rounded-xl border border-slate-200/80 bg-white p-3.5 text-xs space-y-2"
                            >
                              <div className="flex items-start justify-between gap-2">
                                <div>
                                  <p className="font-black text-slate-900 text-sm">
                                    {rx.name}{" "}
                                    <span className="text-[#0284c7] font-bold text-xs">
                                      {rx.dosage} • {rx.form}
                                    </span>
                                  </p>
                                  <p className="text-[11px] text-slate-600 mt-0.5">
                                    {rx.frequency}
                                    {rx.instructions ? ` — "${rx.instructions}"` : ""}
                                  </p>
                                </div>
                                <span
                                  className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${getRxStatusBadge(rx.status)}`}
                                >
                                  {rx.status}
                                </span>
                              </div>
                              <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100 text-[11px] text-slate-500">
                                <div className="flex flex-wrap gap-1">
                                  {rx.scheduleTimes.map((t, i) => (
                                    <span
                                      key={i}
                                      className="inline-flex items-center gap-1 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-700"
                                    >
                                      <Clock className="h-2.5 w-2.5" />
                                      {t}
                                    </span>
                                  ))}
                                </div>
                                <span className="inline-flex items-center gap-1">
                                  <Stethoscope className="h-3 w-3 text-[#0284c7]" />
                                  {rx.prescribedBy} •{" "}
                                  {new Date(rx.startDate).toLocaleDateString()}
                                  {rx.endDate
                                    ? ` → ${new Date(rx.endDate).toLocaleDateString()}`
                                    : ""}
                                </span>
                              </div>
                            </div>
                          ))
                        )}
                      </div>

                      {pastPrescriptionsInChart.length > 0 && (
                        <div className="space-y-2.5 pt-2">
                          <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                            Past / Paused / Discontinued ({pastPrescriptionsInChart.length})
                          </h3>
                          {pastPrescriptionsInChart.map((rx) => (
                            <div
                              key={rx.id}
                              className="rounded-xl border border-slate-100 bg-slate-50/70 p-3 text-xs flex items-center justify-between gap-3"
                            >
                              <div>
                                <p className="font-bold text-slate-800">
                                  {rx.name} ({rx.dosage} • {rx.form})
                                </p>
                                <p className="text-[11px] text-slate-500">
                                  {rx.frequency} • {rx.prescribedBy} •{" "}
                                  {new Date(rx.startDate).toLocaleDateString()}
                                  {rx.endDate
                                    ? ` → ${new Date(rx.endDate).toLocaleDateString()}`
                                    : ""}
                                </p>
                              </div>
                              <span
                                className={`rounded-full px-2 py-0.5 text-[10px] font-bold shrink-0 ${getRxStatusBadge(rx.status)}`}
                              >
                                {rx.status}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </>
                  )}
                </div>
              ) : chartTab === "consultations" ? (
                /* TAB 3: CONSULTATIONS & SOAP NOTES */
                <div className="space-y-3">
                  {chartLoading && !chartDetail ? (
                    <div className="space-y-3">
                      <Skeleton className="h-24 w-full rounded-xl" />
                      <Skeleton className="h-24 w-full rounded-xl" />
                    </div>
                  ) : (chartDetail?.appointments.length ?? 0) === 0 ? (
                    <div className="rounded-xl border border-slate-100 bg-slate-50/60 p-8 text-center space-y-2">
                      <Calendar className="h-6 w-6 text-slate-400 mx-auto" />
                      <p className="text-xs font-bold text-slate-700">
                        No clinic consultations recorded yet
                      </p>
                      <p className="text-[11px] text-slate-500">
                        Scheduled visits, walk-ins, and completed SOAP notes will appear here.
                      </p>
                    </div>
                  ) : (
                    chartDetail!.appointments.map((apt) => (
                      <div
                        key={apt.id}
                        className="rounded-xl border border-slate-200/80 bg-white p-3.5 text-xs space-y-2.5"
                      >
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-black text-slate-900">{apt.reason}</span>
                              <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600">
                                {apt.type === "TELEHEALTH" ? "Telehealth" : "In-Person"}
                              </span>
                            </div>
                            <p className="text-[11px] text-slate-500 mt-0.5">
                              {new Date(apt.scheduledAt).toLocaleString("en-PH", {
                                month: "short",
                                day: "numeric",
                                year: "numeric",
                                hour: "2-digit",
                                minute: "2-digit",
                              })}{" "}
                              • {apt.providerName}
                            </p>
                          </div>
                          <span
                            className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${getAptStatusBadge(apt.status)}`}
                          >
                            {apt.status.replace("_", " ")}
                          </span>
                        </div>

                        {apt.clinicalNotes && (
                          <div className="rounded-lg bg-slate-50 border border-slate-100 p-2.5 font-mono text-[11px] text-slate-700 whitespace-pre-line">
                            {apt.clinicalNotes}
                          </div>
                        )}

                        {!apt.clinicalNotes && (apt.cancellationReason || apt.rejectionReason) && (
                          <p className="text-[11px] text-amber-700 italic">
                            Note: {apt.cancellationReason || apt.rejectionReason}
                          </p>
                        )}
                      </div>
                    ))
                  )}
                </div>
              ) : (
                /* TAB 4: ADHERENCE & PHARMACY DISPENSING */
                <div className="space-y-5">
                  {chartLoading && !chartDetail ? (
                    <div className="space-y-3">
                      <Skeleton className="h-20 w-full rounded-xl" />
                      <Skeleton className="h-24 w-full rounded-xl" />
                    </div>
                  ) : (
                    <>
                      {/* Adherence Breakdown */}
                      <div className="space-y-3">
                        <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                          <Activity className="h-4 w-4 text-emerald-600" />
                          Medication Adherence Breakdown
                        </h3>
                        {chartDetail && chartDetail.adherence.total > 0 ? (
                          <>
                            <div className="grid grid-cols-4 gap-2.5 text-center text-xs">
                              <div className="rounded-xl bg-slate-50 p-2.5 border border-slate-100">
                                <p className="text-[10px] text-slate-400 font-bold uppercase">
                                  Compliance
                                </p>
                                <p className="text-base font-black text-emerald-600">
                                  {chartDetail.adherence.rate}%
                                </p>
                              </div>
                              <div className="rounded-xl bg-emerald-50/50 p-2.5 border border-emerald-100">
                                <p className="text-[10px] text-emerald-700 font-bold uppercase">
                                  Taken
                                </p>
                                <p className="text-base font-black text-emerald-800">
                                  {chartDetail.adherence.taken}
                                </p>
                              </div>
                              <div className="rounded-xl bg-red-50/50 p-2.5 border border-red-100">
                                <p className="text-[10px] text-red-700 font-bold uppercase">
                                  Missed
                                </p>
                                <p className="text-base font-black text-red-800">
                                  {chartDetail.adherence.missed}
                                </p>
                              </div>
                              <div className="rounded-xl bg-amber-50/50 p-2.5 border border-amber-100">
                                <p className="text-[10px] text-amber-700 font-bold uppercase">
                                  Skipped
                                </p>
                                <p className="text-base font-black text-amber-800">
                                  {chartDetail.adherence.skipped}
                                </p>
                              </div>
                            </div>

                            {/* Segmented Compliance Bar */}
                            <div className="h-2.5 w-full rounded-full bg-slate-100 overflow-hidden flex">
                              <div
                                className="bg-emerald-500 h-full"
                                style={{
                                  width: `${(chartDetail.adherence.taken / chartDetail.adherence.total) * 100}%`,
                                }}
                              />
                              <div
                                className="bg-amber-400 h-full"
                                style={{
                                  width: `${(chartDetail.adherence.skipped / chartDetail.adherence.total) * 100}%`,
                                }}
                              />
                              <div
                                className="bg-red-500 h-full"
                                style={{
                                  width: `${(chartDetail.adherence.missed / chartDetail.adherence.total) * 100}%`,
                                }}
                              />
                            </div>

                            <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                              {chartDetail.adherence.logs.slice(0, 15).map((log) => (
                                <div
                                  key={log.id}
                                  className="flex items-center justify-between gap-2 rounded-xl border border-slate-100 bg-white px-3 py-2 text-xs"
                                >
                                  <div className="min-w-0">
                                    <p className="font-bold text-slate-800 truncate">
                                      {log.medication}
                                    </p>
                                    <p className="text-[10px] text-slate-400">
                                      {new Date(log.scheduledTime).toLocaleString("en-PH", {
                                        month: "short",
                                        day: "numeric",
                                        hour: "2-digit",
                                        minute: "2-digit",
                                      })}
                                      {log.notes ? ` • "${log.notes}"` : ""}
                                    </p>
                                  </div>
                                  <span
                                    className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-bold shrink-0 ${
                                      log.status === "TAKEN"
                                        ? "bg-emerald-50 text-emerald-700"
                                        : log.status === "MISSED"
                                          ? "bg-red-50 text-red-700"
                                          : "bg-amber-50 text-amber-700"
                                    }`}
                                  >
                                    {log.status === "TAKEN" && <CheckCircle2 className="h-3 w-3" />}
                                    {log.status === "MISSED" && <XCircle className="h-3 w-3" />}
                                    {log.status === "SKIPPED" && <Clock className="h-3 w-3" />}
                                    {log.status}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </>
                        ) : (
                          <p className="text-xs text-slate-400 italic bg-slate-50 rounded-xl p-4 text-center">
                            No medication dose logs recorded for this patient yet.
                          </p>
                        )}
                      </div>

                      {/* Clinic Pharmacy Dispensing History */}
                      <div className="space-y-2.5 pt-2 border-t border-slate-100">
                        <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                          <Boxes className="h-4 w-4 text-[#0284c7]" />
                          Clinic Pharmacy Handovers ({chartDetail?.dispensations.length ?? 0})
                        </h3>
                        {(chartDetail?.dispensations.length ?? 0) === 0 ? (
                          <p className="text-xs text-slate-400 italic bg-slate-50 rounded-xl p-4 text-center">
                            No pharmacy stock handovers linked to this patient yet.
                          </p>
                        ) : (
                          <div className="space-y-2">
                            {chartDetail!.dispensations.map((tx) => (
                              <div
                                key={tx.id}
                                className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 bg-slate-50/60 p-3 text-xs"
                              >
                                <div>
                                  <p className="font-bold text-slate-900">
                                    {tx.medicationName} ({tx.strength} • {tx.form})
                                  </p>
                                  <p className="text-[11px] text-slate-500">
                                    {tx.performedBy} •{" "}
                                    {new Date(tx.createdAt).toLocaleDateString("en-PH")}
                                    {tx.reason ? ` — ${tx.reason}` : ""}
                                  </p>
                                </div>
                                <span className="rounded-lg bg-sky-100 text-[#0284c7] px-2.5 py-1 font-black text-xs shrink-0">
                                  {tx.quantity} units
                                </span>
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

            {/* Pinned Footer Quick Actions */}
            {!isEditingPatient && (
              <div className="px-6 py-3.5 border-t border-slate-100 bg-slate-50/70 flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      navigate("/app/messages", {
                        state: { recipientUserId: selectedPatient.userId },
                      })
                    }
                    className="rounded-xl text-xs font-bold gap-1.5 bg-white cursor-pointer"
                  >
                    <MessageSquare className="h-3.5 w-3.5 text-[#0284c7]" />
                    Message Patient
                  </Button>

                  {(userRole === "DOCTOR" || userRole === "ADMIN") && (
                    <Button
                      type="button"
                      size="sm"
                      onClick={() =>
                        navigate("/app/medications", {
                          state: { prescribeForPatientId: selectedPatient.id },
                        })
                      }
                      className="rounded-xl bg-[#0284c7] hover:bg-[#0369a1] text-white text-xs font-bold gap-1.5 cursor-pointer"
                    >
                      <Pill className="h-3.5 w-3.5" />
                      Prescribe Medication
                    </Button>
                  )}
                </div>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setSelectedPatient(null)}
                  className="rounded-xl text-xs font-bold bg-white cursor-pointer"
                >
                  Close Chart
                </Button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Enrol Patient Modal */}
      {isEnrolOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
          <div className="w-full max-w-xl rounded-2xl bg-white p-6 shadow-2xl border border-slate-100 max-h-[90vh] overflow-y-auto space-y-4 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h2 className="text-base font-black text-slate-900">Enrol New CSU Patient</h2>
                <p className="text-xs text-slate-500">
                  Register a student or employee in the PILLPAL clinical network.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsEnrolOpen(false)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {enrolError && (
              <div className="rounded-xl bg-red-50 border border-red-200 p-3 text-xs text-red-700 font-semibold flex items-center gap-2">
                <AlertCircle className="h-4 w-4 shrink-0" />
                {enrolError}
              </div>
            )}

            {enrolSuccess && (
              <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-3 text-xs text-emerald-700 font-semibold flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 shrink-0" />
                Patient enrolled successfully!
              </div>
            )}

            <form onSubmit={handleEnrol} className="space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">First Name *</Label>
                  <Input
                    required
                    placeholder="e.g. Ana"
                    value={formData.firstName}
                    onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                    className="rounded-xl text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Last Name *</Label>
                  <Input
                    required
                    placeholder="e.g. Reyes"
                    value={formData.lastName}
                    onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                    className="rounded-xl text-xs"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Email Address *</Label>
                  <Input
                    required
                    type="email"
                    placeholder="e.g. student@carsu.edu.ph or @gmail.com"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    className="rounded-xl text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Mobile Number</Label>
                  <Input
                    type="tel"
                    placeholder="e.g. 0917 123 4567"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    className="rounded-xl text-xs"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">CSU ID Number *</Label>
                  <Input
                    required
                    placeholder="221-00675"
                    value={formData.idNumber}
                    onChange={(e) => setFormData({ ...formData, idNumber: e.target.value })}
                    className="rounded-xl text-xs font-mono"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Classification *</Label>
                  <select
                    required
                    value={formData.userType}
                    onChange={(e) => {
                      const nextType = e.target.value as "" | "STUDENT" | "EMPLOYEE";
                      const nextUnits =
                        nextType === "EMPLOYEE" ? EMPLOYEE_UNITS : CSU_COLLEGES;
                      setFormData({
                        ...formData,
                        userType: nextType,
                        department: (nextUnits as readonly string[]).includes(
                          formData.department,
                        )
                          ? formData.department
                          : "",
                      });
                    }}
                    className="w-full h-9 rounded-xl border border-slate-200 px-2.5 text-xs bg-white text-slate-800"
                  >
                    <option value="" disabled>
                      Select Type
                    </option>
                    <option value="STUDENT">Student</option>
                    <option value="EMPLOYEE">Faculty / Staff</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Date of Birth</Label>
                  <Input
                    type="date"
                    max={getTodayIsoDate()}
                    value={formData.dateOfBirth}
                    onChange={(e) =>
                      setFormData({ ...formData, dateOfBirth: e.target.value })
                    }
                    className="rounded-xl text-xs"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1 col-span-3 sm:col-span-1">
                  <Label className="text-xs">
                    {formData.userType === "EMPLOYEE" ? "College / Office *" : "College *"}
                  </Label>
                  <select
                    required
                    value={formData.department}
                    onChange={(e) => setFormData({ ...formData, department: e.target.value })}
                    className="w-full h-9 rounded-xl border border-slate-200 px-2.5 text-xs bg-white text-slate-800"
                  >
                    <option value="" disabled>
                      Select College
                    </option>
                    {enrolUnits.map((unit) => (
                      <option key={unit} value={unit}>
                        {unit}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Sex</Label>
                  <select
                    value={formData.gender}
                    onChange={(e) => setFormData({ ...formData, gender: e.target.value })}
                    className="w-full h-9 rounded-xl border border-slate-200 px-2.5 text-xs bg-white text-slate-800"
                  >
                    <option value="">Select Sex</option>
                    {GENDER_OPTIONS.map((g) => (
                      <option key={g} value={g}>
                        {g}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Blood Type</Label>
                  <select
                    value={formData.bloodType}
                    onChange={(e) => setFormData({ ...formData, bloodType: e.target.value })}
                    className="w-full h-9 rounded-xl border border-slate-200 px-2.5 text-xs bg-white text-slate-800"
                  >
                    <option value="">Select Blood Type</option>
                    {BLOOD_TYPES.map((bt) => (
                      <option key={bt} value={bt}>
                        {bt}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="space-y-1.5 rounded-xl border border-slate-200 bg-slate-50/70 p-3">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-bold text-slate-700">
                    Known Drug Allergies
                  </Label>
                  <label className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-emerald-800 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={enrolNoAllergies}
                      onChange={(e) => {
                        setEnrolNoAllergies(e.target.checked);
                        if (e.target.checked) {
                          setFormData({ ...formData, allergies: "" });
                        }
                      }}
                      className="h-3.5 w-3.5 rounded accent-emerald-600"
                    />
                    None (NKA)
                  </label>
                </div>
                {!enrolNoAllergies && (
                  <Input
                    placeholder="e.g. Penicillin, Aspirin, Ibuprofen"
                    value={formData.allergies}
                    onChange={(e) => setFormData({ ...formData, allergies: e.target.value })}
                    className="rounded-xl text-xs bg-white"
                  />
                )}
              </div>

              <div className="space-y-1">
                <Label className="text-xs">Medical Conditions</Label>
                <Input
                  placeholder="e.g. Type 2 Diabetes, Asthma (leave blank if none)"
                  value={formData.medicalConditions}
                  onChange={(e) =>
                    setFormData({ ...formData, medicalConditions: e.target.value })
                  }
                  className="rounded-xl text-xs"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Emergency Contact Name</Label>
                  <Input
                    placeholder="e.g. Elena Reyes (Mother)"
                    value={formData.emergencyContactName}
                    onChange={(e) =>
                      setFormData({ ...formData, emergencyContactName: e.target.value })
                    }
                    className="rounded-xl text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Emergency Contact Phone</Label>
                  <Input
                    type="tel"
                    placeholder="e.g. 0918 987 6543"
                    value={formData.emergencyContactPhone}
                    onChange={(e) =>
                      setFormData({ ...formData, emergencyContactPhone: e.target.value })
                    }
                    className="rounded-xl text-xs"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsEnrolOpen(false)}
                  className="rounded-xl text-xs cursor-pointer"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={enrolLoading}
                  className="rounded-xl bg-[#0284c7] hover:bg-[#0369a1] text-xs font-bold text-white cursor-pointer"
                >
                  {enrolLoading ? "Enrolling..." : "Enrol Patient"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
