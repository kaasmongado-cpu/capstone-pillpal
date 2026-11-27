import { useEffect, useState, useMemo } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  Plus,
  Stethoscope,
  Video,
  X,
  Calendar,
  Search,
  FileText,
  Pill,
  Activity,
  Users,
  Hourglass,
  ShieldAlert,
  ClipboardList,
  UserCheck,
  RefreshCw,
  Ban,
  UserX,
} from "lucide-react";
import { fetchWithAuth } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  DOSAGE_FORMS,
  FREQUENCY_PRESETS,
  checkAllergyConflict,
  hasDocumentedDrugAllergy,
} from "@/lib/clinical";

type AppointmentItem = {
  id: string;
  patientId: string;
  patientName: string;
  patientEmail: string;
  patientPhone: string | null;
  idNumber: string;
  department: string;
  allergies: string | null;
  medicalConditions: string | null;
  scheduledAt: string;
  requestedDate: string | null;
  reason: string;
  type: "IN_PERSON" | "TELEHEALTH";
  status:
    | "PENDING"
    | "CONFIRMED"
    | "WAITING"
    | "IN_PROGRESS"
    | "COMPLETED"
    | "REJECTED"
    | "CANCELLED"
    | "NO_SHOW";
  patientNotes: string | null;
  clinicalNotes: string | null;
  rejectionReason: string | null;
  cancellationReason: string | null;
  telehealthUrl: string | null;
  checkedInAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  providerId: string | null;
  providerName: string;
  providerSpecialization: string;
  confirmedByName: string | null;
  createdAt: string;
};

type DoctorOption = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  role: string;
  specialization: string | null;
  workId: string | null;
};

type PatientOption = {
  id: string;
  name: string;
  idNumber: string;
  department: string;
  allergies?: string;
  medicalConditions?: string;
};

type InventoryOption = {
  id: string;
  name: string;
  brandName: string | null;
  strength: string;
  form: string;
  currentStock: number;
};

export function Appointments() {
  const [appointments, setAppointments] = useState<AppointmentItem[]>([]);
  const [doctors, setDoctors] = useState<DoctorOption[]>([]);
  const [patients, setPatients] = useState<PatientOption[]>([]);
  const [inventoryList, setInventoryList] = useState<InventoryOption[]>([]);
  const [loading, setLoading] = useState(true);

  // Authenticated user profile and active workspace role
  const [activeRole, setActiveRole] = useState<"DOCTOR" | "HEALTH_STAFF">("DOCTOR");
  const [currentUserId, setCurrentUserId] = useState<string>("");
  const [currentUserName, setCurrentUserName] = useState<string>("");

  // Tabs for Doctor View: "doctor-queue" | "doctor-schedule" | "doctor-history"
  // Tabs for Staff View: "staff-triage" | "staff-lobby" | "staff-master"
  const [activeTab, setActiveTab] = useState<string>("doctor-queue");

  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");

  // Modals
  const [isWalkInModalOpen, setIsWalkInModalOpen] = useState(false);
  const [isTriageModalOpen, setIsTriageModalOpen] = useState(false);
  const [isDeclineModalOpen, setIsDeclineModalOpen] = useState(false);
  const [isConsultModalOpen, setIsConsultModalOpen] = useState(false);
  const [isViewNotesModalOpen, setIsViewNotesModalOpen] = useState(false);

  const [selectedAppointment, setSelectedAppointment] = useState<AppointmentItem | null>(null);

  // Form states
  const [modalLoading, setModalLoading] = useState(false);
  const [modalError, setModalError] = useState("");
  const [modalSuccess, setModalSuccess] = useState("");

  // Walk-in form
  const [walkInData, setWalkInData] = useState({
    patientId: "",
    reason: "",
    type: "IN_PERSON" as "IN_PERSON" | "TELEHEALTH",
    providerId: "",
    isDirectCheckIn: true,
  });

  // Triage approval form
  const [triageDoctorId, setTriageDoctorId] = useState("");
  const [triageDate, setTriageDate] = useState("");
  const [triageTime, setTriageTime] = useState("");

  // Decline form
  const [declineReason, setDeclineReason] = useState("");

  // Doctor Consultation Workspace form
  const [vitals, setVitals] = useState({
    bp: "",
    hr: "",
    temp: "",
    spo2: "",
    weight: "",
  });
  const [soapNotes, setSoapNotes] = useState({
    subjective: "",
    objective: "",
    assessment: "",
    plan: "",
  });
  const [prescribeMed, setPrescribeMed] = useState(false);
  const [allergyOverrideConfirmed, setAllergyOverrideConfirmed] = useState(false);
  const [rxData, setRxData] = useState({
    inventoryId: "",
    name: "",
    dosage: "",
    form: "Tablet",
    instructions: "",
    frequency: "Twice daily",
    scheduleTimes: "08:00 AM, 08:00 PM",
    durationDays: 7,
    dispenseFromStock: false,
    dispenseQuantity: 1,
  });

  async function loadInitialData() {
    setLoading(true);
    try {
      const [aptRes, docRes, patRes, invRes, meRes] = await Promise.all([
        fetchWithAuth("/appointments"),
        fetchWithAuth("/appointments/doctors"),
        fetchWithAuth("/patients"),
        fetchWithAuth("/inventory"),
        fetchWithAuth("/me"),
      ]);

      if (aptRes.ok) {
        const data = await aptRes.json();
        setAppointments(data);
      }

      if (docRes.ok) {
        const docData = await docRes.json();
        setDoctors(docData);
        if (docData.length > 0 && !triageDoctorId) {
          setTriageDoctorId(docData[0].id);
        }
      }

      if (patRes.ok) {
        const patData = await patRes.json();
        setPatients(
          patData.map((p: any) => ({
            id: p.id,
            name: p.name,
            idNumber: p.idNumber,
            department: p.department,
            allergies: p.allergies,
            medicalConditions: p.medicalConditions,
          }))
        );
      }

      if (invRes.ok) {
        const invData = await invRes.json();
        const items = Array.isArray(invData) ? invData : invData.items || [];
        setInventoryList(items);
      }

      if (meRes.ok) {
        const meData = await meRes.json();
        const role = meData.role === "HEALTH_STAFF" ? "HEALTH_STAFF" : "DOCTOR";
        setActiveRole(role);
        setCurrentUserId(meData.id || "");
        setCurrentUserName(meData.firstName ? `Dr. ${meData.firstName} ${meData.lastName}` : "Physician");
        setActiveTab(role === "HEALTH_STAFF" ? "staff-triage" : "doctor-queue");
      }
    } catch (err) {
      console.error("Failed to load appointments initial data:", err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadInitialData();
  }, []);

  const consultAllergyConflict = useMemo(
    () =>
      prescribeMed
        ? checkAllergyConflict(rxData.name, selectedAppointment?.allergies)
        : { hasConflict: false, matchedTerms: [], warningMessage: "" },
    [prescribeMed, rxData.name, selectedAppointment?.allergies],
  );

  useEffect(() => {
    setAllergyOverrideConfirmed(false);
  }, [rxData.name, selectedAppointment?.id, prescribeMed]);

  // Filtered queries for Health Staff View
  const pendingTriageRequests = useMemo(
    () => appointments.filter((a) => a.status === "PENDING"),
    [appointments]
  );

  const staffLobbyQueue = useMemo(
    () => appointments.filter((a) => a.status === "WAITING" || a.status === "IN_PROGRESS"),
    [appointments]
  );

  const staffMasterSchedule = useMemo(() => {
    return appointments.filter((a) => {
      const matchesSearch =
        a.patientName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        a.idNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
        a.reason.toLowerCase().includes(searchQuery.toLowerCase()) ||
        a.providerName.toLowerCase().includes(searchQuery.toLowerCase());

      const matchesStatus = statusFilter === "ALL" || a.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [appointments, searchQuery, statusFilter]);

  // Filtered queries for Doctor View
  const doctorWaitingAndActiveQueue = useMemo(() => {
    // Shows patients waiting in lobby (assigned to this doctor or unassigned) and current in-progress consults
    return appointments.filter((a) => {
      const isLobbyOrActive = a.status === "WAITING" || a.status === "IN_PROGRESS";
      const isAssignedToDoctor = !a.providerId || a.providerId === currentUserId;
      return isLobbyOrActive && (isAssignedToDoctor || activeRole === "DOCTOR");
    });
  }, [appointments, currentUserId, activeRole]);

  const doctorConfirmedSchedule = useMemo(() => {
    return appointments.filter(
      (a) => a.status === "CONFIRMED" && (!a.providerId || a.providerId === currentUserId)
    );
  }, [appointments, currentUserId]);

  const doctorCompletedHistory = useMemo(() => {
    return appointments.filter((a) => a.status === "COMPLETED");
  }, [appointments]);

  // Actions
  async function handleCreateWalkIn(e: React.FormEvent) {
    e.preventDefault();
    setModalError("");
    if (!walkInData.patientId) {
      setModalError("Please select a CSU patient.");
      return;
    }
    setModalLoading(true);

    try {
      const res = await fetchWithAuth("/appointments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          patientId: walkInData.patientId,
          scheduledAt: new Date().toISOString(),
          reason: walkInData.reason,
          type: walkInData.type,
          providerId: walkInData.providerId || (doctors[0]?.id ?? null),
          isWalkIn: walkInData.isDirectCheckIn,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "Failed to create walk-in appointment");
      }

      setModalSuccess("Walk-in patient registered and placed in lobby queue!");
      setTimeout(() => {
        setModalSuccess("");
        setIsWalkInModalOpen(false);
        setWalkInData({
          patientId: "",
          reason: "",
          type: "IN_PERSON",
          providerId: doctors[0]?.id || "",
          isDirectCheckIn: true,
        });
        void loadInitialData();
      }, 1000);
    } catch (err: any) {
      setModalError(err.message || "Failed to register walk-in.");
    } finally {
      setModalLoading(false);
    }
  }

  function openTriageModal(apt: AppointmentItem) {
    setSelectedAppointment(apt);
    setTriageDoctorId(apt.providerId || doctors[0]?.id || "");
    const dateObj = new Date(apt.scheduledAt);
    setTriageDate(dateObj.toISOString().split("T")[0]);
    setTriageTime(dateObj.toTimeString().slice(0, 5));
    setIsTriageModalOpen(true);
  }

  async function handleConfirmTriage(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedAppointment) return;
    setModalError("");
    setModalLoading(true);

    try {
      const scheduledAt = new Date(`${triageDate}T${triageTime}:00`);
      const res = await fetchWithAuth(`/appointments/${selectedAppointment.id}/confirm`, {
        method: "POST",
        body: JSON.stringify({
          providerId: triageDoctorId,
          scheduledAt: scheduledAt.toISOString(),
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "Failed to confirm appointment");
      }

      setModalSuccess("Appointment approved & Doctor assigned successfully!");
      setTimeout(() => {
        setModalSuccess("");
        setIsTriageModalOpen(false);
        void loadInitialData();
      }, 1000);
    } catch (err: any) {
      setModalError(err.message || "Error confirming appointment.");
    } finally {
      setModalLoading(false);
    }
  }

  function openDeclineModal(apt: AppointmentItem) {
    setSelectedAppointment(apt);
    setDeclineReason("");
    setIsDeclineModalOpen(true);
  }

  async function handleDeclineTriage(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedAppointment) return;
    setModalError("");
    setModalLoading(true);

    try {
      const res = await fetchWithAuth(`/appointments/${selectedAppointment.id}/reject`, {
        method: "POST",
        body: JSON.stringify({ rejectionReason: declineReason }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "Failed to reject appointment");
      }

      setModalSuccess("Appointment request declined.");
      setTimeout(() => {
        setModalSuccess("");
        setIsDeclineModalOpen(false);
        void loadInitialData();
      }, 1000);
    } catch (err: any) {
      setModalError(err.message || "Error declining request.");
    } finally {
      setModalLoading(false);
    }
  }

  async function handleLobbyCheckIn(aptId: string) {
    try {
      const res = await fetchWithAuth(`/appointments/${aptId}/check-in`, {
        method: "POST",
      });
      if (res.ok) {
        void loadInitialData();
      }
    } catch (err) {
      console.error("Failed to check in patient:", err);
    }
  }

  async function handleCancelAppointment(apt: AppointmentItem) {
    if (
      !window.confirm(
        `Cancel appointment for ${apt.patientName} (${apt.idNumber})?`,
      )
    ) {
      return;
    }
    try {
      const res = await fetchWithAuth(`/appointments/${apt.id}/cancel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cancellationReason: "Cancelled by CSU Health Services Clinic.",
        }),
      });
      if (res.ok) {
        void loadInitialData();
      }
    } catch (err) {
      console.error("Failed to cancel appointment:", err);
    }
  }

  async function handleMarkNoShow(apt: AppointmentItem) {
    if (
      !window.confirm(
        `Mark ${apt.patientName} (${apt.idNumber}) as No-Show for this appointment?`,
      )
    ) {
      return;
    }
    try {
      const res = await fetchWithAuth(`/appointments/${apt.id}/no-show`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reason: "Patient did not arrive for scheduled clinic visit.",
        }),
      });
      if (res.ok) {
        void loadInitialData();
      }
    } catch (err) {
      console.error("Failed to mark appointment as no-show:", err);
    }
  }

  function openConsultationWorkspace(apt: AppointmentItem) {
    setSelectedAppointment(apt);
    setModalError("");
    setModalSuccess("");
    setVitals({ bp: "", hr: "", temp: "", spo2: "", weight: "" });
    setSoapNotes({
      subjective: `Chief Complaint: ${apt.reason}${apt.patientNotes ? `\nPatient Notes: ${apt.patientNotes}` : ""}`,
      objective: "",
      assessment: "",
      plan: "",
    });
    setPrescribeMed(false);
    setAllergyOverrideConfirmed(false);
    setRxData({
      inventoryId: "",
      name: "",
      dosage: "",
      form: "Tablet",
      instructions: "",
      frequency: "Twice daily",
      scheduleTimes: "08:00 AM, 08:00 PM",
      durationDays: 7,
      dispenseFromStock: false,
      dispenseQuantity: 1,
    });
    setIsConsultModalOpen(true);
  }

  async function handleStartConsult(aptId: string) {
    try {
      const res = await fetchWithAuth(`/appointments/${aptId}/start`, {
        method: "POST",
      });
      if (res.ok) {
        const apt = appointments.find((a) => a.id === aptId);
        if (apt) {
          openConsultationWorkspace({ ...apt, status: "IN_PROGRESS" });
        }
        void loadInitialData();
      }
    } catch (err) {
      console.error("Failed to start consult:", err);
    }
  }

  async function handleCompleteConsult(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedAppointment) return;
    setModalError("");

    if (prescribeMed && consultAllergyConflict.hasConflict && !allergyOverrideConfirmed) {
      setModalError(
        "Drug-allergy contraindication detected. Acknowledge clinical review before completing this consultation.",
      );
      return;
    }

    setModalLoading(true);

    try {
      const vitalsParts = [
        vitals.bp.trim() ? `BP ${vitals.bp.trim()} mmHg` : "",
        vitals.hr.trim() ? `HR ${vitals.hr.trim()} bpm` : "",
        vitals.temp.trim() ? `Temp ${vitals.temp.trim()} °C` : "",
        vitals.spo2.trim() ? `SpO2 ${vitals.spo2.trim()}%` : "",
        vitals.weight.trim() ? `Weight ${vitals.weight.trim()} kg` : "",
      ].filter(Boolean);

      const objectiveCombined = [
        vitalsParts.length > 0 ? `Vitals: ${vitalsParts.join(", ")}` : "",
        soapNotes.objective.trim(),
      ]
        .filter(Boolean)
        .join("\n");

      const clinicalNotesFormatted = [
        "[SOAP CLINICAL NOTE]",
        `• Subjective: ${soapNotes.subjective.trim() || "Not recorded"}`,
        `• Objective: ${objectiveCombined || "Not recorded"}`,
        `• Assessment: ${soapNotes.assessment.trim() || "Not recorded"}`,
        `• Plan: ${soapNotes.plan.trim() || "Not recorded"}`,
      ].join("\n");

      const payload: any = {
        clinicalNotes: clinicalNotesFormatted,
      };

      if (prescribeMed && rxData.name.trim() && rxData.dosage.trim()) {
        payload.prescription = {
          name: rxData.name.trim(),
          dosage: rxData.dosage.trim(),
          form: rxData.form,
          instructions: rxData.instructions.trim() || undefined,
          frequency: rxData.frequency,
          scheduleTimes: rxData.scheduleTimes
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean),
          durationDays: Number(rxData.durationDays || 7),
          inventoryItemId: rxData.inventoryId || undefined,
          dispenseQuantity:
            rxData.dispenseFromStock && rxData.inventoryId
              ? Number(rxData.dispenseQuantity || 0)
              : 0,
        };
      }

      const res = await fetchWithAuth(`/appointments/${selectedAppointment.id}/complete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "Failed to complete consultation");
      }

      setModalSuccess("Consultation recorded and clinical chart saved!");
      setTimeout(() => {
        setModalSuccess("");
        setIsConsultModalOpen(false);
        void loadInitialData();
      }, 1000);
    } catch (err: any) {
      setModalError(err.message || "Error completing consultation.");
    } finally {
      setModalLoading(false);
    }
  }

  function handleInventoryPick(invId: string) {
    if (!invId) {
      setRxData((prev) => ({
        ...prev,
        inventoryId: "",
        dispenseFromStock: false,
      }));
      return;
    }
    const item = inventoryList.find((i) => i.id === invId);
    if (item) {
      setRxData((prev) => ({
        ...prev,
        inventoryId: item.id,
        name: item.name,
        dosage: item.strength,
        form: item.form || prev.form,
        dispenseQuantity: Math.min(14, item.currentStock > 0 ? item.currentStock : 1),
      }));
    }
  }

  return (
    <div className="space-y-6">
      {/* Top Header & Role Switcher Banner */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-slate-100 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-black tracking-tight text-slate-900">
              {activeRole === "DOCTOR"
                ? "Physician Clinical Consultations & Schedule"
                : "Clinic Scheduling & Triage Coordination"}
            </h1>
            <span
              className={`rounded-full px-2.5 py-0.5 text-[10px] font-black ${
                activeRole === "DOCTOR"
                  ? "bg-emerald-100 text-emerald-800"
                  : "bg-sky-100 text-[#0284c7]"
              }`}
            >
              {activeRole === "DOCTOR" ? "🩺 Doctor Mode" : "📋 Health Staff Mode"}
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            {activeRole === "DOCTOR"
              ? "Conduct patient medical reviews, log SOAP clinical notes, and issue prescriptions directly from pharmacy stock."
              : "Review incoming student booking requests, assign duty physicians, handle reception walk-in arrivals, and coordinate clinic queues."}
          </p>
        </div>

        {/* Quick Actions (Role-Locked to Authenticated Clinician) */}
        <div className="flex flex-wrap items-center gap-2.5">
          <Button
            variant="outline"
            size="sm"
            onClick={() => void loadInitialData()}
            disabled={loading}
            className="gap-1.5 rounded-xl text-xs font-bold cursor-pointer"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>

          {activeRole === "HEALTH_STAFF" ? (
            <Button
              onClick={() => {
                setModalError("");
                setModalSuccess("");
                setIsWalkInModalOpen(true);
              }}
              className="gap-1.5 rounded-xl text-xs font-bold bg-[#0284c7] hover:bg-[#0369a1] text-white shadow-xs cursor-pointer"
            >
              <Plus className="h-4 w-4" />
              Reception Walk-In Check-In
            </Button>
          ) : (
            <Button
              disabled={doctorWaitingAndActiveQueue.length === 0}
              onClick={() => {
                const firstWaiting = doctorWaitingAndActiveQueue.find((a) => a.status === "WAITING");
                if (firstWaiting) {
                  void handleStartConsult(firstWaiting.id);
                } else if (doctorWaitingAndActiveQueue[0]) {
                  openConsultationWorkspace(doctorWaitingAndActiveQueue[0]);
                }
              }}
              className="gap-1.5 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs cursor-pointer"
            >
              <Stethoscope className="h-4 w-4" />
              Call Next Patient
            </Button>
          )}
        </div>
      </div>

      {/* Main Workspace Body */}
      {loading ? (
        <div className="p-16 text-center text-xs text-slate-400 font-medium bg-white rounded-2xl border border-slate-100">
          Loading clinical appointments & schedules...
        </div>
      ) : (
        <>
          {/* ========================================================================= */}
          {/* 1. DOCTOR DASHBOARD & WORKSPACE */}
          {/* ========================================================================= */}
          {activeRole === "DOCTOR" && (
        <div className="space-y-5 animate-in fade-in">
          {/* Doctor KPI Metric Cards */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Card
              onClick={() => setActiveTab("doctor-queue")}
              className={`cursor-pointer rounded-2xl border transition-all ${
                activeTab === "doctor-queue"
                  ? "border-emerald-500 bg-emerald-50/40 shadow-xs ring-1 ring-emerald-300"
                  : "border-slate-100 hover:border-slate-200"
              }`}
            >
              <CardContent className="p-4 flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-100 text-emerald-800 font-bold">
                  <Users className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-[11px] font-semibold text-slate-500">Patients Waiting in Lobby</p>
                  <div className="flex items-center gap-1.5">
                    <span className="text-lg font-black text-slate-900">
                      {doctorWaitingAndActiveQueue.filter((a) => a.status === "WAITING").length}
                    </span>
                    <span className="rounded-full bg-emerald-200 px-1.5 py-0.2 text-[9px] font-bold text-emerald-900">
                      Ready to Call
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card
              onClick={() => setActiveTab("doctor-queue")}
              className={`cursor-pointer rounded-2xl border transition-all ${
                activeTab === "doctor-queue"
                  ? "border-sky-500 bg-sky-50/40 shadow-xs ring-1 ring-sky-300"
                  : "border-slate-100 hover:border-slate-200"
              }`}
            >
              <CardContent className="p-4 flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-100 text-[#0284c7] font-bold">
                  <Activity className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-[11px] font-semibold text-slate-500">In Active Consultation</p>
                  <div className="flex items-center gap-1.5">
                    <span className="text-lg font-black text-slate-900">
                      {doctorWaitingAndActiveQueue.filter((a) => a.status === "IN_PROGRESS").length}
                    </span>
                    <span className="rounded-full bg-sky-200 px-1.5 py-0.2 text-[9px] font-bold text-sky-900">
                      In Room
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card
              onClick={() => setActiveTab("doctor-schedule")}
              className={`cursor-pointer rounded-2xl border transition-all ${
                activeTab === "doctor-schedule"
                  ? "border-indigo-500 bg-indigo-50/40 shadow-xs ring-1 ring-indigo-300"
                  : "border-slate-100 hover:border-slate-200"
              }`}
            >
              <CardContent className="p-4 flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-100 text-indigo-700 font-bold">
                  <Calendar className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-[11px] font-semibold text-slate-500">Upcoming Confirmed</p>
                  <div className="flex items-center gap-1.5">
                    <span className="text-lg font-black text-slate-900">{doctorConfirmedSchedule.length}</span>
                    <span className="text-[10px] text-slate-400">On Schedule</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card
              onClick={() => setActiveTab("doctor-history")}
              className={`cursor-pointer rounded-2xl border transition-all ${
                activeTab === "doctor-history"
                  ? "border-emerald-500 bg-emerald-50/40 shadow-xs ring-1 ring-emerald-300"
                  : "border-slate-100 hover:border-slate-200"
              }`}
            >
              <CardContent className="p-4 flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700 font-bold">
                  <CheckCircle2 className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-[11px] font-semibold text-slate-500">Completed Records</p>
                  <div className="flex items-center gap-1.5">
                    <span className="text-lg font-black text-slate-900">{doctorCompletedHistory.length}</span>
                    <span className="text-[10px] text-emerald-700 font-semibold">SOAP Saved</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Doctor Tabs Navigation */}
          <div className="flex items-center gap-2 border-b border-slate-200 pb-2 text-xs font-bold">
            <button
              type="button"
              onClick={() => setActiveTab("doctor-queue")}
              className={`flex items-center gap-2 rounded-xl px-4 py-2 transition-colors cursor-pointer ${
                activeTab === "doctor-queue"
                  ? "bg-emerald-700 text-white shadow-xs"
                  : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              <Stethoscope className="h-4 w-4" />
              <span>Today's Consultation Queue</span>
              {doctorWaitingAndActiveQueue.length > 0 && (
                <span className="ml-1 rounded-full bg-white/20 px-1.5 py-0.2 text-[10px] font-bold text-white">
                  {doctorWaitingAndActiveQueue.length}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("doctor-schedule")}
              className={`flex items-center gap-2 rounded-xl px-4 py-2 transition-colors cursor-pointer ${
                activeTab === "doctor-schedule"
                  ? "bg-slate-900 text-white shadow-xs"
                  : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              <Calendar className="h-4 w-4" />
              <span>My Confirmed Schedule ({doctorConfirmedSchedule.length})</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("doctor-history")}
              className={`flex items-center gap-2 rounded-xl px-4 py-2 transition-colors cursor-pointer ${
                activeTab === "doctor-history"
                  ? "bg-slate-900 text-white shadow-xs"
                  : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              <ClipboardList className="h-4 w-4" />
              <span>My SOAP Records & Prescriptions</span>
            </button>
          </div>

          {/* DOCTOR TAB 1: ACTIVE CONSULTATION QUEUE */}
          {activeTab === "doctor-queue" && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-black text-slate-900">
                    Active Patient Consultation Queue
                  </h2>
                  <p className="text-xs text-slate-500">
                    Call patients currently waiting in the clinic lobby or continue an in-progress consultation.
                  </p>
                </div>
              </div>

              {doctorWaitingAndActiveQueue.length === 0 ? (
                <Card className="rounded-2xl border border-slate-100 p-12 text-center">
                  <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600 mb-3">
                    <CheckCircle2 className="h-6 w-6" />
                  </div>
                  <h3 className="text-sm font-black text-slate-900">Your Consultation Queue is Clear</h3>
                  <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                    No patients currently waiting in the lobby. As Health Staff checks in students, they will appear here instantly.
                  </p>
                </Card>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {doctorWaitingAndActiveQueue.map((apt) => {
                    const isConsulting = apt.status === "IN_PROGRESS";

                    return (
                      <Card
                        key={apt.id}
                        className={`rounded-2xl border transition-all shadow-xs ${
                          isConsulting
                            ? "border-emerald-300 bg-gradient-to-br from-emerald-50/70 to-white ring-2 ring-emerald-300"
                            : "border-slate-200 bg-white hover:border-slate-300"
                        }`}
                      >
                        <CardContent className="p-4 space-y-3">
                          <div className="flex items-start justify-between">
                            <div className="flex items-center gap-3">
                              <div
                                className={`flex h-11 w-11 items-center justify-center rounded-2xl font-black ${
                                  isConsulting
                                    ? "bg-emerald-600 text-white animate-pulse"
                                    : "bg-sky-100 text-[#0284c7]"
                                }`}
                              >
                                {isConsulting ? (
                                  <Activity className="h-5 w-5" />
                                ) : (
                                  <Users className="h-5 w-5" />
                                )}
                              </div>
                              <div>
                                <div className="flex items-center gap-1.5">
                                  <h3 className="text-sm font-black text-slate-900">
                                    {apt.patientName}
                                  </h3>
                                  <span className="font-mono text-[11px] font-bold text-slate-500">
                                    {apt.idNumber}
                                  </span>
                                </div>
                                <p className="text-xs text-slate-500">{apt.department}</p>
                              </div>
                            </div>

                            <span
                              className={`rounded-full px-2.5 py-0.5 text-[10px] font-black ${
                                isConsulting
                                  ? "bg-emerald-100 text-emerald-800"
                                  : "bg-sky-100 text-sky-800"
                              }`}
                            >
                              {isConsulting ? "In Consultation" : "Waiting in Lobby"}
                            </span>
                          </div>

                          <div className="rounded-xl bg-slate-50 p-3 text-xs space-y-1">
                            <p className="font-semibold text-slate-800">
                              <span className="text-slate-500 font-normal">Chief Complaint: </span>
                              {apt.reason}
                            </p>
                            {apt.patientNotes && (
                              <p className="text-[11px] text-slate-500 italic">
                                "{apt.patientNotes}"
                              </p>
                            )}
                          </div>

                          {apt.allergies && (
                            <div className="flex items-center gap-1.5 text-[11px] text-red-600 font-semibold bg-red-50 p-2 rounded-xl border border-red-100">
                              <ShieldAlert className="h-3.5 w-3.5 shrink-0" />
                              <span>Patient Allergies: {apt.allergies}</span>
                            </div>
                          )}

                          <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                            <span className="text-[11px] text-slate-400 font-medium">
                              {apt.type === "TELEHEALTH" ? "Virtual Video Consultation" : "Clinic Station 1"}
                            </span>

                            {isConsulting ? (
                              <Button
                                size="sm"
                                onClick={() => openConsultationWorkspace(apt)}
                                className="rounded-xl text-xs font-black bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs cursor-pointer gap-1.5"
                              >
                                <Stethoscope className="h-3.5 w-3.5" />
                                Resume SOAP & Prescribe
                              </Button>
                            ) : (
                              <Button
                                size="sm"
                                onClick={() => handleStartConsult(apt.id)}
                                className="rounded-xl text-xs font-black bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs cursor-pointer gap-1.5"
                              >
                                <Stethoscope className="h-3.5 w-3.5" />
                                Call In / Start Consult
                              </Button>
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* DOCTOR TAB 2: MY CONFIRMED SCHEDULE */}
          {activeTab === "doctor-schedule" && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-black text-slate-900">
                    Your Upcoming Confirmed Consultations
                  </h2>
                  <p className="text-xs text-slate-500">
                    Appointments approved and scheduled specifically with you.
                  </p>
                </div>
              </div>

              {doctorConfirmedSchedule.length === 0 ? (
                <div className="p-12 text-center text-xs text-slate-400 bg-white rounded-2xl border border-slate-100">
                  No upcoming confirmed appointments for your schedule.
                </div>
              ) : (
                <div className="space-y-3">
                  {doctorConfirmedSchedule.map((apt) => {
                    const aptDate = new Date(apt.scheduledAt);
                    const dateStr = aptDate.toLocaleDateString([], {
                      weekday: "short",
                      month: "short",
                      day: "numeric",
                    });
                    const timeStr = aptDate.toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    });

                    return (
                      <Card key={apt.id} className="rounded-2xl border border-slate-100 shadow-xs">
                        <CardContent className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                          <div className="flex items-center gap-3.5">
                            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-sky-50 text-[#0284c7] font-bold">
                              {apt.type === "TELEHEALTH" ? (
                                <Video className="h-5 w-5" />
                              ) : (
                                <Stethoscope className="h-5 w-5" />
                              )}
                            </div>
                            <div>
                              <div className="flex items-center gap-2">
                                <p className="text-sm font-bold text-slate-900">{apt.patientName}</p>
                                <span className="font-mono text-xs text-slate-400 font-semibold">{apt.idNumber}</span>
                                <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600">
                                  {apt.type === "IN_PERSON" ? "In-Person" : "Telehealth"}
                                </span>
                              </div>
                              <p className="text-xs text-slate-600 mt-0.5">{apt.reason}</p>
                            </div>
                          </div>

                          <div className="flex items-center gap-3">
                            <div className="text-right">
                              <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800 justify-end">
                                <Clock className="h-3.5 w-3.5 text-slate-400" />
                                <span>{dateStr} • {timeStr}</span>
                              </div>
                              <span className="mt-1 inline-flex rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
                                Confirmed with You
                              </span>
                            </div>

                            <div className="flex flex-wrap items-center gap-1.5">
                              <Button
                                size="sm"
                                onClick={() => handleLobbyCheckIn(apt.id)}
                                className="rounded-xl text-xs font-bold bg-[#0284c7] hover:bg-[#0369a1] text-white shadow-xs cursor-pointer"
                              >
                                Mark In Lobby
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                title="Mark patient as No-Show"
                                onClick={() => void handleMarkNoShow(apt)}
                                className="rounded-xl text-xs font-semibold text-amber-700 border-amber-200 hover:bg-amber-50 cursor-pointer gap-1"
                              >
                                <UserX className="h-3.5 w-3.5" />
                                No-Show
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                title="Cancel appointment"
                                onClick={() => void handleCancelAppointment(apt)}
                                className="rounded-xl text-xs font-semibold text-rose-600 hover:bg-rose-50 cursor-pointer gap-1"
                              >
                                <Ban className="h-3.5 w-3.5" />
                                Cancel
                              </Button>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* DOCTOR TAB 3: SOAP RECORDS & PRESCRIPTIONS */}
          {activeTab === "doctor-history" && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-black text-slate-900">
                    Your Documented SOAP Notes & Prescriptions
                  </h2>
                  <p className="text-xs text-slate-500">
                    Clinical findings, diagnoses, and regimens prescribed during consultations.
                  </p>
                </div>
              </div>

              {doctorCompletedHistory.length === 0 ? (
                <div className="p-12 text-center text-xs text-slate-400 bg-white rounded-2xl border border-slate-100">
                  No completed consultations recorded yet.
                </div>
              ) : (
                <div className="space-y-3">
                  {doctorCompletedHistory.map((apt) => {
                    const compDate = apt.completedAt ? new Date(apt.completedAt) : new Date(apt.scheduledAt);
                    const dateStr = compDate.toLocaleDateString([], {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    });

                    return (
                      <Card key={apt.id} className="rounded-2xl border border-slate-100 shadow-xs">
                        <CardContent className="p-4 space-y-3">
                          <div className="flex items-start justify-between">
                            <div>
                              <div className="flex items-center gap-2">
                                <h3 className="text-sm font-black text-slate-900">{apt.patientName}</h3>
                                <span className="font-mono text-xs text-slate-400 font-bold">{apt.idNumber}</span>
                                <span className="rounded-md bg-emerald-50 text-emerald-700 px-2 py-0.5 text-[10px] font-bold">
                                  Consultation Completed
                                </span>
                              </div>
                              <p className="text-xs text-slate-500 mt-0.5">
                                Chief Complaint: <span className="font-semibold text-slate-700">{apt.reason}</span>
                              </p>
                            </div>
                            <span className="text-xs font-bold text-slate-500">{dateStr}</span>
                          </div>

                          {apt.clinicalNotes && (
                            <div className="rounded-xl bg-slate-50 p-3 text-xs text-slate-700 font-mono whitespace-pre-line border border-slate-100">
                              {apt.clinicalNotes}
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* 2. HEALTH STAFF DASHBOARD & WORKSPACE */}
      {/* ========================================================================= */}
      {activeRole === "HEALTH_STAFF" && (
        <div className="space-y-5 animate-in fade-in">
          {/* Health Staff KPI Metric Cards */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Card
              onClick={() => setActiveTab("staff-triage")}
              className={`cursor-pointer rounded-2xl border transition-all ${
                activeTab === "staff-triage"
                  ? "border-amber-400 bg-amber-50/40 shadow-xs ring-1 ring-amber-300"
                  : "border-slate-100 hover:border-slate-200"
              }`}
            >
              <CardContent className="p-4 flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-100 text-amber-700 font-bold">
                  <Hourglass className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-[11px] font-semibold text-slate-500">Pending Triage Requests</p>
                  <div className="flex items-center gap-1.5">
                    <span className="text-lg font-black text-slate-900">{pendingTriageRequests.length}</span>
                    {pendingTriageRequests.length > 0 && (
                      <span className="rounded-full bg-amber-200 px-1.5 py-0.2 text-[9px] font-bold text-amber-900">
                        Needs Doctor Assignment
                      </span>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card
              onClick={() => setActiveTab("staff-lobby")}
              className={`cursor-pointer rounded-2xl border transition-all ${
                activeTab === "staff-lobby"
                  ? "border-sky-400 bg-sky-50/40 shadow-xs ring-1 ring-sky-300"
                  : "border-slate-100 hover:border-slate-200"
              }`}
            >
              <CardContent className="p-4 flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-100 text-[#0284c7] font-bold">
                  <Users className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-[11px] font-semibold text-slate-500">Reception Waiting Lobby</p>
                  <div className="flex items-center gap-1.5">
                    <span className="text-lg font-black text-slate-900">{staffLobbyQueue.length}</span>
                    <span className="rounded-full bg-sky-200 px-1.5 py-0.2 text-[9px] font-bold text-sky-900">
                      In Clinic
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card
              onClick={() => setActiveTab("staff-master")}
              className={`cursor-pointer rounded-2xl border transition-all ${
                activeTab === "staff-master"
                  ? "border-indigo-400 bg-indigo-50/40 shadow-xs ring-1 ring-indigo-300"
                  : "border-slate-100 hover:border-slate-200"
              }`}
            >
              <CardContent className="p-4 flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-100 text-indigo-700 font-bold">
                  <Calendar className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-[11px] font-semibold text-slate-500">Master Clinic Bookings</p>
                  <div className="flex items-center gap-1.5">
                    <span className="text-lg font-black text-slate-900">{appointments.length}</span>
                    <span className="text-[10px] text-slate-400">Total Records</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card
              onClick={() => setIsWalkInModalOpen(true)}
              className="cursor-pointer rounded-2xl border border-sky-200 bg-gradient-to-br from-sky-50 to-white hover:border-[#0284c7] shadow-xs transition-all"
            >
              <CardContent className="p-4 flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#0284c7] text-white font-bold">
                  <UserCheck className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-[11px] font-semibold text-[#0284c7]">Fast Reception Action</p>
                  <p className="text-xs font-black text-slate-900">Walk-In Check-In</p>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Health Staff Tabs Navigation */}
          <div className="flex items-center gap-2 border-b border-slate-200 pb-2 text-xs font-bold">
            <button
              type="button"
              onClick={() => setActiveTab("staff-triage")}
              className={`flex items-center gap-2 rounded-xl px-4 py-2 transition-colors cursor-pointer ${
                activeTab === "staff-triage"
                  ? "bg-slate-900 text-white shadow-xs"
                  : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              <Hourglass className="h-4 w-4" />
              <span>Triage Requests Queue</span>
              {pendingTriageRequests.length > 0 && (
                <span className="ml-1 rounded-full bg-amber-500 px-1.5 py-0.2 text-[10px] font-bold text-white">
                  {pendingTriageRequests.length}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("staff-lobby")}
              className={`flex items-center gap-2 rounded-xl px-4 py-2 transition-colors cursor-pointer ${
                activeTab === "staff-lobby"
                  ? "bg-slate-900 text-white shadow-xs"
                  : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              <Users className="h-4 w-4" />
              <span>Reception & Waiting Lobby ({staffLobbyQueue.length})</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("staff-master")}
              className={`flex items-center gap-2 rounded-xl px-4 py-2 transition-colors cursor-pointer ${
                activeTab === "staff-master"
                  ? "bg-slate-900 text-white shadow-xs"
                  : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              <Calendar className="h-4 w-4" />
              <span>Master Clinic Calendar</span>
            </button>
          </div>

          {/* STAFF TAB 1: TRIAGE REQUESTS QUEUE */}
          {activeTab === "staff-triage" && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-black text-slate-900">
                    Incoming Patient Appointment Requests (Triage Inbox)
                  </h2>
                  <p className="text-xs text-slate-500">
                    Review student symptoms, resolve schedule conflicts, assign duty doctors, and confirm slots.
                  </p>
                </div>
              </div>

              {pendingTriageRequests.length === 0 ? (
                <Card className="rounded-2xl border border-slate-100 p-12 text-center">
                  <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600 mb-3">
                    <CheckCircle2 className="h-6 w-6" />
                  </div>
                  <h3 className="text-sm font-black text-slate-900">All Triage Requests Processed</h3>
                  <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                    No pending online requests waiting for triage review.
                  </p>
                </Card>
              ) : (
                <div className="grid grid-cols-1 gap-3.5">
                  {pendingTriageRequests.map((apt) => {
                    const reqDate = new Date(apt.scheduledAt);
                    const dateStr = reqDate.toLocaleDateString([], {
                      weekday: "short",
                      month: "short",
                      day: "numeric",
                    });
                    const timeStr = reqDate.toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    });

                    return (
                      <Card
                        key={apt.id}
                        className="rounded-2xl border border-amber-200/70 bg-gradient-to-r from-amber-50/30 to-white shadow-xs hover:shadow-md transition-shadow"
                      >
                        <CardContent className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
                          <div className="flex items-start gap-3.5">
                            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-amber-100 text-amber-800 font-black">
                              <Hourglass className="h-5 w-5" />
                            </div>
                            <div className="space-y-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="text-sm font-black text-slate-900">{apt.patientName}</span>
                                <span className="font-mono text-xs font-bold text-slate-500">{apt.idNumber}</span>
                                <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600">
                                  {apt.department}
                                </span>
                                <span className="rounded-md bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800">
                                  {apt.type === "TELEHEALTH" ? "Virtual Teleconsult" : "In-Person Clinic"}
                                </span>
                              </div>

                              <div className="text-xs font-semibold text-slate-800">
                                <span className="text-slate-500 font-normal">Reason for Visit: </span>
                                {apt.reason}
                              </div>

                              {apt.patientNotes && (
                                <p className="text-[11px] text-slate-600 italic bg-amber-50/60 p-2 rounded-xl border border-amber-100">
                                  "{apt.patientNotes}"
                                </p>
                              )}

                              {apt.allergies && (
                                <div className="flex items-center gap-1.5 text-[11px] text-red-600 font-semibold">
                                  <ShieldAlert className="h-3.5 w-3.5" />
                                  <span>Allergies: {apt.allergies}</span>
                                </div>
                              )}
                            </div>
                          </div>

                          <div className="flex flex-col sm:flex-row md:flex-col items-end justify-between gap-3 border-t md:border-t-0 pt-3 md:pt-0 border-slate-100">
                            <div className="text-right">
                              <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800 justify-end">
                                <Clock className="h-3.5 w-3.5 text-amber-600" />
                                <span>Requested: {dateStr} • {timeStr}</span>
                              </div>
                              <span className="mt-1 inline-flex rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-black text-amber-900">
                                Needs Doctor Assignment
                              </span>
                            </div>

                            <div className="flex items-center gap-2">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => openDeclineModal(apt)}
                                className="rounded-xl text-xs font-bold text-red-600 hover:bg-red-50 hover:text-red-700 border-red-200 cursor-pointer"
                              >
                                Decline
                              </Button>
                              <Button
                                size="sm"
                                onClick={() => openTriageModal(apt)}
                                className="rounded-xl text-xs font-bold bg-[#0284c7] hover:bg-[#0369a1] text-white shadow-xs cursor-pointer gap-1.5"
                              >
                                <Stethoscope className="h-3.5 w-3.5" />
                                Assign Doctor & Confirm
                              </Button>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* STAFF TAB 2: RECEPTION & WAITING LOBBY */}
          {activeTab === "staff-lobby" && (
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <div>
                  <h2 className="text-sm font-black text-slate-900">
                    Clinic Reception Lobby & In-Progress Consultations
                  </h2>
                  <p className="text-xs text-slate-500">
                    Monitor which patients are in the lobby and which doctors are actively consulting.
                  </p>
                </div>

                <Button
                  size="sm"
                  onClick={() => setIsWalkInModalOpen(true)}
                  className="rounded-xl text-xs font-bold bg-[#0284c7] hover:bg-[#0369a1] text-white cursor-pointer gap-1.5"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Register Walk-In
                </Button>
              </div>

              {staffLobbyQueue.length === 0 ? (
                <Card className="rounded-2xl border border-slate-100 p-12 text-center">
                  <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-sky-50 text-[#0284c7] mb-3">
                    <Users className="h-6 w-6" />
                  </div>
                  <h3 className="text-sm font-black text-slate-900">Clinic Lobby is Currently Empty</h3>
                  <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                    No patients currently waiting or in consultation.
                  </p>
                </Card>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {staffLobbyQueue.map((apt) => {
                    const isConsulting = apt.status === "IN_PROGRESS";

                    return (
                      <Card
                        key={apt.id}
                        className={`rounded-2xl border transition-all shadow-xs ${
                          isConsulting
                            ? "border-emerald-300 bg-gradient-to-br from-emerald-50/60 to-white"
                            : "border-sky-200 bg-white"
                        }`}
                      >
                        <CardContent className="p-4 space-y-3">
                          <div className="flex items-start justify-between">
                            <div className="flex items-center gap-3">
                              <div
                                className={`flex h-11 w-11 items-center justify-center rounded-2xl font-black ${
                                  isConsulting
                                    ? "bg-emerald-500 text-white"
                                    : "bg-sky-100 text-[#0284c7]"
                                }`}
                              >
                                {isConsulting ? <Activity className="h-5 w-5" /> : <Users className="h-5 w-5" />}
                              </div>
                              <div>
                                <h3 className="text-sm font-black text-slate-900">{apt.patientName}</h3>
                                <p className="text-xs text-slate-500">{apt.idNumber} • {apt.department}</p>
                              </div>
                            </div>

                            <span
                              className={`rounded-full px-2.5 py-0.5 text-[10px] font-black ${
                                isConsulting ? "bg-emerald-100 text-emerald-800" : "bg-sky-100 text-sky-800"
                              }`}
                            >
                              {isConsulting ? "Inside Doctor Room" : "Waiting in Lobby"}
                            </span>
                          </div>

                          <div className="rounded-xl bg-slate-50 p-2.5 text-xs space-y-1">
                            <p className="font-semibold text-slate-800">
                              <span className="text-slate-500 font-normal">Reason: </span>
                              {apt.reason}
                            </p>
                            <p className="text-[11px] text-slate-600">
                              Assigned Doctor: <span className="font-bold text-slate-900">{apt.providerName}</span>
                            </p>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* STAFF TAB 3: MASTER CLINIC SCHEDULE */}
          {activeTab === "staff-master" && (
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div className="relative flex-1 max-w-md">
                  <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                  <Input
                    placeholder="Search master schedule by student, ID, reason, doctor..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-9 text-xs rounded-xl"
                  />
                </div>

                <div className="flex items-center gap-2">
                  <Label className="text-xs text-slate-500">Filter Status:</Label>
                  <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    className="h-9 rounded-xl border border-slate-200 px-2.5 text-xs bg-white font-semibold text-slate-700"
                  >
                    <option value="ALL">All Statuses</option>
                    <option value="PENDING">PENDING</option>
                    <option value="CONFIRMED">CONFIRMED</option>
                    <option value="WAITING">WAITING</option>
                    <option value="IN_PROGRESS">IN_PROGRESS</option>
                    <option value="COMPLETED">COMPLETED</option>
                    <option value="REJECTED">REJECTED</option>
                    <option value="CANCELLED">CANCELLED</option>
                    <option value="NO_SHOW">NO_SHOW</option>
                  </select>
                </div>
              </div>

              {staffMasterSchedule.length === 0 ? (
                <div className="p-12 text-center text-xs text-slate-400 bg-white rounded-2xl border border-slate-100">
                  No appointments found matching filters.
                </div>
              ) : (
                <div className="space-y-3">
                  {staffMasterSchedule.map((apt) => {
                    const aptDate = new Date(apt.scheduledAt);
                    const dateStr = aptDate.toLocaleDateString([], {
                      weekday: "short",
                      month: "short",
                      day: "numeric",
                    });
                    const timeStr = aptDate.toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    });

                    return (
                      <Card key={apt.id} className="rounded-2xl border border-slate-100 shadow-xs">
                        <CardContent className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                          <div className="flex items-center gap-3.5">
                            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-sky-50 text-[#0284c7] font-bold">
                              {apt.type === "TELEHEALTH" ? <Video className="h-5 w-5" /> : <Stethoscope className="h-5 w-5" />}
                            </div>
                            <div>
                              <div className="flex items-center gap-2">
                                <p className="text-sm font-bold text-slate-900">{apt.patientName}</p>
                                <span className="font-mono text-xs text-slate-400 font-semibold">{apt.idNumber}</span>
                                <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600">
                                  {apt.type === "IN_PERSON" ? "In-Person" : "Telehealth"}
                                </span>
                              </div>
                              <p className="text-xs text-slate-600 mt-0.5">{apt.reason}</p>
                              <p className="text-[10px] text-slate-400 mt-0.5">Assigned to: {apt.providerName}</p>
                            </div>
                          </div>

                          <div className="flex items-center gap-3">
                            <div className="text-right">
                              <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800 justify-end">
                                <Clock className="h-3.5 w-3.5 text-slate-400" />
                                <span>{dateStr} • {timeStr}</span>
                              </div>
                              <span
                                className={`mt-1 inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold ${
                                  apt.status === "COMPLETED"
                                    ? "bg-emerald-100 text-emerald-800"
                                    : apt.status === "CANCELLED"
                                      ? "bg-amber-100 text-amber-900 border border-amber-200"
                                      : apt.status === "NO_SHOW"
                                        ? "bg-orange-100 text-orange-900 border border-orange-200"
                                        : apt.status === "REJECTED"
                                          ? "bg-rose-100 text-rose-800"
                                          : "bg-slate-100 text-slate-700"
                                }`}
                              >
                                {apt.status === "CANCELLED"
                                  ? "CANCELLED / OVERDUE"
                                  : apt.status === "NO_SHOW"
                                    ? "NO SHOW"
                                    : apt.status}
                              </span>
                              {(apt.status === "CANCELLED" || apt.status === "NO_SHOW") &&
                                apt.cancellationReason && (
                                  <p className="text-[10px] text-amber-700 max-w-xs mt-1">
                                    {apt.cancellationReason}
                                  </p>
                                )}
                            </div>

                            {apt.status === "CONFIRMED" && (
                              <div className="flex items-center gap-1.5">
                                <Button
                                  size="sm"
                                  onClick={() => handleLobbyCheckIn(apt.id)}
                                  className="rounded-xl text-xs font-bold bg-[#0284c7] hover:bg-[#0369a1] text-white shadow-xs cursor-pointer"
                                >
                                  Check In
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => void handleMarkNoShow(apt)}
                                  className="rounded-xl text-xs font-semibold text-amber-700 border-amber-200 hover:bg-amber-50 cursor-pointer"
                                >
                                  No-Show
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => void handleCancelAppointment(apt)}
                                  className="rounded-xl text-xs font-semibold text-rose-600 hover:bg-rose-50 cursor-pointer"
                                >
                                  Cancel
                                </Button>
                              </div>
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </>
  )}

      {/* ========================================================================= */}
      {/* SHARED MODALS */}
      {/* ========================================================================= */}

      {/* MODAL 1: WALK-IN CLINIC CHECK-IN */}
      {isWalkInModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl border border-slate-100 max-h-[90vh] overflow-y-auto space-y-4 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h2 className="text-base font-black text-slate-900">Direct Walk-In Check-In</h2>
                <p className="text-xs text-slate-500">Register a patient arriving at clinic reception.</p>
              </div>
              <button
                type="button"
                onClick={() => setIsWalkInModalOpen(false)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {modalError && (
              <div className="rounded-xl bg-red-50 p-3 text-xs text-red-700 font-semibold flex items-center gap-2">
                <AlertCircle className="h-4 w-4 shrink-0" />
                {modalError}
              </div>
            )}

            {modalSuccess && (
              <div className="rounded-xl bg-emerald-50 p-3 text-xs text-emerald-700 font-semibold flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 shrink-0" />
                {modalSuccess}
              </div>
            )}

            <form onSubmit={handleCreateWalkIn} className="space-y-4 text-xs">
              <div className="space-y-1">
                <Label className="text-xs">Select CSU Patient *</Label>
                <select
                  required
                  value={walkInData.patientId}
                  onChange={(e) => setWalkInData({ ...walkInData, patientId: e.target.value })}
                  className="w-full h-9 rounded-xl border border-slate-200 px-2.5 text-xs bg-white text-slate-800"
                >
                  <option value="" disabled>
                    -- Select CSU Patient --
                  </option>
                  {patients.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.idNumber} - {p.department})
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <Label className="text-xs">Chief Complaint / Reason for Visit</Label>
                <Input
                  required
                  placeholder="e.g. Fever, cough, asthma flare, blood pressure review"
                  value={walkInData.reason}
                  onChange={(e) => setWalkInData({ ...walkInData, reason: e.target.value })}
                  className="rounded-xl text-xs"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Assign Duty Doctor</Label>
                  <select
                    value={walkInData.providerId}
                    onChange={(e) => setWalkInData({ ...walkInData, providerId: e.target.value })}
                    className="w-full h-9 rounded-xl border border-slate-200 px-2.5 text-xs bg-white text-slate-800"
                  >
                    {doctors.map((d) => (
                      <option key={d.id} value={d.id}>
                        Dr. {d.firstName} {d.lastName} ({d.specialization || "General Medicine"})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <Label className="text-xs">Consultation Format</Label>
                  <div className="flex h-9 items-center rounded-xl border border-slate-200 bg-slate-50 px-3 text-xs font-semibold text-slate-700">
                    In-Person Clinic Visit
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2 rounded-xl bg-sky-50 p-3 text-xs text-[#0284c7] font-semibold">
                <input
                  type="checkbox"
                  id="directCheckIn"
                  checked={walkInData.isDirectCheckIn}
                  onChange={(e) => setWalkInData({ ...walkInData, isDirectCheckIn: e.target.checked })}
                  className="rounded border-sky-300 text-[#0284c7]"
                />
                <label htmlFor="directCheckIn" className="cursor-pointer">
                  Directly place patient into Waiting Room Lobby queue
                </label>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsWalkInModalOpen(false)}
                  className="rounded-xl text-xs cursor-pointer"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={modalLoading}
                  className="rounded-xl bg-[#0284c7] hover:bg-[#0369a1] text-xs font-bold text-white cursor-pointer"
                >
                  {modalLoading ? "Registering..." : "Confirm & Check In"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: TRIAGE ASSIGN DOCTOR & APPROVE */}
      {isTriageModalOpen && selectedAppointment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl border border-slate-100 max-h-[90vh] overflow-y-auto space-y-4 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h2 className="text-base font-black text-slate-900">Triage Approval & Doctor Assignment</h2>
                <p className="text-xs text-slate-500">Assign physician and confirm time slot.</p>
              </div>
              <button
                type="button"
                onClick={() => setIsTriageModalOpen(false)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {modalError && (
              <div className="rounded-xl bg-red-50 p-3 text-xs text-red-700 font-semibold flex items-center gap-2">
                <AlertCircle className="h-4 w-4 shrink-0" />
                {modalError}
              </div>
            )}

            {modalSuccess && (
              <div className="rounded-xl bg-emerald-50 p-3 text-xs text-emerald-700 font-semibold flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 shrink-0" />
                {modalSuccess}
              </div>
            )}

            <div className="rounded-xl bg-slate-50 p-3 text-xs space-y-1 border border-slate-100">
              <p className="font-bold text-slate-900">{selectedAppointment.patientName} ({selectedAppointment.idNumber})</p>
              <p className="text-slate-600">Reason: {selectedAppointment.reason}</p>
              {selectedAppointment.patientNotes && (
                <p className="text-slate-500 italic">"{selectedAppointment.patientNotes}"</p>
              )}
            </div>

            <form onSubmit={handleConfirmTriage} className="space-y-4 text-xs">
              <div className="space-y-1">
                <Label className="text-xs">Assign Duty Doctor</Label>
                <select
                  value={triageDoctorId}
                  onChange={(e) => setTriageDoctorId(e.target.value)}
                  className="w-full h-9 rounded-xl border border-slate-200 px-2.5 text-xs bg-white text-slate-800"
                >
                  {doctors.map((d) => (
                    <option key={d.id} value={d.id}>
                      Dr. {d.firstName} {d.lastName} ({d.specialization || "General Medicine"})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Confirmed Date</Label>
                  <Input
                    required
                    type="date"
                    value={triageDate}
                    onChange={(e) => setTriageDate(e.target.value)}
                    className="rounded-xl text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Confirmed Time</Label>
                  <Input
                    required
                    type="time"
                    value={triageTime}
                    onChange={(e) => setTriageTime(e.target.value)}
                    className="rounded-xl text-xs"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsTriageModalOpen(false)}
                  className="rounded-xl text-xs cursor-pointer"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={modalLoading}
                  className="rounded-xl bg-[#0284c7] hover:bg-[#0369a1] text-xs font-bold text-white cursor-pointer"
                >
                  {modalLoading ? "Confirming..." : "Approve & Schedule"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 3: DECLINE TRIAGE REQUEST */}
      {isDeclineModalOpen && selectedAppointment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl border border-slate-100 space-y-4 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h2 className="text-base font-black text-red-600">Decline Appointment Request</h2>
                <p className="text-xs text-slate-500">Provide reason for patient notification.</p>
              </div>
              <button
                type="button"
                onClick={() => setIsDeclineModalOpen(false)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {modalError && (
              <div className="rounded-xl bg-red-50 p-3 text-xs text-red-700 font-semibold flex items-center gap-2">
                <AlertCircle className="h-4 w-4 shrink-0" />
                {modalError}
              </div>
            )}

            <form onSubmit={handleDeclineTriage} className="space-y-4 text-xs">
              <div className="space-y-1">
                <Label className="text-xs">Reason for Declining</Label>
                <textarea
                  required
                  rows={3}
                  placeholder="e.g. Doctor is off-duty at this hour. Please re-book for tomorrow morning or visit the emergency triage."
                  value={declineReason}
                  onChange={(e) => setDeclineReason(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 p-2.5 text-xs text-slate-800"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsDeclineModalOpen(false)}
                  className="rounded-xl text-xs cursor-pointer"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={modalLoading}
                  className="rounded-xl bg-red-600 hover:bg-red-700 text-xs font-bold text-white cursor-pointer"
                >
                  {modalLoading ? "Declining..." : "Decline Request"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 4: DOCTOR CLINICAL CONSULTATION ROOM (SOAP NOTES & RX) */}
      {isConsultModalOpen && selectedAppointment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
          <div className="w-full max-w-4xl rounded-2xl bg-white p-6 shadow-2xl border border-slate-100 max-h-[92vh] overflow-y-auto space-y-5 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-100 text-emerald-800 font-black">
                  <Stethoscope className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-base font-black text-slate-900">
                    Clinical Consultation Room: {selectedAppointment.patientName}
                  </h2>
                  <p className="text-xs text-slate-500">
                    ID: {selectedAppointment.idNumber} • {selectedAppointment.department} • Chief Complaint: {selectedAppointment.reason}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setIsConsultModalOpen(false)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {modalError && (
              <div className="rounded-xl bg-red-50 p-3 text-xs text-red-700 font-semibold flex items-center gap-2">
                <AlertCircle className="h-4 w-4 shrink-0" />
                {modalError}
              </div>
            )}

            {modalSuccess && (
              <div className="rounded-xl bg-emerald-50 p-3 text-xs text-emerald-700 font-semibold flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 shrink-0" />
                {modalSuccess}
              </div>
            )}

            {/* Patient Clinical Profile Strip */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 rounded-xl bg-slate-50 p-3 text-xs border border-slate-100">
              <div>
                <span className="text-[10px] text-slate-400 font-bold uppercase">Medical Conditions</span>
                <p className="font-semibold text-slate-800">
                  {selectedAppointment.medicalConditions || "None recorded"}
                </p>
              </div>
              <div>
                <span className="text-[10px] text-slate-400 font-bold uppercase">Known Drug Allergies</span>
                <p
                  className={`font-semibold ${
                    hasDocumentedDrugAllergy(selectedAppointment.allergies)
                      ? "text-red-600"
                      : "text-slate-700"
                  }`}
                >
                  {selectedAppointment.allergies || "Not screened yet"}
                </p>
              </div>
              <div>
                <span className="text-[10px] text-slate-400 font-bold uppercase">Attending Physician</span>
                <p className="font-semibold text-[#0284c7]">
                  {selectedAppointment.providerName || currentUserName}
                </p>
              </div>
            </div>

            <form onSubmit={handleCompleteConsult} className="space-y-5 text-xs">
              {/* Structured Vital Signs (Empty by Default — No Fabricated Readings) */}
              <div className="space-y-2.5 rounded-2xl border border-slate-200/80 bg-slate-50/50 p-3.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Activity className="h-4 w-4 text-emerald-600" />
                    <h3 className="font-black text-slate-900">Vital Signs (Optional)</h3>
                  </div>
                  <span className="text-[10px] text-slate-400 font-medium">
                    Leave blank if not measured
                  </span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
                  <div className="space-y-1">
                    <Label className="text-[10px] text-slate-500">BP (mmHg)</Label>
                    <Input
                      placeholder="e.g. 120/80"
                      value={vitals.bp}
                      onChange={(e) => setVitals({ ...vitals, bp: e.target.value })}
                      className="h-8 rounded-lg text-xs bg-white font-mono"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[10px] text-slate-500">HR (bpm)</Label>
                    <Input
                      placeholder="e.g. 74"
                      value={vitals.hr}
                      onChange={(e) => setVitals({ ...vitals, hr: e.target.value })}
                      className="h-8 rounded-lg text-xs bg-white font-mono"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[10px] text-slate-500">Temp (°C)</Label>
                    <Input
                      placeholder="e.g. 36.8"
                      value={vitals.temp}
                      onChange={(e) => setVitals({ ...vitals, temp: e.target.value })}
                      className="h-8 rounded-lg text-xs bg-white font-mono"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[10px] text-slate-500">SpO2 (%)</Label>
                    <Input
                      placeholder="e.g. 98"
                      value={vitals.spo2}
                      onChange={(e) => setVitals({ ...vitals, spo2: e.target.value })}
                      className="h-8 rounded-lg text-xs bg-white font-mono"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[10px] text-slate-500">Weight (kg)</Label>
                    <Input
                      placeholder="e.g. 58"
                      value={vitals.weight}
                      onChange={(e) => setVitals({ ...vitals, weight: e.target.value })}
                      className="h-8 rounded-lg text-xs bg-white font-mono"
                    />
                  </div>
                </div>
              </div>

              {/* SOAP Notes Section */}
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <FileText className="h-4 w-4 text-[#0284c7]" />
                  <h3 className="font-black text-slate-900">Document Clinical SOAP Notes</h3>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs font-bold text-slate-700">Subjective (Symptoms / History)</Label>
                    <textarea
                      rows={2}
                      placeholder="Enter patient symptoms, onset, duration, and history..."
                      value={soapNotes.subjective}
                      onChange={(e) => setSoapNotes({ ...soapNotes, subjective: e.target.value })}
                      className="w-full rounded-xl border border-slate-200 p-2.5 text-xs text-slate-800"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs font-bold text-slate-700">Objective (Physical Exam Findings)</Label>
                    <textarea
                      rows={2}
                      placeholder="Enter physical examination findings..."
                      value={soapNotes.objective}
                      onChange={(e) => setSoapNotes({ ...soapNotes, objective: e.target.value })}
                      className="w-full rounded-xl border border-slate-200 p-2.5 text-xs text-slate-800"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs font-bold text-slate-700">Assessment (Diagnosis / Impression)</Label>
                    <textarea
                      rows={2}
                      placeholder="Enter clinical impression or working diagnosis..."
                      value={soapNotes.assessment}
                      onChange={(e) => setSoapNotes({ ...soapNotes, assessment: e.target.value })}
                      className="w-full rounded-xl border border-slate-200 p-2.5 text-xs text-slate-800"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs font-bold text-slate-700">Plan (Treatment &amp; Follow-up)</Label>
                    <textarea
                      rows={2}
                      placeholder="Enter treatment plan, counseling, and follow-up instructions..."
                      value={soapNotes.plan}
                      onChange={(e) => setSoapNotes({ ...soapNotes, plan: e.target.value })}
                      className="w-full rounded-xl border border-slate-200 p-2.5 text-xs text-slate-800"
                    />
                  </div>
                </div>
              </div>

              {/* Prescribe Medication Integration */}
              <div className="rounded-2xl border border-sky-100 bg-sky-50/40 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Pill className="h-4 w-4 text-[#0284c7]" />
                    <h3 className="font-black text-slate-900">Direct Prescription from Clinic Stock</h3>
                  </div>

                  <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-[#0284c7]">
                    <input
                      type="checkbox"
                      checked={prescribeMed}
                      onChange={(e) => setPrescribeMed(e.target.checked)}
                      className="rounded border-sky-300 accent-[#0284c7]"
                    />
                    Issue New Prescription
                  </label>
                </div>

                {prescribeMed && (
                  <div className="space-y-3 pt-2 border-t border-sky-100/80 animate-in fade-in">
                    {/* Real-Time Allergy Contraindication Alert */}
                    {consultAllergyConflict.hasConflict && (
                      <div className="rounded-xl border-2 border-red-400 bg-red-50 p-3.5 space-y-2 text-xs text-red-900">
                        <div className="flex items-start gap-2">
                          <ShieldAlert className="h-5 w-5 text-red-600 shrink-0 mt-0.5" />
                          <div>
                            <p className="font-black text-red-800 uppercase tracking-wide text-[11px]">
                              Drug-Allergy Contraindication Alert
                            </p>
                            <p className="mt-0.5 leading-relaxed font-medium">
                              {consultAllergyConflict.warningMessage}
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
                            prescribe this medication.
                          </span>
                        </label>
                      </div>
                    )}

                    {/* Live Clinic Stock Picker */}
                    <div className="space-y-1">
                      <Label className="text-[11px] text-slate-600 font-semibold">
                        Pick from Available Clinic Pharmacy Inventory (Optional):
                      </Label>
                      <select
                        value={rxData.inventoryId}
                        onChange={(e) => handleInventoryPick(e.target.value)}
                        className="w-full h-9 rounded-xl border border-slate-200 px-2.5 text-xs bg-white text-slate-800 font-medium"
                      >
                        <option value="">
                          -- Optional: select clinic stock to auto-fill medication --
                        </option>
                        {inventoryList.map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.name} {item.brandName ? `(${item.brandName})` : ""} - {item.strength} [{item.form}] (Stock: {item.currentStock})
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                      <div className="space-y-1">
                        <Label className="text-[11px]">Medication Name *</Label>
                        <Input
                          required={prescribeMed}
                          placeholder="e.g. Paracetamol"
                          value={rxData.name}
                          onChange={(e) => setRxData({ ...rxData, name: e.target.value })}
                          className="rounded-xl text-xs bg-white"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[11px]">Dosage *</Label>
                        <Input
                          required={prescribeMed}
                          placeholder="e.g. 500 mg"
                          value={rxData.dosage}
                          onChange={(e) => setRxData({ ...rxData, dosage: e.target.value })}
                          className="rounded-xl text-xs bg-white"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[11px]">Form</Label>
                        <select
                          value={rxData.form}
                          onChange={(e) => setRxData({ ...rxData, form: e.target.value })}
                          className="w-full h-9 rounded-xl border border-slate-200 px-2 text-xs bg-white text-slate-800"
                        >
                          {DOSAGE_FORMS.map((f) => (
                            <option key={f} value={f}>
                              {f}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[11px]">Duration (Days)</Label>
                        <Input
                          type="number"
                          min={1}
                          max={90}
                          value={rxData.durationDays}
                          onChange={(e) => setRxData({ ...rxData, durationDays: Number(e.target.value) })}
                          className="rounded-xl text-xs bg-white"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <Label className="text-[11px]">Dosing Frequency</Label>
                        <select
                          value={rxData.frequency}
                          onChange={(e) => {
                            const nextFreq = e.target.value;
                            setRxData({
                              ...rxData,
                              frequency: nextFreq,
                              scheduleTimes: FREQUENCY_PRESETS[nextFreq] || rxData.scheduleTimes,
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
                        <Label className="text-[11px]">Schedule Times</Label>
                        <Input
                          value={rxData.scheduleTimes}
                          onChange={(e) => setRxData({ ...rxData, scheduleTimes: e.target.value })}
                          placeholder="e.g. 08:00 AM, 08:00 PM"
                          className="rounded-xl text-xs bg-white font-mono"
                        />
                      </div>
                    </div>

                    <div className="space-y-1">
                      <Label className="text-[11px]">Dosage Instructions (Sig.)</Label>
                      <Input
                        placeholder="e.g. Take 1 tablet after meals with a full glass of water"
                        value={rxData.instructions}
                        onChange={(e) => setRxData({ ...rxData, instructions: e.target.value })}
                        className="rounded-xl text-xs bg-white"
                      />
                    </div>

                    {/* Direct Dispensing from Clinic Stock */}
                    {rxData.inventoryId && (
                      <div className="pt-2 border-t border-sky-200/60 space-y-2 bg-white/60 p-2.5 rounded-xl">
                        <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-[#0284c7]">
                          <input
                            type="checkbox"
                            checked={rxData.dispenseFromStock}
                            onChange={(e) =>
                              setRxData({ ...rxData, dispenseFromStock: e.target.checked })
                            }
                            className="rounded border-sky-300 accent-[#0284c7]"
                          />
                          Hand over initial medication supply from clinic stock to patient now
                        </label>

                        {rxData.dispenseFromStock && (
                          <div className="flex items-center gap-2 pt-1">
                            <Label className="text-[11px] text-slate-600 whitespace-nowrap">Units to Dispense:</Label>
                            <Input
                              type="number"
                              min={1}
                              max={inventoryList.find((i) => i.id === rxData.inventoryId)?.currentStock || 100}
                              value={rxData.dispenseQuantity}
                              onChange={(e) =>
                                setRxData({ ...rxData, dispenseQuantity: Number(e.target.value) })
                              }
                              className="w-24 h-8 rounded-lg text-xs bg-white"
                            />
                            <span className="text-[10px] text-slate-500">
                              (Stock: {inventoryList.find((i) => i.id === rxData.inventoryId)?.currentStock ?? 0} units available)
                            </span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsConsultModalOpen(false)}
                  className="rounded-xl text-xs cursor-pointer"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={
                    modalLoading ||
                    (prescribeMed &&
                      consultAllergyConflict.hasConflict &&
                      !allergyOverrideConfirmed)
                  }
                  className="rounded-xl bg-emerald-600 hover:bg-emerald-700 text-xs font-black text-white cursor-pointer shadow-xs gap-1.5"
                >
                  <CheckCircle2 className="h-4 w-4" />
                  {modalLoading ? "Saving..." : "Complete Consultation & Save Record"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 5: VIEW CLINICAL NOTES MODAL */}
      {isViewNotesModalOpen && selectedAppointment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl border border-slate-100 space-y-4 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h2 className="text-base font-black text-slate-900">Clinical Consultation Notes</h2>
                <p className="text-xs text-slate-500">
                  {selectedAppointment.patientName} ({selectedAppointment.idNumber})
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsViewNotesModalOpen(false)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="rounded-xl bg-slate-50 p-4 text-xs text-slate-800 font-mono whitespace-pre-line border border-slate-100">
              {selectedAppointment.clinicalNotes || "No notes recorded for this consultation."}
            </div>

            <div className="flex justify-end pt-2 border-t border-slate-100">
              <Button
                variant="outline"
                onClick={() => setIsViewNotesModalOpen(false)}
                className="rounded-xl text-xs cursor-pointer"
              >
                Close
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
