import { useCallback, useEffect, useState } from "react";
import {
  Activity,
  AlertCircle,
  AlertTriangle,
  ArrowUpRight,
  Boxes,
  Calendar,
  CheckCircle2,
  Clock,
  MessageSquare,
  Pill,
  RefreshCw,
  Search,
  Stethoscope,
  TrendingUp,
  Users,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { getSession } from "@pillpal/auth";
import { fetchWithAuth } from "@/lib/api";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

type DashboardStats = {
  totalPatients: number;
  activeMedications: number;
  averageAdherence: number | null;
  totalLogs30d: number;
  todayAppointments: number;
  criticalAttentionCount: number;
  criticalCount?: number;
  warningCount?: number;
  pendingTriageCount: number;
  lowStockCount: number;
  outOfStockCount: number;
};

type AttentionPatient = {
  id: string;
  userId?: string;
  name: string;
  idNumber: string;
  adherenceRate: number;
  missedDoses: number;
  consecutiveMissed?: number;
  severity?: "CRITICAL" | "WARNING";
  alertReasons?: string[];
  lastMedication: string;
  condition: string;
};

type TodayAppointment = {
  id: string;
  patientName: string;
  idNumber: string;
  time: string;
  type: string;
  reason?: string;
  status: "PENDING" | "CONFIRMED" | "WAITING" | "IN_PROGRESS" | "COMPLETED";
};

function getSavedComplianceThreshold(userId?: string): number {
  try {
    const key = `pillpal_clinician_prefs_${userId || "default"}`;
    const raw = localStorage.getItem(key);
    if (raw) {
      const parsed = JSON.parse(raw);
      const val = Number(parsed?.complianceThreshold);
      if (Number.isFinite(val) && val >= 50 && val <= 95) return val;
    }
  } catch {
    // ignore storage parse errors
  }
  return 80;
}

function getStatusBadgeStyle(status: TodayAppointment["status"]): string {
  switch (status) {
    case "PENDING":
      return "bg-amber-50 text-amber-700 border border-amber-200/70";
    case "CONFIRMED":
      return "bg-sky-50 text-[#0284c7] border border-sky-200/70";
    case "WAITING":
      return "bg-indigo-50 text-indigo-700 border border-indigo-200/70";
    case "IN_PROGRESS":
      return "bg-emerald-50 text-emerald-700 border border-emerald-200/70";
    case "COMPLETED":
      return "bg-slate-100 text-slate-600 border border-slate-200/70";
    default:
      return "bg-slate-100 text-slate-600";
  }
}

export function Dashboard() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [providerName, setProviderName] = useState("");
  const [providerRole, setProviderRole] = useState<"DOCTOR" | "HEALTH_STAFF">("DOCTOR");
  const [specialization, setSpecialization] = useState("");
  const [threshold, setThreshold] = useState<number>(80);

  const [stats, setStats] = useState<DashboardStats>({
    totalPatients: 0,
    activeMedications: 0,
    averageAdherence: null,
    totalLogs30d: 0,
    todayAppointments: 0,
    criticalAttentionCount: 0,
    pendingTriageCount: 0,
    lowStockCount: 0,
    outOfStockCount: 0,
  });

  const [attentionPatients, setAttentionPatients] = useState<AttentionPatient[]>([]);
  const [appointments, setAppointments] = useState<TodayAppointment[]>([]);

  const loadDashboardData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const {
        data: { session },
      } = await getSession();
      const savedThreshold = getSavedComplianceThreshold(session?.user?.id);
      setThreshold(savedThreshold);

      const res = await fetchWithAuth(`/clinical-dashboard?threshold=${savedThreshold}`);
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(errBody?.message || "Failed to load clinical dashboard.");
      }

      const data = await res.json();
      if (data.provider) {
        const rawName: string = data.provider.name || "";
        const formattedName =
          data.provider.role === "DOCTOR" && rawName && !rawName.startsWith("Dr.")
            ? `Dr. ${rawName}`
            : rawName;
        setProviderName(formattedName || "Clinician");
        setProviderRole(data.provider.role === "HEALTH_STAFF" ? "HEALTH_STAFF" : "DOCTOR");
        setSpecialization(data.provider.specialization || "");
      }
      if (typeof data.threshold === "number") {
        setThreshold(data.threshold);
      }
      if (data.stats) {
        setStats(data.stats);
      }
      setAttentionPatients(Array.isArray(data.attentionPatients) ? data.attentionPatients : []);
      setAppointments(Array.isArray(data.upcomingAppointments) ? data.upcomingAppointments : []);
    } catch (err: any) {
      setError(err?.message || "Unable to load clinical dashboard metrics.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadDashboardData();
  }, [loadDashboardData]);

  const todayFormatted = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const stockAlertsCount = stats.lowStockCount + stats.outOfStockCount;

  return (
    <div className="space-y-6">
      {/* 1. Header Banner & Quick Actions */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-sky-50 px-3 py-1 text-xs font-bold text-[#0284c7] border border-sky-100">
              <Stethoscope className="h-3.5 w-3.5" />
              CSU Health Services Portal
            </span>
            <span className="text-xs text-slate-400 font-medium">{todayFormatted}</span>
          </div>
          {loading && !providerName ? (
            <Skeleton className="mt-2 h-8 w-64" />
          ) : (
            <h1 className="mt-1.5 text-2xl font-black tracking-tight text-slate-900 sm:text-3xl">
              Welcome back, {providerName || "Clinician"}
            </h1>
          )}
          <p className="text-xs text-slate-500 mt-0.5">
            {providerRole === "DOCTOR"
              ? `Attending Physician • ${specialization || "General Medicine"}`
              : "Clinical Health Staff • CSU Health Services"}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void loadDashboardData()}
            disabled={loading}
            className="gap-1.5 rounded-xl text-xs font-semibold text-slate-500 hover:text-slate-900 cursor-pointer"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <Button
            variant="outline"
            onClick={() => navigate("/app/patients")}
            className="gap-2 rounded-xl text-xs font-bold cursor-pointer"
          >
            <Search className="h-3.5 w-3.5" />
            Find Patient
          </Button>
          <Button
            onClick={() => navigate("/app/appointments")}
            className="gap-2 rounded-xl text-xs font-bold bg-[#0284c7] hover:bg-[#0369a1] cursor-pointer"
          >
            <Calendar className="h-3.5 w-3.5" />
            Today's Schedule
          </Button>
        </div>
      </div>

      {error && (
        <div className="rounded-xl bg-red-50 border border-red-200 p-3 text-xs font-semibold text-red-700 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4 shrink-0 text-red-600" />
            <span>{error}</span>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={() => void loadDashboardData()}
            className="h-7 rounded-lg text-[11px] font-bold cursor-pointer"
          >
            Retry
          </Button>
        </div>
      )}

      {/* Operational Clinic Alerts Strip (Triage & Pharmacy Stock) */}
      {!loading && (stats.pendingTriageCount > 0 || stockAlertsCount > 0) && (
        <div className="flex flex-wrap items-center gap-2.5">
          {stats.pendingTriageCount > 0 && (
            <button
              type="button"
              onClick={() => navigate("/app/appointments")}
              className="inline-flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-800 hover:bg-amber-100/80 transition-colors cursor-pointer"
            >
              <Clock className="h-3.5 w-3.5 text-amber-600" />
              <span>
                {stats.pendingTriageCount} Pending Appointment Request
                {stats.pendingTriageCount === 1 ? "" : "s"} Awaiting Triage
              </span>
              <ArrowUpRight className="h-3.5 w-3.5" />
            </button>
          )}
          {stockAlertsCount > 0 && (
            <button
              type="button"
              onClick={() => navigate("/app/inventory")}
              className="inline-flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-bold text-rose-800 hover:bg-rose-100/80 transition-colors cursor-pointer"
            >
              <Boxes className="h-3.5 w-3.5 text-rose-600" />
              <span>
                Pharmacy Stock Alert: {stats.lowStockCount} Low, {stats.outOfStockCount} Out of Stock
              </span>
              <ArrowUpRight className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      )}

      {/* 2. Key Metrics Grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Total Patients */}
        <Card
          onClick={() => navigate("/app/patients")}
          className="cursor-pointer rounded-2xl border border-slate-100 shadow-xs hover:shadow-md transition-shadow"
        >
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Monitored Patients
            </CardTitle>
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-sky-50 text-[#0284c7]">
              <Users className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-7 w-20" />
            ) : (
              <div className="text-2xl font-bold text-slate-900">{stats.totalPatients}</div>
            )}
            <p className="mt-1 flex items-center text-[11px] text-emerald-600 font-medium">
              <TrendingUp className="mr-1 h-3 w-3" />
              Active CSU clinic roster
            </p>
          </CardContent>
        </Card>

        {/* Active Medications */}
        <Card
          onClick={() => navigate("/app/medications")}
          className="cursor-pointer rounded-2xl border border-slate-100 shadow-xs hover:shadow-md transition-shadow"
        >
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Active Prescriptions
            </CardTitle>
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">
              <Pill className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-7 w-20" />
            ) : (
              <div className="text-2xl font-bold text-slate-900">{stats.activeMedications}</div>
            )}
            <p className="mt-1 text-[11px] text-slate-500 font-medium">
              Across {stats.totalPatients} enrolled patient{stats.totalPatients === 1 ? "" : "s"}
            </p>
          </CardContent>
        </Card>

        {/* Adherence Rate */}
        <Card
          onClick={() => navigate("/app/adherence")}
          className="cursor-pointer rounded-2xl border border-slate-100 shadow-xs hover:shadow-md transition-shadow"
        >
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Avg Adherence Rate
            </CardTitle>
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
              <Activity className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-7 w-20" />
            ) : (
              <div className="text-2xl font-bold text-emerald-600">
                {stats.averageAdherence !== null ? `${stats.averageAdherence}%` : "—"}
              </div>
            )}
            <p className="mt-1 text-[11px] text-slate-500 font-medium">
              {stats.totalLogs30d > 0
                ? `30-day compliance (${stats.totalLogs30d} logs)`
                : "No adherence logs in last 30 days"}
            </p>
          </CardContent>
        </Card>

        {/* Attention Alerts */}
        <Card
          onClick={() => navigate("/app/adherence")}
          className="cursor-pointer rounded-2xl border border-amber-100 bg-amber-50/30 shadow-xs hover:shadow-md transition-shadow"
        >
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-semibold text-amber-800 uppercase tracking-wider">
              Needs Attention
            </CardTitle>
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-amber-100 text-amber-700">
              <AlertTriangle className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-7 w-20" />
            ) : (
              <div className="text-2xl font-bold text-amber-700">
                {stats.criticalAttentionCount}
              </div>
            )}
            <p className="mt-1 text-[11px] text-amber-700 font-medium">
              {(stats.criticalCount ?? 0) > 0
                ? `${stats.criticalCount} Critical • ${stats.warningCount ?? 0} Warning`
                : `Patients with <${threshold}% adherence`}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* 3. Main Dashboard Panels */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Left 2 Cols: Attention Required & Today's Schedule */}
        <div className="space-y-6 lg:col-span-2">
          {/* Patients Requiring Attention Widget */}
          <Card className="rounded-2xl border border-slate-100 shadow-xs">
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <div>
                <div className="flex items-center gap-2">
                  <div className="h-2 w-2 rounded-full bg-amber-500" />
                  <CardTitle className="text-sm font-bold text-slate-900">
                    Patients Requiring Clinical Attention
                  </CardTitle>
                </div>
                <CardDescription className="text-xs text-slate-500 mt-0.5">
                  Patients below {threshold}% compliance or with recent missed doses.
                </CardDescription>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => navigate("/app/adherence")}
                className="gap-1 text-xs text-[#0284c7] font-semibold cursor-pointer"
              >
                View all
                <ArrowUpRight className="h-3.5 w-3.5" />
              </Button>
            </CardHeader>

            <CardContent>
              {loading ? (
                <div className="space-y-3">
                  <Skeleton className="h-16 w-full rounded-xl" />
                  <Skeleton className="h-16 w-full rounded-xl" />
                </div>
              ) : attentionPatients.length === 0 ? (
                <div className="rounded-xl border border-emerald-100 bg-emerald-50/40 p-6 text-center space-y-1.5">
                  <CheckCircle2 className="h-6 w-6 text-emerald-600 mx-auto" />
                  <p className="text-xs font-bold text-slate-800">
                    All monitored patients are on track
                  </p>
                  <p className="text-[11px] text-slate-500">
                    No patients are currently below your {threshold}% adherence threshold.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {attentionPatients.map((patient) => {
                    const isCritical = patient.severity === "CRITICAL";
                    return (
                      <div
                        key={patient.id}
                        className={`flex flex-col sm:flex-row sm:items-center justify-between p-3.5 rounded-xl border bg-white hover:bg-slate-50/80 transition-colors gap-3 ${
                          isCritical ? "border-rose-200" : "border-slate-100"
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <div
                            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full font-bold text-xs ${
                              isCritical
                                ? "bg-rose-50 text-rose-700"
                                : "bg-amber-50 text-amber-700"
                            }`}
                          >
                            {(patient.name[0] || "P").toUpperCase()}
                          </div>
                          <div>
                            <div className="flex flex-wrap items-center gap-1.5">
                              <p className="text-xs font-bold text-slate-900">{patient.name}</p>
                              <span className="text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded-md font-mono">
                                {patient.idNumber}
                              </span>
                              <span
                                className={`rounded-full px-2 py-0.5 text-[9px] font-black uppercase ${
                                  isCritical
                                    ? "bg-rose-100 text-rose-800 border border-rose-200"
                                    : "bg-amber-100 text-amber-800 border border-amber-200"
                                }`}
                              >
                                {isCritical ? "Critical" : "Warning"}
                              </span>
                            </div>
                            <p className="text-[11px] text-slate-500 mt-0.5">
                              {patient.condition} • {patient.lastMedication}
                            </p>
                            {patient.alertReasons && patient.alertReasons.length > 0 && (
                              <p
                                className={`text-[10px] font-semibold mt-0.5 ${
                                  isCritical ? "text-rose-700" : "text-amber-700"
                                }`}
                              >
                                {patient.alertReasons.join(" • ")}
                              </p>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center justify-between sm:justify-end gap-3">
                          <div className="text-right">
                            <span
                              className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-bold ${
                                isCritical
                                  ? "bg-rose-100/80 text-rose-800"
                                  : "bg-amber-100/80 text-amber-800"
                              }`}
                            >
                              {patient.adherenceRate}% Adherence
                            </span>
                            <p className="text-[10px] text-red-600 font-medium mt-0.5">
                              {patient.missedDoses} missed dose{patient.missedDoses === 1 ? "" : "s"}
                            </p>
                          </div>

                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() =>
                              navigate("/app/messages", {
                                state: { recipientUserId: patient.userId },
                              })
                            }
                            className="rounded-xl text-xs font-semibold shrink-0 cursor-pointer"
                          >
                            <MessageSquare className="h-3.5 w-3.5 mr-1" />
                            Message
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Today's Schedule */}
          <Card className="rounded-2xl border border-slate-100 shadow-xs">
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <div>
                <CardTitle className="text-sm font-bold text-slate-900">
                  Today's Clinical Appointments ({stats.todayAppointments})
                </CardTitle>
                <CardDescription className="text-xs text-slate-500 mt-0.5">
                  Scheduled clinic visits and virtual follow-ups for {todayFormatted}.
                </CardDescription>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => navigate("/app/appointments")}
                className="gap-1 text-xs text-[#0284c7] font-semibold cursor-pointer"
              >
                Schedule
                <ArrowUpRight className="h-3.5 w-3.5" />
              </Button>
            </CardHeader>

            <CardContent>
              {loading ? (
                <div className="space-y-3">
                  <Skeleton className="h-14 w-full rounded-xl" />
                  <Skeleton className="h-14 w-full rounded-xl" />
                </div>
              ) : appointments.length === 0 ? (
                <div className="rounded-xl border border-slate-100 bg-slate-50/60 p-6 text-center space-y-2">
                  <Calendar className="h-6 w-6 text-slate-400 mx-auto" />
                  <p className="text-xs font-bold text-slate-700">
                    No appointments scheduled for today
                  </p>
                  <p className="text-[11px] text-slate-500">
                    Walk-in check-ins and confirmed student bookings for today will appear here.
                  </p>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => navigate("/app/appointments")}
                    className="mt-1 rounded-xl text-xs font-bold cursor-pointer"
                  >
                    Open Appointments Desk
                  </Button>
                </div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {appointments.map((apt) => (
                    <div
                      key={apt.id}
                      onClick={() => navigate("/app/appointments")}
                      className="flex items-center justify-between py-3 px-2 -mx-2 rounded-xl hover:bg-slate-50 transition-colors cursor-pointer gap-3"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-sky-50 text-[#0284c7] text-xs font-bold">
                          <Clock className="h-4 w-4" />
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="text-xs font-bold text-slate-900 truncate">
                              {apt.patientName}
                            </p>
                            <span className="text-[10px] text-slate-400 font-mono shrink-0">
                              {apt.idNumber}
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-500 truncate">
                            {apt.type}
                            {apt.reason ? ` • ${apt.reason}` : ""}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2.5 shrink-0">
                        <span className="text-xs font-bold text-slate-800">{apt.time}</span>
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${getStatusBadgeStyle(apt.status)}`}
                        >
                          {apt.status.replace("_", " ")}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right 1 Col: Role-Aware Quick Actions & Clinic Protocol */}
        <div className="space-y-6">
          <Card className="rounded-2xl border border-slate-100 bg-white shadow-xs">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-bold text-slate-900">
                Clinical Quick Actions
              </CardTitle>
              <CardDescription className="text-xs text-slate-500">
                Shortcuts for everyday {providerRole === "DOCTOR" ? "physician" : "clinic staff"} workflows.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              <Button
                variant="outline"
                onClick={() => navigate("/app/patients")}
                className="w-full justify-start gap-2.5 rounded-xl text-xs font-semibold h-10 border-slate-200 cursor-pointer"
              >
                <Users className="h-4 w-4 text-[#0284c7]" />
                <span>Search &amp; View Patient Records</span>
              </Button>

              {providerRole === "DOCTOR" ? (
                <Button
                  variant="outline"
                  onClick={() => navigate("/app/medications")}
                  className="w-full justify-start gap-2.5 rounded-xl text-xs font-semibold h-10 border-slate-200 cursor-pointer"
                >
                  <Pill className="h-4 w-4 text-indigo-600" />
                  <span>Prescribe / Dispense Medication</span>
                </Button>
              ) : (
                <Button
                  variant="outline"
                  onClick={() => navigate("/app/inventory")}
                  className="w-full justify-start gap-2.5 rounded-xl text-xs font-semibold h-10 border-slate-200 cursor-pointer"
                >
                  <Boxes className="h-4 w-4 text-indigo-600" />
                  <span>Manage Clinic Pharmacy Inventory</span>
                </Button>
              )}

              <Button
                variant="outline"
                onClick={() => navigate("/app/adherence")}
                className="w-full justify-start gap-2.5 rounded-xl text-xs font-semibold h-10 border-slate-200 cursor-pointer"
              >
                <Activity className="h-4 w-4 text-emerald-600" />
                <span>Review Adherence Analytics</span>
              </Button>

              <Button
                variant="outline"
                onClick={() => navigate("/app/appointments")}
                className="w-full justify-start gap-2.5 rounded-xl text-xs font-semibold h-10 border-slate-200 cursor-pointer"
              >
                <Calendar className="h-4 w-4 text-amber-600" />
                <span>
                  {providerRole === "DOCTOR"
                    ? "Open Consultation Queue"
                    : "Triage & Check-In Desk"}
                </span>
              </Button>
            </CardContent>
          </Card>

          <Card className="rounded-2xl border border-sky-100 bg-gradient-to-br from-sky-50/60 to-white shadow-xs">
            <CardHeader className="pb-2">
              <div className="flex items-center gap-2 text-[#0284c7]">
                <CardTitle className="text-xs font-bold text-[#0284c7] uppercase tracking-wider">
                  CSU Clinic Protocol
                </CardTitle>
              </div>
            </CardHeader>
            <CardContent className="text-xs text-slate-600 space-y-2 leading-relaxed">
              <p>
                • Prescriptions must be issued by a licensed <strong>Doctor</strong>.
              </p>
              <p>
                • <strong>Health Staff</strong> can triage visits, monitor adherence, and dispense stock.
              </p>
              <p>
                • Attention threshold is currently set to{" "}
                <strong>&lt;{threshold}%</strong> compliance (configurable in Settings).
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
