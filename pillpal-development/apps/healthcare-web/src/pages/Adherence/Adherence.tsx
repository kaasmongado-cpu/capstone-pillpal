import { useEffect, useState } from "react";
import {
  CheckCircle2,
  Clock,
  RefreshCw,
  X,
  XCircle,
} from "lucide-react";
import { fetchWithAuth } from "@/lib/api";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

type AdherenceLogItem = {
  id: string;
  patientName: string;
  idNumber: string;
  medication: string;
  scheduledTime: string;
  takenTime: string | null;
  status: "TAKEN" | "MISSED" | "SKIPPED";
  notes: string | null;
  createdAt: string;
};

type AdherenceResponse = {
  overallRate: number;
  totalLogs: number;
  takenLogs: number;
  missedLogs: number;
  logs: AdherenceLogItem[];
};

export function Adherence() {
  const [data, setData] = useState<AdherenceResponse>({
    overallRate: 100,
    totalLogs: 0,
    takenLogs: 0,
    missedLogs: 0,
    logs: [],
  });
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState<"ALL" | "TAKEN" | "MISSED" | "SKIPPED">("ALL");
  const [selectedLog, setSelectedLog] = useState<AdherenceLogItem | null>(null);

  async function loadAdherence() {
    setLoading(true);
    try {
      const res = await fetchWithAuth("/adherence");
      if (res.ok) {
        const result = await res.json();
        setData(result);
      }
    } catch (err) {
      console.error("Failed to load adherence data:", err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadAdherence();
  }, []);

  const filteredLogs = data.logs.filter((l) =>
    filterStatus === "ALL" ? true : l.status === filterStatus
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-slate-900">
            Medication Adherence Monitoring
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Real-time tracking of patient medication logs, missed doses, and compliance analytics.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={() => void loadAdherence()}
            className="gap-2 rounded-xl text-xs font-bold"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            Refresh Stream
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card className="rounded-2xl border border-slate-100 shadow-xs">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-semibold text-slate-500 uppercase">
              Overall Campus Compliance
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald-600">
              {data.overallRate}%
            </div>
            <p className="mt-1 text-[11px] text-slate-400">
              Target clinical benchmark: ≥ 85%
            </p>
          </CardContent>
        </Card>

        <Card className="rounded-2xl border border-slate-100 shadow-xs">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-semibold text-slate-500 uppercase">
              Successfully Taken Doses
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-slate-900">
              {data.takenLogs} <span className="text-sm font-normal text-slate-400">/ {data.totalLogs}</span>
            </div>
            <p className="mt-1 text-[11px] text-emerald-600 font-medium">
              Recorded ingestion confirmations
            </p>
          </CardContent>
        </Card>

        <Card className="rounded-2xl border border-amber-100 bg-amber-50/20 shadow-xs">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-semibold text-amber-800 uppercase">
              Missed Doses Alert
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-amber-700">
              {data.missedLogs} Doses
            </div>
            <p className="mt-1 text-[11px] text-amber-600 font-medium">
              Requiring clinician follow-up
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Adherence Logs Feed */}
      <Card className="rounded-2xl border border-slate-100 shadow-xs overflow-hidden">
        <CardHeader className="pb-3 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <CardTitle className="text-sm font-bold text-slate-900">
              Medication Ingestion Events
            </CardTitle>
            <CardDescription className="text-xs text-slate-500">
              Chronological log of mobile patient intake recordings.
            </CardDescription>
          </div>

          <div className="flex items-center gap-1.5 bg-slate-50 p-1 rounded-xl">
            {(["ALL", "TAKEN", "MISSED", "SKIPPED"] as const).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setFilterStatus(s)}
                className={`rounded-lg px-2.5 py-1 text-[11px] font-semibold transition-colors cursor-pointer ${
                  filterStatus === s
                    ? "bg-white text-slate-900 shadow-2xs font-bold"
                    : "text-slate-500 hover:text-slate-900"
                }`}
              >
                {s === "ALL" ? "All" : s}
              </button>
            ))}
          </div>
        </CardHeader>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-700">
            <thead className="border-b border-slate-100 bg-slate-50/70 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
              <tr>
                <th className="px-6 py-3.5">Patient</th>
                <th className="px-6 py-3.5">Prescribed Medication</th>
                <th className="px-6 py-3.5">Scheduled Time</th>
                <th className="px-6 py-3.5">Recorded Status</th>
                <th className="px-6 py-3.5">Notes</th>
                <th className="px-6 py-3.5 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-xs text-slate-400">
                    Loading live intake events...
                  </td>
                </tr>
              ) : filteredLogs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-xs text-slate-400">
                    No adherence logs found for the selected filter.
                  </td>
                </tr>
              ) : (
                filteredLogs.map((log) => (
                  <tr key={log.id} className="hover:bg-slate-50/60 transition-colors">
                    <td className="px-6 py-4">
                      <p className="font-bold text-slate-900">{log.patientName}</p>
                      <p className="font-mono text-[11px] text-slate-400">{log.idNumber}</p>
                    </td>
                    <td className="px-6 py-4 font-semibold text-slate-800">
                      {log.medication}
                    </td>
                    <td className="px-6 py-4 text-slate-500">
                      {new Date(log.scheduledTime).toLocaleString([], {
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </td>
                    <td className="px-6 py-4">
                      <span
                        className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-bold ${
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
                    </td>
                    <td className="px-6 py-4 text-slate-500 max-w-xs truncate">
                      {log.notes || "—"}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setSelectedLog(log)}
                        className="text-xs text-[#0284c7] font-semibold cursor-pointer"
                      >
                        Details
                      </Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Log Details Modal */}
      {selectedLog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl border border-slate-100 space-y-4 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h2 className="text-base font-black text-slate-900">Adherence Log Details</h2>
              <button
                type="button"
                onClick={() => setSelectedLog(null)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="rounded-xl bg-slate-50 p-3 space-y-1.5">
                <div className="flex justify-between">
                  <span className="text-slate-400">Patient:</span>
                  <span className="font-bold text-slate-900">{selectedLog.patientName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">CSU ID:</span>
                  <span className="font-mono font-semibold text-slate-700">{selectedLog.idNumber}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Medication:</span>
                  <span className="font-bold text-[#0284c7]">{selectedLog.medication}</span>
                </div>
              </div>

              <div className="space-y-2 border-t border-slate-100 pt-3">
                <div className="flex justify-between">
                  <span className="text-slate-400">Scheduled:</span>
                  <span className="font-semibold text-slate-800">
                    {new Date(selectedLog.scheduledTime).toLocaleString()}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Taken Time:</span>
                  <span className="font-semibold text-slate-800">
                    {selectedLog.takenTime ? new Date(selectedLog.takenTime).toLocaleString() : "Not recorded"}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-400">Status:</span>
                  <span className="font-bold">{selectedLog.status}</span>
                </div>
              </div>

              {selectedLog.notes && (
                <div className="rounded-xl border border-slate-100 p-3 bg-slate-50/50">
                  <span className="text-slate-400 block mb-1 font-semibold">Intake Notes:</span>
                  <p className="text-slate-700 italic">"{selectedLog.notes}"</p>
                </div>
              )}
            </div>

            <div className="pt-2 flex justify-end">
              <Button
                variant="outline"
                onClick={() => setSelectedLog(null)}
                className="rounded-xl text-xs font-bold"
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
