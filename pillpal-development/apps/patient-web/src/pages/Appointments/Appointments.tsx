import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  Calendar,
  ChevronLeft,
  ChevronRight,
  Plus,
  UserCheck,
  CheckCircle2,
  AlertCircle,
  FileText,
  X,
  Send,
  Building,
  Printer,
} from "lucide-react";
import { fetchWithAuth } from "@/lib/api";
import { getTodayIsoDate } from "@/lib/registration";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type AppointmentStatus =
  | "PENDING"
  | "CONFIRMED"
  | "WAITING"
  | "IN_PROGRESS"
  | "COMPLETED"
  | "REJECTED"
  | "CANCELLED"
  | "NO_SHOW";

type AppointmentItem = {
  id: string;
  providerName: string;
  providerSpecialization: string;
  scheduledAt: string;
  requestedDate: string | null;
  reason: string;
  type: "IN_PERSON" | "TELEHEALTH";
  status: AppointmentStatus;
  patientNotes: string | null;
  clinicalNotes: string | null;
  rejectionReason: string | null;
  cancellationReason: string | null;
  telehealthUrl: string | null;
  checkedInAt: string | null;
  createdAt: string;
};

const TIME_SLOTS = [
  { value: "08:30 AM", label: "08:30 AM - Morning" },
  { value: "09:30 AM", label: "09:30 AM - Morning" },
  { value: "10:30 AM", label: "10:30 AM - Morning" },
  { value: "01:30 PM", label: "01:30 PM - Afternoon" },
  { value: "02:30 PM", label: "02:30 PM - Afternoon" },
  { value: "03:30 PM", label: "03:30 PM - Afternoon" },
] as const;

const WEEKDAY_HEADERS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"] as const;

function toLocalIsoDate(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function getDefaultClinicWeekdayIso(): string {
  const d = new Date();
  while (d.getDay() === 0 || d.getDay() === 6) {
    d.setDate(d.getDate() + 1);
  }
  return toLocalIsoDate(d);
}

function formatReadableDate(iso: string): string {
  const [y, m, day] = iso.split("-").map(Number);
  if (!y || !m || !day) return iso;
  return new Date(y, m - 1, day).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

type CalendarCell = {
  key: string;
  iso: string;
  day: number;
  isToday: boolean;
  isWeekend: boolean;
  isDisabled: boolean;
} | null;

function buildCalendarWeeks(year: number, month: number): CalendarCell[][] {
  const todayIso = toLocalIsoDate(new Date());
  const firstDayOfWeek = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const cells: CalendarCell[] = [];
  for (let i = 0; i < firstDayOfWeek; i++) {
    cells.push(null);
  }
  for (let day = 1; day <= daysInMonth; day++) {
    const dt = new Date(year, month, day);
    const iso = toLocalIsoDate(dt);
    const dow = dt.getDay();
    const isWeekend = dow === 0 || dow === 6;
    const isPast = iso < todayIso;
    cells.push({
      key: iso,
      iso,
      day,
      isToday: iso === todayIso,
      isWeekend,
      isDisabled: isPast || isWeekend,
    });
  }
  while (cells.length % 7 !== 0) {
    cells.push(null);
  }

  const weeks: CalendarCell[][] = [];
  for (let i = 0; i < cells.length; i += 7) {
    weeks.push(cells.slice(i, i + 7));
  }
  return weeks;
}

function combineDateAndTime(isoDate: string, timeLabel: string): Date {
  const match = timeLabel.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  let hours = 8;
  let minutes = 30;
  if (match && match[1] && match[2] && match[3]) {
    hours = parseInt(match[1], 10);
    minutes = parseInt(match[2], 10);
    const period = match[3].toUpperCase();
    if (period === "PM" && hours < 12) hours += 12;
    if (period === "AM" && hours === 12) hours = 0;
  }
  const [y, m, day] = isoDate.split("-").map((v) => parseInt(v, 10));
  return new Date(y || 2026, (m || 1) - 1, day || 1, hours, minutes, 0, 0);
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function Appointments() {
  const location = useLocation();
  const navigate = useNavigate();

  const [appointments, setAppointments] = useState<AppointmentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"confirmed" | "pending" | "history">("confirmed");
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  // Request Consultation Modal
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalLoading, setModalLoading] = useState(false);
  const [modalError, setModalError] = useState("");
  const [modalSuccess, setModalSuccess] = useState("");

  const defaultWeekdayIso = useMemo(() => getDefaultClinicWeekdayIso(), []);

  const [formData, setFormData] = useState({
    preferredDate: defaultWeekdayIso,
    preferredTime: "08:30 AM",
    reason: "",
    notes: "",
  });

  const [calendarMonth, setCalendarMonth] = useState(() => {
    const [y, m] = defaultWeekdayIso.split("-").map(Number);
    return { year: y || new Date().getFullYear(), month: (m || 1) - 1 };
  });

  const calendarWeeks = useMemo(
    () => buildCalendarWeeks(calendarMonth.year, calendarMonth.month),
    [calendarMonth.year, calendarMonth.month],
  );

  const monthTitle = useMemo(
    () =>
      new Date(calendarMonth.year, calendarMonth.month, 1).toLocaleDateString("en-US", {
        month: "long",
        year: "numeric",
      }),
    [calendarMonth.year, calendarMonth.month],
  );

  const todayNow = new Date();
  const canGoPrevMonth =
    calendarMonth.year > todayNow.getFullYear() ||
    (calendarMonth.year === todayNow.getFullYear() &&
      calendarMonth.month > todayNow.getMonth());

  function stepCalendarMonth(delta: number) {
    setCalendarMonth((prev) => {
      const next = new Date(prev.year, prev.month + delta, 1);
      return { year: next.getFullYear(), month: next.getMonth() };
    });
  }

  // Cancel Appointment Modal
  const [isCancelModalOpen, setIsCancelModalOpen] = useState(false);
  const [selectedAppointment, setSelectedAppointment] = useState<AppointmentItem | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelLoading, setCancelLoading] = useState(false);

  // View Clinical Notes Modal
  const [isNotesModalOpen, setIsNotesModalOpen] = useState(false);
  const [viewNotesAppointment, setViewNotesAppointment] = useState<AppointmentItem | null>(null);

  async function loadAppointments() {
    setLoading(true);
    try {
      const res = await fetchWithAuth("/appointments");
      if (res.ok) {
        const data = await res.json();
        setAppointments(data);
      }
    } catch (err) {
      console.error("Failed to load patient appointments:", err);
      setActionError("Unable to load appointments right now.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadAppointments();
  }, []);

  // Consume medication refill handoff from Medications page
  useEffect(() => {
    const state = location.state as { prefillReason?: string } | null;
    if (state?.prefillReason) {
      setFormData((prev) => ({
        ...prev,
        reason: state.prefillReason!,
      }));
      setModalError("");
      setModalSuccess("");
      setIsModalOpen(true);
      navigate(location.pathname, { replace: true, state: {} });
    }
  }, [location.state, location.pathname, navigate]);

  async function handleCreateRequest(e: React.FormEvent) {
    e.preventDefault();
    setModalError("");
    setModalSuccess("");

    if (!formData.preferredDate) {
      setModalError("Please select a preferred consultation date.");
      return;
    }

    const dayCheck = new Date(`${formData.preferredDate}T12:00:00`);
    if (isNaN(dayCheck.getTime())) {
      setModalError("Please select a valid consultation date.");
      return;
    }

    if (formData.preferredDate < getTodayIsoDate()) {
      setModalError("Consultation date cannot be in the past.");
      return;
    }

    if (dayCheck.getDay() === 0 || dayCheck.getDay() === 6) {
      setModalError(
        "CSU Health Center consultations are open Monday to Friday (8:00 AM – 5:00 PM). Please pick a weekday.",
      );
      return;
    }

    setModalLoading(true);
    try {
      const scheduledDate = combineDateAndTime(formData.preferredDate, formData.preferredTime);
      const res = await fetchWithAuth("/appointments", {
        method: "POST",
        body: JSON.stringify({
          scheduledAt: scheduledDate.toISOString(),
          requestedDate: formData.preferredDate,
          reason: formData.reason.trim(),
          type: "IN_PERSON",
          patientNotes: formData.notes.trim()
            ? `${formData.notes.trim()} (Preferred Time: ${formData.preferredTime})`
            : `Preferred Time: ${formData.preferredTime}`,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.message || "Failed to submit appointment request.");
      }

      setModalSuccess("Appointment request submitted for CSU clinic triage!");
      setTimeout(() => {
        setModalSuccess("");
        setIsModalOpen(false);
        setFormData({
          preferredDate: getDefaultClinicWeekdayIso(),
          preferredTime: "08:30 AM",
          reason: "",
          notes: "",
        });
        setActiveTab("pending");
        void loadAppointments();
      }, 1100);
    } catch (err: any) {
      setModalError(err?.message || "Failed to submit request.");
    } finally {
      setModalLoading(false);
    }
  }

  async function handleLobbyCheckIn(aptId: string) {
    setActionError(null);
    setActionSuccess(null);
    try {
      const res = await fetchWithAuth(`/appointments/${aptId}/check-in`, {
        method: "POST",
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.message || "Unable to check in right now.");
      }
      setActionSuccess("Lobby check-in recorded. The CSU triage nurse has been notified.");
      setTimeout(() => setActionSuccess(null), 3500);
      void loadAppointments();
    } catch (err: any) {
      setActionError(err?.message || "Failed to check in. Please notify the clinic desk.");
    }
  }

  async function handleCancelAppointment(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedAppointment) return;
    setCancelLoading(true);
    setActionError(null);

    try {
      const res = await fetchWithAuth(`/appointments/${selectedAppointment.id}/cancel`, {
        method: "POST",
        body: JSON.stringify({
          cancellationReason: cancelReason.trim() || "Cancelled by patient.",
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.message || "Unable to cancel this appointment.");
      }

      setIsCancelModalOpen(false);
      setCancelReason("");
      setActionSuccess("Appointment cancelled.");
      setTimeout(() => setActionSuccess(null), 3000);
      void loadAppointments();
    } catch (err: any) {
      setActionError(err?.message || "Cancellation failed.");
    } finally {
      setCancelLoading(false);
    }
  }

  function handlePrintConsultationSummary(apt: AppointmentItem) {
    const win = window.open("", "_blank", "width=760,height=640");
    if (!win) return;

    win.document.write(`
      <!doctype html>
      <html>
        <head>
          <title>CSU University Center for Health and Wellness — Consultation Summary</title>
          <style>
            body { font-family: system-ui, -apple-system, sans-serif; color: #0f172a; padding: 28px; }
            .head { border-bottom: 2px solid #059669; padding-bottom: 12px; margin-bottom: 18px; }
            h1 { margin: 0; font-size: 18px; color: #065f46; }
            .sub { font-size: 12px; color: #475569; margin-top: 4px; }
            .meta { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 14px; font-size: 12px; margin-bottom: 16px; }
            .notes { border: 1px solid #cbd5e1; border-radius: 10px; padding: 16px; font-family: ui-monospace, SFMono-Regular, monospace; font-size: 12px; white-space: pre-line; background: #ffffff; line-height: 1.6; }
            .footer { margin-top: 20px; font-size: 11px; color: #64748b; border-top: 1px solid #e2e8f0; padding-top: 10px; }
          </style>
        </head>
        <body>
          <div class="head">
            <h1>CSU University Center for Health and Wellness</h1>
            <div class="sub">Patient Consultation Summary</div>
          </div>
          <div class="meta">
            <div><strong>Attending Physician:</strong> ${escapeHtml(apt.providerName || "CSU Physician")}</div>
            <div><strong>Specialization:</strong> ${escapeHtml(apt.providerSpecialization || "General Medicine")}</div>
            <div><strong>Visit Date:</strong> ${escapeHtml(new Date(apt.scheduledAt).toLocaleString())}</div>
            <div><strong>Format:</strong> In-Person Clinic Visit</div>
            <div style="grid-column: span 2;"><strong>Chief Complaint:</strong> ${escapeHtml(apt.reason)}</div>
          </div>
          <div class="notes">${escapeHtml(apt.clinicalNotes || "No detailed clinical notes recorded for this consultation.")}</div>
          <div class="footer">CSU Health Infirmary • (085) 341-2786 • Printed ${escapeHtml(new Date().toLocaleString())}</div>
        </body>
      </html>
    `);
    win.document.close();
    win.focus();
    win.print();
  }

  const confirmedList = appointments.filter(
    (a) => a.status === "CONFIRMED" || a.status === "WAITING" || a.status === "IN_PROGRESS",
  );
  const pendingList = appointments.filter((a) => a.status === "PENDING");
  const historyList = appointments.filter(
    (a) =>
      a.status === "COMPLETED" ||
      a.status === "REJECTED" ||
      a.status === "CANCELLED" ||
      a.status === "NO_SHOW",
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-slate-900">
            Clinic Appointments &amp; Consultations
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Book in-person visits at CSU Infirmary, check in at the clinic lobby, and view
            completed medical notes.
          </p>
        </div>

        <Button
          onClick={() => {
            setModalError("");
            setModalSuccess("");
            setIsModalOpen(true);
          }}
          className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-xs gap-1.5 cursor-pointer"
        >
          <Plus className="h-4 w-4" />
          Request New Consultation
        </Button>
      </div>

      {actionSuccess && (
        <div className="rounded-2xl bg-emerald-50 border border-emerald-200 p-3.5 text-xs font-semibold text-emerald-800 flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
          <span>{actionSuccess}</span>
        </div>
      )}

      {actionError && (
        <div className="rounded-2xl bg-red-50 border border-red-200 p-3.5 text-xs font-semibold text-red-700 flex items-center gap-2">
          <AlertCircle className="h-4 w-4 text-red-600 shrink-0" />
          <span>{actionError}</span>
        </div>
      )}

      {/* Tabs */}
      <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-2xl w-full sm:w-fit">
        <button
          type="button"
          onClick={() => setActiveTab("confirmed")}
          className={`flex-1 sm:flex-initial px-4 py-2 text-xs font-bold rounded-xl transition-all cursor-pointer ${
            activeTab === "confirmed"
              ? "bg-white text-slate-900 shadow-xs"
              : "text-slate-500 hover:text-slate-800"
          }`}
        >
          Upcoming Confirmed ({confirmedList.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("pending")}
          className={`flex-1 sm:flex-initial px-4 py-2 text-xs font-bold rounded-xl transition-all cursor-pointer ${
            activeTab === "pending"
              ? "bg-white text-slate-900 shadow-xs"
              : "text-slate-500 hover:text-slate-800"
          }`}
        >
          Pending Triage ({pendingList.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("history")}
          className={`flex-1 sm:flex-initial px-4 py-2 text-xs font-bold rounded-xl transition-all cursor-pointer ${
            activeTab === "history"
              ? "bg-white text-slate-900 shadow-xs"
              : "text-slate-500 hover:text-slate-800"
          }`}
        >
          History &amp; Completed ({historyList.length})
        </button>
      </div>

      {/* Tab 1: Upcoming Confirmed */}
      {activeTab === "confirmed" && (
        <div className="space-y-4">
          {loading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 animate-pulse">
              <div className="h-48 rounded-3xl bg-white border border-slate-200/80" />
              <div className="h-48 rounded-3xl bg-white border border-slate-200/80" />
            </div>
          ) : confirmedList.length === 0 ? (
            <Card className="rounded-3xl border border-slate-200/80 p-12 text-center bg-white space-y-3">
              <Calendar className="h-10 w-10 text-slate-300 mx-auto" />
              <h3 className="text-sm font-black text-slate-700">No Upcoming Appointments</h3>
              <p className="text-xs text-slate-400 max-w-sm mx-auto">
                You have no scheduled consultations. Click &quot;Request New Consultation&quot; to
                book an appointment with CSU Clinic.
              </p>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {confirmedList.map((apt) => (
                <Card
                  key={apt.id}
                  className="rounded-3xl border border-slate-200/80 bg-white shadow-xs p-5 flex flex-col justify-between"
                >
                  <div className="space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2.5">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700">
                          <Building className="h-5 w-5" />
                        </div>
                        <div>
                          <h3 className="text-sm font-black text-slate-900">
                            {apt.providerName || "Assigned CSU Doctor"}
                          </h3>
                          <span className="text-[11px] font-bold text-emerald-700">
                            {apt.providerSpecialization || "General Medicine"}
                          </span>
                        </div>
                      </div>

                      <span
                        className={`rounded-full px-2.5 py-0.5 text-[10px] font-black shrink-0 ${
                          apt.status === "WAITING"
                            ? "bg-amber-100 text-amber-800"
                            : apt.status === "IN_PROGRESS"
                              ? "bg-emerald-100 text-emerald-800"
                              : "bg-sky-100 text-[#0369a1]"
                        }`}
                      >
                        {apt.status === "WAITING"
                          ? "Waiting in Lobby"
                          : apt.status === "IN_PROGRESS"
                            ? "In Consultation"
                            : apt.status}
                      </span>
                    </div>

                    <div className="bg-slate-50 p-3 rounded-2xl border border-slate-100 text-xs space-y-1">
                      <p className="font-bold text-slate-800">Reason: &quot;{apt.reason}&quot;</p>
                      <p className="font-mono text-[11px] text-[#0284c7] font-bold">
                        Scheduled: {new Date(apt.scheduledAt).toLocaleString()}
                      </p>
                    </div>
                  </div>

                  <div className="pt-4 mt-3 border-t border-slate-100 flex items-center justify-between gap-2">
                    {apt.status !== "IN_PROGRESS" ? (
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedAppointment(apt);
                          setCancelReason("");
                          setIsCancelModalOpen(true);
                        }}
                        className="text-xs font-bold text-red-600 hover:text-red-700 cursor-pointer"
                      >
                        Cancel Visit
                      </button>
                    ) : (
                      <span className="text-[11px] font-semibold text-emerald-700">
                        Session in progress
                      </span>
                    )}

                    <div className="flex items-center gap-2">
                      {apt.status === "WAITING" ? (
                        <span className="text-[11px] font-bold text-amber-700 bg-amber-50 px-2.5 py-1 rounded-lg border border-amber-200">
                          Checked In • Awaiting Call
                        </span>
                      ) : apt.status === "IN_PROGRESS" ? (
                        <span className="text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-200">
                          Consultation Active
                        </span>
                      ) : (
                        <Button
                          size="sm"
                          onClick={() => handleLobbyCheckIn(apt.id)}
                          className="bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs rounded-xl shadow-xs gap-1 cursor-pointer"
                        >
                          <UserCheck className="h-4 w-4" />
                          I Have Arrived
                        </Button>
                      )}
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Tab 2: Pending Triage */}
      {activeTab === "pending" && (
        <div className="space-y-4">
          {pendingList.length === 0 ? (
            <Card className="rounded-3xl border border-slate-200/80 p-12 text-center bg-white space-y-2">
              <p className="text-xs text-slate-400">No pending consultation requests.</p>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {pendingList.map((apt) => (
                <Card
                  key={apt.id}
                  className="rounded-3xl border border-slate-200/80 bg-white p-5 space-y-3"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <span className="text-[10px] font-extrabold uppercase tracking-wider text-amber-800 bg-amber-50 px-2.5 py-0.5 rounded-full border border-amber-200">
                        Awaiting Clinic Staff Triage
                      </span>
                      <h3 className="text-sm font-black text-slate-900 mt-2">{apt.reason}</h3>
                    </div>
                    <span className="text-[10px] font-bold text-slate-400">
                      IN-PERSON
                    </span>
                  </div>

                  <div className="bg-slate-50 p-3 rounded-2xl border border-slate-100 text-xs space-y-1">
                    <p className="text-slate-600">
                      Requested for:{" "}
                      <span className="font-bold text-slate-900 font-mono">
                        {new Date(apt.scheduledAt).toLocaleString([], {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    </p>
                    {apt.patientNotes && (
                      <p className="text-[11px] text-slate-500 italic">&quot;{apt.patientNotes}&quot;</p>
                    )}
                  </div>

                  <div className="pt-2 flex justify-end">
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedAppointment(apt);
                        setCancelReason("");
                        setIsCancelModalOpen(true);
                      }}
                      className="text-xs font-bold text-red-600 hover:text-red-700 cursor-pointer"
                    >
                      Withdraw Request
                    </button>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Tab 3: History & Completed */}
      {activeTab === "history" && (
        <div className="space-y-4">
          {historyList.length === 0 ? (
            <Card className="rounded-3xl border border-slate-200/80 p-12 text-center bg-white space-y-2">
              <p className="text-xs text-slate-400">No past consultations recorded.</p>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {historyList.map((apt) => (
                <Card
                  key={apt.id}
                  className="rounded-3xl border border-slate-200/80 bg-white p-5 space-y-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h3 className="text-sm font-black text-slate-900">{apt.reason}</h3>
                      <p className="text-xs text-slate-500">
                        {apt.providerName || "CSU Physician"}
                      </p>
                    </div>
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-[10px] font-black shrink-0 ${
                        apt.status === "COMPLETED"
                          ? "bg-emerald-100 text-emerald-800"
                          : apt.status === "NO_SHOW"
                            ? "bg-rose-100 text-rose-800 border border-rose-200"
                            : apt.status === "CANCELLED"
                              ? "bg-amber-100 text-amber-900 border border-amber-200"
                              : "bg-red-100 text-red-800"
                      }`}
                    >
                      {apt.status === "NO_SHOW"
                        ? "NO-SHOW"
                        : apt.status === "CANCELLED"
                          ? "CANCELLED"
                          : apt.status}
                    </span>
                  </div>

                  <div className="text-xs text-slate-500 font-mono">
                    Scheduled: {new Date(apt.scheduledAt).toLocaleDateString()} at{" "}
                    {new Date(apt.scheduledAt).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </div>

                  {apt.status === "COMPLETED" && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setViewNotesAppointment(apt);
                        setIsNotesModalOpen(true);
                      }}
                      className="w-full text-xs font-bold gap-1.5 rounded-xl text-[#0284c7] border-sky-200 hover:bg-sky-50 cursor-pointer"
                    >
                      <FileText className="h-3.5 w-3.5" />
                      View Doctor&apos;s Consultation Summary
                    </Button>
                  )}

                  {apt.status === "REJECTED" && apt.rejectionReason && (
                    <p className="text-xs text-red-700 bg-red-50 p-2.5 rounded-xl border border-red-100 font-medium">
                      Decline Reason: {apt.rejectionReason}
                    </p>
                  )}

                  {(apt.status === "CANCELLED" || apt.status === "NO_SHOW") && (
                    <div className="text-xs text-amber-800 bg-amber-50/80 p-2.5 rounded-xl border border-amber-200 space-y-0.5">
                      <p className="font-bold text-[11px]">
                        {apt.status === "NO_SHOW" ? "Attendance Note:" : "Cancellation Note:"}
                      </p>
                      <p className="text-slate-600 text-[11px]">
                        {apt.cancellationReason ||
                          (apt.status === "NO_SHOW"
                            ? "Patient did not arrive for the scheduled appointment."
                            : "Appointment was cancelled.")}
                      </p>
                    </div>
                  )}
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {/* REQUEST CONSULTATION MODAL */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
          <div className="w-full max-w-lg rounded-3xl bg-white p-6 shadow-2xl border border-slate-100 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h2 className="text-base font-black text-slate-900">
                  Request Clinic Consultation
                </h2>
                <p className="text-xs text-slate-500">
                  Book an in-person visit at CSU Health Center (Mon–Fri, 8AM–5PM).
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

            <form onSubmit={handleCreateRequest} className="space-y-4 text-xs">
              <div className="flex items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50/60 p-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white text-emerald-600 shadow-2xs">
                  <Building className="h-4 w-4" />
                </div>
                <div>
                  <p className="text-xs font-black text-emerald-950">In-Person Visit</p>
                  <p className="text-[10px] text-emerald-800/80">
                    CSU Campus Infirmary • Walk-in Lobby Triage
                  </p>
                </div>
              </div>

              {/* Weekday-Only Interactive Month Calendar (Matching Patient Mobile) */}
              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-slate-700">
                  Preferred Date (Clinic Weekdays Mon–Fri)
                </Label>
                <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-3.5 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <button
                      type="button"
                      disabled={!canGoPrevMonth}
                      onClick={() => stepCalendarMonth(-1)}
                      aria-label="Previous month"
                      className={`flex h-8 w-8 items-center justify-center rounded-xl border transition-colors ${
                        canGoPrevMonth
                          ? "border-slate-200 bg-white text-slate-700 hover:bg-slate-100 cursor-pointer"
                          : "border-slate-100 bg-slate-100/70 text-slate-300 cursor-not-allowed"
                      }`}
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </button>
                    <span className="text-xs font-black text-slate-900">{monthTitle}</span>
                    <button
                      type="button"
                      onClick={() => stepCalendarMonth(1)}
                      aria-label="Next month"
                      className="flex h-8 w-8 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
                    >
                      <ChevronRight className="h-4 w-4" />
                    </button>
                  </div>

                  {/* Day-of-week headers */}
                  <div className="grid grid-cols-7 text-center">
                    {WEEKDAY_HEADERS.map((label, idx) => (
                      <span
                        key={label}
                        className={`text-[10px] font-bold py-1 ${
                          idx === 0 || idx === 6 ? "text-slate-300" : "text-slate-500"
                        }`}
                      >
                        {label}
                      </span>
                    ))}
                  </div>

                  {/* Calendar day cells */}
                  <div className="space-y-1">
                    {calendarWeeks.map((week, wIdx) => (
                      <div key={wIdx} className="grid grid-cols-7 gap-1">
                        {week.map((cell, cIdx) => {
                          if (!cell) {
                            return <div key={`empty_${wIdx}_${cIdx}`} className="h-8" />;
                          }
                          const isSelected = formData.preferredDate === cell.iso;
                          return (
                            <button
                              key={cell.key}
                              type="button"
                              disabled={cell.isDisabled}
                              onClick={() =>
                                setFormData((prev) => ({ ...prev, preferredDate: cell.iso }))
                              }
                              className={`h-8 rounded-xl text-xs font-bold transition-all ${
                                isSelected
                                  ? "bg-emerald-600 text-white shadow-xs cursor-pointer"
                                  : cell.isDisabled
                                    ? "text-slate-300 cursor-not-allowed"
                                    : cell.isToday
                                      ? "border border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 cursor-pointer"
                                      : "text-slate-800 hover:bg-white hover:shadow-2xs cursor-pointer"
                              }`}
                            >
                              {cell.day}
                            </button>
                          );
                        })}
                      </div>
                    ))}
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t border-slate-200/70 text-[11px]">
                    <span className="font-bold text-emerald-700">
                      Selected: {formatReadableDate(formData.preferredDate)}
                    </span>
                    <span className="text-[10px] font-semibold text-slate-400">
                      Sat–Sun closed
                    </span>
                  </div>
                </div>
              </div>

              {/* Time Slot Pills */}
              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-slate-700">Preferred Time Slot</Label>
                <div className="grid grid-cols-3 gap-2">
                  {TIME_SLOTS.map((slot) => {
                    const active = formData.preferredTime === slot.value;
                    return (
                      <button
                        key={slot.value}
                        type="button"
                        onClick={() =>
                          setFormData((prev) => ({ ...prev, preferredTime: slot.value }))
                        }
                        className={`rounded-xl border py-2 text-xs font-bold transition-colors cursor-pointer ${
                          active
                            ? "border-emerald-500 bg-emerald-50 text-emerald-800"
                            : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                        }`}
                      >
                        {slot.value}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-1">
                <Label className="text-xs">Chief Complaint / Reason for Visit</Label>
                <Input
                  required
                  placeholder="e.g. Persistent headache, prescription refill, flu symptoms"
                  value={formData.reason}
                  onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
                  className="rounded-xl text-xs"
                />
              </div>

              <div className="space-y-1">
                <Label className="text-xs">Additional Symptoms &amp; Notes</Label>
                <textarea
                  rows={2}
                  placeholder="Describe your current symptoms or specific requirements..."
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  className="w-full rounded-xl border border-slate-200 p-2.5 text-xs text-slate-800"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
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
                  disabled={modalLoading}
                  className="rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold gap-1.5 cursor-pointer"
                >
                  <Send className="h-3.5 w-3.5" />
                  {modalLoading ? "Submitting..." : "Submit Consultation Request"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CANCEL MODAL */}
      {isCancelModalOpen && selectedAppointment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
          <form
            onSubmit={handleCancelAppointment}
            className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl border border-slate-100 space-y-4"
          >
            <h3 className="text-sm font-black text-slate-900">Cancel Appointment</h3>
            <p className="text-xs text-slate-500">
              Are you sure you want to cancel your consultation for &quot;
              {selectedAppointment.reason}&quot;?
            </p>

            <div className="space-y-1">
              <Label className="text-xs">Reason for cancellation</Label>
              <Input
                placeholder="e.g. Class conflict, feeling better"
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                className="rounded-xl text-xs"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setIsCancelModalOpen(false)}
                className="rounded-xl text-xs cursor-pointer"
              >
                Keep Visit
              </Button>
              <Button
                type="submit"
                size="sm"
                variant="destructive"
                disabled={cancelLoading}
                className="rounded-xl text-xs font-bold cursor-pointer"
              >
                {cancelLoading ? "Cancelling..." : "Confirm Cancellation"}
              </Button>
            </div>
          </form>
        </div>
      )}

      {/* VIEW NOTES MODAL */}
      {isNotesModalOpen && viewNotesAppointment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl border border-slate-100 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-base font-black text-slate-900">
                  Doctor&apos;s Consultation Summary
                </h3>
                <p className="text-xs text-slate-500">
                  {viewNotesAppointment.providerName} •{" "}
                  {new Date(viewNotesAppointment.scheduledAt).toLocaleDateString()}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsNotesModalOpen(false)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="rounded-2xl bg-slate-50 p-4 text-xs font-mono whitespace-pre-line text-slate-800 border border-slate-100 max-h-80 overflow-y-auto">
              {viewNotesAppointment.clinicalNotes ||
                "No detailed notes recorded for this consultation."}
            </div>

            <div className="flex justify-between items-center pt-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => handlePrintConsultationSummary(viewNotesAppointment)}
                className="rounded-xl text-xs font-bold gap-1.5 cursor-pointer"
              >
                <Printer className="h-3.5 w-3.5" />
                Print Summary
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setIsNotesModalOpen(false)}
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
