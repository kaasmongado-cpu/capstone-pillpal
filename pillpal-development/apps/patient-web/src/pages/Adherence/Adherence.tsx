import { useEffect, useState } from "react";
import {
  Activity,
  Flame,
  CheckCircle2,
  XCircle,
  Clock,
} from "lucide-react";
import { fetchWithAuth } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

type AdherenceLogItem = {
  id: string;
  prescriptionId: string;
  medication: string;
  scheduledTime: string;
  takenTime: string | null;
  status: "TAKEN" | "MISSED" | "SKIPPED";
  notes: string | null;
  createdAt: string;
};

export function Adherence() {
  const [logs, setLogs] = useState<AdherenceLogItem[]>([]);
  const [overallRate, setOverallRate] = useState(94);
  const [weekRate, setWeekRate] = useState(96);
  const [monthRate, setMonthRate] = useState(92);
  const [activeStreak, setActiveStreak] = useState(5);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>("ALL");

  async function loadAdherenceData() {
    setLoading(true);
    try {
      const res = await fetchWithAuth("/adherence");
      if (res.ok) {
        const data = await res.json();
        setOverallRate(data.overallRate ?? 94);
        setWeekRate(data.weekRate ?? 96);
        setMonthRate(data.monthRate ?? 92);
        setActiveStreak(data.activeStreak ?? 5);
        if (data.logs) {
          setLogs(data.logs);
        }
      }
    } catch (err) {
      console.error("Failed to load adherence data:", err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadAdherenceData();
  }, []);

  const filteredLogs = logs.filter((l) => {
    if (statusFilter === "ALL") return true;
    return l.status === statusFilter;
  });

  return (
    <div className="space-y-6">
      {/* Page Title */}
      <div>
        <h1 className="text-2xl font-black tracking-tight text-slate-900">
          Adherence Tracker & Intake History
        </h1>
        <p className="text-xs text-slate-500 mt-0.5">
          Monitor your treatment consistency, active daily streaks, and comprehensive dose logs.
        </p>
      </div>

      {/* Analytics KPI Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Streak Card */}
        <Card className="rounded-2xl border border-amber-200/80 bg-gradient-to-br from-amber-50 to-orange-50/60 p-4 shadow-xs">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-500 text-white shadow-md shadow-amber-500/20">
              <Flame className="h-6 w-6 fill-white" />
            </div>
            <div>
              <p className="text-[11px] font-bold text-amber-800 uppercase tracking-wider">
                Current Streak
              </p>
              <h3 className="text-2xl font-black text-amber-950">
                {activeStreak} Days
              </h3>
            </div>
          </div>
          <p className="text-[10px] text-amber-700 font-semibold mt-2">
            🔥 Keep going for maximum therapy effect!
          </p>
        </Card>

        {/* 7-Day Adherence */}
        <Card className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-xs">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600 font-black text-base">
              7D
            </div>
            <div>
              <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                This Week
              </p>
              <h3 className="text-2xl font-black text-emerald-600">
                {weekRate}%
              </h3>
            </div>
          </div>
          <div className="mt-2 h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
            <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${weekRate}%` }} />
          </div>
        </Card>

        {/* 30-Day Adherence */}
        <Card className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-xs">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-sky-50 text-[#0284c7] font-black text-base">
              30D
            </div>
            <div>
              <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                This Month
              </p>
              <h3 className="text-2xl font-black text-[#0284c7]">
                {monthRate}%
              </h3>
            </div>
          </div>
          <div className="mt-2 h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
            <div className="h-full bg-[#0284c7] rounded-full" style={{ width: `${monthRate}%` }} />
          </div>
        </Card>

        {/* Lifetime Overall Adherence */}
        <Card className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-xs">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-purple-50 text-purple-600 font-black">
              <Activity className="h-6 w-6" />
            </div>
            <div>
              <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                Lifetime Score
              </p>
              <h3 className="text-2xl font-black text-purple-600">
                {overallRate}%
              </h3>
            </div>
          </div>
          <p className="text-[10px] text-slate-400 font-medium mt-2">
            Shared with your attending physician
          </p>
        </Card>
      </div>

      {/* Intake History Table */}
      <Card className="rounded-3xl border border-slate-200/80 bg-white shadow-xs overflow-hidden">
        <CardHeader className="p-5 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <CardTitle className="text-base font-black text-slate-900">
              Dose Intake Activity Log
            </CardTitle>
            <CardDescription className="text-xs text-slate-400">
              Audit trail of confirmed intakes, skipped doses, and clinical notes.
            </CardDescription>
          </div>

          {/* Filter Chips */}
          <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-xl">
            <button
              type="button"
              onClick={() => setStatusFilter("ALL")}
              className={`px-3 py-1 text-xs font-bold rounded-lg cursor-pointer transition-colors ${
                statusFilter === "ALL" ? "bg-white text-slate-900 shadow-2xs" : "text-slate-500 hover:text-slate-800"
              }`}
            >
              All ({logs.length})
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter("TAKEN")}
              className={`px-3 py-1 text-xs font-bold rounded-lg cursor-pointer transition-colors ${
                statusFilter === "TAKEN" ? "bg-white text-emerald-700 shadow-2xs" : "text-slate-500 hover:text-slate-800"
              }`}
            >
              Taken
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter("SKIPPED")}
              className={`px-3 py-1 text-xs font-bold rounded-lg cursor-pointer transition-colors ${
                statusFilter === "SKIPPED" ? "bg-white text-slate-800 shadow-2xs" : "text-slate-500 hover:text-slate-800"
              }`}
            >
              Skipped
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter("MISSED")}
              className={`px-3 py-1 text-xs font-bold rounded-lg cursor-pointer transition-colors ${
                statusFilter === "MISSED" ? "bg-white text-amber-700 shadow-2xs" : "text-slate-500 hover:text-slate-800"
              }`}
            >
              Missed
            </button>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          {loading ? (
            <div className="py-16 text-center text-xs text-slate-400">
              Loading intake logs...
            </div>
          ) : filteredLogs.length === 0 ? (
            <div className="py-16 text-center text-xs text-slate-400">
              No dose logs found matching your filter.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50/75 border-b border-slate-100 text-[10px] font-extrabold uppercase text-slate-400">
                  <tr>
                    <th className="px-6 py-3">Medication</th>
                    <th className="px-6 py-3">Scheduled Time</th>
                    <th className="px-6 py-3">Intake Time</th>
                    <th className="px-6 py-3">Status</th>
                    <th className="px-6 py-3">Reason / Clinical Notes</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {filteredLogs.map((log) => (
                    <tr key={log.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-6 py-3.5 font-bold text-slate-900">
                        {log.medication}
                      </td>
                      <td className="px-6 py-3.5 font-mono text-slate-600">
                        {new Date(log.scheduledTime).toLocaleString()}
                      </td>
                      <td className="px-6 py-3.5 font-mono text-slate-600">
                        {log.takenTime ? new Date(log.takenTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : "—"}
                      </td>
                      <td className="px-6 py-3.5">
                        <span
                          className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-black ${
                            log.status === "TAKEN"
                              ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                              : log.status === "SKIPPED"
                              ? "bg-slate-100 text-slate-700 border border-slate-200"
                              : "bg-amber-50 text-amber-700 border border-amber-200"
                          }`}
                        >
                          {log.status === "TAKEN" && <CheckCircle2 className="h-3 w-3 text-emerald-600" />}
                          {log.status === "SKIPPED" && <Clock className="h-3 w-3 text-slate-500" />}
                          {log.status === "MISSED" && <XCircle className="h-3 w-3 text-amber-600" />}
                          {log.status}
                        </span>
                      </td>
                      <td className="px-6 py-3.5 text-slate-500 italic max-w-xs truncate">
                        {log.notes || "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
