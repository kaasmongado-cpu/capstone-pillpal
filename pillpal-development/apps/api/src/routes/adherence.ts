import type { IncomingMessage, ServerResponse } from "node:http";
import { prisma } from "@pillpal/database";
import { getAuthenticatedUser } from "../services/auth.js";
import {
  AUTO_MISSED_NOTE,
  classifyAdherenceRisk,
  computeConsecutiveMissed,
  escalateCriticalPatientIfNeeded,
  reconcileOverdueDoses,
} from "../services/adherence-monitor.js";

function readJsonBody(req: IncomingMessage): Promise<any> {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk.toString();
    });
    req.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (err) {
        reject(err);
      }
    });
  });
}

function parseScheduledTimeToDate(timeStr?: string): Date {
  if (!timeStr) return new Date();

  // Try standard date parsing
  const parsed = new Date(timeStr);
  if (!isNaN(parsed.getTime())) {
    return parsed;
  }

  // Parse "08:00 AM" or "8:00 PM"
  const match = timeStr.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i);
  if (match && match[1] && match[2]) {
    let hours = parseInt(match[1], 10);
    const minutes = parseInt(match[2], 10);
    const period = match[3]?.toUpperCase();

    if (period === "PM" && hours < 12) hours += 12;
    if (period === "AM" && hours === 12) hours = 0;

    const d = new Date();
    d.setHours(hours, minutes, 0, 0);
    return d;
  }

  return new Date();
}

function getLocalDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function slotTimeToMinutes(timeStr: string): number {
  const match = timeStr.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i);
  if (!match || !match[1] || !match[2]) return 0;
  let hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2], 10);
  const period = match[3]?.toUpperCase();
  if (period === "PM" && hours < 12) hours += 12;
  if (period === "AM" && hours === 12) hours = 0;
  return hours * 60 + minutes;
}

function sendJson(res: ServerResponse, status: number, data: any) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(data));
}

export async function adherenceRoute(req: IncomingMessage, res: ServerResponse) {
  const user = await getAuthenticatedUser(req);
  if (!user) {
    sendJson(res, 401, { message: "Unauthorized" });
    return;
  }

  // GET /adherence
  if (req.method === "GET") {
    try {
      await reconcileOverdueDoses();

      if (user.role === "PATIENT") {
        const patientProfile = user.patientProfile;
        if (!patientProfile) {
          sendJson(res, 200, {
            overallRate: null,
            weekRate: null,
            prevWeekRate: null,
            weekDelta: null,
            monthRate: null,
            activeStreak: 0,
            bestStreak: 0,
            onTimeRate: null,
            avgDelayMinutes: null,
            windowSummary: { total: 0, taken: 0, skipped: 0, missed: 0, rate: null },
            timeOfDayBreakdown: [],
            riskWindow: null,
            endingSoon: [],
            totalLogs: 0,
            takenLogs: 0,
            missedLogs: 0,
            skippedLogs: 0,
            todayDoses: [],
            medicationSummaries: [],
            dailyTrend: [],
            logs: [],
          });
          return;
        }

        const reqUrl = new URL(req.url || "/adherence", "http://localhost:4000");
        const daysParam = reqUrl.searchParams.get("days");
        const parsedDays = daysParam ? Number(daysParam) : NaN;
        const patientDateFilter =
          Number.isFinite(parsedDays) && parsedDays > 0
            ? {
                scheduledTime: {
                  gte: new Date(Date.now() - parsedDays * 24 * 60 * 60 * 1000),
                },
              }
            : {};

        const now = new Date();
        const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
        const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

        const [
          windowLogs,
          totalLogs,
          takenLogs,
          missedLogs,
          skippedLogs,
          monthLogs,
          allTakenDates,
          activePrescriptions,
          todayLogs,
        ] = await Promise.all([
          prisma.adherenceLog.findMany({
            where: { patientId: patientProfile.id, ...patientDateFilter },
            orderBy: { scheduledTime: "desc" },
            take: 300,
            include: {
              prescription: {
                select: {
                  id: true,
                  name: true,
                  dosage: true,
                  form: true,
                  instructions: true,
                  status: true,
                },
              },
            },
          }),
          prisma.adherenceLog.count({ where: { patientId: patientProfile.id } }),
          prisma.adherenceLog.count({ where: { patientId: patientProfile.id, status: "TAKEN" } }),
          prisma.adherenceLog.count({ where: { patientId: patientProfile.id, status: "MISSED" } }),
          prisma.adherenceLog.count({ where: { patientId: patientProfile.id, status: "SKIPPED" } }),
          prisma.adherenceLog.findMany({
            where: { patientId: patientProfile.id, scheduledTime: { gte: thirtyDaysAgo } },
            select: { scheduledTime: true, status: true },
          }),
          prisma.adherenceLog.findMany({
            where: { patientId: patientProfile.id, status: "TAKEN" },
            select: { scheduledTime: true },
            orderBy: { scheduledTime: "asc" },
          }),
          prisma.prescription.findMany({
            where: { patientId: patientProfile.id, status: "ACTIVE" },
          }),
          prisma.adherenceLog.findMany({
            where: {
              patientId: patientProfile.id,
              scheduledTime: { gte: startOfToday, lte: endOfToday },
            },
            orderBy: { scheduledTime: "asc" },
            include: {
              prescription: { select: { name: true, dosage: true } },
            },
          }),
        ]);

        const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
        const weekLogs = monthLogs.filter((l) => l.scheduledTime >= sevenDaysAgo);
        const prevWeekLogs = monthLogs.filter(
          (l) => l.scheduledTime >= fourteenDaysAgo && l.scheduledTime < sevenDaysAgo,
        );

        const overallRate =
          totalLogs > 0 ? Math.round((takenLogs / totalLogs) * 100) : null;
        const weekRate =
          weekLogs.length > 0
            ? Math.round(
                (weekLogs.filter((l) => l.status === "TAKEN").length / weekLogs.length) * 100,
              )
            : null;
        const prevWeekRate =
          prevWeekLogs.length > 0
            ? Math.round(
                (prevWeekLogs.filter((l) => l.status === "TAKEN").length / prevWeekLogs.length) *
                  100,
              )
            : null;
        const weekDelta =
          weekRate !== null && prevWeekRate !== null ? weekRate - prevWeekRate : null;
        const monthRate =
          monthLogs.length > 0
            ? Math.round(
                (monthLogs.filter((l) => l.status === "TAKEN").length / monthLogs.length) * 100,
              )
            : null;

        // Calculate consecutive local-calendar-day streak & all-time best streak
        const uniqueAllTakenDays = Array.from(
          new Set(allTakenDates.map((l) => getLocalDateKey(new Date(l.scheduledTime)))),
        ).sort();
        const uniqueTakenDaySet = new Set(uniqueAllTakenDays);

        let activeStreak = 0;
        for (let d = 0; d < 365; d++) {
          const checkDate = new Date(
            now.getFullYear(),
            now.getMonth(),
            now.getDate() - d,
          );
          const dateKey = getLocalDateKey(checkDate);
          if (uniqueTakenDaySet.has(dateKey)) {
            activeStreak++;
          } else if (d > 0) {
            break;
          }
        }

        let bestStreak = 0;
        let runningStreak = 0;
        let prevDayTime: number | null = null;
        for (const dayKey of uniqueAllTakenDays) {
          const [y, m, d] = dayKey.split("-").map(Number);
          const curDayTime = new Date(y!, (m || 1) - 1, d || 1).getTime();
          if (prevDayTime !== null && Math.round((curDayTime - prevDayTime) / 86400000) === 1) {
            runningStreak++;
          } else {
            runningStreak = 1;
          }
          if (runningStreak > bestStreak) bestStreak = runningStreak;
          prevDayTime = curDayTime;
        }
        if (activeStreak > bestStreak) bestStreak = activeStreak;

        // Selected timeframe summary + On-Time Punctuality (±30 min of scheduledTime)
        const winTaken = windowLogs.filter((l) => l.status === "TAKEN");
        const winSkipped = windowLogs.filter((l) => l.status === "SKIPPED").length;
        const winMissed = windowLogs.filter((l) => l.status === "MISSED").length;
        const windowSummary = {
          total: windowLogs.length,
          taken: winTaken.length,
          skipped: winSkipped,
          missed: winMissed,
          rate:
            windowLogs.length > 0
              ? Math.round((winTaken.length / windowLogs.length) * 100)
              : null,
        };

        const timedTakenLogs = winTaken.filter((l) => Boolean(l.takenTime));
        let onTimeCount = 0;
        let totalAbsDelayMin = 0;
        for (const l of timedTakenLogs) {
          const diffMin = Math.abs(
            (l.takenTime!.getTime() - l.scheduledTime.getTime()) / (60 * 1000),
          );
          // Cap extreme outliers (e.g., logging a legacy test dose days later) at 180 min for realistic avg
          totalAbsDelayMin += Math.min(diffMin, 180);
          if (diffMin <= 30) onTimeCount++;
        }
        const onTimeRate =
          timedTakenLogs.length > 0
            ? Math.round((onTimeCount / timedTakenLogs.length) * 100)
            : null;
        const avgDelayMinutes =
          timedTakenLogs.length > 0
            ? Math.round(totalAbsDelayMin / timedTakenLogs.length)
            : null;

        // Time-of-Day Pattern (Morning / Afternoon / Evening) & Peak Risk Window
        const periodBuckets = [
          { period: "MORNING", label: "Morning (5AM–11AM)", taken: 0, total: 0 },
          { period: "AFTERNOON", label: "Afternoon (12PM–4PM)", taken: 0, total: 0 },
          { period: "EVENING", label: "Evening (5PM–11PM)", taken: 0, total: 0 },
        ];
        for (const l of windowLogs) {
          const hour = new Date(l.scheduledTime).getHours();
          const idx = hour < 12 ? 0 : hour < 17 ? 1 : 2;
          const bucket = periodBuckets[idx]!;
          bucket.total += 1;
          if (l.status === "TAKEN") bucket.taken += 1;
        }
        const timeOfDayBreakdown = periodBuckets.map((b) => ({
          ...b,
          rate: b.total > 0 ? Math.round((b.taken / b.total) * 100) : null,
        }));
        const riskCandidate = timeOfDayBreakdown
          .filter((b) => b.total > 0 && (b.rate ?? 100) < 85)
          .sort((a, b) => (a.rate ?? 100) - (b.rate ?? 100))[0];
        const riskWindow = riskCandidate
          ? {
              period: riskCandidate.period,
              label: riskCandidate.label,
              rate: riskCandidate.rate!,
              missedOrSkipped: riskCandidate.total - riskCandidate.taken,
            }
          : null;

        // Active courses ending within 3 days
        const endingSoon = activePrescriptions
          .filter((rx) => Boolean(rx.endDate))
          .map((rx) => {
            const daysLeft = Math.ceil(
              (rx.endDate!.getTime() - now.getTime()) / (24 * 60 * 60 * 1000),
            );
            return {
              id: rx.id,
              name: rx.name,
              dosage: rx.dosage,
              daysLeft,
            };
          })
          .filter((rx) => rx.daysLeft >= 0 && rx.daysLeft <= 3)
          .sort((a, b) => a.daysLeft - b.daysLeft);

        // Build 14-day daily trend (oldest -> today)
        const dailyBuckets = new Map<
          string,
          { date: string; taken: number; missed: number; skipped: number; total: number }
        >();
        for (let d = 13; d >= 0; d--) {
          const dayDate = new Date(
            now.getFullYear(),
            now.getMonth(),
            now.getDate() - d,
          );
          const key = getLocalDateKey(dayDate);
          dailyBuckets.set(key, { date: key, taken: 0, missed: 0, skipped: 0, total: 0 });
        }
        for (const l of monthLogs) {
          const key = getLocalDateKey(new Date(l.scheduledTime));
          const bucket = dailyBuckets.get(key);
          if (!bucket) continue;
          bucket.total += 1;
          if (l.status === "TAKEN") bucket.taken += 1;
          else if (l.status === "MISSED") bucket.missed += 1;
          else if (l.status === "SKIPPED") bucket.skipped += 1;
        }
        const dailyTrend = Array.from(dailyBuckets.values()).map((b) => ({
          ...b,
          rate: b.total > 0 ? Math.round((b.taken / b.total) * 100) : null,
        }));

        // Build per-medication adherence summaries within the selected timeframe
        const byMed = new Map<
          string,
          {
            prescriptionId: string;
            name: string;
            dosage: string;
            status: string;
            totalLogs: number;
            takenLogs: number;
            missedLogs: number;
            skippedLogs: number;
          }
        >();
        for (const l of windowLogs) {
          const existing = byMed.get(l.prescriptionId) || {
            prescriptionId: l.prescriptionId,
            name: l.prescription.name,
            dosage: l.prescription.dosage,
            status: l.prescription.status,
            totalLogs: 0,
            takenLogs: 0,
            missedLogs: 0,
            skippedLogs: 0,
          };
          existing.totalLogs += 1;
          if (l.status === "TAKEN") existing.takenLogs += 1;
          else if (l.status === "MISSED") existing.missedLogs += 1;
          else if (l.status === "SKIPPED") existing.skippedLogs += 1;
          byMed.set(l.prescriptionId, existing);
        }
        const medicationSummaries = Array.from(byMed.values())
          .map((m) => ({
            ...m,
            adherenceRate:
              m.totalLogs > 0 ? Math.round((m.takenLogs / m.totalLogs) * 100) : null,
          }))
          .sort((a, b) => (a.adherenceRate ?? 101) - (b.adherenceRate ?? 101));

        // Build today's scheduled doses with accurate slot-level log matching
        const todayDoses: any[] = [];
        for (const rx of activePrescriptions) {
          const rxLogs = todayLogs.filter((l) => l.prescriptionId === rx.id);
          const usedLogIds = new Set<string>();
          const slots = rx.scheduleTimes.map((timeStr) => ({
            timeStr,
            targetMs: parseScheduledTimeToDate(timeStr).getTime(),
            matchedLog: null as (typeof rxLogs)[number] | null,
          }));

          // Pass 1: exact or near-exact slot match (within 2 minutes)
          for (const slot of slots) {
            const exact = rxLogs.find(
              (l) =>
                !usedLogIds.has(l.id) &&
                Math.abs(l.scheduledTime.getTime() - slot.targetMs) <= 2 * 60 * 1000,
            );
            if (exact) {
              slot.matchedLog = exact;
              usedLogIds.add(exact.id);
            }
          }

          // Pass 2: match remaining logs to their closest unmatched slot (within 2 hours, or fallback for legacy unslotted logs)
          const remainingLogs = rxLogs.filter((l) => !usedLogIds.has(l.id));
          for (const log of remainingLogs) {
            let bestSlot: (typeof slots)[number] | null = null;
            let bestDiff = Infinity;
            for (const slot of slots) {
              if (slot.matchedLog) continue;
              const diff = Math.abs(log.scheduledTime.getTime() - slot.targetMs);
              if (diff < bestDiff) {
                bestDiff = diff;
                bestSlot = slot;
              }
            }
            if (bestSlot && bestDiff <= 4 * 60 * 60 * 1000) {
              bestSlot.matchedLog = log;
              usedLogIds.add(log.id);
            }
          }

          for (const slot of slots) {
            const matchedLog = slot.matchedLog;
            todayDoses.push({
              prescriptionId: rx.id,
              name: rx.name,
              dosage: rx.dosage,
              form: rx.form || "Tablet",
              time: slot.timeStr,
              instructions: rx.instructions,
              logId: matchedLog?.id || null,
              status: matchedLog ? matchedLog.status : "PENDING",
              notes: matchedLog?.notes || null,
              takenTime: matchedLog?.takenTime?.toISOString() || null,
            });
          }
        }

        todayDoses.sort((a, b) => slotTimeToMinutes(a.time) - slotTimeToMinutes(b.time));

        sendJson(res, 200, {
          overallRate,
          weekRate,
          prevWeekRate,
          weekDelta,
          monthRate,
          activeStreak,
          bestStreak,
          onTimeRate,
          avgDelayMinutes,
          windowSummary,
          timeOfDayBreakdown,
          riskWindow,
          endingSoon,
          totalLogs,
          takenLogs,
          missedLogs,
          skippedLogs,
          todayDoses,
          medicationSummaries,
          dailyTrend,
          logs: windowLogs.slice(0, 150).map((l) => ({
            id: l.id,
            prescriptionId: l.prescriptionId,
            medication: `${l.prescription.name} ${l.prescription.dosage}`,
            scheduledTime: l.scheduledTime.toISOString(),
            takenTime: l.takenTime ? l.takenTime.toISOString() : null,
            status: l.status,
            notes: l.notes,
            createdAt: l.createdAt.toISOString(),
          })),
        });
        return;
      }

      // Clinic-wide for DOCTOR / HEALTH_STAFF / ADMIN
      const reqUrl = new URL(req.url || "/adherence", "http://localhost:4000");
      const daysParam = reqUrl.searchParams.get("days");
      const parsedDays = daysParam ? Number(daysParam) : NaN;
      const hasWindow = Number.isFinite(parsedDays) && parsedDays > 0;
      const rawThreshold = Number(reqUrl.searchParams.get("threshold") || 80);
      const threshold = Number.isFinite(rawThreshold)
        ? Math.min(95, Math.max(50, Math.round(rawThreshold)))
        : 80;

      const now = new Date();
      const windowMs = hasWindow ? parsedDays * 24 * 60 * 60 * 1000 : 0;
      const windowStart = hasWindow ? new Date(now.getTime() - windowMs) : null;
      const prevWindowStart = hasWindow ? new Date(now.getTime() - windowMs * 2) : null;
      const fourteenDaysAgo = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate() - 13,
        0,
        0,
        0,
        0,
      );

      const dateFilter = windowStart ? { scheduledTime: { gte: windowStart } } : {};

      const [
        logs,
        totalLogs,
        takenLogs,
        missedLogs,
        skippedLogs,
        prevPeriodLogs,
        trendRawLogs,
        activeRxCounts,
      ] = await Promise.all([
        prisma.adherenceLog.findMany({
          where: dateFilter,
          take: 500,
          orderBy: { scheduledTime: "desc" },
          include: {
            patient: {
              include: {
                user: {
                  select: { id: true, firstName: true, lastName: true },
                },
              },
            },
            prescription: {
              select: { name: true, dosage: true },
            },
          },
        }),
        prisma.adherenceLog.count({ where: dateFilter }),
        prisma.adherenceLog.count({ where: { ...dateFilter, status: "TAKEN" } }),
        prisma.adherenceLog.count({ where: { ...dateFilter, status: "MISSED" } }),
        prisma.adherenceLog.count({ where: { ...dateFilter, status: "SKIPPED" } }),
        hasWindow && windowStart && prevWindowStart
          ? prisma.adherenceLog.findMany({
              where: {
                scheduledTime: { gte: prevWindowStart, lt: windowStart },
              },
              select: { status: true },
            })
          : Promise.resolve([]),
        prisma.adherenceLog.findMany({
          where: { scheduledTime: { gte: fourteenDaysAgo } },
          select: { scheduledTime: true, status: true },
        }),
        prisma.prescription.groupBy({
          by: ["patientId"],
          where: { status: "ACTIVE" },
          _count: { _all: true },
        }),
      ]);

      const activeRxByPatient = new Map<string, number>();
      for (const row of activeRxCounts) {
        activeRxByPatient.set(row.patientId, row._count._all);
      }

      const overallRate = totalLogs > 0 ? Math.round((takenLogs / totalLogs) * 100) : null;
      const prevPeriodRate =
        prevPeriodLogs.length > 0
          ? Math.round(
              (prevPeriodLogs.filter((l) => l.status === "TAKEN").length /
                prevPeriodLogs.length) *
                100,
            )
          : null;
      const periodDelta =
        overallRate !== null && prevPeriodRate !== null ? overallRate - prevPeriodRate : null;

      // Format logs with timing delay & auto-missed indicator
      let clinicTimedCount = 0;
      let clinicOnTimeCount = 0;
      let clinicAbsDelayTotal = 0;

      const formatted = logs.map((l) => {
        let delayMinutes: number | null = null;
        if (l.status === "TAKEN" && l.takenTime) {
          const rawDiffMin = Math.round(
            (l.takenTime.getTime() - l.scheduledTime.getTime()) / (60 * 1000),
          );
          delayMinutes = rawDiffMin;
          const absDiff = Math.abs(rawDiffMin);
          clinicTimedCount += 1;
          clinicAbsDelayTotal += Math.min(absDiff, 180);
          if (absDiff <= 30) clinicOnTimeCount += 1;
        }
        return {
          id: l.id,
          patientId: l.patientId,
          patientUserId: l.patient.user.id,
          patientName: `${l.patient.user.firstName} ${l.patient.user.lastName}`.trim(),
          idNumber: l.patient.idNumber,
          department: l.patient.department,
          medication: `${l.prescription.name} ${l.prescription.dosage}`,
          scheduledTime: l.scheduledTime.toISOString(),
          takenTime: l.takenTime ? l.takenTime.toISOString() : null,
          status: l.status,
          delayMinutes,
          isAutoMissed:
            l.status === "MISSED" &&
            Boolean(l.notes && l.notes.includes(AUTO_MISSED_NOTE.slice(0, 18))),
          notes: l.notes,
          createdAt: l.createdAt.toISOString(),
        };
      });

      const onTimeRate =
        clinicTimedCount > 0 ? Math.round((clinicOnTimeCount / clinicTimedCount) * 100) : null;
      const avgDelayMinutes =
        clinicTimedCount > 0 ? Math.round(clinicAbsDelayTotal / clinicTimedCount) : null;

      // 14-day campus trend (oldest -> today)
      const dailyBuckets = new Map<
        string,
        { date: string; taken: number; missed: number; skipped: number; total: number }
      >();
      for (let d = 13; d >= 0; d--) {
        const dayDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - d);
        const key = getLocalDateKey(dayDate);
        dailyBuckets.set(key, { date: key, taken: 0, missed: 0, skipped: 0, total: 0 });
      }
      for (const l of trendRawLogs) {
        const key = getLocalDateKey(new Date(l.scheduledTime));
        const bucket = dailyBuckets.get(key);
        if (!bucket) continue;
        bucket.total += 1;
        if (l.status === "TAKEN") bucket.taken += 1;
        else if (l.status === "MISSED") bucket.missed += 1;
        else if (l.status === "SKIPPED") bucket.skipped += 1;
      }
      const dailyTrend = Array.from(dailyBuckets.values()).map((b) => ({
        ...b,
        rate: b.total > 0 ? Math.round((b.taken / b.total) * 100) : null,
      }));

      // Time-of-Day Pattern (Morning / Afternoon / Evening)
      const periodBuckets = [
        { period: "MORNING", label: "Morning (5AM–11AM)", taken: 0, missed: 0, total: 0 },
        { period: "AFTERNOON", label: "Afternoon (12PM–4PM)", taken: 0, missed: 0, total: 0 },
        { period: "EVENING", label: "Evening (5PM–11PM)", taken: 0, missed: 0, total: 0 },
      ];
      for (const item of formatted) {
        const hour = new Date(item.scheduledTime).getHours();
        const idx = hour < 12 ? 0 : hour < 17 ? 1 : 2;
        const bucket = periodBuckets[idx]!;
        bucket.total += 1;
        if (item.status === "TAKEN") bucket.taken += 1;
        else if (item.status === "MISSED") bucket.missed += 1;
      }
      const timeOfDayBreakdown = periodBuckets.map((b) => ({
        ...b,
        rate: b.total > 0 ? Math.round((b.taken / b.total) * 100) : null,
      }));
      const riskPeriodCandidate = timeOfDayBreakdown
        .filter((b) => b.total > 0 && (b.rate ?? 100) < threshold)
        .sort((a, b) => (a.rate ?? 100) - (b.rate ?? 100))[0];
      const peakRiskWindow = riskPeriodCandidate
        ? {
            period: riskPeriodCandidate.period,
            label: riskPeriodCandidate.label,
            rate: riskPeriodCandidate.rate!,
            missedOrSkipped: riskPeriodCandidate.total - riskPeriodCandidate.taken,
          }
        : null;

      // Aggregate per-patient, per-department, and per-medication compliance rollups
      const byPatient = new Map<
        string,
        {
          patientId: string;
          userId: string;
          patientName: string;
          idNumber: string;
          department: string;
          totalLogs: number;
          takenLogs: number;
          missedLogs: number;
          skippedLogs: number;
          timedTaken: number;
          onTimeTaken: number;
          statusesDesc: Array<{ status: string }>;
          lastEventAt: string;
        }
      >();

      const byDepartment = new Map<
        string,
        {
          department: string;
          patientIds: Set<string>;
          totalLogs: number;
          takenLogs: number;
          missedLogs: number;
        }
      >();

      const byMedication = new Map<
        string,
        {
          medication: string;
          patientIds: Set<string>;
          totalLogs: number;
          takenLogs: number;
          missedLogs: number;
          skippedLogs: number;
        }
      >();

      for (const item of formatted) {
        // Patient rollup (formatted is already ordered newest -> oldest)
        const current = byPatient.get(item.patientId) || {
          patientId: item.patientId,
          userId: item.patientUserId,
          patientName: item.patientName,
          idNumber: item.idNumber,
          department: item.department,
          totalLogs: 0,
          takenLogs: 0,
          missedLogs: 0,
          skippedLogs: 0,
          timedTaken: 0,
          onTimeTaken: 0,
          statusesDesc: [],
          lastEventAt: item.scheduledTime,
        };

        current.totalLogs += 1;
        current.statusesDesc.push({ status: item.status });
        if (item.status === "TAKEN") {
          current.takenLogs += 1;
          if (item.delayMinutes !== null) {
            current.timedTaken += 1;
            if (Math.abs(item.delayMinutes) <= 30) current.onTimeTaken += 1;
          }
        } else if (item.status === "MISSED") {
          current.missedLogs += 1;
        } else if (item.status === "SKIPPED") {
          current.skippedLogs += 1;
        }
        if (item.scheduledTime > current.lastEventAt) {
          current.lastEventAt = item.scheduledTime;
        }
        byPatient.set(item.patientId, current);

        // Department rollup
        const deptName = item.department || "Unassigned Unit";
        const dept = byDepartment.get(deptName) || {
          department: deptName,
          patientIds: new Set<string>(),
          totalLogs: 0,
          takenLogs: 0,
          missedLogs: 0,
        };
        dept.patientIds.add(item.patientId);
        dept.totalLogs += 1;
        if (item.status === "TAKEN") dept.takenLogs += 1;
        else if (item.status === "MISSED") dept.missedLogs += 1;
        byDepartment.set(deptName, dept);

        // Medication rollup
        const med = byMedication.get(item.medication) || {
          medication: item.medication,
          patientIds: new Set<string>(),
          totalLogs: 0,
          takenLogs: 0,
          missedLogs: 0,
          skippedLogs: 0,
        };
        med.patientIds.add(item.patientId);
        med.totalLogs += 1;
        if (item.status === "TAKEN") med.takenLogs += 1;
        else if (item.status === "MISSED") med.missedLogs += 1;
        else if (item.status === "SKIPPED") med.skippedLogs += 1;
        byMedication.set(item.medication, med);
      }

      const severityOrder = { CRITICAL: 0, WARNING: 1, ON_TRACK: 2 } as const;

      const patientSummaries = Array.from(byPatient.values())
        .map((p) => {
          const adherenceRate =
            p.totalLogs > 0 ? Math.round((p.takenLogs / p.totalLogs) * 100) : 0;
          const consecutiveMissed = computeConsecutiveMissed(p.statusesDesc);
          const { severity, alertReasons } = classifyAdherenceRisk({
            adherenceRate,
            missedLogs: p.missedLogs,
            consecutiveMissed,
            threshold,
          });
          return {
            patientId: p.patientId,
            userId: p.userId,
            patientName: p.patientName,
            idNumber: p.idNumber,
            department: p.department,
            totalLogs: p.totalLogs,
            takenLogs: p.takenLogs,
            missedLogs: p.missedLogs,
            skippedLogs: p.skippedLogs,
            adherenceRate,
            onTimeRate:
              p.timedTaken > 0 ? Math.round((p.onTimeTaken / p.timedTaken) * 100) : null,
            consecutiveMissed,
            severity,
            alertReasons,
            activeMedicationsCount: activeRxByPatient.get(p.patientId) || 0,
            lastEventAt: p.lastEventAt,
          };
        })
        .sort(
          (a, b) =>
            severityOrder[a.severity] - severityOrder[b.severity] ||
            a.adherenceRate - b.adherenceRate ||
            b.missedLogs - a.missedLogs,
        );

      const criticalCount = patientSummaries.filter((p) => p.severity === "CRITICAL").length;
      const warningCount = patientSummaries.filter((p) => p.severity === "WARNING").length;

      const departmentBreakdown = Array.from(byDepartment.values())
        .map((d) => ({
          department: d.department,
          patientCount: d.patientIds.size,
          totalLogs: d.totalLogs,
          takenLogs: d.takenLogs,
          missedLogs: d.missedLogs,
          adherenceRate: d.totalLogs > 0 ? Math.round((d.takenLogs / d.totalLogs) * 100) : 0,
        }))
        .sort((a, b) => a.adherenceRate - b.adherenceRate || b.missedLogs - a.missedLogs);

      const medicationBreakdown = Array.from(byMedication.values())
        .map((m) => ({
          medication: m.medication,
          patientCount: m.patientIds.size,
          totalLogs: m.totalLogs,
          takenLogs: m.takenLogs,
          missedLogs: m.missedLogs,
          skippedLogs: m.skippedLogs,
          adherenceRate: m.totalLogs > 0 ? Math.round((m.takenLogs / m.totalLogs) * 100) : 0,
        }))
        .sort((a, b) => a.adherenceRate - b.adherenceRate || b.missedLogs - a.missedLogs);

      sendJson(res, 200, {
        threshold,
        overallRate,
        prevPeriodRate,
        periodDelta,
        onTimeRate,
        avgDelayMinutes,
        criticalCount,
        warningCount,
        totalLogs,
        takenLogs,
        missedLogs,
        skippedLogs,
        dailyTrend,
        timeOfDayBreakdown,
        peakRiskWindow,
        departmentBreakdown,
        medicationBreakdown,
        patientSummaries,
        logs: formatted.slice(0, 200),
      });
      return;
    } catch (err: any) {
      console.error("GET /adherence error:", err);
      sendJson(res, 500, { message: err.message || "Failed to load adherence data" });
      return;
    }
  }

  // POST /adherence (Record dose intake / skip / miss)
  if (req.method === "POST") {
    try {
      const body = await readJsonBody(req);
      let patientId = body.patientId || body.patient_id;
      const prescriptionId = body.prescriptionId || body.prescription_id;
      const scheduledTime = body.scheduledTime || body.scheduled_time;
      const takenTime = body.takenTime || body.taken_time;
      const status = body.status;
      const notes = body.notes;

      if (user.role === "PATIENT") {
        if (!user.patientProfile) {
          sendJson(res, 400, { message: "Patient profile not found." });
          return;
        }
        patientId = user.patientProfile.id;
      }

      if (!patientId || !prescriptionId) {
        sendJson(res, 400, {
          message: "patientId and prescriptionId are required.",
        });
        return;
      }

      // Check if prescription exists in DB
      let rx = await prisma.prescription.findUnique({
        where: { id: prescriptionId },
      });

      // Ownership guard: prevent a patient from logging against another patient's prescription
      if (rx && user.role === "PATIENT" && rx.patientId !== patientId) {
        sendJson(res, 403, {
          message: "Forbidden: You can only record doses for your own prescriptions.",
        });
        return;
      }

      // If prescription was created locally via mobile OCR and doesn't exist on server yet,
      // create a placeholder/self-scanned record so adherence log does not fail foreign key constraint
      if (!rx) {
        rx = await prisma.prescription.create({
          data: {
            id: prescriptionId,
            patientId,
            name: body.medicationName || body.name || "Self-Scanned Medication",
            dosage: body.dosage || "500 mg",
            form: body.form || "Capsule",
            frequency: body.frequency || "As prescribed",
            scheduleTimes: body.scheduleTimes || body.schedule_times || ["08:00 AM"],
            instructions: body.instructions || "Scanned via Mobile OCR",
            status: "ACTIVE",
          },
        });
      }

      const parsedScheduledTime = parseScheduledTimeToDate(scheduledTime);
      const effectiveStatus = status || "TAKEN";
      const parsedTakenTime = takenTime
        ? parseScheduledTimeToDate(takenTime)
        : effectiveStatus === "TAKEN"
          ? new Date()
          : null;

      // Idempotency / duplicate-slot guard (±5 minutes on same prescription + patient)
      const windowStart = new Date(parsedScheduledTime.getTime() - 5 * 60 * 1000);
      const windowEnd = new Date(parsedScheduledTime.getTime() + 5 * 60 * 1000);
      const existingSlotLog = await prisma.adherenceLog.findFirst({
        where: {
          patientId,
          prescriptionId: rx.id,
          scheduledTime: { gte: windowStart, lte: windowEnd },
        },
      });

      if (existingSlotLog) {
        const updatedLog = await prisma.adherenceLog.update({
          where: { id: existingSlotLog.id },
          data: {
            status: effectiveStatus,
            takenTime: parsedTakenTime,
            notes: notes !== undefined ? notes || null : existingSlotLog.notes,
          },
          include: {
            prescription: {
              select: { name: true, dosage: true },
            },
          },
        });

        if (updatedLog.status === "MISSED" || updatedLog.status === "SKIPPED") {
          void escalateCriticalPatientIfNeeded(patientId);
        }

        sendJson(res, 200, {
          message: `Dose updated as ${updatedLog.status}`,
          log: updatedLog,
          deduplicated: true,
        });
        return;
      }

      const log = await prisma.adherenceLog.create({
        data: {
          patientId,
          prescriptionId: rx.id,
          scheduledTime: parsedScheduledTime,
          takenTime: parsedTakenTime,
          status: effectiveStatus,
          notes: notes || null,
        },
        include: {
          prescription: {
            select: { name: true, dosage: true },
          },
        },
      });

      if (log.status === "MISSED" || log.status === "SKIPPED") {
        void escalateCriticalPatientIfNeeded(patientId);
      }

      sendJson(res, 201, {
        message: `Dose logged as ${log.status}`,
        log,
      });
      return;
    } catch (err: any) {
      console.error("POST /adherence error:", err);
      sendJson(res, 500, { message: err.message || "Failed to record adherence log" });
      return;
    }
  }

  sendJson(res, 405, { message: "Method not allowed" });
}
