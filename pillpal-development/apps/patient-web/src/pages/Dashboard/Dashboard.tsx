import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  Pill,
  Clock,
  CheckCircle2,
  Calendar,
  Flame,
  ArrowRight,
  UserCheck,
  Plus,
  AlertCircle,
  MessageSquare,
} from "lucide-react";
import { fetchWithAuth } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

type TodayDose = {
  prescriptionId: string;
  name: string;
  dosage: string;
  form: string;
  time: string;
  instructions: string | null;
  logId: string | null;
  status: "TAKEN" | "MISSED" | "SKIPPED" | "PENDING";
  notes: string | null;
  takenTime: string | null;
};

type UpcomingAppointment = {
  id: string;
  providerName: string;
  providerSpecialization: string;
  scheduledAt: string;
  type: "IN_PERSON" | "TELEHEALTH";
  status:
    | "CONFIRMED"
    | "WAITING"
    | "IN_PROGRESS"
    | "PENDING"
    | "COMPLETED"
    | "REJECTED"
    | "CANCELLED"
    | "NO_SHOW";
  telehealthUrl: string | null;
  reason: string;
};

const ACTIVE_APPT_PRIORITY: Record<string, number> = {
  IN_PROGRESS: 0,
  WAITING: 1,
  CONFIRMED: 2,
  PENDING: 3,
};

export function Dashboard() {
  const [loading, setLoading] = useState(true);
  const [todayDoses, setTodayDoses] = useState<TodayDose[]>([]);
  const [adherenceStats, setAdherenceStats] = useState<{
    overallRate: number | null;
    weekRate: number | null;
    activeStreak: number;
    takenLogs: number;
    totalLogs: number;
  }>({
    overallRate: null,
    weekRate: null,
    activeStreak: 0,
    takenLogs: 0,
    totalLogs: 0,
  });
  const [nextAppointment, setNextAppointment] = useState<UpcomingAppointment | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // Skip dose modal state
  const [isSkipModalOpen, setIsSkipModalOpen] = useState(false);
  const [skipDoseTarget, setSkipDoseTarget] = useState<TodayDose | null>(null);
  const [skipReason, setSkipReason] = useState("Forgot / Away from medicine");
  const [customSkipReason, setCustomSkipReason] = useState("");

  async function loadDashboardData(silent = false) {
    if (!silent) setLoading(true);
    try {
      const [adhRes, aptRes] = await Promise.all([
        fetchWithAuth("/adherence"),
        fetchWithAuth("/appointments"),
      ]);

      if (adhRes.ok) {
        const a = await adhRes.json();
        setAdherenceStats({
          overallRate: typeof a.overallRate === "number" ? a.overallRate : null,
          weekRate: typeof a.weekRate === "number" ? a.weekRate : null,
          activeStreak: typeof a.activeStreak === "number" ? a.activeStreak : 0,
          takenLogs: a.takenLogs ?? 0,
          totalLogs: a.totalLogs ?? 0,
        });
        setTodayDoses(a.todayDoses || []);
      }

      if (aptRes.ok) {
        const apts: UpcomingAppointment[] = await aptRes.json();
        const active = apts
          .filter((a) => a.status in ACTIVE_APPT_PRIORITY)
          .sort((a, b) => {
            const pDiff =
              (ACTIVE_APPT_PRIORITY[a.status] ?? 9) - (ACTIVE_APPT_PRIORITY[b.status] ?? 9);
            if (pDiff !== 0) return pDiff;
            return new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime();
          });
        setNextAppointment(active[0] ?? null);
      }
    } catch (err) {
      console.error("Failed to load patient dashboard data:", err);
      if (!silent) {
        setActionError("Unable to load your latest dashboard data. Please refresh.");
      }
    } finally {
      if (!silent) setLoading(false);
    }
  }

  useEffect(() => {
    void loadDashboardData();
  }, []);

  // 1-Click Slot-Accurate Dose Logger
  async function handleLogDose(
    dose: TodayDose,
    status: "TAKEN" | "SKIPPED",
    customNotes?: string,
  ) {
    const slotKey = `${dose.prescriptionId}_${dose.time}`;
    setActionLoading(slotKey);
    setActionError(null);
    try {
      const res = await fetchWithAuth("/adherence", {
        method: "POST",
        body: JSON.stringify({
          prescriptionId: dose.prescriptionId,
          scheduledTime: dose.time,
          takenTime: status === "TAKEN" ? new Date().toISOString() : null,
          status,
          notes:
            customNotes ||
            (status === "TAKEN" ? "Logged via Patient Dashboard" : "Skipped dose"),
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.message || "Failed to record dose intake.");
      }

      setActionSuccess(`${dose.name} (${dose.time}) recorded as ${status}.`);
      setTimeout(() => setActionSuccess(null), 3000);

      // Optimistic update for this specific slot only
      setTodayDoses((prev) =>
        prev.map((d) =>
          d.prescriptionId === dose.prescriptionId && d.time === dose.time
            ? {
                ...d,
                status,
                takenTime: status === "TAKEN" ? new Date().toISOString() : null,
              }
            : d,
        ),
      );

      void loadDashboardData(true);
    } catch (err: any) {
      setActionError(err?.message || "Could not record your dose. Please try again.");
    } finally {
      setActionLoading(null);
    }
  }

  // Lobby check-in for confirmed appointment
  async function handleLobbyCheckIn(aptId: string) {
    setActionLoading(aptId);
    setActionError(null);
    try {
      const res = await fetchWithAuth(`/appointments/${aptId}/check-in`, {
        method: "POST",
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.message || "Unable to complete lobby check-in.");
      }

      setActionSuccess(
        "Checked in! Health staff has been notified of your arrival in the clinic lobby.",
      );
      setTimeout(() => setActionSuccess(null), 3500);
      void loadDashboardData(true);
    } catch (err: any) {
      setActionError(err?.message || "Check-in failed. Please inform the clinic desk.");
    } finally {
      setActionLoading(null);
    }
  }

  if (loading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-20 rounded-2xl bg-slate-200/70" />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 h-64 rounded-3xl bg-white border border-slate-200/80" />
          <div className="h-64 rounded-3xl bg-white border border-slate-200/80" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="h-36 rounded-2xl bg-white border border-slate-200/80" />
          <div className="h-36 rounded-2xl bg-white border border-slate-200/80" />
          <div className="h-36 rounded-2xl bg-white border border-slate-200/80" />
        </div>
      </div>
    );
  }

  // Determine next immediate dose
  const pendingDoses = todayDoses.filter((d) => d.status === "PENDING");
  const takenTodayCount = todayDoses.filter((d) => d.status === "TAKEN").length;
  const nextDose = pendingDoses[0] || todayDoses[0];

  return (
    <div className="space-y-6">
      {/* Banner / Quick Actions */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-700 p-4 sm:p-5 text-white shadow-lg shadow-emerald-700/15">
        <div>
          <h2 className="text-base font-black text-white">
            CSU Health Center Clinic Active
          </h2>
          <p className="text-xs text-emerald-100">
            Walk-in triage and medical consultations available Mon–Fri, 8:00 AM – 5:00 PM.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Link to="/app/medications">
            <Button
              size="sm"
              variant="outline"
              className="border-white/30 bg-white/10 text-white hover:bg-white/20 text-xs font-bold rounded-xl cursor-pointer gap-1.5"
            >
              <Pill className="h-3.5 w-3.5" />
              Medications
            </Button>
          </Link>
          <Link to="/app/messages">
            <Button
              size="sm"
              variant="outline"
              className="border-white/30 bg-white/10 text-white hover:bg-white/20 text-xs font-bold rounded-xl cursor-pointer gap-1.5"
            >
              <MessageSquare className="h-3.5 w-3.5" />
              Message Clinic
            </Button>
          </Link>
          <Link to="/app/appointments">
            <Button
              size="sm"
              className="bg-white text-emerald-800 hover:bg-emerald-50 text-xs font-black rounded-xl cursor-pointer"
            >
              Book Consultation
            </Button>
          </Link>
        </div>
      </div>

      {actionSuccess && (
        <div className="rounded-2xl bg-emerald-50 p-4 text-xs font-bold text-emerald-800 border border-emerald-200 flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
          {actionSuccess}
        </div>
      )}

      {actionError && (
        <div className="rounded-2xl bg-red-50 p-4 text-xs font-bold text-red-700 border border-red-200 flex items-center gap-2">
          <AlertCircle className="h-4 w-4 text-red-600 shrink-0" />
          {actionError}
        </div>
      )}

      {/* Hero Grid: Next Dose Card & Adherence Snapshot */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Next Dose Hero Card */}
        <Card className="lg:col-span-2 rounded-3xl border border-slate-200/80 shadow-xs relative overflow-hidden bg-white">
          <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-50 rounded-full blur-2xl -mr-10 -mt-10 pointer-events-none" />

          <CardHeader className="pb-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="flex items-center gap-1.5 text-xs font-extrabold uppercase tracking-wider text-emerald-700 bg-emerald-50 px-3 py-1 rounded-full border border-emerald-100">
                <Clock className="h-3.5 w-3.5" />
                {pendingDoses.length > 0 ? "Next Scheduled Intake" : "Today's Intake Status"}
              </span>
              <span className="text-xs font-semibold text-slate-400">
                {new Date().toLocaleDateString("en-US", {
                  weekday: "long",
                  month: "short",
                  day: "numeric",
                })}
              </span>
            </div>
          </CardHeader>

          <CardContent className="space-y-4">
            {nextDose ? (
              <div className="space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50/80 p-4 rounded-2xl border border-slate-100">
                  <div className="flex items-center gap-3.5">
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700 font-black">
                      <Pill className="h-6 w-6" />
                    </div>
                    <div>
                      <h3 className="text-lg font-black text-slate-900">{nextDose.name}</h3>
                      <p className="text-xs font-bold text-emerald-700">
                        {nextDose.dosage} • {nextDose.form}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center gap-1 font-mono text-sm font-black bg-white px-3 py-1.5 rounded-xl border border-slate-200 text-slate-800 shadow-2xs">
                      <Clock className="h-4 w-4 text-emerald-600" />
                      {nextDose.time}
                    </span>
                  </div>
                </div>

                {nextDose.instructions && (
                  <p className="text-xs text-slate-600 italic bg-amber-50/60 border border-amber-100 p-3 rounded-xl">
                    <span className="font-bold text-amber-800">Doctor&apos;s Note:</span> &quot;
                    {nextDose.instructions}&quot;
                  </p>
                )}

                <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100">
                  <div className="text-xs text-slate-500">
                    Status:{" "}
                    <span
                      className={`font-black ${
                        nextDose.status === "TAKEN"
                          ? "text-emerald-600"
                          : nextDose.status === "SKIPPED"
                            ? "text-slate-500"
                            : nextDose.status === "MISSED"
                              ? "text-amber-600"
                              : "text-sky-600"
                      }`}
                    >
                      {nextDose.status}
                    </span>
                  </div>

                  {nextDose.status === "PENDING" ? (
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setSkipDoseTarget(nextDose);
                          setSkipReason("Forgot / Away from medicine");
                          setCustomSkipReason("");
                          setIsSkipModalOpen(true);
                        }}
                        disabled={
                          actionLoading === `${nextDose.prescriptionId}_${nextDose.time}`
                        }
                        className="rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 cursor-pointer"
                      >
                        Skip
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => handleLogDose(nextDose, "TAKEN")}
                        disabled={
                          actionLoading === `${nextDose.prescriptionId}_${nextDose.time}`
                        }
                        className="rounded-xl text-xs font-black bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs gap-1.5 cursor-pointer"
                      >
                        <CheckCircle2 className="h-4 w-4" />
                        {actionLoading === `${nextDose.prescriptionId}_${nextDose.time}`
                          ? "Logging..."
                          : "Mark as Taken"}
                      </Button>
                    </div>
                  ) : (
                    <span className="text-xs font-bold text-emerald-700 bg-emerald-50 px-3 py-1 rounded-xl border border-emerald-200">
                      ✓ All scheduled slots logged for today
                    </span>
                  )}
                </div>
              </div>
            ) : (
              <div className="py-8 text-center space-y-2">
                <Pill className="h-8 w-8 text-slate-300 mx-auto" />
                <p className="text-xs font-semibold text-slate-500">
                  No medication doses scheduled for today.
                </p>
                <p className="text-[11px] text-slate-400">
                  Prescriptions issued during CSU Clinic visits or scanned on mobile will appear
                  here.
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Adherence Streak & Progress */}
        <Card className="rounded-3xl border border-slate-200/80 shadow-xs bg-white flex flex-col justify-between">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-black text-slate-900">
              Adherence &amp; Health Score
            </CardTitle>
            <CardDescription className="text-xs text-slate-400">
              Personal treatment consistency
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-4">
            {/* Streak Box */}
            <div className="flex items-center justify-between rounded-2xl bg-gradient-to-br from-amber-50 to-orange-50/50 p-4 border border-amber-200/60">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-amber-500 text-white shadow-md shadow-amber-500/20">
                  <Flame className="h-6 w-6 fill-white" />
                </div>
                <div>
                  <p className="text-lg font-black text-amber-950">
                    {adherenceStats.activeStreak}{" "}
                    {adherenceStats.activeStreak === 1 ? "Day" : "Days"} Streak
                  </p>
                  <p className="text-[11px] text-amber-700 font-semibold">
                    {adherenceStats.activeStreak > 0
                      ? "Consecutive dosing chain"
                      : "Start your streak today"}
                  </p>
                </div>
              </div>
            </div>

            {/* Weekly Adherence Progress */}
            <div className="space-y-2 pt-1">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-slate-600">Weekly Adherence Rate</span>
                <span className="font-mono text-sm font-black text-emerald-600">
                  {adherenceStats.weekRate !== null ? `${adherenceStats.weekRate}%` : "—"}
                </span>
              </div>
              <div className="h-2.5 w-full rounded-full bg-slate-100 overflow-hidden">
                <div
                  className="h-full rounded-full bg-emerald-500 transition-all duration-500"
                  style={{ width: `${adherenceStats.weekRate ?? 0}%` }}
                />
              </div>
              <p className="text-[10px] text-slate-400">
                {adherenceStats.weekRate !== null
                  ? "Target: Maintain 90%+ for optimal therapeutic efficacy."
                  : "Log your first dose to start tracking weekly consistency."}
              </p>
            </div>

            <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-xs">
              <Link
                to="/app/adherence"
                className="font-bold text-emerald-600 hover:text-emerald-700 flex items-center gap-1"
              >
                View Full Adherence Analytics
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Today's Full Schedule Grid */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-base font-black text-slate-900">Today&apos;s Intake Schedule</h2>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600">
            {takenTodayCount} of {todayDoses.length} doses taken
          </span>
        </div>

        {todayDoses.length === 0 ? (
          <Card className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/50 p-8 text-center">
            <Pill className="h-8 w-8 text-slate-300 mx-auto mb-2" />
            <p className="text-sm font-bold text-slate-700">No active medication schedules</p>
            <p className="text-xs text-slate-400 mt-1">
              Your doctor or infirmary clinician will prescribe medications during your
              consultations.
            </p>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {todayDoses.map((dose) => {
              const slotKey = `${dose.prescriptionId}_${dose.time}`;
              return (
                <Card
                  key={slotKey}
                  className={`rounded-2xl border transition-all ${
                    dose.status === "TAKEN"
                      ? "border-emerald-200 bg-emerald-50/20"
                      : dose.status === "SKIPPED"
                        ? "border-slate-200 bg-slate-50/50"
                        : dose.status === "MISSED"
                          ? "border-amber-200 bg-amber-50/20"
                          : "border-slate-200 bg-white"
                  }`}
                >
                  <CardContent className="p-4 space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div
                          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl font-bold ${
                            dose.status === "TAKEN"
                              ? "bg-emerald-100 text-emerald-700"
                              : "bg-sky-50 text-[#0284c7]"
                          }`}
                        >
                          <Pill className="h-4 w-4" />
                        </div>
                        <div className="min-w-0">
                          <h4 className="text-xs font-black text-slate-900 truncate">
                            {dose.name}
                          </h4>
                          <p className="text-[11px] font-semibold text-slate-500">
                            {dose.dosage}
                          </p>
                        </div>
                      </div>

                      <span
                        className={`shrink-0 rounded-md px-2 py-0.5 text-[10px] font-black ${
                          dose.status === "TAKEN"
                            ? "bg-emerald-100 text-emerald-800"
                            : dose.status === "SKIPPED"
                              ? "bg-slate-200 text-slate-700"
                              : dose.status === "MISSED"
                                ? "bg-amber-100 text-amber-800"
                                : "bg-sky-100 text-[#0369a1]"
                        }`}
                      >
                        {dose.status}
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-xs font-mono text-slate-600 bg-white/80 p-2 rounded-lg border border-slate-100">
                      <span className="flex items-center gap-1 font-bold">
                        <Clock className="h-3 w-3 text-slate-400" />
                        {dose.time}
                      </span>
                      <span className="text-[10px] text-slate-400">{dose.form}</span>
                    </div>

                    {dose.status === "PENDING" ? (
                      <div className="flex items-center gap-2 pt-1">
                        <Button
                          size="sm"
                          onClick={() => handleLogDose(dose, "TAKEN")}
                          disabled={actionLoading === slotKey}
                          className="w-full h-8 text-[11px] font-black bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg shadow-2xs cursor-pointer"
                        >
                          <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
                          {actionLoading === slotKey ? "Saving..." : "Mark Taken"}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setSkipDoseTarget(dose);
                            setSkipReason("Forgot / Away from medicine");
                            setCustomSkipReason("");
                            setIsSkipModalOpen(true);
                          }}
                          disabled={actionLoading === slotKey}
                          className="h-8 text-[11px] rounded-lg text-slate-600 hover:bg-slate-100 cursor-pointer px-2.5"
                        >
                          Skip
                        </Button>
                      </div>
                    ) : (
                      <p className="text-[11px] text-slate-500 truncate">
                        {dose.status === "TAKEN" && dose.takenTime
                          ? `Taken at ${new Date(dose.takenTime).toLocaleTimeString([], {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}`
                          : dose.notes || `Recorded as ${dose.status.toLowerCase()}`}
                      </p>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* Upcoming / Active Clinic Appointment Section */}
      <div className="space-y-3 pt-2">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-black text-slate-900">CSU Clinic Appointments</h2>
          <Link
            to="/app/appointments"
            className="text-xs font-bold text-emerald-600 hover:text-emerald-700 flex items-center gap-1"
          >
            All Appointments
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>

        {nextAppointment ? (
          <Card className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-center gap-3.5">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-sky-50 text-[#0284c7]">
                  <Calendar className="h-6 w-6" />
                </div>
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-sm font-black text-slate-900">
                      {nextAppointment.status === "PENDING"
                        ? "Consultation Request (Awaiting Triage)"
                        : `Consultation with ${nextAppointment.providerName}`}
                    </h3>
                    <span className="rounded-full bg-sky-100 px-2.5 py-0.5 text-[10px] font-bold text-[#0369a1]">
                      IN-PERSON
                    </span>
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-[10px] font-black ${
                        nextAppointment.status === "IN_PROGRESS"
                          ? "bg-emerald-100 text-emerald-800"
                          : nextAppointment.status === "WAITING"
                            ? "bg-amber-100 text-amber-800"
                            : nextAppointment.status === "PENDING"
                              ? "bg-slate-100 text-slate-700"
                              : "bg-emerald-50 text-emerald-700 border border-emerald-200"
                      }`}
                    >
                      {nextAppointment.status === "WAITING"
                        ? "Waiting in Lobby"
                        : nextAppointment.status === "IN_PROGRESS"
                          ? "In Consultation"
                          : nextAppointment.status === "PENDING"
                            ? "Pending Triage"
                            : "Confirmed"}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {nextAppointment.providerSpecialization} • Reason: &quot;
                    {nextAppointment.reason}&quot;
                  </p>
                  <p className="font-mono text-xs font-bold text-[#0284c7] mt-1">
                    Scheduled: {new Date(nextAppointment.scheduledAt).toLocaleString()}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {nextAppointment.status === "PENDING" ? (
                  <Link to="/app/appointments">
                    <Button
                      size="sm"
                      variant="outline"
                      className="rounded-xl text-xs font-bold cursor-pointer"
                    >
                      View Request
                    </Button>
                  </Link>
                ) : nextAppointment.status === "WAITING" ? (
                  <span className="text-xs font-bold text-amber-800 bg-amber-50 px-3 py-1.5 rounded-xl border border-amber-200">
                    Checked In • Awaiting Call
                  </span>
                ) : nextAppointment.status === "IN_PROGRESS" ? (
                  <span className="text-xs font-bold text-emerald-800 bg-emerald-50 px-3 py-1.5 rounded-xl border border-emerald-200">
                    Consultation Active
                  </span>
                ) : (
                  <Button
                    size="sm"
                    onClick={() => handleLobbyCheckIn(nextAppointment.id)}
                    disabled={actionLoading === nextAppointment.id}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs rounded-xl shadow-xs gap-1.5 cursor-pointer"
                  >
                    <UserCheck className="h-4 w-4" />
                    {actionLoading === nextAppointment.id
                      ? "Checking In..."
                      : "I Have Arrived at Clinic"}
                  </Button>
                )}
              </div>
            </div>
          </Card>
        ) : (
          <Card className="rounded-2xl border border-slate-200/80 bg-white p-6 text-center space-y-2">
            <p className="text-xs text-slate-400">No upcoming appointments scheduled.</p>
            <Link to="/app/appointments">
              <Button size="sm" variant="outline" className="rounded-xl text-xs font-bold gap-1.5">
                <Plus className="h-4 w-4 text-emerald-600" />
                Request Clinic Consultation
              </Button>
            </Link>
          </Card>
        )}
      </div>

      {/* Skip Dose Modal */}
      {isSkipModalOpen && skipDoseTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl border border-slate-100 space-y-4">
            <div className="space-y-1">
              <h3 className="text-sm font-black text-slate-900">Record Skipped Dose</h3>
              <p className="text-xs text-slate-500">
                {skipDoseTarget.name} ({skipDoseTarget.dosage}) • {skipDoseTarget.time}
              </p>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-700">Reason for skipping:</label>
              <select
                value={skipReason}
                onChange={(e) => setSkipReason(e.target.value)}
                className="w-full h-9 rounded-xl border border-slate-200 px-2.5 text-xs bg-white text-slate-800"
              >
                <option value="Forgot / Away from medicine">Forgot / Away from medicine</option>
                <option value="Experiencing nausea / adverse side effect">
                  Experiencing nausea / adverse side effect
                </option>
                <option value="Medication supply ran out">Medication supply ran out</option>
                <option value="Felt completely recovered / not needed">
                  Felt completely recovered / not needed
                </option>
                <option value="Other reason">Other reason</option>
              </select>

              {skipReason === "Other reason" && (
                <Input
                  placeholder="Briefly describe your reason..."
                  value={customSkipReason}
                  onChange={(e) => setCustomSkipReason(e.target.value)}
                  className="rounded-xl text-xs h-9"
                />
              )}
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsSkipModalOpen(false)}
                className="rounded-xl text-xs cursor-pointer"
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={() => {
                  const finalReason =
                    skipReason === "Other reason" && customSkipReason.trim()
                      ? customSkipReason.trim()
                      : skipReason;
                  void handleLogDose(skipDoseTarget, "SKIPPED", finalReason);
                  setIsSkipModalOpen(false);
                }}
                className="rounded-xl text-xs font-bold bg-slate-800 text-white hover:bg-slate-900 cursor-pointer"
              >
                Confirm Skip
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
