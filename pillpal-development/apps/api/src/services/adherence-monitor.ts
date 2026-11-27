import { prisma } from "@pillpal/database";
import { createNotification } from "./notifications.js";

export type AdherenceRiskSeverity = "CRITICAL" | "WARNING" | "ON_TRACK";

export const AUTO_MISSED_NOTE =
  "Auto-marked MISSED: no intake logged within 2-hour grace window";

const OVERDUE_GRACE_MS = 2 * 60 * 60 * 1000; // 2 hours
const SLOT_MATCH_TOLERANCE_MS = 90 * 60 * 1000; // ±90 minutes
const LOOKBACK_DAYS = 3;
const RECONCILE_THROTTLE_MS = 5 * 60 * 1000; // run sweep at most once every 5 minutes

let lastReconcileAt = 0;
let activeReconcilePromise: Promise<{ created: number }> | null = null;

export function parseSlotHoursMinutes(
  timeStr: string,
): { hours: number; minutes: number } | null {
  const match = timeStr.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i);
  if (!match || !match[1] || !match[2]) return null;
  let hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2], 10);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes) || minutes < 0 || minutes > 59) {
    return null;
  }
  const period = match[3]?.toUpperCase();
  if (period === "PM" && hours < 12) hours += 12;
  if (period === "AM" && hours === 12) hours = 0;
  if (hours < 0 || hours > 23) return null;
  return { hours, minutes };
}

/**
 * Counts consecutive MISSED doses from the most recent logged events backwards.
 * Expects logs sorted newest -> oldest by scheduledTime.
 */
export function computeConsecutiveMissed(
  logsDesc: ReadonlyArray<{ status: string }>,
): number {
  let streak = 0;
  for (const log of logsDesc) {
    if (log.status === "MISSED") {
      streak++;
    } else {
      break;
    }
  }
  return streak;
}

/**
 * Classifies clinical adherence risk into CRITICAL, WARNING, or ON_TRACK
 * with transparent, human-readable trigger reasons for clinicians.
 */
export function classifyAdherenceRisk(input: {
  adherenceRate: number;
  missedLogs: number;
  consecutiveMissed: number;
  threshold: number;
}): {
  severity: AdherenceRiskSeverity;
  alertReasons: string[];
} {
  const threshold = Math.min(95, Math.max(50, Math.round(input.threshold || 80)));
  const reasons: string[] = [];

  const isCriticalRate = input.adherenceRate < 60;
  const isCriticalStreak = input.consecutiveMissed >= 3;
  const isBelowThreshold = input.adherenceRate < threshold;
  const hasMultipleMisses = input.missedLogs >= 2;

  if (isCriticalStreak) {
    reasons.push(`${input.consecutiveMissed} consecutive missed doses`);
  }
  if (isCriticalRate) {
    reasons.push(`Critical compliance (${input.adherenceRate}% < 60%)`);
  } else if (isBelowThreshold) {
    reasons.push(`Below ${threshold}% target (${input.adherenceRate}%)`);
  }
  if (!isCriticalStreak && hasMultipleMisses) {
    reasons.push(`${input.missedLogs} missed doses in period`);
  }

  if (isCriticalRate || isCriticalStreak) {
    return { severity: "CRITICAL", alertReasons: reasons };
  }
  if (isBelowThreshold || hasMultipleMisses) {
    return { severity: "WARNING", alertReasons: reasons };
  }
  return { severity: "ON_TRACK", alertReasons: [] };
}

/**
 * Pure helper that computes which scheduled slots for a single prescription
 * are overdue (>2h past scheduled time) and have no matching AdherenceLog.
 */
export function findMissingOverdueSlots(params: {
  scheduleTimes: string[];
  startDate: Date;
  endDate: Date | null;
  existingLogTimes: Date[];
  now: Date;
  lookbackDays?: number;
  graceMs?: number;
}): Date[] {
  const {
    scheduleTimes,
    startDate,
    endDate,
    existingLogTimes,
    now,
    lookbackDays = LOOKBACK_DAYS,
    graceMs = OVERDUE_GRACE_MS,
  } = params;

  const cutoffMs = now.getTime() - graceMs;
  const lookbackFloor = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() - lookbackDays,
    0,
    0,
    0,
    0,
  );
  const startMs = Math.max(startDate.getTime(), lookbackFloor.getTime());
  const endMs = endDate ? Math.min(endDate.getTime(), cutoffMs) : cutoffMs;

  if (endMs < startMs || scheduleTimes.length === 0) {
    return [];
  }

  const parsedSlots = scheduleTimes
    .map(parseSlotHoursMinutes)
    .filter((s): s is { hours: number; minutes: number } => s !== null);

  if (parsedSlots.length === 0) return [];

  const missing: Date[] = [];

  for (let dayOffset = lookbackDays; dayOffset >= 0; dayOffset--) {
    const dayBase = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate() - dayOffset,
    );
    for (const slot of parsedSlots) {
      const slotDate = new Date(
        dayBase.getFullYear(),
        dayBase.getMonth(),
        dayBase.getDate(),
        slot.hours,
        slot.minutes,
        0,
        0,
      );
      const slotMs = slotDate.getTime();
      if (slotMs < startMs || slotMs > endMs) continue;

      const hasLog = existingLogTimes.some(
        (existing) => Math.abs(existing.getTime() - slotMs) <= SLOT_MATCH_TOLERANCE_MS,
      );
      if (!hasLog) {
        missing.push(slotDate);
      }
    }
  }

  return missing;
}

/**
 * Evaluates a patient's recent 30-day adherence and, if CRITICAL, creates a
 * deduplicated ALERT AdminNotification + ActivityLog (max once per 24h per patient).
 */
export async function escalateCriticalPatientIfNeeded(
  patientId: string,
  threshold = 80,
): Promise<boolean> {
  try {
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    const patient = await prisma.patientProfile.findUnique({
      where: { id: patientId },
      include: {
        user: { select: { firstName: true, lastName: true } },
        adherenceLogs: {
          where: { scheduledTime: { gte: thirtyDaysAgo } },
          orderBy: { scheduledTime: "desc" },
          select: { status: true, scheduledTime: true },
        },
      },
    });

    if (!patient || patient.adherenceLogs.length === 0) return false;

    const total = patient.adherenceLogs.length;
    const taken = patient.adherenceLogs.filter((l) => l.status === "TAKEN").length;
    const missed = patient.adherenceLogs.filter((l) => l.status === "MISSED").length;
    const adherenceRate = Math.round((taken / total) * 100);
    const consecutiveMissed = computeConsecutiveMissed(patient.adherenceLogs);

    const { severity, alertReasons } = classifyAdherenceRisk({
      adherenceRate,
      missedLogs: missed,
      consecutiveMissed,
      threshold,
    });

    if (severity !== "CRITICAL") return false;

    const patientName = `${patient.user.firstName} ${patient.user.lastName}`.trim() || "Patient";
    const alertTitle = `Critical Adherence Alert: ${patientName} (${patient.idNumber})`;

    // Deduplicate: skip if we already raised a critical alert for this patient within 24 hours
    const recentAlert = await prisma.adminNotification.findFirst({
      where: {
        title: alertTitle,
        createdAt: { gte: twentyFourHoursAgo },
      },
      select: { id: true },
    });
    if (recentAlert) return false;

    const details = `Automated clinical alert triggered for ${patientName} (${patient.idNumber}, ${patient.department}): ${alertReasons.join("; ")}. Immediate clinician follow-up recommended.`;

    await Promise.all([
      createNotification({
        type: "ALERT",
        title: alertTitle,
        message: details,
      }),
      prisma.activityLog.create({
        data: {
          action: "ADHERENCE_CRITICAL_ALERT",
          details,
          targetId: patient.id,
          targetType: "PatientProfile",
        },
      }),
    ]);

    return true;
  } catch (err) {
    console.error("Failed to evaluate critical adherence alert:", err);
    return false;
  }
}

/**
 * Automatically sweeps ACTIVE prescriptions over the past 3 days and inserts
 * MISSED logs for scheduled doses overdue by more than 2 hours with no intake log.
 * Throttled in-memory to once every 5 minutes unless forced.
 */
export async function reconcileOverdueDoses(force = false): Promise<{ created: number }> {
  const nowMs = Date.now();
  if (!force && nowMs - lastReconcileAt < RECONCILE_THROTTLE_MS) {
    return { created: 0 };
  }
  if (activeReconcilePromise) {
    return activeReconcilePromise;
  }

  activeReconcilePromise = (async () => {
    try {
      const now = new Date();
      const lookbackStart = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate() - LOOKBACK_DAYS - 1,
        0,
        0,
        0,
        0,
      );

      const activePrescriptions = await prisma.prescription.findMany({
        where: {
          status: "ACTIVE",
          startDate: { lte: now },
          OR: [{ endDate: null }, { endDate: { gte: lookbackStart } }],
        },
        select: {
          id: true,
          patientId: true,
          scheduleTimes: true,
          startDate: true,
          endDate: true,
        },
      });

      if (activePrescriptions.length === 0) {
        lastReconcileAt = Date.now();
        return { created: 0 };
      }

      const rxIds = activePrescriptions.map((rx) => rx.id);
      const existingLogs = await prisma.adherenceLog.findMany({
        where: {
          prescriptionId: { in: rxIds },
          scheduledTime: { gte: lookbackStart },
        },
        select: {
          prescriptionId: true,
          scheduledTime: true,
        },
      });

      const logsByRx = new Map<string, Date[]>();
      for (const l of existingLogs) {
        const arr = logsByRx.get(l.prescriptionId) || [];
        arr.push(l.scheduledTime);
        logsByRx.set(l.prescriptionId, arr);
      }

      const toInsert: Array<{
        patientId: string;
        prescriptionId: string;
        scheduledTime: Date;
        takenTime: null;
        status: "MISSED";
        notes: string;
      }> = [];
      const impactedPatientIds = new Set<string>();

      for (const rx of activePrescriptions) {
        const missingSlots = findMissingOverdueSlots({
          scheduleTimes: rx.scheduleTimes,
          startDate: rx.startDate,
          endDate: rx.endDate,
          existingLogTimes: logsByRx.get(rx.id) || [],
          now,
        });

        for (const slotDate of missingSlots) {
          toInsert.push({
            patientId: rx.patientId,
            prescriptionId: rx.id,
            scheduledTime: slotDate,
            takenTime: null,
            status: "MISSED",
            notes: AUTO_MISSED_NOTE,
          });
          impactedPatientIds.add(rx.patientId);
        }
      }

      if (toInsert.length > 0) {
        await prisma.adherenceLog.createMany({
          data: toInsert,
        });

        // Evaluate clinical escalations for patients with newly missed doses
        for (const pid of impactedPatientIds) {
          await escalateCriticalPatientIfNeeded(pid);
        }
      }

      lastReconcileAt = Date.now();
      return { created: toInsert.length };
    } catch (err) {
      console.error("reconcileOverdueDoses error:", err);
      return { created: 0 };
    } finally {
      activeReconcilePromise = null;
    }
  })();

  return activeReconcilePromise;
}
