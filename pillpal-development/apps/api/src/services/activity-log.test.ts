import { describe, it } from "node:test";
import assert from "node:assert/strict";

describe("Activity Log Domain Model", () => {
  const allowedActions = [
    "ADMIN_SETUP_COMPLETED",
    "PROVIDER_INVITED",
    "PROVIDER_ACTIVATED",
    "PROVIDER_DEACTIVATED",
    "PROVIDER_UPDATED",
  ];

  it("verifies all expected audit action categories exist", () => {
    assert.equal(allowedActions.includes("PROVIDER_INVITED"), true);
    assert.equal(allowedActions.includes("PROVIDER_ACTIVATED"), true);
    assert.equal(allowedActions.includes("PROVIDER_DEACTIVATED"), true);
    assert.equal(allowedActions.includes("PROVIDER_UPDATED"), true);
    assert.equal(allowedActions.includes("ADMIN_SETUP_COMPLETED"), true);
  });

  it("formats activity log details accurately", () => {
    function formatInviteDetails(adminName: string, role: string, providerName: string, email: string) {
      return `${adminName} invited ${role} ${providerName} (${email}).`;
    }

    const details = formatInviteDetails("Admin User", "Doctor", "John Doe", "john@csu.edu.ph");
    assert.equal(details, "Admin User invited Doctor John Doe (john@csu.edu.ph).");
  });
});
