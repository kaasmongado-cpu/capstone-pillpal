import { describe, it } from "node:test";
import assert from "node:assert/strict";

describe("Provider & Admin Validation Rules", () => {
  function validateProviderInput(input: {
    firstName?: string;
    lastName?: string;
    email?: string;
    workId?: string;
    role?: string;
    specialization?: string;
  }) {
    const firstName = input.firstName?.trim();
    const lastName = input.lastName?.trim();
    const email = input.email?.trim().toLowerCase();
    const workId = input.workId?.trim();
    const role = input.role;
    const specialization = input.specialization?.trim();

    if (!firstName || !lastName || !email || !workId || !role) {
      throw new Error("First name, last name, email, work ID, and provider role are required.");
    }

    if (role !== "DOCTOR" && role !== "HEALTH_STAFF") {
      throw new Error("Provider role must be DOCTOR or HEALTH_STAFF.");
    }

    if (role === "DOCTOR" && !specialization) {
      throw new Error("Specialization is required for doctors.");
    }

    return {
      firstName,
      lastName,
      email,
      workId,
      role,
      specialization: role === "DOCTOR" ? specialization : null,
    };
  }

  it("successfully validates a valid Doctor input with specialization", () => {
    const validDoctor = {
      firstName: "Jose",
      lastName: "Rizal",
      email: "j.rizal@csu.edu.ph",
      workId: "DOC-101",
      role: "DOCTOR",
      specialization: "General Medicine",
    };

    const result = validateProviderInput(validDoctor);
    assert.equal(result.firstName, "Jose");
    assert.equal(result.role, "DOCTOR");
    assert.equal(result.specialization, "General Medicine");
  });

  it("throws error when Doctor has no specialization", () => {
    const invalidDoctor = {
      firstName: "Jose",
      lastName: "Rizal",
      email: "j.rizal@csu.edu.ph",
      workId: "DOC-101",
      role: "DOCTOR",
      specialization: "",
    };

    assert.throws(
      () => validateProviderInput(invalidDoctor),
      /Specialization is required for doctors/,
    );
  });

  it("successfully validates Health Staff without requiring specialization", () => {
    const validStaff = {
      firstName: "Maria",
      lastName: "Clara",
      email: "m.clara@csu.edu.ph",
      workId: "STF-202",
      role: "HEALTH_STAFF",
    };

    const result = validateProviderInput(validStaff);
    assert.equal(result.role, "HEALTH_STAFF");
    assert.equal(result.specialization, null);
  });

  it("rejects invalid roles like PATIENT or ADMIN in provider registration", () => {
    const invalidRole = {
      firstName: "Juan",
      lastName: "Tamad",
      email: "j.tamad@csu.edu.ph",
      workId: "STU-001",
      role: "PATIENT",
    };

    assert.throws(
      () => validateProviderInput(invalidRole),
      /Provider role must be DOCTOR or HEALTH_STAFF/,
    );
  });

  it("enforces admin password minimum length of 8 characters", () => {
    function validateAdminPassword(password: string) {
      if (!password || password.length < 8) {
        throw new Error("Password must be at least 8 characters.");
      }
      return true;
    }

    assert.equal(validateAdminPassword("PillPal#2026"), true);
    assert.throws(() => validateAdminPassword("12345"), /Password must be at least 8 characters/);
  });
});
