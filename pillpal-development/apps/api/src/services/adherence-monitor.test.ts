import test from "node:test";
import assert from "node:assert/strict";
import {
  classifyAdherenceRisk,
  computeConsecutiveMissed,
  findMissingOverdueSlots,
  parseSlotHoursMinutes,
} from "./adherence-monitor.js";

test("parseSlotHoursMinutes parses 12h AM/PM and 24h formats accurately", () => {
  assert.deepEqual(parseSlotHoursMinutes("08:00 AM"), { hours: 8, minutes: 0 });
  assert.deepEqual(parseSlotHoursMinutes("12:00 PM"), { hours: 12, minutes: 0 });
  assert.deepEqual(parseSlotHoursMinutes("12:30 AM"), { hours: 0, minutes: 30 });
  assert.deepEqual(parseSlotHoursMinutes("08:15 PM"), { hours: 20, minutes: 15 });
  assert.deepEqual(parseSlotHoursMinutes("14:45"), { hours: 14, minutes: 45 });
  assert.equal(parseSlotHoursMinutes("invalid"), null);
});

test("computeConsecutiveMissed counts leading MISSED logs until first non-missed", () => {
  assert.equal(
    computeConsecutiveMissed([
      { status: "MISSED" },
      { status: "MISSED" },
      { status: "MISSED" },
      { status: "TAKEN" },
      { status: "MISSED" },
    ]),
    3,
  );
  assert.equal(
    computeConsecutiveMissed([{ status: "TAKEN" }, { status: "MISSED" }]),
    0,
  );
  assert.equal(computeConsecutiveMissed([]), 0);
});

test("classifyAdherenceRisk separates CRITICAL, WARNING, and ON_TRACK properly", () => {
  const criticalRate = classifyAdherenceRisk({
    adherenceRate: 55,
    missedLogs: 4,
    consecutiveMissed: 1,
    threshold: 80,
  });
  assert.equal(criticalRate.severity, "CRITICAL");
  assert.ok(criticalRate.alertReasons.some((r) => r.includes("55%")));

  const criticalStreak = classifyAdherenceRisk({
    adherenceRate: 75,
    missedLogs: 3,
    consecutiveMissed: 3,
    threshold: 80,
  });
  assert.equal(criticalStreak.severity, "CRITICAL");
  assert.ok(criticalStreak.alertReasons.some((r) => r.includes("3 consecutive")));

  const warning = classifyAdherenceRisk({
    adherenceRate: 72,
    missedLogs: 2,
    consecutiveMissed: 1,
    threshold: 80,
  });
  assert.equal(warning.severity, "WARNING");

  const onTrack = classifyAdherenceRisk({
    adherenceRate: 92,
    missedLogs: 1,
    consecutiveMissed: 0,
    threshold: 80,
  });
  assert.equal(onTrack.severity, "ON_TRACK");
  assert.equal(onTrack.alertReasons.length, 0);
});

test("findMissingOverdueSlots respects 2-hour grace window, startDate, and existing logs", () => {
  const now = new Date(2026, 10, 27, 13, 0, 0); // Nov 27, 2026 1:00 PM
  const startDate = new Date(2026, 10, 26, 7, 0, 0); // Started Nov 26, 7:00 AM

  // Already logged Nov 26 8:00 AM (at 8:10 AM)
  const existingLogTimes = [new Date(2026, 10, 26, 8, 10, 0)];

  const missing = findMissingOverdueSlots({
    scheduleTimes: ["08:00 AM", "12:00 PM", "08:00 PM"],
    startDate,
    endDate: null,
    existingLogTimes,
    now,
    lookbackDays: 3,
  });

  // Expected missing:
  // - Nov 26 8:00 AM -> logged (skip)
  // - Nov 26 12:00 PM -> missing
  // - Nov 26 8:00 PM -> missing
  // - Nov 27 8:00 AM -> missing (>2h before 1:00 PM)
  // - Nov 27 12:00 PM -> within 2h grace window (skip!)
  // - Nov 27 8:00 PM -> future (skip!)
  assert.equal(missing.length, 3);
  assert.equal(missing[0]!.getDate(), 26);
  assert.equal(missing[0]!.getHours(), 12);
  assert.equal(missing[1]!.getDate(), 26);
  assert.equal(missing[1]!.getHours(), 20);
  assert.equal(missing[2]!.getDate(), 27);
  assert.equal(missing[2]!.getHours(), 8);
});
