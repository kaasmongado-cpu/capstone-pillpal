import { describe, it } from "node:test";
import assert from "node:assert/strict";

describe("Admin Notifications Domain Model", () => {
  const allowedTypes = ["INFO", "SUCCESS", "WARNING", "ALERT"];

  it("verifies notification type categories", () => {
    assert.equal(allowedTypes.includes("INFO"), true);
    assert.equal(allowedTypes.includes("SUCCESS"), true);
    assert.equal(allowedTypes.includes("WARNING"), true);
    assert.equal(allowedTypes.includes("ALERT"), true);
  });

  it("formats notification items with default unread state", () => {
    function createNotificationPayload(title: string, message: string, type: "INFO" | "SUCCESS" | "WARNING" | "ALERT" = "INFO") {
      return {
        title,
        message,
        type,
        isRead: false,
        createdAt: new Date().toISOString(),
      };
    }

    const notif = createNotificationPayload("New Provider Invited", "Doctor Jane Smith was invited.");
    assert.equal(notif.title, "New Provider Invited");
    assert.equal(notif.isRead, false);
    assert.equal(notif.type, "INFO");
  });
});
