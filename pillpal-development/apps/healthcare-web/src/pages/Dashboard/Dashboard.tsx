import { useEffect, useState } from "react";
import {
  Activity,
  AlertTriangle,
  ArrowUpRight,
  Calendar,
  Clock,
  MessageSquare,
  Pill,
  Search,
  Sparkles,
  Stethoscope,
  TrendingUp,
  Users,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
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
  averageAdherence: number;
  todayAppointments: number;
  criticalAttentionCount: number;
};

type AttentionPatient = {
  id: string;
  name: string;
  idNumber: string;
  adherenceRate: number;
  missedDoses: number;
  lastMedication: string;
  condition: string;
};

type UpcomingAppointment = {
  id: string;
  patientName: string;
  idNumber: string;
  time: string;
  type: string;
  status: "CONFIRMED" | "WAITING" | "COMPLETED";
};

export function Dashboard() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [providerName, setProviderName] = useState("Doctor");
  const [providerRole, setProviderRole] = useState<"DOCTOR" | "HEALTH_STAFF">("DOCTOR");
  const [specialization, setSpecialization] = useState("");

  const [stats, setStats] = useState<DashboardStats>({
    totalPatients: 0,
    activeMedications: 0,
    averageAdherence: 100,
    todayAppointments: 0,
    criticalAttentionCount: 0,
  });

  const [attentionPatients, setAttentionPatients] = useState<AttentionPatient[]>([]);
  const [appointments, setAppointments] = useState<UpcomingAppointment[]>([]);

  useEffect(() => {
    async function loadDashboardData() {
      try {
        const res = await fetchWithAuth("/clinical-dashboard");
        if (res.ok) {
          const data = await res.json();
          if (data.provider) {
            setProviderName(
              data.provider.role === "DOCTOR"
                ? `Dr. ${data.provider.name}`
                : data.provider.name,
            );
            setProviderRole(data.provider.role);
            if (data.provider.specialization) {
              setSpecialization(data.provider.specialization);
            }
          }
          if (data.stats) {
            setStats(data.stats);
          }
          if (data.attentionPatients) {
            setAttentionPatients(data.attentionPatients);
          }
          if (data.upcomingAppointments) {
            setAppointments(data.upcomingAppointments);
          }
        }
      } catch (err) {
        console.error("Failed to load dashboard data:", err);
      } finally {
        setLoading(false);
      }
    }

    void loadDashboardData();
  }, []);

  const todayFormatted = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

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
          <h1 className="mt-1.5 text-2xl font-black tracking-tight text-slate-900 sm:text-3xl">
            Welcome back, {providerName}
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            {providerRole === "DOCTOR"
              ? `Attending Physician • ${specialization || "General Medicine"}`
              : "Clinical Health Staff • CSU Health Services"}
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <Button
            variant="outline"
            onClick={() => navigate("/app/patients")}
            className="gap-2 rounded-xl text-xs font-bold"
          >
            <Search className="h-3.5 w-3.5" />
            Find Patient
          </Button>
          <Button
            onClick={() => navigate("/app/appointments")}
            className="gap-2 rounded-xl text-xs font-bold bg-[#0284c7] hover:bg-[#0369a1]"
          >
            <Calendar className="h-3.5 w-3.5" />
            Today's Schedule
          </Button>
        </div>
      </div>

      {/* 2. Key Metrics Grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Total Patients */}
        <Card className="rounded-2xl border border-slate-100 shadow-xs hover:shadow-md transition-shadow">
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
        <Card className="rounded-2xl border border-slate-100 shadow-xs hover:shadow-md transition-shadow">
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
              Across 48 enrolled patients
            </p>
          </CardContent>
        </Card>

        {/* Adherence Rate */}
        <Card className="rounded-2xl border border-slate-100 shadow-xs hover:shadow-md transition-shadow">
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
                {stats.averageAdherence}%
              </div>
            )}
            <p className="mt-1 text-[11px] text-slate-500 font-medium">
              30-day medication compliance
            </p>
          </CardContent>
        </Card>

        {/* Attention Alerts */}
        <Card className="rounded-2xl border border-amber-100 bg-amber-50/30 shadow-xs hover:shadow-md transition-shadow">
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
              Patients with &lt;80% adherence
            </p>
          </CardContent>
        </Card>
      </div>

      {/* 3. Main Dashboard Panels */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Left 2 Cols: Attention Required & Clinical Schedule */}
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
                  High-risk adherence drop-offs requiring provider follow-up or dosage review.
                </CardDescription>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => navigate("/app/adherence")}
                className="gap-1 text-xs text-[#0284c7] font-semibold"
              >
                View all
                <ArrowUpRight className="h-3.5 w-3.5" />
              </Button>
            </CardHeader>

            <CardContent>
              <div className="space-y-3">
                {attentionPatients.map((patient) => (
                  <div
                    key={patient.id}
                    className="flex flex-col sm:flex-row sm:items-center justify-between p-3.5 rounded-xl border border-slate-100 bg-white hover:bg-slate-50/80 transition-colors gap-3"
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-50 text-amber-700 font-bold text-xs">
                        {patient.name[0]}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="text-xs font-bold text-slate-900">{patient.name}</p>
                          <span className="text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded-md font-mono">
                            {patient.idNumber}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-500 mt-0.5">
                          {patient.condition} • {patient.lastMedication}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center justify-between sm:justify-end gap-3">
                      <div className="text-right">
                        <span className="inline-flex items-center gap-1 rounded-md bg-amber-100/80 px-2 py-0.5 text-[11px] font-bold text-amber-800">
                          {patient.adherenceRate}% Adherence
                        </span>
                        <p className="text-[10px] text-red-600 font-medium mt-0.5">
                          {patient.missedDoses} missed doses this week
                        </p>
                      </div>

                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => navigate("/app/messages")}
                        className="rounded-xl text-xs font-semibold shrink-0"
                      >
                        <MessageSquare className="h-3.5 w-3.5 mr-1" />
                        Message
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Today's Schedule */}
          <Card className="rounded-2xl border border-slate-100 shadow-xs">
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <div>
                <CardTitle className="text-sm font-bold text-slate-900">
                  Today's Clinical Appointments
                </CardTitle>
                <CardDescription className="text-xs text-slate-500 mt-0.5">
                  Scheduled clinic visits and virtual follow-ups for {todayFormatted}.
                </CardDescription>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => navigate("/app/appointments")}
                className="gap-1 text-xs text-[#0284c7] font-semibold"
              >
                Schedule
                <ArrowUpRight className="h-3.5 w-3.5" />
              </Button>
            </CardHeader>

            <CardContent>
              <div className="divide-y divide-slate-100">
                {appointments.map((apt) => (
                  <div key={apt.id} className="flex items-center justify-between py-3">
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-sky-50 text-[#0284c7] text-xs font-bold">
                        <Clock className="h-4 w-4" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="text-xs font-bold text-slate-900">{apt.patientName}</p>
                          <span className="text-[10px] text-slate-400 font-mono">
                            {apt.idNumber}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-500">{apt.type}</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <span className="text-xs font-bold text-slate-800">{apt.time}</span>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                          apt.status === "CONFIRMED"
                            ? "bg-emerald-50 text-emerald-700"
                            : "bg-blue-50 text-blue-700"
                        }`}
                      >
                        {apt.status}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right 1 Col: Quick Actions & Clinic Notice */}
        <div className="space-y-6">
          {/* Quick Actions Card */}
          <Card className="rounded-2xl border border-slate-100 bg-white shadow-xs">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-bold text-slate-900">
                Clinical Quick Actions
              </CardTitle>
              <CardDescription className="text-xs text-slate-500">
                Shortcuts for everyday healthcare workflows.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              <Button
                variant="outline"
                onClick={() => navigate("/app/patients")}
                className="w-full justify-start gap-2.5 rounded-xl text-xs font-semibold h-10 border-slate-200"
              >
                <Users className="h-4 w-4 text-[#0284c7]" />
                <span>Search & View Patient Records</span>
              </Button>

              <Button
                variant="outline"
                onClick={() => navigate("/app/medications")}
                className="w-full justify-start gap-2.5 rounded-xl text-xs font-semibold h-10 border-slate-200"
              >
                <Pill className="h-4 w-4 text-indigo-600" />
                <span>Prescribe / Update Medication</span>
              </Button>

              <Button
                variant="outline"
                onClick={() => navigate("/app/adherence")}
                className="w-full justify-start gap-2.5 rounded-xl text-xs font-semibold h-10 border-slate-200"
              >
                <Activity className="h-4 w-4 text-emerald-600" />
                <span>Review Adherence Analytics</span>
              </Button>

              <Button
                variant="outline"
                onClick={() => navigate("/app/appointments")}
                className="w-full justify-start gap-2.5 rounded-xl text-xs font-semibold h-10 border-slate-200"
              >
                <Calendar className="h-4 w-4 text-amber-600" />
                <span>Book Patient Consultation</span>
              </Button>
            </CardContent>
          </Card>

          {/* CSU Clinic System Guidelines Card */}
          <Card className="rounded-2xl border border-sky-100 bg-gradient-to-br from-sky-50/60 to-white shadow-xs">
            <CardHeader className="pb-2">
              <div className="flex items-center gap-2 text-[#0284c7]">
                <Sparkles className="h-4 w-4" />
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
                • <strong>Health Staff</strong> can monitor adherence and log medicine dispensation.
              </p>
              <p>
                • Missed medication threshold is set to <strong>&lt;80%</strong> compliance.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
