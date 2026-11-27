import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Activity,
  AlertTriangle,
  BarChart3,
  Building2,
  CheckCircle2,
  Clock,
  Download,
  MessageSquare,
  Pill,
  Printer,
  RefreshCw,
  Search,
  ShieldAlert,
  TrendingDown,
  TrendingUp,
  Users,
  X,
  XCircle,
} from "lucide-react";
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
import { Input } from "@/components/ui/input";

type RiskSeverity = "CRITICAL" | "WARNING" | "ON_TRACK";

type AdherenceLogItem = {
  id: string;
  patientId?: string;
  patientUserId?: string;
  patientName: string;
  idNumber: string;
  department?: string;
  medication: string;
  scheduledTime: string;
  takenTime: string | null;
  status: "TAKEN" | "MISSED" | "SKIPPED";
  delayMinutes?: number | null;
  isAutoMissed?: boolean;
  notes: string | null;
  createdAt: string;
};

type PatientAdherenceSummary = {
  patientId: string;
  userId: string;
  patientName: string;
  idNumber: string;
  department: string;
  totalLogs: number;
  takenLogs: number;
  missedLogs: number;
  skippedLogs: number;
  adherenceRate: number;
  onTimeRate: number | null;
  consecutiveMissed: number;
  severity: RiskSeverity;
  alertReasons: string[];
  activeMedicationsCount: number;
  lastEventAt: string;
};

type DailyTrendPoint = {
  date: string;
  taken: number;
  missed: number;
  skipped: number;
  total: number;
  rate: number | null;
};

type TimeOfDayPoint = {
  period: string;
  label: string;
  taken: number;
  missed: number;
  total: number;
  rate: number | null;
};

type DepartmentBreakdownItem = {
  department: string;
  patientCount: number;
  totalLogs: number;
  takenLogs: number;
  missedLogs: number;
  adherenceRate: number;
};

type MedicationBreakdownItem = {
  medication: string;
  patientCount: number;
  totalLogs: number;
  takenLogs: number;
  missedLogs: number;
  skippedLogs: number;
  adherenceRate: number;
};

type AdherenceResponse = {
  threshold: number;
  overallRate: number | null;
  prevPeriodRate: number | null;
  periodDelta: number | null;
  onTimeRate: number | null;
  avgDelayMinutes: number | null;
  criticalCount: number;
  warningCount: number;
  totalLogs: number;
  takenLogs: number;
  missedLogs: number;
  skippedLogs: number;
  dailyTrend: DailyTrendPoint[];
  timeOfDayBreakdown: TimeOfDayPoint[];
  peakRiskWindow: {
    period: string;
    label: string;
    rate: number;
    missedOrSkipped: number;
  } | null;
  departmentBreakdown: DepartmentBreakdownItem[];
  medicationBreakdown: MedicationBreakdownItem[];
  patientSummaries: PatientAdherenceSummary[];
  logs: AdherenceLogItem[];
};

function getSavedComplianceThreshold(userId?: string): number {
  try {
    const raw = localStorage.getItem(`pillpal_clinician_prefs_${userId || "default"}`);
    if (raw) {
      const parsed = JSON.parse(raw);
      const val = Number(parsed?.complianceThreshold);
      if (Number.isFinite(val) && val >= 50 && val <= 95) return val;
    }
  } catch {
    // ignore storage errors
  }
  return 80;
}

function escapeCsvCell(val: string | number | null | undefined): string {
  const str = String(val ?? "");
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function escapeHtml(val: string | number | null | undefined): string {
  return String(val ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatDelayLabel(delayMinutes: number | null | undefined): string | null {
  if (delayMinutes === null || delayMinutes === undefined) return null;
  const abs = Math.abs(delayMinutes);
  if (abs <= 5) return "Exact";
  if (abs <= 30) return delayMinutes >= 0 ? `+${abs}m` : `-${abs}m`;
  if (abs < 60) return delayMinutes >= 0 ? `+${abs}m late` : `-${abs}m early`;
  const hrs = Math.round((abs / 60) * 10) / 10;
  return delayMinutes >= 0 ? `+${hrs}h late` : `-${hrs}h early`;
}

function formatShortDay(isoDate: string): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  const dt = new Date(y || 2026, (m || 1) - 1, d || 1);
  return dt.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function Adherence() {
  const navigate = useNavigate();
  const [data, setData] = useState<AdherenceResponse>({
    threshold: 80,
    overallRate: null,
    prevPeriodRate: null,
    periodDelta: null,
    onTimeRate: null,
    avgDelayMinutes: null,
    criticalCount: 0,
    warningCount: 0,
    totalLogs: 0,
    takenLogs: 0,
    missedLogs: 0,
    skippedLogs: 0,
    dailyTrend: [],
    timeOfDayBreakdown: [],
    peakRiskWindow: null,
    departmentBreakdown: [],
    medicationBreakdown: [],
    patientSummaries: [],
    logs: [],
  });
  const [loading, setLoading] = useState(true);
  const [daysRange, setDaysRange] = useState<"7" | "30" | "90" | "ALL">("30");
  const [activeView, setActiveView] = useState<"events" | "patients">("events");
  const [breakdownTab, setBreakdownTab] = useState<"department" | "medication">("department");
  const [searchQuery, setSearchQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState<"ALL" | "TAKEN" | "MISSED" | "SKIPPED">("ALL");
  const [threshold, setThreshold] = useState<number>(80);
  const [selectedLog, setSelectedLog] = useState<AdherenceLogItem | null>(null);

  const loadAdherence = useCallback(async () => {
    setLoading(true);
    try {
      const {
        data: { session },
      } = await getSession();
      const savedThreshold = getSavedComplianceThreshold(session?.user?.id);
      setThreshold(savedThreshold);

      const params = new URLSearchParams();
      if (daysRange !== "ALL") params.set("days", daysRange);
      params.set("threshold", String(savedThreshold));

      const res = await fetchWithAuth(`/adherence?${params.toString()}`);
      if (res.ok) {
        const result = await res.json();
        setData({
          threshold: result.threshold ?? savedThreshold,
          overallRate: result.overallRate ?? null,
          prevPeriodRate: result.prevPeriodRate ?? null,
          periodDelta: result.periodDelta ?? null,
          onTimeRate: result.onTimeRate ?? null,
          avgDelayMinutes: result.avgDelayMinutes ?? null,
          criticalCount: result.criticalCount ?? 0,
          warningCount: result.warningCount ?? 0,
          totalLogs: result.totalLogs ?? 0,
          takenLogs: result.takenLogs ?? 0,
          missedLogs: result.missedLogs ?? 0,
          skippedLogs: result.skippedLogs ?? 0,
          dailyTrend: Array.isArray(result.dailyTrend) ? result.dailyTrend : [],
          timeOfDayBreakdown: Array.isArray(result.timeOfDayBreakdown)
            ? result.timeOfDayBreakdown
            : [],
          peakRiskWindow: result.peakRiskWindow ?? null,
          departmentBreakdown: Array.isArray(result.departmentBreakdown)
            ? result.departmentBreakdown
            : [],
          medicationBreakdown: Array.isArray(result.medicationBreakdown)
            ? result.medicationBreakdown
            : [],
          patientSummaries: Array.isArray(result.patientSummaries)
            ? result.patientSummaries
            : [],
          logs: Array.isArray(result.logs) ? result.logs : [],
        });
      }
    } catch (err) {
      console.error("Failed to load adherence data:", err);
    } finally {
      setLoading(false);
    }
  }, [daysRange]);

  useEffect(() => {
    void loadAdherence();
  }, [loadAdherence]);

  const filteredLogs = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return data.logs.filter((l) => {
      const matchesStatus = filterStatus === "ALL" ? true : l.status === filterStatus;
      const matchesQuery =
        !q ||
        l.patientName.toLowerCase().includes(q) ||
        l.idNumber.toLowerCase().includes(q) ||
        l.medication.toLowerCase().includes(q) ||
        (l.department && l.department.toLowerCase().includes(q));
      return matchesStatus && matchesQuery;
    });
  }, [data.logs, filterStatus, searchQuery]);

  const filteredPatients = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return data.patientSummaries.filter((p) => {
      if (!q) return true;
      return (
        p.patientName.toLowerCase().includes(q) ||
        p.idNumber.toLowerCase().includes(q) ||
        p.department.toLowerCase().includes(q)
      );
    });
  }, [data.patientSummaries, searchQuery]);

  const flaggedPatients = useMemo(
    () => data.patientSummaries.filter((p) => p.severity === "CRITICAL" || p.severity === "WARNING"),
    [data.patientSummaries],
  );

  function triggerCsvDownload(filename: string, headers: string[], rows: (string | number)[][]) {
    const csv = [headers, ...rows]
      .map((row) => row.map(escapeCsvCell).join(","))
      .join("\r\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  function handleExportCsv() {
    const todayIso = new Date().toISOString().slice(0, 10);
    if (activeView === "patients") {
      const headers = [
        "Patient Name",
        "CSU ID",
        "College / Unit",
        "Risk Tier",
        "Compliance Rate (%)",
        "On-Time Rate (%)",
        "Taken Doses",
        "Missed Doses",
        "Skipped Doses",
        "Consecutive Missed",
        "Total Logs",
        "Alert Triggers",
      ];
      const rows = filteredPatients.map((p) => [
        p.patientName,
        p.idNumber,
        p.department,
        p.severity,
        p.adherenceRate,
        p.onTimeRate !== null ? p.onTimeRate : "N/A",
        p.takenLogs,
        p.missedLogs,
        p.skippedLogs,
        p.consecutiveMissed,
        p.totalLogs,
        p.alertReasons.join("; "),
      ]);
      triggerCsvDownload(`pillpal-patient-adherence-summary-${daysRange}d-${todayIso}.csv`, headers, rows);
      return;
    }

    const headers = [
      "Patient Name",
      "CSU ID",
      "College / Unit",
      "Medication",
      "Scheduled Time",
      "Taken Time",
      "Status",
      "Timing Offset (min)",
      "Auto-Flagged Missed",
      "Notes",
    ];
    const rows = filteredLogs.map((l) => [
      l.patientName,
      l.idNumber,
      l.department || "",
      l.medication,
      new Date(l.scheduledTime).toLocaleString("en-PH"),
      l.takenTime ? new Date(l.takenTime).toLocaleString("en-PH") : "",
      l.status,
      l.delayMinutes !== null && l.delayMinutes !== undefined ? l.delayMinutes : "",
      l.isAutoMissed ? "Yes" : "No",
      l.notes || "",
    ]);
    triggerCsvDownload(`pillpal-adherence-events-${daysRange}d-${todayIso}.csv`, headers, rows);
  }

  function handlePrintReport() {
    const printWin = window.open("", "_blank", "width=960,height=900");
    if (!printWin) return;

    const periodLabel =
      daysRange === "ALL" ? "All Recorded History" : `Last ${daysRange} Days`;

    const alertsHtml =
      flaggedPatients.length === 0
        ? `<p style="color:#047857;font-size:12px;font-weight:700;">All monitored patients currently meet the ≥ ${threshold}% clinical adherence target.</p>`
        : `<table>
            <thead>
              <tr>
                <th>Risk Tier</th>
                <th>Patient</th>
                <th>College / Unit</th>
                <th>Compliance</th>
                <th>Missed (Streak)</th>
                <th>Automated Alert Triggers</th>
              </tr>
            </thead>
            <tbody>
              ${flaggedPatients
                .map(
                  (p) => `<tr>
                    <td><span class="pill ${p.severity === "CRITICAL" ? "pill-red" : "pill-amber"}">${escapeHtml(p.severity)}</span></td>
                    <td><strong>${escapeHtml(p.patientName)}</strong><br/><span class="muted">${escapeHtml(p.idNumber)}</span></td>
                    <td>${escapeHtml(p.department)}</td>
                    <td><strong>${p.adherenceRate}%</strong></td>
                    <td>${p.missedLogs} (${p.consecutiveMissed} consec.)</td>
                    <td>${escapeHtml(p.alertReasons.join("; "))}</td>
                  </tr>`,
                )
                .join("")}
            </tbody>
          </table>`;

    const deptRowsHtml = data.departmentBreakdown
      .map(
        (d) => `<tr>
          <td><strong>${escapeHtml(d.department)}</strong></td>
          <td>${d.patientCount}</td>
          <td>${d.takenLogs} / ${d.totalLogs}</td>
          <td>${d.missedLogs}</td>
          <td><strong>${d.adherenceRate}%</strong></td>
        </tr>`,
      )
      .join("");

    const medRowsHtml = data.medicationBreakdown
      .map(
        (m) => `<tr>
          <td><strong>${escapeHtml(m.medication)}</strong></td>
          <td>${m.patientCount}</td>
          <td>${m.takenLogs} / ${m.totalLogs}</td>
          <td>${m.missedLogs}</td>
          <td><strong>${m.adherenceRate}%</strong></td>
        </tr>`,
      )
      .join("");

    const patientRowsHtml = data.patientSummaries
      .map(
        (p) => `<tr>
          <td><strong>${escapeHtml(p.patientName)}</strong><br/><span class="muted">${escapeHtml(p.idNumber)}</span></td>
          <td>${escapeHtml(p.department)}</td>
          <td>${p.takenLogs} / ${p.totalLogs}</td>
          <td>${p.missedLogs} / ${p.skippedLogs}</td>
          <td>${p.onTimeRate !== null ? `${p.onTimeRate}%` : "—"}</td>
          <td><strong>${p.adherenceRate}%</strong></td>
          <td><span class="pill ${
            p.severity === "CRITICAL"
              ? "pill-red"
              : p.severity === "WARNING"
                ? "pill-amber"
                : "pill-green"
          }">${escapeHtml(p.severity.replace("_", " "))}</span></td>
        </tr>`,
      )
      .join("");

    printWin.document.write(`
      <!doctype html>
      <html>
        <head>
          <meta charset="utf-8" />
          <title>CSU Clinical Adherence Analytics Report — ${escapeHtml(periodLabel)}</title>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: #0f172a; padding: 32px; max-width: 900px; margin: 0 auto; font-size: 12px; }
            .header { border-bottom: 2px solid #0284c7; padding-bottom: 14px; margin-bottom: 20px; display: flex; justify-content: space-between; align-items: flex-end; }
            .univ { font-size: 16px; font-weight: 900; }
            .sub { font-size: 11px; color: #475569; margin-top: 2px; }
            .kpis { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 22px; }
            .kpi { border: 1px solid #e2e8f0; border-radius: 10px; padding: 12px; background: #f8fafc; }
            .kpi .lbl { font-size: 10px; text-transform: uppercase; font-weight: 700; color: #64748b; }
            .kpi .val { font-size: 20px; font-weight: 900; margin-top: 4px; color: #0f172a; }
            .kpi .note { font-size: 10px; color: #475569; margin-top: 2px; }
            h2 { font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px; color: #0284c7; border-bottom: 1px solid #e2e8f0; padding-bottom: 4px; margin: 22px 0 10px; }
            table { width: 100%; border-collapse: collapse; font-size: 11px; margin-bottom: 16px; }
            th, td { border: 1px solid #e2e8f0; padding: 7px 8px; text-align: left; vertical-align: top; }
            th { background: #f8fafc; font-size: 10px; text-transform: uppercase; color: #475569; }
            .muted { color: #64748b; font-size: 10px; font-family: ui-monospace, monospace; }
            .pill { display: inline-block; padding: 2px 7px; border-radius: 99px; font-size: 9px; font-weight: 800; }
            .pill-red { background: #fee2e2; color: #991b1b; }
            .pill-amber { background: #fef3c7; color: #92400e; }
            .pill-green { background: #dcfce7; color: #166534; }
            .two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
            .footer { margin-top: 28px; border-top: 1px dashed #cbd5e1; padding-top: 10px; font-size: 10px; color: #64748b; display: flex; justify-content: space-between; }
          </style>
        </head>
        <body>
          <div class="header">
            <div>
              <div class="univ">CARAGA STATE UNIVERSITY</div>
              <div class="sub">CSU University Center for Health and Wellness • Clinical Adherence Analytics Report</div>
              <div class="sub">Reporting Window: ${escapeHtml(periodLabel)} • Clinical Target Threshold: ≥ ${threshold}%</div>
            </div>
            <div class="sub" style="text-align:right;">
              <strong>Generated:</strong> ${escapeHtml(new Date().toLocaleString("en-PH"))}<br/>
              PILLPAL Clinical Portal
            </div>
          </div>

          <div class="kpis">
            <div class="kpi">
              <div class="lbl">Campus Compliance</div>
              <div class="val">${data.overallRate !== null ? `${data.overallRate}%` : "—"}</div>
              <div class="note">${data.periodDelta !== null ? `${data.periodDelta >= 0 ? "+" : ""}${data.periodDelta}% vs prior period` : `Target: ≥ ${threshold}%`}</div>
            </div>
            <div class="kpi">
              <div class="lbl">On-Time (±30 min)</div>
              <div class="val">${data.onTimeRate !== null ? `${data.onTimeRate}%` : "—"}</div>
              <div class="note">${data.avgDelayMinutes !== null ? `Avg offset: ${data.avgDelayMinutes} min` : "No timed logs"}</div>
            </div>
            <div class="kpi">
              <div class="lbl">Dose Breakdown</div>
              <div class="val">${data.takenLogs} / ${data.totalLogs}</div>
              <div class="note">${data.missedLogs} missed • ${data.skippedLogs} skipped</div>
            </div>
            <div class="kpi">
              <div class="lbl">Clinical Alerts</div>
              <div class="val">${data.criticalCount + data.warningCount}</div>
              <div class="note">${data.criticalCount} Critical • ${data.warningCount} Warning</div>
            </div>
          </div>

          <h2>Automated Clinical Alerts (${flaggedPatients.length})</h2>
          ${alertsHtml}

          <div class="two-col">
            <div>
              <h2>Compliance by College / Unit</h2>
              <table>
                <thead><tr><th>Unit</th><th>Patients</th><th>Taken</th><th>Missed</th><th>Rate</th></tr></thead>
                <tbody>${deptRowsHtml || `<tr><td colspan="5" class="muted">No data in window</td></tr>`}</tbody>
              </table>
            </div>
            <div>
              <h2>Compliance by Medication</h2>
              <table>
                <thead><tr><th>Medication</th><th>Patients</th><th>Taken</th><th>Missed</th><th>Rate</th></tr></thead>
                <tbody>${medRowsHtml || `<tr><td colspan="5" class="muted">No data in window</td></tr>`}</tbody>
              </table>
            </div>
          </div>

          <h2>Per-Patient Adherence Roster (${data.patientSummaries.length})</h2>
          <table>
            <thead>
              <tr>
                <th>Patient</th>
                <th>College / Unit</th>
                <th>Taken / Total</th>
                <th>Missed / Skipped</th>
                <th>On-Time</th>
                <th>Compliance</th>
                <th>Risk Tier</th>
              </tr>
            </thead>
            <tbody>${patientRowsHtml || `<tr><td colspan="7" class="muted">No patient logs in window</td></tr>`}</tbody>
          </table>

          <div class="footer">
            <span>Confidential Clinical Analytics • RA 10173 Data Privacy Act Compliant</span>
            <span>CSU Health Infirmary • (085) 341-2786</span>
          </div>
          <script>window.onload = () => { window.print(); };</script>
        </body>
      </html>
    `);
    printWin.document.close();
  }

  const totalAlerts = data.criticalCount + data.warningCount;

  return (
    <div className="space-y-6">
      {/* Header & Reporting Toolbar */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-slate-900">
            Adherence Reporting &amp; Analytics
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Real-time compliance analytics, automated overdue-dose clinical alerts, and exportable CSU clinic reports.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Timeframe Selector */}
          <div className="flex items-center gap-1 rounded-xl bg-slate-100 p-1 text-xs">
            {(
              [
                { key: "7", label: "7D" },
                { key: "30", label: "30D" },
                { key: "90", label: "90D" },
                { key: "ALL", label: "All" },
              ] as const
            ).map((opt) => (
              <button
                key={opt.key}
                type="button"
                onClick={() => setDaysRange(opt.key)}
                className={`rounded-lg px-2.5 py-1 text-[11px] font-bold transition-colors cursor-pointer ${
                  daysRange === opt.key
                    ? "bg-white text-[#0284c7] shadow-2xs"
                    : "text-slate-500 hover:text-slate-900"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          <Button
            variant="outline"
            size="sm"
            disabled={activeView === "patients" ? filteredPatients.length === 0 : filteredLogs.length === 0}
            onClick={handleExportCsv}
            className="gap-1.5 rounded-xl text-xs font-bold cursor-pointer"
          >
            <Download className="h-3.5 w-3.5" />
            {activeView === "patients" ? "Export Summary CSV" : "Export Events CSV"}
          </Button>

          <Button
            variant="outline"
            size="sm"
            disabled={loading || data.totalLogs === 0}
            onClick={handlePrintReport}
            className="gap-1.5 rounded-xl text-xs font-bold text-[#0284c7] border-sky-200 hover:bg-sky-50 cursor-pointer"
          >
            <Printer className="h-3.5 w-3.5" />
            Print / PDF Report
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={() => void loadAdherence()}
            disabled={loading}
            className="gap-1.5 rounded-xl text-xs font-bold cursor-pointer"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Row 1: 4 Executive Clinical KPI Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* KPI 1: Campus Compliance + Period Delta */}
        <Card className="rounded-2xl border border-slate-100 shadow-xs">
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-xs font-semibold text-slate-500 uppercase">
              Campus Compliance
            </CardTitle>
            {data.periodDelta !== null && (
              <span
                className={`inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[10px] font-extrabold ${
                  data.periodDelta >= 0
                    ? "bg-emerald-50 text-emerald-700"
                    : "bg-rose-50 text-rose-700"
                }`}
              >
                {data.periodDelta >= 0 ? (
                  <TrendingUp className="h-3 w-3" />
                ) : (
                  <TrendingDown className="h-3 w-3" />
                )}
                {data.periodDelta >= 0 ? "+" : ""}
                {data.periodDelta}%
              </span>
            )}
          </CardHeader>
          <CardContent>
            <div
              className={`text-2xl font-black ${
                data.overallRate === null
                  ? "text-slate-400"
                  : data.overallRate >= threshold
                    ? "text-emerald-600"
                    : data.overallRate >= 60
                      ? "text-amber-600"
                      : "text-rose-600"
              }`}
            >
              {data.overallRate !== null ? `${data.overallRate}%` : "—"}
            </div>
            <p className="mt-1 text-[11px] text-slate-400">
              {data.totalLogs > 0
                ? `Clinical target: ≥ ${threshold}% (WHO standard)`
                : "No logs in selected window"}
            </p>
          </CardContent>
        </Card>

        {/* KPI 2: On-Time Punctuality (±30 min) */}
        <Card className="rounded-2xl border border-slate-100 shadow-xs">
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-xs font-semibold text-slate-500 uppercase">
              On-Time (±30 min)
            </CardTitle>
            <Clock className="h-4 w-4 text-[#0284c7]" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-black text-[#0284c7]">
              {data.onTimeRate !== null ? `${data.onTimeRate}%` : "—"}
            </div>
            <p className="mt-1 text-[11px] text-slate-500 font-medium">
              {data.avgDelayMinutes !== null
                ? `Avg schedule offset: ${data.avgDelayMinutes} min`
                : "Awaiting timed dose logs"}
            </p>
          </CardContent>
        </Card>

        {/* KPI 3: Doses Recorded Breakdown */}
        <Card className="rounded-2xl border border-slate-100 shadow-xs">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-semibold text-slate-500 uppercase">
              Doses Recorded
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-black text-slate-900">
              {data.takenLogs}{" "}
              <span className="text-sm font-normal text-slate-400">/ {data.totalLogs}</span>
            </div>
            <div className="mt-1.5 flex items-center gap-2 text-[10px] font-bold">
              <span className="rounded bg-rose-50 px-1.5 py-0.5 text-rose-700">
                {data.missedLogs} missed
              </span>
              <span className="rounded bg-amber-50 px-1.5 py-0.5 text-amber-700">
                {data.skippedLogs} skipped
              </span>
            </div>
          </CardContent>
        </Card>

        {/* KPI 4: Automated Clinical Alerts */}
        <Card
          className={`rounded-2xl border shadow-xs ${
            data.criticalCount > 0
              ? "border-rose-200 bg-rose-50/30"
              : data.warningCount > 0
                ? "border-amber-200 bg-amber-50/30"
                : "border-emerald-100 bg-emerald-50/20"
          }`}
        >
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle
              className={`text-xs font-semibold uppercase ${
                data.criticalCount > 0
                  ? "text-rose-800"
                  : data.warningCount > 0
                    ? "text-amber-800"
                    : "text-emerald-800"
              }`}
            >
              Clinical Alerts
            </CardTitle>
            {data.criticalCount > 0 ? (
              <ShieldAlert className="h-4 w-4 text-rose-600" />
            ) : (
              <AlertTriangle className="h-4 w-4 text-amber-600" />
            )}
          </CardHeader>
          <CardContent>
            <div
              className={`text-2xl font-black ${
                data.criticalCount > 0
                  ? "text-rose-700"
                  : data.warningCount > 0
                    ? "text-amber-700"
                    : "text-emerald-700"
              }`}
            >
              {totalAlerts}
            </div>
            <div className="mt-1.5 flex items-center gap-2 text-[10px] font-bold">
              <span className="rounded bg-rose-100 px-1.5 py-0.5 text-rose-800">
                {data.criticalCount} Critical
              </span>
              <span className="rounded bg-amber-100 px-1.5 py-0.5 text-amber-800">
                {data.warningCount} Warning
              </span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Row 2: Severity-Tiered Automated Clinical Alerts Queue */}
      {!loading && flaggedPatients.length > 0 && (
        <Card
          className={`rounded-2xl border shadow-xs ${
            data.criticalCount > 0
              ? "border-rose-200 bg-rose-50/25"
              : "border-amber-200 bg-amber-50/30"
          }`}
        >
          <CardHeader className="pb-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                {data.criticalCount > 0 ? (
                  <ShieldAlert className="h-4 w-4 text-rose-600" />
                ) : (
                  <AlertTriangle className="h-4 w-4 text-amber-600" />
                )}
                <CardTitle className="text-sm font-black text-slate-900">
                  Automated Clinical Alerts Queue ({flaggedPatients.length})
                </CardTitle>
              </div>
              <span className="text-[10px] font-semibold text-slate-500">
                Auto-detects overdue misses (&gt;2h grace), consecutive streaks &amp; &lt;{threshold}% compliance
              </span>
            </div>
          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 pt-2">
            {flaggedPatients.slice(0, 6).map((pat) => {
              const isCritical = pat.severity === "CRITICAL";
              return (
                <div
                  key={pat.patientId}
                  className={`flex flex-col justify-between gap-2.5 rounded-xl border bg-white p-3.5 text-xs shadow-2xs ${
                    isCritical ? "border-rose-200" : "border-amber-200"
                  }`}
                >
                  <div className="space-y-1.5">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-bold text-slate-900 truncate">{pat.patientName}</p>
                        <p className="font-mono text-[10px] text-slate-400">
                          {pat.idNumber} • {pat.department}
                        </p>
                      </div>
                      <span
                        className={`shrink-0 rounded-full px-2 py-0.5 text-[9px] font-black uppercase ${
                          isCritical
                            ? "bg-rose-100 text-rose-800 border border-rose-200"
                            : "bg-amber-100 text-amber-800 border border-amber-200"
                        }`}
                      >
                        {pat.severity}
                      </span>
                    </div>

                    <div className="flex flex-wrap gap-1">
                      {pat.alertReasons.map((reason, idx) => (
                        <span
                          key={idx}
                          className={`rounded-md px-1.5 py-0.5 text-[10px] font-semibold ${
                            isCritical
                              ? "bg-rose-50 text-rose-700"
                              : "bg-amber-50 text-amber-800"
                          }`}
                        >
                          {reason}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t border-slate-100 gap-2">
                    <span className="text-[11px] font-bold text-slate-700">
                      {pat.adherenceRate}%{" "}
                      <span className="font-normal text-slate-400">
                        ({pat.takenLogs}/{pat.totalLogs})
                      </span>
                    </span>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() =>
                        navigate("/app/messages", {
                          state: { recipientUserId: pat.userId },
                        })
                      }
                      className="h-7 rounded-lg text-[11px] font-bold gap-1 shrink-0 cursor-pointer"
                    >
                      <MessageSquare className="h-3 w-3" />
                      Message
                    </Button>
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      {/* Row 3: Visual Analytics Suite (14-Day Trend + College/Medication Breakdown) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Left 7 cols: 14-Day Campus Trend + Time-of-Day Consistency */}
        <Card className="lg:col-span-7 rounded-2xl border border-slate-100 shadow-xs">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between gap-2">
              <div>
                <CardTitle className="text-sm font-black text-slate-900 flex items-center gap-1.5">
                  <BarChart3 className="h-4 w-4 text-[#0284c7]" />
                  14-Day Campus Adherence Trend
                </CardTitle>
                <CardDescription className="text-[11px]">
                  Daily compliance percentage across all monitored CSU patients.
                </CardDescription>
              </div>
              <div className="hidden sm:flex items-center gap-2 text-[10px] font-semibold text-slate-500">
                <span className="inline-flex items-center gap-1">
                  <span className="h-2 w-2 rounded-full bg-emerald-500" /> ≥{threshold}%
                </span>
                <span className="inline-flex items-center gap-1">
                  <span className="h-2 w-2 rounded-full bg-amber-400" /> 60–{threshold - 1}%
                </span>
                <span className="inline-flex items-center gap-1">
                  <span className="h-2 w-2 rounded-full bg-rose-500" /> &lt;60%
                </span>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Bar Chart */}
            <div className="h-40 flex items-end justify-between gap-1.5 pt-4 pb-1 px-1 border-b border-slate-100">
              {data.dailyTrend.map((day) => {
                const heightPct = day.rate !== null ? Math.max(8, day.rate) : 6;
                const barColor =
                  day.rate === null
                    ? "bg-slate-100"
                    : day.rate >= threshold
                      ? "bg-emerald-500 hover:bg-emerald-600"
                      : day.rate >= 60
                        ? "bg-amber-400 hover:bg-amber-500"
                        : "bg-rose-500 hover:bg-rose-600";
                return (
                  <div
                    key={day.date}
                    title={`${formatShortDay(day.date)}: ${
                      day.rate !== null
                        ? `${day.rate}% (${day.taken} taken, ${day.missed} missed, ${day.skipped} skipped)`
                        : "No scheduled logs"
                    }`}
                    className="flex-1 flex flex-col items-center gap-1.5 group h-full justify-end"
                  >
                    <span className="text-[9px] font-bold text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity">
                      {day.rate !== null ? `${day.rate}%` : "—"}
                    </span>
                    <div
                      className={`w-full max-w-[26px] rounded-t-md transition-all ${barColor}`}
                      style={{ height: `${heightPct}%` }}
                    />
                    <span className="text-[9px] font-mono text-slate-400 truncate">
                      {day.date.slice(8)}
                    </span>
                  </div>
                );
              })}
            </div>

            {/* Time-of-Day Consistency Strip */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-[11px]">
                <span className="font-bold text-slate-700">Time-of-Day Adherence Pattern</span>
                {data.peakRiskWindow && (
                  <span className="text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5">
                    Peak Risk: {data.peakRiskWindow.label} ({data.peakRiskWindow.rate}%)
                  </span>
                )}
              </div>
              <div className="grid grid-cols-3 gap-2">
                {data.timeOfDayBreakdown.map((slot) => (
                  <div
                    key={slot.period}
                    className="rounded-xl border border-slate-100 bg-slate-50/70 p-2.5 text-center"
                  >
                    <p className="text-[10px] font-bold text-slate-500 uppercase">
                      {slot.period}
                    </p>
                    <p
                      className={`text-sm font-black mt-0.5 ${
                        slot.rate === null
                          ? "text-slate-400"
                          : slot.rate >= threshold
                            ? "text-emerald-600"
                            : slot.rate >= 60
                              ? "text-amber-600"
                              : "text-rose-600"
                      }`}
                    >
                      {slot.rate !== null ? `${slot.rate}%` : "—"}
                    </p>
                    <p className="text-[9px] text-slate-400">
                      {slot.taken}/{slot.total} taken
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Right 5 cols: Cohort & Regimen Breakdown */}
        <Card className="lg:col-span-5 rounded-2xl border border-slate-100 shadow-xs flex flex-col">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between gap-2">
              <CardTitle className="text-sm font-black text-slate-900">
                Compliance Breakdown
              </CardTitle>
              <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded-lg">
                <button
                  type="button"
                  onClick={() => setBreakdownTab("department")}
                  className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-bold cursor-pointer ${
                    breakdownTab === "department"
                      ? "bg-white text-[#0284c7] shadow-2xs"
                      : "text-slate-500 hover:text-slate-800"
                  }`}
                >
                  <Building2 className="h-3 w-3" />
                  College
                </button>
                <button
                  type="button"
                  onClick={() => setBreakdownTab("medication")}
                  className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-bold cursor-pointer ${
                    breakdownTab === "medication"
                      ? "bg-white text-[#0284c7] shadow-2xs"
                      : "text-slate-500 hover:text-slate-800"
                  }`}
                >
                  <Pill className="h-3 w-3" />
                  Medication
                </button>
              </div>
            </div>
            <CardDescription className="text-[11px]">
              {breakdownTab === "department"
                ? "Lowest-compliance CSU colleges & units first."
                : "Lowest-compliance prescribed regimens first."}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex-1 card-scroll-area max-h-[250px] overflow-y-auto space-y-3 pt-2">
            {breakdownTab === "department" ? (
              data.departmentBreakdown.length === 0 ? (
                <p className="text-xs text-slate-400 text-center py-8">
                  No college/unit adherence records in this period.
                </p>
              ) : (
                data.departmentBreakdown.map((dept) => (
                  <div key={dept.department} className="space-y-1">
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <span className="font-bold text-slate-800 truncate" title={dept.department}>
                        {dept.department}
                      </span>
                      <span
                        className={`font-black shrink-0 ${
                          dept.adherenceRate >= threshold
                            ? "text-emerald-600"
                            : dept.adherenceRate >= 60
                              ? "text-amber-600"
                              : "text-rose-600"
                        }`}
                      >
                        {dept.adherenceRate}%
                      </span>
                    </div>
                    <div className="h-2 w-full rounded-full bg-slate-100 overflow-hidden">
                      <div
                        className={`h-full rounded-full ${
                          dept.adherenceRate >= threshold
                            ? "bg-emerald-500"
                            : dept.adherenceRate >= 60
                              ? "bg-amber-400"
                              : "bg-rose-500"
                        }`}
                        style={{ width: `${dept.adherenceRate}%` }}
                      />
                    </div>
                    <p className="text-[10px] text-slate-400">
                      {dept.patientCount} patient{dept.patientCount === 1 ? "" : "s"} • {dept.takenLogs}/{dept.totalLogs} taken • {dept.missedLogs} missed
                    </p>
                  </div>
                ))
              )
            ) : data.medicationBreakdown.length === 0 ? (
              <p className="text-xs text-slate-400 text-center py-8">
                No medication adherence records in this period.
              </p>
            ) : (
              data.medicationBreakdown.map((med) => (
                <div key={med.medication} className="space-y-1">
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span className="font-bold text-slate-800 truncate" title={med.medication}>
                      {med.medication}
                    </span>
                    <span
                      className={`font-black shrink-0 ${
                        med.adherenceRate >= threshold
                          ? "text-emerald-600"
                          : med.adherenceRate >= 60
                            ? "text-amber-600"
                            : "text-rose-600"
                      }`}
                    >
                      {med.adherenceRate}%
                    </span>
                  </div>
                  <div className="h-2 w-full rounded-full bg-slate-100 overflow-hidden">
                    <div
                      className={`h-full rounded-full ${
                        med.adherenceRate >= threshold
                          ? "bg-emerald-500"
                          : med.adherenceRate >= 60
                            ? "bg-amber-400"
                            : "bg-rose-500"
                      }`}
                      style={{ width: `${med.adherenceRate}%` }}
                    />
                  </div>
                  <p className="text-[10px] text-slate-400">
                    {med.patientCount} patient{med.patientCount === 1 ? "" : "s"} • {med.takenLogs}/{med.totalLogs} taken • {med.missedLogs} missed
                  </p>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      {/* Row 4: Main Feed Card with Scrollable Sticky Tables */}
      <Card className="rounded-2xl border border-slate-100 shadow-xs overflow-hidden">
        <CardHeader className="pb-3 border-b border-slate-100 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-xl w-fit">
              <button
                type="button"
                onClick={() => setActiveView("events")}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition-colors cursor-pointer ${
                  activeView === "events"
                    ? "bg-white text-[#0284c7] shadow-2xs"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                <Activity className="h-3.5 w-3.5" />
                Ingestion Events ({filteredLogs.length})
              </button>
              <button
                type="button"
                onClick={() => setActiveView("patients")}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition-colors cursor-pointer ${
                  activeView === "patients"
                    ? "bg-white text-[#0284c7] shadow-2xs"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                <Users className="h-3.5 w-3.5" />
                By Patient ({filteredPatients.length})
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="relative w-full sm:w-64">
                <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400" />
                <Input
                  placeholder="Search patient, ID, medication..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-8 text-xs h-8 rounded-xl"
                />
              </div>

              {activeView === "events" && (
                <div className="flex items-center gap-1 bg-slate-50 p-1 rounded-xl border border-slate-100">
                  {(["ALL", "TAKEN", "MISSED", "SKIPPED"] as const).map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setFilterStatus(s)}
                      className={`rounded-lg px-2 py-1 text-[11px] font-semibold transition-colors cursor-pointer ${
                        filterStatus === s
                          ? "bg-white text-slate-900 shadow-2xs font-bold"
                          : "text-slate-500 hover:text-slate-900"
                      }`}
                    >
                      {s === "ALL" ? "All" : s}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </CardHeader>

        {activeView === "events" ? (
          <div
            tabIndex={0}
            role="region"
            aria-label="Adherence ingestion events table"
            className="card-scroll-area max-h-[480px] overflow-auto focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#0284c7]/50"
          >
            <table className="w-full text-left text-xs text-slate-700">
              <thead className="sticky top-0 z-10 border-b border-slate-200/80 bg-slate-50/95 backdrop-blur-xs text-[11px] font-bold text-slate-500 uppercase tracking-wider">
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
                      No adherence logs found for the selected filter and timeframe.
                    </td>
                  </tr>
                ) : (
                  filteredLogs.map((log) => {
                    const delayTag = formatDelayLabel(log.delayMinutes);
                    const isLate =
                      log.delayMinutes !== null &&
                      log.delayMinutes !== undefined &&
                      Math.abs(log.delayMinutes) > 30;
                    return (
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
                          <div className="flex flex-wrap items-center gap-1.5">
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
                            {delayTag && (
                              <span
                                className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
                                  isLate
                                    ? "bg-amber-50 text-amber-700"
                                    : "bg-sky-50 text-[#0284c7]"
                                }`}
                              >
                                {delayTag}
                              </span>
                            )}
                            {log.isAutoMissed && (
                              <span className="rounded bg-rose-100 px-1.5 py-0.5 text-[10px] font-bold text-rose-800">
                                Auto-Detected
                              </span>
                            )}
                          </div>
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
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        ) : (
          <div
            tabIndex={0}
            role="region"
            aria-label="Per-patient adherence summary table"
            className="card-scroll-area max-h-[480px] overflow-auto focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#0284c7]/50"
          >
            <table className="w-full text-left text-xs text-slate-700">
              <thead className="sticky top-0 z-10 border-b border-slate-200/80 bg-slate-50/95 backdrop-blur-xs text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                <tr>
                  <th className="px-6 py-3.5">Patient</th>
                  <th className="px-6 py-3.5">Risk Tier</th>
                  <th className="px-6 py-3.5">Taken / Total</th>
                  <th className="px-6 py-3.5">Missed / Skipped</th>
                  <th className="px-6 py-3.5">On-Time</th>
                  <th className="px-6 py-3.5">Compliance</th>
                  <th className="px-6 py-3.5 text-right">Follow-Up</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading ? (
                  <tr>
                    <td colSpan={7} className="px-6 py-8 text-center text-xs text-slate-400">
                      Computing per-patient compliance...
                    </td>
                  </tr>
                ) : filteredPatients.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-6 py-8 text-center text-xs text-slate-400">
                      No patient adherence records in this timeframe.
                    </td>
                  </tr>
                ) : (
                  filteredPatients.map((pat) => (
                    <tr key={pat.patientId} className="hover:bg-slate-50/60 transition-colors">
                      <td className="px-6 py-4">
                        <p className="font-bold text-slate-900">{pat.patientName}</p>
                        <p className="font-mono text-[11px] text-slate-400">
                          {pat.idNumber} • {pat.department}
                        </p>
                      </td>
                      <td className="px-6 py-4">
                        <span
                          className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-black uppercase ${
                            pat.severity === "CRITICAL"
                              ? "bg-rose-100 text-rose-800 border border-rose-200"
                              : pat.severity === "WARNING"
                                ? "bg-amber-100 text-amber-800 border border-amber-200"
                                : "bg-emerald-50 text-emerald-700 border border-emerald-200"
                          }`}
                        >
                          {pat.severity.replace("_", " ")}
                        </span>
                      </td>
                      <td className="px-6 py-4 font-semibold text-slate-800">
                        {pat.takenLogs} / {pat.totalLogs}
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-red-600 font-bold">{pat.missedLogs} missed</span>
                        <span className="text-slate-300 mx-1.5">•</span>
                        <span className="text-amber-600 font-semibold">
                          {pat.skippedLogs} skipped
                        </span>
                        {pat.consecutiveMissed >= 2 && (
                          <span className="block text-[10px] font-bold text-rose-700">
                            {pat.consecutiveMissed} consecutive missed
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4 font-semibold text-slate-700">
                        {pat.onTimeRate !== null ? `${pat.onTimeRate}%` : "—"}
                      </td>
                      <td className="px-6 py-4">
                        <span
                          className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-bold ${
                            pat.adherenceRate >= threshold
                              ? "bg-emerald-50 text-emerald-700"
                              : pat.adherenceRate >= 60
                                ? "bg-amber-100 text-amber-800"
                                : "bg-rose-100 text-rose-800"
                          }`}
                        >
                          {pat.adherenceRate}%
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            navigate("/app/messages", {
                              state: { recipientUserId: pat.userId },
                            })
                          }
                          className="rounded-lg text-xs font-semibold gap-1 cursor-pointer"
                        >
                          <MessageSquare className="h-3.5 w-3.5 text-[#0284c7]" />
                          Message
                        </Button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
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
                  <span className="font-mono font-semibold text-slate-700">
                    {selectedLog.idNumber}
                  </span>
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
                    {selectedLog.takenTime
                      ? new Date(selectedLog.takenTime).toLocaleString()
                      : "Not recorded"}
                  </span>
                </div>
                {selectedLog.delayMinutes !== null && selectedLog.delayMinutes !== undefined && (
                  <div className="flex justify-between">
                    <span className="text-slate-400">Schedule Offset:</span>
                    <span className="font-semibold text-slate-800">
                      {formatDelayLabel(selectedLog.delayMinutes)}
                    </span>
                  </div>
                )}
                <div className="flex justify-between items-center">
                  <span className="text-slate-400">Status:</span>
                  <span className="font-bold">{selectedLog.status}</span>
                </div>
              </div>

              {selectedLog.notes && (
                <div className="rounded-xl border border-slate-100 p-3 bg-slate-50/50">
                  <span className="text-slate-400 block mb-1 font-semibold">Intake Notes:</span>
                  <p className="text-slate-700 italic">&ldquo;{selectedLog.notes}&rdquo;</p>
                </div>
              )}
            </div>

            <div className="pt-2 flex items-center justify-between gap-2 border-t border-slate-100">
              {selectedLog.patientUserId ? (
                <Button
                  size="sm"
                  onClick={() =>
                    navigate("/app/messages", {
                      state: { recipientUserId: selectedLog.patientUserId },
                    })
                  }
                  className="rounded-xl bg-[#0284c7] hover:bg-[#0369a1] text-white text-xs font-bold gap-1.5 cursor-pointer"
                >
                  <MessageSquare className="h-3.5 w-3.5" />
                  Follow Up via Message
                </Button>
              ) : (
                <div />
              )}

              <Button
                variant="outline"
                size="sm"
                onClick={() => setSelectedLog(null)}
                className="rounded-xl text-xs font-bold cursor-pointer"
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
