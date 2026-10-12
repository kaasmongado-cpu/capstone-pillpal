import { prisma } from "@pillpal/database";

export const OVERDUE_APPOINTMENT_REASON =
  "Automatically cancelled: Scheduled appointment time has passed without consultation.";

/**
 * Cancels all overdue appointments whose scheduled time is in the past
 * and are still in PENDING, CONFIRMED, or WAITING states.
 */
export async function autoCancelOverdueAppointments(
  referenceDate: Date = new Date(),
): Promise<{ count: number }> {
  try {
    const result = await prisma.appointment.updateMany({
      where: {
        status: {
          in: ["PENDING", "CONFIRMED", "WAITING"],
        },
        scheduledAt: {
          lt: referenceDate,
        },
      },
      data: {
        status: "CANCELLED",
        cancellationReason: OVERDUE_APPOINTMENT_REASON,
      },
    });

    if (result.count > 0) {
      console.log(
        `[Auto-Cancel] Automatically cancelled ${result.count} overdue appointment(s) prior to ${referenceDate.toISOString()}`,
      );
    }

    return { count: result.count };
  } catch (err) {
    console.error("[Auto-Cancel] Error auto-cancelling overdue appointments:", err);
    return { count: 0 };
  }
}

/**
 * Pure domain helper to evaluate whether an appointment record is overdue.
 */
export function isAppointmentOverdue(
  appointment: {
    status: string;
    scheduledAt: Date | string;
  },
  referenceDate: Date = new Date(),
): boolean {
  const eligibleStatuses = ["PENDING", "CONFIRMED", "WAITING"];
  if (!eligibleStatuses.includes(appointment.status)) {
    return false;
  }
  const sched = new Date(appointment.scheduledAt);
  return sched.getTime() < referenceDate.getTime();
}
