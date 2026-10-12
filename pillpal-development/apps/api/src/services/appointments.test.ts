import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { isAppointmentOverdue, OVERDUE_APPOINTMENT_REASON } from "./appointments.js";

describe("Automated Overdue Appointments Cancellation Logic", () => {
  const referenceTime = new Date("2026-10-06T12:00:00.000Z");

  it("identifies past PENDING triage requests as overdue", () => {
    const pastPending = {
      status: "PENDING",
      scheduledAt: new Date("2026-10-06T09:00:00.000Z"),
    };
    assert.equal(isAppointmentOverdue(pastPending, referenceTime), true);
  });

  it("identifies past CONFIRMED appointments as overdue", () => {
    const pastConfirmed = {
      status: "CONFIRMED",
      scheduledAt: new Date("2026-10-05T14:30:00.000Z"),
    };
    assert.equal(isAppointmentOverdue(pastConfirmed, referenceTime), true);
  });

  it("identifies past WAITING lobby arrivals as overdue if day has passed", () => {
    const pastWaiting = {
      status: "WAITING",
      scheduledAt: new Date("2026-10-04T10:00:00.000Z"),
    };
    assert.equal(isAppointmentOverdue(pastWaiting, referenceTime), true);
  });

  it("does NOT mark future PENDING or CONFIRMED appointments as overdue", () => {
    const futureConfirmed = {
      status: "CONFIRMED",
      scheduledAt: new Date("2026-10-07T09:00:00.000Z"),
    };
    const futurePending = {
      status: "PENDING",
      scheduledAt: new Date("2026-10-08T15:00:00.000Z"),
    };
    assert.equal(isAppointmentOverdue(futureConfirmed, referenceTime), false);
    assert.equal(isAppointmentOverdue(futurePending, referenceTime), false);
  });

  it("does NOT mark COMPLETED appointments as overdue even if scheduled in the past", () => {
    const pastCompleted = {
      status: "COMPLETED",
      scheduledAt: new Date("2026-10-01T08:00:00.000Z"),
    };
    assert.equal(isAppointmentOverdue(pastCompleted, referenceTime), false);
  });

  it("does NOT mark REJECTED or CANCELLED appointments as overdue", () => {
    const pastRejected = {
      status: "REJECTED",
      scheduledAt: new Date("2026-10-01T08:00:00.000Z"),
    };
    const pastCancelled = {
      status: "CANCELLED",
      scheduledAt: new Date("2026-10-01T08:00:00.000Z"),
    };
    assert.equal(isAppointmentOverdue(pastRejected, referenceTime), false);
    assert.equal(isAppointmentOverdue(pastCancelled, referenceTime), false);
  });

  it("provides standard cancellation reason for automated cancellation", () => {
    assert.equal(typeof OVERDUE_APPOINTMENT_REASON, "string");
    assert.equal(
      OVERDUE_APPOINTMENT_REASON.includes("Automatically cancelled"),
      true,
    );
  });
});
