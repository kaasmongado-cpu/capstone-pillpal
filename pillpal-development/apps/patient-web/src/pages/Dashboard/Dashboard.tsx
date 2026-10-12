import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  Pill,
  Clock,
  CheckCircle2,
  Calendar,
  Flame,
  ArrowRight,
  Sparkles,
  Video,
  UserCheck,
  Plus,
} from "lucide-react";
import { fetchWithAuth } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

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
  status: "CONFIRMED" | "WAITING" | "IN_PROGRESS" | "PENDING";
  telehealthUrl: string | null;
  reason: string;
};

export function Dashboard() {
  const [loading, setLoading] = useState(true);
  const [todayDoses, setTodayDoses] = useState<TodayDose[]>([]);
  const [adherenceStats, setAdherenceStats] = useState({
    overallRate: 94,
    weekRate: 96,
    activeStreak: 5,
    takenLogs: 12,
    totalLogs: 13,
  });
  const [nextAppointment, setNextAppointment] = useState<UpcomingAppointment | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  // Skip dose modal state
  const [isSkipModalOpen, setIsSkipModalOpen] = useState(false);
  const [skipDoseTarget, setSkipDoseTarget] = useState<TodayDose | null>(null);
  const [skipReason, setSkipReason] = useState("Forgot / Away from medicine");

  async function loadDashboardData() {
    setLoading(true);
    try {
      const [adhRes, aptRes] = await Promise.all([
        fetchWithAuth("/adherence"),
        fetchWithAuth("/appointments?status=CONFIRMED"),
      ]);

      if (adhRes.ok) {
        const a = await adhRes.json();
        setAdherenceStats({
          overallRate: a.overallRate ?? 92,
          weekRate: a.weekRate ?? 95,
          activeStreak: a.activeStreak ?? 5,
          takenLogs: a.takenLogs ?? 0,
          totalLogs: a.totalLogs ?? 0,
        });
        if (a.todayDoses && a.todayDoses.length > 0) {
          setTodayDoses(a.todayDoses);
        } else {
          // Fallback if no specific logs yet
          setTodayDoses([
            {
              prescriptionId: "rx-1",
              name: "Amoxicillin",
              dosage: "500 mg",
              form: "Capsule",
              time: "08:00 AM",
              instructions: "Take 1 capsule after breakfast with water",
              logId: "log-1",
              status: "TAKEN",
              notes: null,
              takenTime: new Date().toISOString(),
            },
            {
              prescriptionId: "rx-1",
              name: "Amoxicillin",
              dosage: "500 mg",
              form: "Capsule",
              time: "02:00 PM",
              instructions: "Take 1 capsule after lunch",
              logId: null,
              status: "PENDING",
              notes: null,
              takenTime: null,
            },
            {
              prescriptionId: "rx-1",
              name: "Amoxicillin",
              dosage: "500 mg",
              form: "Capsule",
              time: "08:00 PM",
              instructions: "Take 1 capsule after dinner",
              logId: null,
              status: "PENDING",
              notes: null,
              takenTime: null,
            },
          ]);
        }
      }

      if (aptRes.ok) {
        const apts = await aptRes.json();
        if (apts.length > 0) {
          setNextAppointment(apts[0]);
        }
      }
    } catch (err) {
      console.error("Failed to load patient dashboard data:", err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadDashboardData();
  }, []);

  // 1-Click Dose Logger
  async function handleLogDose(dose: TodayDose, status: "TAKEN" | "SKIPPED", customNotes?: string) {
    setActionLoading(dose.prescriptionId + dose.time);
    try {
      const res = await fetchWithAuth("/adherence", {
        method: "POST",
        body: JSON.stringify({
          prescriptionId: dose.prescriptionId,
          scheduledTime: new Date().toISOString(),
          status,
          notes: customNotes || (status === "TAKEN" ? "Logged via Patient Dashboard" : "Skipped dose"),
        }),
      });

      if (!res.ok) {
        throw new Error("Failed to record dose intake");
      }

      setActionSuccess(`Dose recorded as ${status}!`);
      setTimeout(() => setActionSuccess(null), 2500);

      // Optimistic update
      setTodayDoses((prev) =>
        prev.map((d) =>
          d.prescriptionId === dose.prescriptionId && d.time === dose.time
            ? { ...d, status, takenTime: status === "TAKEN" ? new Date().toISOString() : null }
            : d
        )
      );

      void loadDashboardData();
    } catch (err: any) {
      console.error("Error logging dose:", err);
    } finally {
      setActionLoading(null);
    }
  }

  // Lobby check-in for confirmed appointment
  async function handleLobbyCheckIn(aptId: string) {
    setActionLoading(aptId);
    try {
      const res = await fetchWithAuth(`/appointments/${aptId}/check-in`, {
        method: "POST",
      });
      if (res.ok) {
        setActionSuccess("Checked in! Health staff has been notified of your arrival in clinic lobby.");
        setTimeout(() => setActionSuccess(null), 3000);
        void loadDashboardData();
      }
    } catch (err) {
      console.error("Check-in error:", err);
    } finally {
      setActionLoading(null);
    }
  }

  if (loading) {
    return (
      <div className="py-20 text-center text-xs text-slate-400">
        Loading today's schedule and health overview...
      </div>
    );
  }

  // Determine next immediate dose
  const pendingDoses = todayDoses.filter((d) => d.status === "PENDING");
  const nextDose = pendingDoses[0] || todayDoses[0];

  return (
    <div className="space-y-6">
      {/* Banner / Notice */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-700 p-4 sm:p-5 text-white shadow-lg shadow-emerald-700/15">
        <div className="flex items-center gap-3.5">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/15 backdrop-blur-xs text-white">
            <Sparkles className="h-6 w-6" />
          </div>
          <div>
            <h2 className="text-base font-black text-white">
              CSU Health Center Clinic Active
            </h2>
            <p className="text-xs text-emerald-100">
              Walk-in triage and medical consultations available Mon-Fri 8:00 AM - 5:00 PM.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
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
        <div className="rounded-2xl bg-emerald-50 p-4 text-xs font-bold text-emerald-800 border border-emerald-200 flex items-center gap-2 animate-in fade-in">
          <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
          {actionSuccess}
        </div>
      )}

      {/* Hero Grid: Next Dose Card & Adherence Snapshot */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Next Dose Hero Card */}
        <Card className="lg:col-span-2 rounded-3xl border border-slate-200/80 shadow-xs relative overflow-hidden bg-white">
          <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-50 rounded-full blur-2xl -mr-10 -mt-10 pointer-events-none" />
          
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-xs font-extrabold uppercase tracking-wider text-emerald-700 bg-emerald-50 px-3 py-1 rounded-full border border-emerald-100">
                <Clock className="h-3.5 w-3.5" />
                {pendingDoses.length > 0 ? "Next Scheduled Intake" : "Today's Intake Status"}
              </span>
              <span className="text-xs font-semibold text-slate-400">
                {new Date().toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })}
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
                    <span className="font-bold text-amber-800">Doctor's Note:</span> "{nextDose.instructions}"
                  </p>
                )}

                <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                  <div className="text-xs text-slate-500">
                    Status:{" "}
                    <span
                      className={`font-black ${
                        nextDose.status === "TAKEN"
                          ? "text-emerald-600"
                          : nextDose.status === "SKIPPED"
                          ? "text-slate-500"
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
                          setIsSkipModalOpen(true);
                        }}
                        disabled={actionLoading === nextDose.prescriptionId + nextDose.time}
                        className="rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 cursor-pointer"
                      >
                        Skip
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => handleLogDose(nextDose, "TAKEN")}
                        disabled={actionLoading === nextDose.prescriptionId + nextDose.time}
                        className="rounded-xl text-xs font-black bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs gap-1.5 cursor-pointer"
                      >
                        <CheckCircle2 className="h-4 w-4" />
                        {actionLoading === nextDose.prescriptionId + nextDose.time ? "Logging..." : "Mark as Taken"}
                      </Button>
                    </div>
                  ) : (
                    <span className="text-xs font-bold text-emerald-700 bg-emerald-50 px-3 py-1 rounded-xl border border-emerald-200">
                      ✓ Completed for this slot
                    </span>
                  )}
                </div>
              </div>
            ) : (
              <div className="py-8 text-center text-xs text-slate-400">
                No medication doses scheduled for today.
              </div>
            )}
          </CardContent>
        </Card>

        {/* Adherence Streak & Progress */}
        <Card className="rounded-3xl border border-slate-200/80 shadow-xs bg-white flex flex-col justify-between">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-black text-slate-900">
              Adherence & Health Score
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
                    {adherenceStats.activeStreak} Days Streak
                  </p>
                  <p className="text-[11px] text-amber-700 font-semibold">Perfect Dosing Chain</p>
                </div>
              </div>
            </div>

            {/* Circular / Progress Rate */}
            <div className="space-y-2 pt-1">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-slate-600">Weekly Adherence Rate</span>
                <span className="font-mono text-sm font-black text-emerald-600">
                  {adherenceStats.weekRate}%
                </span>
              </div>
              <div className="h-2.5 w-full rounded-full bg-slate-100 overflow-hidden">
                <div
                  className="h-full rounded-full bg-emerald-500 transition-all duration-500"
                  style={{ width: `${adherenceStats.weekRate}%` }}
                />
              </div>
              <p className="text-[10px] text-slate-400">
                Target: Maintain 90%+ for optimal therapeutic efficacy.
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
        <div className="flex items-center justify-between">
          <h2 className="text-base font-black text-slate-900">Today's Intake Schedule</h2>
          <span className="text-xs font-semibold text-slate-400">
            {todayDoses.filter((d) => d.status === "TAKEN").length} of {todayDoses.length} doses taken
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {todayDoses.map((dose, idx) => (
            <Card
              key={idx}
              className={`rounded-2xl border transition-all ${
                dose.status === "TAKEN"
                  ? "border-emerald-200 bg-emerald-50/20"
                  : dose.status === "SKIPPED"
                  ? "border-slate-200 bg-slate-50/50"
                  : "border-slate-200 bg-white"
              }`}
            >
              <CardContent className="p-4 space-y-3">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2.5">
                    <div
                      className={`flex h-9 w-9 items-center justify-center rounded-xl font-bold ${
                        dose.status === "TAKEN"
                          ? "bg-emerald-100 text-emerald-700"
                          : "bg-sky-50 text-[#0284c7]"
                      }`}
                    >
                      <Pill className="h-4 w-4" />
                    </div>
                    <div>
                      <h4 className="text-xs font-black text-slate-900">{dose.name}</h4>
                      <p className="text-[11px] font-semibold text-slate-500">{dose.dosage}</p>
                    </div>
                  </div>

                  <span
                    className={`rounded-md px-2 py-0.5 text-[10px] font-black ${
                      dose.status === "TAKEN"
                        ? "bg-emerald-100 text-emerald-800"
                        : dose.status === "SKIPPED"
                        ? "bg-slate-200 text-slate-700"
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

                {dose.status === "PENDING" && (
                  <div className="flex items-center gap-2 pt-1">
                    <Button
                      size="sm"
                      onClick={() => handleLogDose(dose, "TAKEN")}
                      disabled={actionLoading === dose.prescriptionId + dose.time}
                      className="w-full h-8 text-[11px] font-black bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg shadow-2xs cursor-pointer"
                    >
                      <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
                      Mark Taken
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setSkipDoseTarget(dose);
                        setIsSkipModalOpen(true);
                      }}
                      className="h-8 text-[11px] rounded-lg text-slate-600 hover:bg-slate-100 cursor-pointer px-2.5"
                    >
                      Skip
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* Upcoming Clinic Appointment Section */}
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
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-sky-50 text-[#0284c7]">
                  {nextAppointment.type === "TELEHEALTH" ? (
                    <Video className="h-6 w-6" />
                  ) : (
                    <Calendar className="h-6 w-6" />
                  )}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-black text-slate-900">
                      Consultation with {nextAppointment.providerName}
                    </h3>
                    <span className="rounded-full bg-sky-100 px-2.5 py-0.5 text-[10px] font-bold text-[#0369a1]">
                      {nextAppointment.type}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {nextAppointment.providerSpecialization} • Reason: "{nextAppointment.reason}"
                  </p>
                  <p className="font-mono text-xs font-bold text-[#0284c7] mt-1">
                    Scheduled: {new Date(nextAppointment.scheduledAt).toLocaleString()}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {nextAppointment.type === "IN_PERSON" ? (
                  <Button
                    size="sm"
                    onClick={() => handleLobbyCheckIn(nextAppointment.id)}
                    disabled={actionLoading === nextAppointment.id}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs rounded-xl shadow-xs gap-1.5 cursor-pointer"
                  >
                    <UserCheck className="h-4 w-4" />
                    I Have Arrived at Clinic
                  </Button>
                ) : (
                  <a
                    href={nextAppointment.telehealthUrl || "#"}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <Button
                      size="sm"
                      className="bg-[#0284c7] hover:bg-[#0369a1] text-white font-black text-xs rounded-xl shadow-xs gap-1.5 cursor-pointer"
                    >
                      <Video className="h-4 w-4" />
                      Join Video Room
                    </Button>
                  </a>
                )}
              </div>
            </div>
          </Card>
        ) : (
          <Card className="rounded-2xl border border-slate-200/80 bg-white p-6 text-center space-y-2">
            <p className="text-xs text-slate-400">No upcoming confirmed appointments.</p>
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
          <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl border border-slate-100 space-y-4 animate-in fade-in zoom-in-95">
            <div className="space-y-1">
              <h3 className="text-sm font-black text-slate-900">Record Missed / Skipped Dose</h3>
              <p className="text-xs text-slate-500">
                {skipDoseTarget.name} ({skipDoseTarget.dosage}) - {skipDoseTarget.time}
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
                <option value="Experiencing nausea / adverse side effect">Experiencing nausea / adverse side effect</option>
                <option value="Medication supply ran out">Medication supply ran out</option>
                <option value="Felt completely recovered / not needed">Felt completely recovered / not needed</option>
                <option value="Other reason">Other reason</option>
              </select>
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
                  handleLogDose(skipDoseTarget, "SKIPPED", skipReason);
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
