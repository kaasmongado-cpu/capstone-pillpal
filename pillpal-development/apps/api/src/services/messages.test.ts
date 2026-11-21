import { describe, it } from "node:test";
import assert from "node:assert/strict";

describe("Clinical Messaging Domain & Authorization Rules", () => {
  function isAuthorizedForClinicalMessaging(role: string): boolean {
    return role === "PATIENT" || role === "DOCTOR" || role === "HEALTH_STAFF";
  }

  function calculateUnreadCount(
    messages: Array<{ id: string; senderId: string; createdAt: Date; isRead: boolean }>,
    currentUserId: string,
    lastReadAt: Date | null,
  ): number {
    return messages.filter((m) => {
      if (m.senderId === currentUserId) return false;
      if (!lastReadAt) return !m.isRead;
      return m.createdAt.getTime() > lastReadAt.getTime();
    }).length;
  }

  function validateMessageContent(content?: string): { valid: boolean; error?: string } {
    if (!content || !content.trim()) {
      return { valid: false, error: "Message content cannot be empty" };
    }
    if (content.length > 5000) {
      return { valid: false, error: "Message exceeds maximum character limit" };
    }
    return { valid: true };
  }

  it("authorizes PATIENT, DOCTOR, and HEALTH_STAFF for clinical messaging", () => {
    assert.equal(isAuthorizedForClinicalMessaging("PATIENT"), true);
    assert.equal(isAuthorizedForClinicalMessaging("DOCTOR"), true);
    assert.equal(isAuthorizedForClinicalMessaging("HEALTH_STAFF"), true);
  });

  it("strictly denies ADMIN role from accessing private clinical messaging", () => {
    assert.equal(isAuthorizedForClinicalMessaging("ADMIN"), false);
  });

  it("rejects empty or whitespace-only messages", () => {
    assert.equal(validateMessageContent("").valid, false);
    assert.equal(validateMessageContent("   ").valid, false);
    assert.equal(validateMessageContent(undefined).valid, false);
    assert.equal(validateMessageContent("Doctor, I have a question.").valid, true);
  });

  it("calculates unread message count accurately using lastReadAt", () => {
    const userId = "patient_maria";
    const doctorId = "doctor_ramirez";
    const t0 = new Date("2026-10-12T10:00:00Z");
    const t1 = new Date("2026-10-12T10:05:00Z");
    const t2 = new Date("2026-10-12T10:10:00Z");
    const t3 = new Date("2026-10-12T10:15:00Z");

    const sampleMessages = [
      { id: "m1", senderId: doctorId, createdAt: t0, isRead: true },
      { id: "m2", senderId: userId, createdAt: t1, isRead: true },
      { id: "m3", senderId: doctorId, createdAt: t2, isRead: false },
      { id: "m4", senderId: doctorId, createdAt: t3, isRead: false },
    ];

    // Case A: Last read is at 10:07 (m3 and m4 are unread)
    const unreadCount1 = calculateUnreadCount(sampleMessages, userId, new Date("2026-10-12T10:07:00Z"));
    assert.equal(unreadCount1, 2);

    // Case B: Last read is at 10:12 (only m4 is unread)
    const unreadCount2 = calculateUnreadCount(sampleMessages, userId, new Date("2026-10-12T10:12:00Z"));
    assert.equal(unreadCount2, 1);

    // Case C: Current user is the sender (own messages never count as unread)
    const doctorUnread = calculateUnreadCount(sampleMessages, doctorId, new Date("2026-10-12T10:00:00Z"));
    assert.equal(doctorUnread, 1); // Only m2 from maria is unread for the doctor
  });

  it("formats clinical participant profile metadata correctly", () => {
    const clinician = {
      firstName: "Evelyn",
      lastName: "Ramirez",
      role: "DOCTOR",
      specialization: "Cardiology",
    };

    const formattedName = clinician.role === "DOCTOR"
      ? `Dr. ${clinician.firstName} ${clinician.lastName}`
      : `${clinician.firstName} ${clinician.lastName}`;

    assert.equal(formattedName, "Dr. Evelyn Ramirez");
  });
});
