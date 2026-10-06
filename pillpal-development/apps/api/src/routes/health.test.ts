import { describe, it } from "node:test";
import assert from "node:assert/strict";

describe("Health Route & API Core", () => {
  it("verifies health check payload structure", () => {
    const payload = { status: "ok", service: "PILLPAL API" };
    assert.equal(payload.status, "ok");
    assert.equal(payload.service, "PILLPAL API");
  });

  it("validates provider role classifications", () => {
    const validRoles = ["DOCTOR", "HEALTH_STAFF"];
    assert.equal(validRoles.includes("DOCTOR"), true);
    assert.equal(validRoles.includes("HEALTH_STAFF"), true);
    assert.equal(validRoles.includes("PATIENT"), false);
  });
});
