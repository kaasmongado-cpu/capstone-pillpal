import { useEffect, useState } from "react";
import {
  Activity,
  Flame,
  CheckCircle2,
  XCircle,
  Clock,
  Download,
  Printer,
  Search,
  Pill,
  Timer,
  TrendingUp,
  TrendingDown,
  CalendarCheck2,
  Sun,
  Sunset,
  Moon,
  AlertTriangle,
} from "lucide-react";
import { fetchWithAuth } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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

type MedicationSummary = {
  prescriptionId: string;
  name: string;
  dosage: string;
  status: string;
  totalLogs: number;
  takenLogs: number;
  missedLogs: number;
  skippedLogs: number;
  adherenceRate: number | null;
};

type DailyTrendPoint = {
  date: string;
  taken: number;
  missed: number;
  skipped: number;
  total: number;
  rate: number | null;
};

type TodayDoseItem = {
  prescriptionId: string;
  name: string;
  dosage: string;
  time: string;
  status: "PENDING" | "TAKEN" | "SKIPPED" | "MISSED";
};

type TimeOfDayBucket = {
  period: "MORNING" | "AFTERNOON" | "EVENING" | string;
  label: string;
  taken: number;
  total: number;
  rate: number | null;
};

type RiskWindowInfo = {
  period: string;
  label: string;
  rate: number;
  missedOrSkipped: number;
};

type EndingSoonItem = {
  id: string;
  name: string;
  dosage: string;
  daysLeft: number;
};

type WindowSummary = {
  total: number;
  taken: number;
  skipped: number;
  missed: number;
  rate: number | null;
};

type TimeframeOption = "7" | "30" | "90" | "all";

function getClinicalTier(rate: number | null): {
  label: string;
  badgeClass: string;
} {
  if (rate === null) {
    return {
      label: "No Data",
      badgeClass: "bg-slate-100 text-slate-500 border-slate-200",
    };
  }
  if (rate >= 80) {
    return {
      label: "Optimal (≥80%)",
      badgeClass: "bg-emerald-50 text-emerald-700 border-emerald-200",
    };
  }
  if (rate >= 60) {
    return {
      label: "Moderate",
      badgeClass: "bg-amber-50 text-amber-800 border-amber-200",
    };
  }
  return {
    label: "At Risk (<60%)",
    badgeClass: "bg-rose-50 text-rose-700 border-rose-200",
  };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function csvEscape(value: string): string {
  const safe = value.replace(/"/g, '""');
  return `"${safe}"`;
}

export function Adherence() {
  const [logs, setLogs] = useState<AdherenceLogItem[]>([]);
  const [medicationSummaries, setMedicationSummaries] = useState<MedicationSummary[]>([]);
  const [dailyTrend, setDailyTrend] = useState<DailyTrendPoint[]>([]);
  const [todayDoses, setTodayDoses] = useState<TodayDoseItem[]>([]);
  const [overallRate, setOverallRate] = useState<number | null>(null);
  const [weekRate, setWeekRate] = useState<number | null>(null);
  const [weekDelta, setWeekDelta] = useState<number | null>(null);
  const [monthRate, setMonthRate] = useState<number | null>(null);
  const [activeStreak, setActiveStreak] = useState(0);
  const [bestStreak, setBestStreak] = useState(0);
  const [onTimeRate, setOnTimeRate] = useState<number | null>(null);
  const [avgDelayMinutes, setAvgDelayMinutes] = useState<number | null>(null);
  const [windowSummary, setWindowSummary] = useState<WindowSummary>({
    total: 0,
    taken: 0,
    skipped: 0,
    missed: 0,
    rate: null,
  });
  const [timeOfDayBreakdown, setTimeOfDayBreakdown] = useState<TimeOfDayBucket[]>([]);
  const [riskWindow, setRiskWindow] = useState<RiskWindowInfo | null>(null);
  const [endingSoon, setEndingSoon] = useState<EndingSoonItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [timeframe, setTimeframe] = useState<TimeframeOption>("30");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [search, setSearch] = useState("");

  async function loadAdherenceData(selectedDays: TimeframeOption) {
    setLoading(true);
    try {
      const query = selectedDays === "all" ? "" : `?days=${selectedDays}`;
      const res = await fetchWithAuth(`/adherence${query}`);
      if (res.ok) {
        const data = await res.json();
        setOverallRate(typeof data.overallRate === "number" ? data.overallRate : null);
        setWeekRate(typeof data.weekRate === "number" ? data.weekRate : null);
        setWeekDelta(typeof data.weekDelta === "number" ? data.weekDelta : null);
        setMonthRate(typeof data.monthRate === "number" ? data.monthRate : null);
        setActiveStreak(typeof data.activeStreak === "number" ? data.activeStreak : 0);
        setBestStreak(typeof data.bestStreak === "number" ? data.bestStreak : 0);
        setOnTimeRate(typeof data.onTimeRate === "number" ? data.onTimeRate : null);
        setAvgDelayMinutes(typeof data.avgDelayMinutes === "number" ? data.avgDelayMinutes : null);
        setWindowSummary(
          data.windowSummary || {
            total: 0,
            taken: 0,
            skipped: 0,
            missed: 0,
            rate: null,
          },
        );
        setTimeOfDayBreakdown(Array.isArray(data.timeOfDayBreakdown) ? data.timeOfDayBreakdown : []);
        setRiskWindow(data.riskWindow || null);
        setEndingSoon(Array.isArray(data.endingSoon) ? data.endingSoon : []);
        setTodayDoses(Array.isArray(data.todayDoses) ? data.todayDoses : []);
        setLogs(data.logs || []);
        setMedicationSummaries(data.medicationSummaries || []);
        setDailyTrend(data.dailyTrend || []);
      }
    } catch (err) {
      console.error("Failed to load adherence data:", err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadAdherenceData(timeframe);
  }, [timeframe]);

  const filteredLogs = logs.filter((l) => {
    const matchesStatus = statusFilter === "ALL" ? true : l.status === statusFilter;
    const q = search.trim().toLowerCase();
    const matchesSearch =
      !q ||
      l.medication.toLowerCase().includes(q) ||
      (l.notes || "").toLowerCase().includes(q);
    return matchesStatus && matchesSearch;
  });

  function handleExportCsv() {
    const header = ["Medication", "Scheduled Time", "Intake Time", "Status", "Notes"];
    const rows = filteredLogs.map((l) => [
      csvEscape(l.medication),
      csvEscape(new Date(l.scheduledTime).toLocaleString()),
      csvEscape(l.takenTime ? new Date(l.takenTime).toLocaleString() : ""),
      csvEscape(l.status),
      csvEscape(l.notes || ""),
    ]);
    const csv = [header.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `pillpal-adherence-${timeframe === "all" ? "all" : `${timeframe}d`}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function handlePrintReport() {
    const summaryRows = medicationSummaries
      .map(
        (m) => `
          <tr>
            <td><strong>${escapeHtml(m.name)}</strong> (${escapeHtml(m.dosage)})</td>
            <td>${m.takenLogs}</td>
            <td>${m.skippedLogs}</td>
            <td>${m.missedLogs}</td>
            <td><strong>${m.adherenceRate !== null ? `${m.adherenceRate}%` : "—"}</strong></td>
          </tr>
        `,
      )
      .join("");

    const logRows = filteredLogs
      .slice(0, 60)
      .map(
        (l) => `
          <tr>
            <td>${escapeHtml(l.medication)}</td>
            <td>${escapeHtml(new Date(l.scheduledTime).toLocaleString())}</td>
            <td>${escapeHtml(l.takenTime ? new Date(l.takenTime).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "—")}</td>
            <td><strong>${escapeHtml(l.status)}</strong></td>
            <td>${escapeHtml(l.notes || "—")}</td>
          </tr>
        `,
      )
      .join("");

    const win = window.open("", "_blank", "width=860,height=720");
    if (!win) return;

    win.document.write(`
      <!doctype html>
      <html>
        <head>
          <title>CSU University Center for Health and Wellness — Patient Adherence Summary</title>
          <style>
            body { font-family: system-ui, -apple-system, sans-serif; color: #0f172a; padding: 28px; }
            .head { border-bottom: 2px solid #059669; padding-bottom: 12px; margin-bottom: 18px; display: flex; justify-content: space-between; align-items: flex-end; }
            h1 { margin: 0; font-size: 18px; color: #065f46; }
            h2 { font-size: 14px; margin: 18px 0 8px; color: #0f172a; }
            .sub { font-size: 12px; color: #475569; margin-top: 4px; }
            .kpis { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-bottom: 16px; }
            .kpi { border: 1px solid #cbd5e1; border-radius: 10px; padding: 10px; }
            .kpi-label { font-size: 10px; text-transform: uppercase; color: #64748b; font-weight: 700; }
            .kpi-val { font-size: 20px; font-weight: 900; color: #065f46; margin-top: 2px; }
            table { width: 100%; border-collapse: collapse; font-size: 12px; }
            th, td { border: 1px solid #cbd5e1; padding: 8px; text-align: left; }
            th { background: #ecfdf5; color: #065f46; font-size: 11px; text-transform: uppercase; }
          </style>
        </head>
        <body>
          <div class="head">
            <div>
              <h1>CSU University Center for Health and Wellness — Medication Adherence Report</h1>
              <div class="sub">Window: ${timeframe === "all" ? "All Time" : `Last ${timeframe} Days`}</div>
            </div>
            <div class="sub">Generated: ${escapeHtml(new Date().toLocaleString())}</div>
          </div>
          <div class="kpis">
            <div class="kpi"><div class="kpi-label">Active / Best Streak</div><div class="kpi-val">${activeStreak}d / ${bestStreak}d</div></div>
            <div class="kpi"><div class="kpi-label">Window Rate (${timeframe === "all" ? "All" : `${timeframe}D`})</div><div class="kpi-val">${windowSummary.rate !== null ? `${windowSummary.rate}%` : "—"}</div></div>
            <div class="kpi"><div class="kpi-label">On-Time (±30 min)</div><div class="kpi-val">${onTimeRate !== null ? `${onTimeRate}%` : "—"}</div></div>
            <div class="kpi"><div class="kpi-label">Lifetime Rate</div><div class="kpi-val">${overallRate !== null ? `${overallRate}%` : "—"}</div></div>
          </div>
          ${
            timeOfDayBreakdown.some((t) => t.total > 0)
              ? `<h2>Time-of-Day Pattern</h2>
                 <table>
                   <thead><tr><th>Time Window</th><th>Taken</th><th>Total</th><th>Rate</th></tr></thead>
                   <tbody>${timeOfDayBreakdown
                     .map(
                       (b) =>
                         `<tr><td>${escapeHtml(b.label)}</td><td>${b.taken}</td><td>${b.total}</td><td><strong>${b.rate !== null ? `${b.rate}%` : "—"}</strong></td></tr>`,
                     )
                     .join("")}</tbody>
                 </table>`
              : ""
          }
          ${
            medicationSummaries.length > 0
              ? `<h2>Compliance by Medication</h2>
                 <table>
                   <thead><tr><th>Medication</th><th>Taken</th><th>Skipped</th><th>Missed</th><th>Rate</th></tr></thead>
                   <tbody>${summaryRows}</tbody>
                 </table>`
              : ""
          }
          <h2>Recent Dose Log (${filteredLogs.length} entries)</h2>
          ${
            filteredLogs.length === 0
              ? "<p>No dose logs recorded in this window.</p>"
              : `<table>
                  <thead><tr><th>Medication</th><th>Scheduled</th><th>Taken At</th><th>Status</th><th>Notes</th></tr></thead>
                  <tbody>${logRows}</tbody>
                </table>`
          }
        </body>
      </html>
    `);
    win.document.close();
    win.focus();
    win.print();
  }

  return (
    <div className="space-y-6">
      {/* Page Title & Export Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-slate-900">
            Adherence Tracker &amp; Intake History
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Monitor your treatment consistency, 14-day streaks, and per-medication compliance.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl">
            {(
              [
                { value: "7", label: "7D" },
                { value: "30", label: "30D" },
                { value: "90", label: "90D" },
                { value: "all", label: "All" },
              ] as const
            ).map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setTimeframe(opt.value)}
                className={`px-2.5 py-1 text-xs font-bold rounded-lg transition-colors cursor-pointer ${
                  timeframe === opt.value
                    ? "bg-white text-slate-900 shadow-2xs"
                    : "text-slate-500 hover:text-slate-800"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleExportCsv}
            disabled={filteredLogs.length === 0}
            className="rounded-xl text-xs font-bold gap-1.5 cursor-pointer"
          >
            <Download className="h-3.5 w-3.5" />
            Export CSV
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handlePrintReport}
            className="rounded-xl text-xs font-bold gap-1.5 cursor-pointer"
          >
            <Printer className="h-3.5 w-3.5" />
            Print Report
          </Button>
        </div>
      </div>

      {/* Analytics KPI Grid */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 animate-pulse">
          <div className="h-28 rounded-2xl bg-white border border-slate-200/80" />
          <div className="h-28 rounded-2xl bg-white border border-slate-200/80" />
          <div className="h-28 rounded-2xl bg-white border border-slate-200/80" />
          <div className="h-28 rounded-2xl bg-white border border-slate-200/80" />
        </div>
      ) : (
        <>
          {(() => {
            const todayTotal = todayDoses.length;
            const todayTaken = todayDoses.filter((d) => d.status === "TAKEN").length;
            const nextPending = todayDoses.find((d) => d.status === "PENDING");
            const todayPct = todayTotal > 0 ? Math.round((todayTaken / todayTotal) * 100) : 0;
            const primaryRate = windowSummary.rate ?? weekRate ?? overallRate;
            const clinicalTier = getClinicalTier(primaryRate);

            return (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {/* 1. Current Streak + All-Time Best */}
                <Card className="rounded-2xl border border-amber-200/80 bg-gradient-to-br from-amber-50 to-orange-50/60 p-4 shadow-xs">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-3">
                      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-amber-500 text-white shadow-md shadow-amber-500/20">
                        <Flame className="h-6 w-6 fill-white" />
                      </div>
                      <div>
                        <p className="text-[11px] font-bold text-amber-800 uppercase tracking-wider">
                          Current Streak
                        </p>
                        <h3 className="text-2xl font-black text-amber-950">
                          {activeStreak} {activeStreak === 1 ? "Day" : "Days"}
                        </h3>
                      </div>
                    </div>
                    <span className="rounded-full bg-white/90 border border-amber-200 px-2 py-0.5 text-[10px] font-extrabold text-amber-800 shrink-0">
                      Best: {bestStreak}d
                    </span>
                  </div>
                  <p className="text-[10px] text-amber-700 font-semibold mt-2">
                    {activeStreak > 0
                      ? "Keep going for maximum therapeutic effect!"
                      : "Log a dose today to begin your streak."}
                  </p>
                </Card>

                {/* 2. Today's Progress + Next Dose */}
                <Card className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-xs">
                  <div className="flex items-center gap-3">
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600">
                      <CalendarCheck2 className="h-6 w-6" />
                    </div>
                    <div>
                      <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                        Today&apos;s Doses
                      </p>
                      <h3 className="text-2xl font-black text-emerald-600">
                        {todayTotal > 0 ? `${todayTaken}/${todayTotal}` : "—"}
                      </h3>
                    </div>
                  </div>
                  <div className="mt-2 h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-emerald-500 rounded-full transition-all"
                      style={{ width: `${todayPct}%` }}
                    />
                  </div>
                  <p className="text-[10px] text-slate-500 font-semibold mt-1.5 truncate">
                    {todayTotal === 0
                      ? "No active doses scheduled today"
                      : nextPending
                        ? `Next: ${nextPending.name} at ${nextPending.time}`
                        : "All scheduled doses completed today!"}
                  </p>
                </Card>

                {/* 3. Adherence Rate + Clinical Tier + WoW Delta */}
                <Card className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-xs">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-3">
                      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-sky-50 text-[#0284c7]">
                        <Activity className="h-6 w-6" />
                      </div>
                      <div>
                        <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                          Adherence ({timeframe === "all" ? "All" : `${timeframe}D`})
                        </p>
                        <div className="flex items-baseline gap-1.5">
                          <h3 className="text-2xl font-black text-[#0284c7]">
                            {primaryRate !== null ? `${primaryRate}%` : "—"}
                          </h3>
                          {weekDelta !== null && weekDelta !== 0 && (
                            <span
                              className={`inline-flex items-center text-[10px] font-extrabold ${
                                weekDelta > 0 ? "text-emerald-600" : "text-rose-600"
                              }`}
                            >
                              {weekDelta > 0 ? (
                                <TrendingUp className="h-3 w-3 mr-0.5" />
                              ) : (
                                <TrendingDown className="h-3 w-3 mr-0.5" />
                              )}
                              {weekDelta > 0 ? `+${weekDelta}%` : `${weekDelta}%`}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <span
                      className={`rounded-full border px-2 py-0.5 text-[9px] font-extrabold shrink-0 ${clinicalTier.badgeClass}`}
                    >
                      {clinicalTier.label}
                    </span>
                  </div>
                  <p className="text-[10px] text-slate-400 font-semibold mt-2">
                    7D: {weekRate !== null ? `${weekRate}%` : "—"} • 30D:{" "}
                    {monthRate !== null ? `${monthRate}%` : "—"} • Lifetime:{" "}
                    {overallRate !== null ? `${overallRate}%` : "—"}
                  </p>
                </Card>

                {/* 4. On-Time Punctuality (±30 min) */}
                <Card className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-xs">
                  <div className="flex items-center gap-3">
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-purple-50 text-purple-600">
                      <Timer className="h-6 w-6" />
                    </div>
                    <div>
                      <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                        On-Time Rate
                      </p>
                      <h3 className="text-2xl font-black text-purple-600">
                        {onTimeRate !== null ? `${onTimeRate}%` : "—"}
                      </h3>
                    </div>
                  </div>
                  <div className="mt-2 h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-purple-500 rounded-full transition-all"
                      style={{ width: `${onTimeRate ?? 0}%` }}
                    />
                  </div>
                  <p className="text-[10px] text-slate-500 font-semibold mt-1.5">
                    {onTimeRate !== null
                      ? `Within ±30 min • Avg offset: ${
                          avgDelayMinutes === 0 ? "Right on time" : `±${avgDelayMinutes} min`
                        }`
                      : "Taken within ±30 min of schedule"}
                  </p>
                </Card>
              </div>
            );
          })()}

          {/* Clinical Insights Strip (3 Actionable Pills) */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Insight 1: Dose Breakdown Volume */}
            <Card className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-xs space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-black uppercase tracking-wider text-slate-500">
                  Dose Volume ({timeframe === "all" ? "All Time" : `Last ${timeframe}D`})
                </span>
                <span className="text-[11px] font-mono font-bold text-slate-400">
                  {windowSummary.total} logged
                </span>
              </div>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="rounded-xl bg-emerald-50 border border-emerald-100 py-2">
                  <p className="text-base font-black text-emerald-700">{windowSummary.taken}</p>
                  <p className="text-[10px] font-bold text-emerald-600">Taken</p>
                </div>
                <div className="rounded-xl bg-slate-50 border border-slate-200 py-2">
                  <p className="text-base font-black text-slate-700">{windowSummary.skipped}</p>
                  <p className="text-[10px] font-bold text-slate-500">Skipped</p>
                </div>
                <div className="rounded-xl bg-rose-50 border border-rose-100 py-2">
                  <p className="text-base font-black text-rose-700">{windowSummary.missed}</p>
                  <p className="text-[10px] font-bold text-rose-600">Missed</p>
                </div>
              </div>
            </Card>

            {/* Insight 2: Time-of-Day Pattern & Risk Window */}
            <Card className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-xs space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-black uppercase tracking-wider text-slate-500">
                  Time-of-Day Consistency
                </span>
                {riskWindow ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 border border-amber-200 px-2 py-0.5 text-[10px] font-extrabold text-amber-800">
                    <AlertTriangle className="h-3 w-3" />
                    Watch {riskWindow.period.toLowerCase()}
                  </span>
                ) : (
                  <span className="text-[10px] font-bold text-emerald-700">On track</span>
                )}
              </div>
              <div className="grid grid-cols-3 gap-2">
                {timeOfDayBreakdown.map((slot) => {
                  const Icon =
                    slot.period === "MORNING"
                      ? Sun
                      : slot.period === "AFTERNOON"
                        ? Sunset
                        : Moon;
                  const shortName =
                    slot.period === "MORNING"
                      ? "Morning"
                      : slot.period === "AFTERNOON"
                        ? "Afternoon"
                        : "Evening";
                  const isRisk = riskWindow?.period === slot.period;
                  return (
                    <div
                      key={slot.period}
                      className={`rounded-xl border p-2 text-center ${
                        isRisk
                          ? "bg-amber-50 border-amber-200"
                          : "bg-slate-50/80 border-slate-100"
                      }`}
                    >
                      <Icon
                        className={`h-3.5 w-3.5 mx-auto mb-0.5 ${
                          isRisk ? "text-amber-600" : "text-slate-500"
                        }`}
                      />
                      <p className="text-[10px] font-bold text-slate-600">{shortName}</p>
                      <p className="text-xs font-black text-slate-900">
                        {slot.rate !== null ? `${slot.rate}%` : "—"}
                      </p>
                    </div>
                  );
                })}
              </div>
            </Card>

            {/* Insight 3: Course Completion Watch */}
            <Card className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-xs space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-black uppercase tracking-wider text-slate-500">
                  Course Completion Watch
                </span>
                <Pill className="h-3.5 w-3.5 text-emerald-600" />
              </div>
              {endingSoon.length === 0 ? (
                <div className="rounded-xl bg-emerald-50/70 border border-emerald-100 p-2.5 text-xs text-emerald-900 font-medium">
                  No short-course medications ending in the next 3 days. Keep taking your active
                  regimens as scheduled.
                </div>
              ) : (
                <div className="space-y-1.5">
                  {endingSoon.slice(0, 2).map((rx) => (
                    <div
                      key={rx.id}
                      className="flex items-center justify-between gap-2 rounded-xl bg-amber-50 border border-amber-200 px-2.5 py-2 text-xs"
                    >
                      <span className="font-bold text-amber-950 truncate">
                        {rx.name} <span className="font-normal text-amber-800">{rx.dosage}</span>
                      </span>
                      <span className="rounded-md bg-white border border-amber-200 px-1.5 py-0.5 text-[10px] font-extrabold text-amber-800 shrink-0">
                        {rx.daysLeft === 0 ? "Ends today" : `${rx.daysLeft}d left`}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>
        </>
      )}

      {/* 14-Day Visual Consistency Strip + Per-Medication Compliance */}
      {!loading && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {/* 14-Day Strip */}
          <Card className="rounded-3xl border border-slate-200/80 bg-white shadow-xs">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-black text-slate-900">
                14-Day Consistency Strip
              </CardTitle>
              <CardDescription className="text-xs text-slate-400">
                Daily dose completion over the past two weeks
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-7 gap-2">
                {dailyTrend.map((day) => {
                  const dateObj = new Date(`${day.date}T00:00:00`);
                  const dayNum = dateObj.getDate();
                  const weekday = dateObj.toLocaleDateString("en-US", { weekday: "short" });
                  const tone =
                    day.total === 0
                      ? "bg-slate-100 border-slate-200 text-slate-400"
                      : (day.rate ?? 0) >= 85
                        ? "bg-emerald-500 border-emerald-600 text-white"
                        : (day.rate ?? 0) >= 50
                          ? "bg-amber-400 border-amber-500 text-amber-950"
                          : "bg-rose-500 border-rose-600 text-white";
                  return (
                    <div
                      key={day.date}
                      title={`${day.date}: ${day.taken}/${day.total} taken${
                        day.skipped ? `, ${day.skipped} skipped` : ""
                      }${day.missed ? `, ${day.missed} missed` : ""}`}
                      className={`rounded-xl border p-2 text-center transition-transform hover:scale-105 ${tone}`}
                    >
                      <p className="text-[9px] font-bold uppercase opacity-80">{weekday}</p>
                      <p className="text-sm font-black leading-tight mt-0.5">{dayNum}</p>
                      <p className="text-[9px] font-mono font-bold mt-0.5">
                        {day.total > 0 ? `${day.taken}/${day.total}` : "—"}
                      </p>
                    </div>
                  );
                })}
              </div>

              <div className="flex flex-wrap items-center gap-3 text-[10px] font-semibold text-slate-500 pt-1">
                <span className="flex items-center gap-1">
                  <span className="h-2.5 w-2.5 rounded-xs bg-emerald-500" /> ≥85% On Track
                </span>
                <span className="flex items-center gap-1">
                  <span className="h-2.5 w-2.5 rounded-xs bg-amber-400" /> 50–84% Partial
                </span>
                <span className="flex items-center gap-1">
                  <span className="h-2.5 w-2.5 rounded-xs bg-rose-500" /> &lt;50% Missed
                </span>
                <span className="flex items-center gap-1">
                  <span className="h-2.5 w-2.5 rounded-xs bg-slate-200" /> No Logs
                </span>
              </div>
            </CardContent>
          </Card>

          {/* Per-Medication Breakdown */}
          <Card className="rounded-3xl border border-slate-200/80 bg-white shadow-xs">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-black text-slate-900">
                Compliance by Medication
              </CardTitle>
              <CardDescription className="text-xs text-slate-400">
                Breakdown for{" "}
                {timeframe === "all" ? "all recorded history" : `the last ${timeframe} days`}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {medicationSummaries.length === 0 ? (
                <div className="py-10 text-center text-xs text-slate-400 space-y-1.5">
                  <Pill className="h-7 w-7 text-slate-300 mx-auto" />
                  <p>No medication logs recorded in this timeframe yet.</p>
                </div>
              ) : (
                medicationSummaries.map((med) => {
                  const rate = med.adherenceRate ?? 0;
                  const barColor =
                    rate >= 85
                      ? "bg-emerald-500"
                      : rate >= 60
                        ? "bg-amber-500"
                        : "bg-rose-500";
                  return (
                    <div
                      key={med.prescriptionId}
                      className="rounded-2xl border border-slate-100 bg-slate-50/70 p-3 space-y-2"
                    >
                      <div className="flex items-center justify-between gap-2 text-xs">
                        <div className="min-w-0">
                          <p className="font-black text-slate-900 truncate">
                            {med.name}{" "}
                            <span className="font-semibold text-slate-500">{med.dosage}</span>
                          </p>
                          <p className="text-[10px] text-slate-500">
                            {med.takenLogs} taken • {med.skippedLogs} skipped • {med.missedLogs}{" "}
                            missed
                          </p>
                        </div>
                        <span className="font-mono text-sm font-black text-slate-900 shrink-0">
                          {med.adherenceRate !== null ? `${med.adherenceRate}%` : "—"}
                        </span>
                      </div>
                      <div className="h-2 w-full rounded-full bg-slate-200/80 overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${barColor}`}
                          style={{ width: `${rate}%` }}
                        />
                      </div>
                    </div>
                  );
                })
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Intake History Table */}
      <Card className="rounded-3xl border border-slate-200/80 bg-white shadow-xs overflow-hidden">
        <CardHeader className="p-5 border-b border-slate-100 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div>
            <CardTitle className="text-base font-black text-slate-900">
              Dose Intake Activity Log
            </CardTitle>
            <CardDescription className="text-xs text-slate-400">
              Audit trail of confirmed intakes, skipped doses, and clinical notes.
            </CardDescription>
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
            <div className="relative w-full sm:w-56">
              <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400" />
              <Input
                placeholder="Filter by drug or note..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8 h-9 text-xs rounded-xl"
              />
            </div>

            {/* Filter Chips */}
            <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl">
              {(["ALL", "TAKEN", "SKIPPED", "MISSED"] as const).map((status) => (
                <button
                  key={status}
                  type="button"
                  onClick={() => setStatusFilter(status)}
                  className={`px-2.5 py-1 text-xs font-bold rounded-lg cursor-pointer transition-colors ${
                    statusFilter === status
                      ? "bg-white text-slate-900 shadow-2xs"
                      : "text-slate-500 hover:text-slate-800"
                  }`}
                >
                  {status === "ALL"
                    ? `All (${logs.length})`
                    : status[0] + status.slice(1).toLowerCase()}
                </button>
              ))}
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          {loading ? (
            <div className="p-6 space-y-3 animate-pulse">
              <div className="h-10 rounded-xl bg-slate-100" />
              <div className="h-10 rounded-xl bg-slate-100" />
              <div className="h-10 rounded-xl bg-slate-100" />
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
                        {log.takenTime
                          ? new Date(log.takenTime).toLocaleTimeString([], {
                              hour: "2-digit",
                              minute: "2-digit",
                            })
                          : "—"}
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
                          {log.status === "TAKEN" && (
                            <CheckCircle2 className="h-3 w-3 text-emerald-600" />
                          )}
                          {log.status === "SKIPPED" && (
                            <Clock className="h-3 w-3 text-slate-500" />
                          )}
                          {log.status === "MISSED" && (
                            <XCircle className="h-3 w-3 text-amber-600" />
                          )}
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
