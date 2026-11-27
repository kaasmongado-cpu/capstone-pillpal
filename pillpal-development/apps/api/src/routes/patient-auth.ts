import type { IncomingMessage, ServerResponse } from "node:http";
import crypto from "node:crypto";
import dns from "node:dns/promises";
import { fromNodeHeaders } from "better-auth/node";
import { prisma } from "@pillpal/database";
import { auth, isGoogleAuthEnabled } from "../lib/auth.js";
import { getAuthenticatedUser } from "../services/auth.js";

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

function sendJson(res: ServerResponse, status: number, data: any) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(data));
}

function isAllowedClientRedirect(target: string): boolean {
  const clean = target.trim();
  if (!clean) return false;

  const allowedPrefixes = [
    "http://localhost:",
    "http://127.0.0.1:",
    "http://10.0.2.2:",
    "pillpal://",
    "exp://",
    process.env.PATIENT_WEB_URL,
  ].filter((p): p is string => Boolean(p));

  if (allowedPrefixes.some((prefix) => clean.startsWith(prefix))) {
    return true;
  }

  // Also allow local LAN IP during Expo physical-device testing (e.g. exp://192.168.x.x or http://192.168.x.x)
  return /^(https?|exp):\/\/(192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/.test(clean);
}

function appendQueryParams(baseUrl: string, params: Record<string, string>): string {
  const sep = baseUrl.includes("?") ? "&" : "?";
  const qs = Object.entries(params)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join("&");
  return `${baseUrl}${sep}${qs}`;
}

async function hasValidMailDomain(email: string): Promise<boolean> {
  const domain = email.split("@")[1]?.toLowerCase().trim();
  if (!domain) return false;

  // Fast-path known trusted domains so transient DNS hiccups never block valid students
  const trustedDomains = new Set([
    "gmail.com",
    "carsu.edu.ph",
    "csu.edu.ph",
    "yahoo.com",
    "outlook.com",
    "hotmail.com",
    "icloud.com",
  ]);
  if (trustedDomains.has(domain)) return true;

  try {
    const mxRecords = await dns.resolveMx(domain);
    return Array.isArray(mxRecords) && mxRecords.length > 0;
  } catch {
    return false;
  }
}

function parseOptionalDob(raw: unknown): Date | null {
  if (typeof raw !== "string" || !raw.trim()) return null;
  const parsed = new Date(raw.trim());
  if (Number.isNaN(parsed.getTime())) return null;
  const now = new Date();
  if (parsed > now) return null;
  return parsed;
}

function isValidPhPhone(raw: string): boolean {
  const digits = raw.replace(/[\s()-]/g, "");
  return /^(\+?63|0)9\d{9}$/.test(digits);
}

function validatePasswordStrength(password: string): string | null {
  if (password.length < 8) {
    return "Password must be at least 8 characters long.";
  }
  if (!/[A-Z]/.test(password)) {
    return "Password must include at least one uppercase letter.";
  }
  if (!/\d/.test(password)) {
    return "Password must include at least one number.";
  }
  return null;
}

export async function patientAuthRoute(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const url = new URL(req.url || "/", "http://localhost:4000");
  const pathname = url.pathname;

  // 0. GET /auth/patient/providers - Report available social auth providers
  if (req.method === "GET" && pathname === "/auth/patient/providers") {
    sendJson(res, 200, {
      googleEnabled: isGoogleAuthEnabled,
    });
    return;
  }

  // 0b. GET /auth/patient/oauth-complete - Bridge Better Auth OAuth session to 60s one-time code for Web & Mobile
  if (req.method === "GET" && pathname === "/auth/patient/oauth-complete") {
    const defaultRedirect = `${process.env.PATIENT_WEB_URL || "http://localhost:5175"}/auth/callback`;
    const requestedRedirect = url.searchParams.get("redirect")?.trim() || defaultRedirect;
    const safeRedirect = isAllowedClientRedirect(requestedRedirect)
      ? requestedRedirect
      : defaultRedirect;

    try {
      const session = await auth.api.getSession({
        headers: fromNodeHeaders(req.headers),
      });

      if (!session?.session?.token || !session?.user?.id) {
        res.writeHead(302, {
          Location: appendQueryParams(safeRedirect, {
            error: "Google sign-in did not complete. Please try again.",
          }),
        });
        res.end();
        return;
      }

      const code = crypto.randomBytes(32).toString("hex");
      const expiresAt = new Date(Date.now() + 60 * 1000); // 60 seconds single-use

      await prisma.verification.create({
        data: {
          identifier: `oauth-code:${code}`,
          value: JSON.stringify({
            token: session.session.token,
            userId: session.user.id,
          }),
          expiresAt,
        },
      });

      res.writeHead(302, {
        Location: appendQueryParams(safeRedirect, { code }),
      });
      res.end();
      return;
    } catch (err) {
      console.error("GET /auth/patient/oauth-complete error:", err);
      res.writeHead(302, {
        Location: appendQueryParams(safeRedirect, {
          error: "Unable to complete Google sign-in.",
        }),
      });
      res.end();
      return;
    }
  }

  // 0c. POST /auth/patient/exchange-oauth-code - Swap 60s one-time code for Bearer token + onboarding status
  if (req.method === "POST" && pathname === "/auth/patient/exchange-oauth-code") {
    try {
      const body = await readJsonBody(req);
      const code = typeof body.code === "string" ? body.code.trim() : "";

      if (!code) {
        sendJson(res, 400, { message: "Sign-in code is required." });
        return;
      }

      const record = await prisma.verification.findFirst({
        where: { identifier: `oauth-code:${code}` },
      });

      if (!record || record.expiresAt < new Date()) {
        if (record) {
          await prisma.verification.delete({ where: { id: record.id } }).catch(() => {});
        }
        sendJson(res, 400, {
          message: "Invalid or expired Google sign-in code. Please try again.",
        });
        return;
      }

      // Consume immediately (single-use)
      await prisma.verification.delete({ where: { id: record.id } });

      const payload = JSON.parse(record.value) as { token: string; userId: string };
      const user = await prisma.user.findUnique({
        where: { id: payload.userId },
        include: { patientProfile: true },
      });

      if (!user) {
        sendJson(res, 404, { message: "User account not found." });
        return;
      }

      if (user.status === "INACTIVE") {
        sendJson(res, 403, {
          message: "Your account is inactive. Please contact the CSU Health Services Clinic.",
        });
        return;
      }

      const isPatientPortalEligible = user.role === "PATIENT" || user.role === "ADMIN";
      if (!isPatientPortalEligible) {
        sendJson(res, 403, {
          message:
            "This email belongs to a Healthcare Provider account. Please sign in on the Healthcare Portal.",
        });
        return;
      }

      sendJson(res, 200, {
        access_token: payload.token,
        needsProfileOnboarding: user.role === "PATIENT" && !user.patientProfile,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          firstName: user.firstName,
          lastName: user.lastName,
          role: user.role,
          userType: user.userType,
          status: user.status,
          emailVerified: user.emailVerified,
          patientProfile: user.patientProfile,
        },
      });
      return;
    } catch (err: any) {
      console.error("POST /auth/patient/exchange-oauth-code error:", err);
      sendJson(res, 500, { message: err.message || "Failed to finalize Google sign-in." });
      return;
    }
  }

  // 0d. POST /auth/patient/complete-profile - 1-step CSU ID & College onboarding for first-time Google users
  if (req.method === "POST" && pathname === "/auth/patient/complete-profile") {
    try {
      const user = await getAuthenticatedUser(req);
      if (!user) {
        sendJson(res, 401, { message: "Authentication required." });
        return;
      }

      const body = await readJsonBody(req);
      const idNumber = typeof body.idNumber === "string" ? body.idNumber.trim() : "";
      const department = typeof body.department === "string" ? body.department.trim() : "";
      const firstName = typeof body.firstName === "string" && body.firstName.trim() ? body.firstName.trim() : user.firstName;
      const lastName = typeof body.lastName === "string" && body.lastName.trim() ? body.lastName.trim() : user.lastName;
      const userType = body.userType === "EMPLOYEE" ? "EMPLOYEE" : "STUDENT";
      const dateOfBirth = parseOptionalDob(body.dateOfBirth);
      const gender = typeof body.gender === "string" && body.gender.trim() ? body.gender.trim() : null;
      const phone = typeof body.phone === "string" && body.phone.trim() ? body.phone.trim() : null;
      const bloodType = typeof body.bloodType === "string" && body.bloodType.trim() ? body.bloodType.trim() : null;
      const allergies =
        typeof body.allergies === "string" && body.allergies.trim()
          ? body.allergies.trim()
          : null;
      const medicalConditions =
        typeof body.medicalConditions === "string" && body.medicalConditions.trim()
          ? body.medicalConditions.trim()
          : null;
      const emergencyContactName =
        typeof body.emergencyContactName === "string" && body.emergencyContactName.trim()
          ? body.emergencyContactName.trim()
          : null;
      const emergencyContactPhone =
        typeof body.emergencyContactPhone === "string" && body.emergencyContactPhone.trim()
          ? body.emergencyContactPhone.trim()
          : null;
      const privacyConsent = body.privacyConsent === true;
      const optionalPassword =
        typeof body.password === "string" ? body.password : "";

      if (optionalPassword.length > 0) {
        const pwdError = validatePasswordStrength(optionalPassword);
        if (pwdError) {
          sendJson(res, 400, { message: pwdError });
          return;
        }
      }

      if (!idNumber || !department) {
        sendJson(res, 400, {
          message: "CSU Student/Employee ID Number and College/Unit are required.",
        });
        return;
      }

      if (phone && !isValidPhPhone(phone)) {
        sendJson(res, 400, {
          message: "Please enter a valid Philippine mobile number (e.g. 0912 345 6789).",
        });
        return;
      }

      if (body.privacyConsent === false) {
        sendJson(res, 400, {
          message: "You must consent to the CSU Data Privacy Notice (RA 10173) to continue.",
        });
        return;
      }

      const isValidIdFormat = /^(\d{2,4}-\d{4,6}|\d{6,10})$/.test(idNumber);
      if (!isValidIdFormat) {
        sendJson(res, 400, {
          message:
            "Invalid CSU ID Number format. Please use standard format like '211-00123' or '2022-04912'.",
        });
        return;
      }

      const existingIdOwner = await prisma.patientProfile.findUnique({
        where: { idNumber },
      });
      if (existingIdOwner && existingIdOwner.userId !== user.id) {
        sendJson(res, 409, {
          message: "This CSU ID Number is already registered to another account.",
        });
        return;
      }

      const consentTimestamp = privacyConsent ? new Date() : undefined;

      const updatedUser = await prisma.user.update({
        where: { id: user.id },
        data: {
          firstName,
          lastName,
          name: `${firstName} ${lastName}`.trim(),
          userType,
          ...(phone !== null ? { phone } : {}),
          patientProfile: {
            upsert: {
              create: {
                idNumber,
                department,
                dateOfBirth,
                gender,
                bloodType,
                allergies,
                medicalConditions,
                emergencyContactName,
                emergencyContactPhone,
                privacyConsentAt: consentTimestamp ?? new Date(),
              },
              update: {
                idNumber,
                department,
                ...(dateOfBirth ? { dateOfBirth } : {}),
                ...(gender ? { gender } : {}),
                bloodType,
                allergies,
                ...(medicalConditions !== null ? { medicalConditions } : {}),
                ...(emergencyContactName !== null ? { emergencyContactName } : {}),
                ...(emergencyContactPhone !== null ? { emergencyContactPhone } : {}),
                ...(consentTimestamp ? { privacyConsentAt: consentTimestamp } : {}),
              },
            },
          },
        },
        include: { patientProfile: true },
      });

      let passwordSet = false;
      if (optionalPassword.length > 0) {
        const existingCred = await prisma.account.findFirst({
          where: { userId: user.id, providerId: "credential" },
          select: { id: true, password: true },
        });
        if (!existingCred || !existingCred.password) {
          await auth.api.setPassword({
            body: { newPassword: optionalPassword },
            headers: fromNodeHeaders(req.headers),
          });
          passwordSet = true;
        }
      }

      sendJson(res, 200, {
        message: "CSU health profile completed successfully!",
        passwordSet,
        user: {
          id: updatedUser.id,
          email: updatedUser.email,
          firstName: updatedUser.firstName,
          lastName: updatedUser.lastName,
          phone: updatedUser.phone || null,
          role: updatedUser.role,
          userType: updatedUser.userType,
          patientProfile: updatedUser.patientProfile,
        },
      });
      return;
    } catch (err: any) {
      console.error("POST /auth/patient/complete-profile error:", err);
      sendJson(res, 500, { message: err.message || "Failed to save CSU health profile." });
      return;
    }
  }

  // 0e. POST /auth/patient/set-password - Allow signed-in OAuth (Google) users to set an initial portal password
  if (req.method === "POST" && pathname === "/auth/patient/set-password") {
    try {
      const user = await getAuthenticatedUser(req);
      if (!user) {
        sendJson(res, 401, { message: "Authentication required." });
        return;
      }

      const body = await readJsonBody(req);
      const newPassword =
        typeof body.newPassword === "string" ? body.newPassword : "";

      const pwdError = validatePasswordStrength(newPassword);
      if (pwdError) {
        sendJson(res, 400, { message: pwdError });
        return;
      }

      const existingCred = await prisma.account.findFirst({
        where: { userId: user.id, providerId: "credential" },
        select: { id: true, password: true },
      });

      if (existingCred?.password) {
        sendJson(res, 400, {
          message:
            "A portal password is already set on your account. Use Change Password instead.",
        });
        return;
      }

      await auth.api.setPassword({
        body: { newPassword },
        headers: fromNodeHeaders(req.headers),
      });

      sendJson(res, 200, {
        status: true,
        hasPassword: true,
        message:
          "Portal password created! You can now sign in with Google or your Email / CSU ID and password.",
      });
      return;
    } catch (err: any) {
      console.error("POST /auth/patient/set-password error:", err);
      sendJson(res, 400, {
        message: err?.message || "Unable to set portal password.",
      });
      return;
    }
  }

  // 1. POST /auth/patient/lookup - Resolve Email from CSU Student/Employee ID Number (or Email)
  if (req.method === "POST" && pathname === "/auth/patient/lookup") {
    try {
      const body = await readJsonBody(req);
      const { identifier } = body;

      if (!identifier || typeof identifier !== "string") {
        sendJson(res, 400, { message: "Identifier (Email or CSU ID Number) is required." });
        return;
      }

      const cleanId = identifier.trim();

      // Check if it's directly an email
      if (cleanId.includes("@")) {
        const user = await prisma.user.findUnique({
          where: { email: cleanId.toLowerCase() },
          include: { patientProfile: true },
        });

        if (user) {
          sendJson(res, 200, {
            email: user.email,
            firstName: user.firstName,
            lastName: user.lastName,
            idNumber: user.patientProfile?.idNumber || null,
            emailVerified: user.emailVerified,
          });
          return;
        }
      }

      // Look up by CSU ID number
      const profile = await prisma.patientProfile.findUnique({
        where: { idNumber: cleanId },
        include: { user: true },
      });

      if (profile && profile.user) {
        sendJson(res, 200, {
          email: profile.user.email,
          firstName: profile.user.firstName,
          lastName: profile.user.lastName,
          idNumber: profile.idNumber,
          emailVerified: profile.user.emailVerified,
        });
        return;
      }

      sendJson(res, 404, {
        message: "No registered CSU patient found with this ID or Email.",
      });
      return;
    } catch (err: any) {
      console.error("POST /auth/patient/lookup error:", err);
      sendJson(res, 500, { message: err.message || "Lookup failed" });
      return;
    }
  }

  // 2. POST /auth/patient/register - Self-registration with Better Auth + 6-digit Email OTP
  if (req.method === "POST" && pathname === "/auth/patient/register") {
    try {
      const body = await readJsonBody(req);
      const {
        firstName,
        lastName,
        email,
        password,
        idNumber,
        department,
        userType = "STUDENT",
        dateOfBirth,
        phone,
        gender,
        bloodType,
        allergies,
        medicalConditions,
        emergencyContactName,
        emergencyContactPhone,
        privacyConsent,
      } = body;

      if (!firstName || !lastName || !email || !password || !idNumber || !department) {
        sendJson(res, 400, {
          message:
            "First name, last name, valid email, password, ID number, and college/unit are required.",
        });
        return;
      }

      if (privacyConsent === false) {
        sendJson(res, 400, {
          message:
            "You must agree to the Data Privacy Notice (RA 10173) before creating an account.",
        });
        return;
      }

      const cleanPhone = typeof phone === "string" ? phone.trim() : "";
      if (cleanPhone && !isValidPhPhone(cleanPhone)) {
        sendJson(res, 400, {
          message:
            "Please enter a valid Philippine mobile number (e.g. 0912 345 6789 or +63 912 345 6789).",
        });
        return;
      }

      // 1. Validate Real & Well-Formed Email Address (Supports @gmail.com, @carsu.edu.ph, etc.)
      const cleanEmail = email.toLowerCase().trim();
      const emailRegex =
        /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;
      const hasValidTld =
        cleanEmail.includes(".") && (cleanEmail.split(".").pop()?.length ?? 0) >= 2;
      const isValidEmail = emailRegex.test(cleanEmail) && hasValidTld;

      if (!isValidEmail) {
        sendJson(res, 400, {
          message:
            "Please provide a valid email address (e.g. yourname@gmail.com or yourname@carsu.edu.ph).",
        });
        return;
      }

      // 2. Verify mail server exists (DNS MX check)
      const domainHasMx = await hasValidMailDomain(cleanEmail);
      if (!domainHasMx) {
        sendJson(res, 400, {
          message:
            "This email domain does not appear to accept mail. Please enter a real email address (e.g. @gmail.com or @carsu.edu.ph).",
        });
        return;
      }

      // 3. Validate Password Strength
      const passwordError = validatePasswordStrength(String(password));
      if (passwordError) {
        sendJson(res, 400, {
          message: passwordError,
        });
        return;
      }

      // 4. Validate CSU Student/Employee ID Number Format (e.g. 211-00123 or 2021-00123)
      const cleanIdNumber = idNumber.trim();
      const isValidIdFormat = /^(\d{2,4}-\d{4,6}|\d{6,10})$/.test(cleanIdNumber);
      if (!isValidIdFormat) {
        sendJson(res, 400, {
          message:
            "Invalid CSU ID Number format. Please use standard format like '211-00123' or '2021-00123'.",
        });
        return;
      }

      // 5. Check duplicate email / ID number in Neon DB
      const existingUser = await prisma.user.findUnique({
        where: { email: cleanEmail },
      });
      if (existingUser) {
        if (!existingUser.emailVerified) {
          // Resend OTP for unverified user so they can finish verification seamlessly
          await auth.api.sendVerificationOTP({
            body: {
              email: cleanEmail,
              type: "email-verification",
            },
          });
          sendJson(res, 200, {
            message:
              "Account already exists but is not yet verified. A new 6-digit verification code has been sent to your email.",
            requiresVerification: true,
            email: cleanEmail,
          });
          return;
        }
        sendJson(res, 409, {
          message: "An account with this email already exists. Please sign in.",
        });
        return;
      }

      const existingProfile = await prisma.patientProfile.findUnique({
        where: { idNumber: cleanIdNumber },
      });
      if (existingProfile) {
        sendJson(res, 409, {
          message: "A patient profile with this CSU ID Number is already registered.",
        });
        return;
      }

      const requireVerification = process.env.REQUIRE_EMAIL_VERIFICATION !== "false";
      const fullName = `${firstName.trim()} ${lastName.trim()}`.trim();

      // 6. Create User + Credential Account via Better Auth
      const signUpResult = await auth.api.signUpEmail({
        body: {
          name: fullName,
          email: cleanEmail,
          password,
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          phone: phone ? phone.trim() : undefined,
          role: "PATIENT",
          userType: userType === "EMPLOYEE" ? "EMPLOYEE" : "STUDENT",
          status: "ACTIVE",
        },
      });

      if (!signUpResult?.user?.id) {
        sendJson(res, 400, {
          message: "Failed to create authentication credentials.",
        });
        return;
      }

      // 7. Create PatientProfile in Neon DB linked to the new Better Auth User
      try {
        await prisma.patientProfile.create({
          data: {
            userId: signUpResult.user.id,
            idNumber: cleanIdNumber,
            department: department.trim(),
            dateOfBirth: parseOptionalDob(dateOfBirth),
            gender: typeof gender === "string" && gender.trim() ? gender.trim() : null,
            bloodType: typeof bloodType === "string" && bloodType.trim() ? bloodType.trim() : null,
            allergies: typeof allergies === "string" && allergies.trim() ? allergies.trim() : null,
            medicalConditions:
              typeof medicalConditions === "string" && medicalConditions.trim()
                ? medicalConditions.trim()
                : null,
            emergencyContactName:
              typeof emergencyContactName === "string" && emergencyContactName.trim()
                ? emergencyContactName.trim()
                : null,
            emergencyContactPhone:
              typeof emergencyContactPhone === "string" && emergencyContactPhone.trim()
                ? emergencyContactPhone.trim()
                : null,
            privacyConsentAt: privacyConsent === true ? new Date() : null,
          },
        });
      } catch (profileErr) {
        // Roll back user if profile creation fails
        await prisma.user.delete({ where: { id: signUpResult.user.id } }).catch(() => {});
        throw profileErr;
      }

      // If email verification is explicitly disabled (e.g., offline defense toggle), mark verified
      if (!requireVerification) {
        await prisma.user.update({
          where: { id: signUpResult.user.id },
          data: { emailVerified: true },
        });
      }

      sendJson(res, 201, {
        message: requireVerification
          ? "Account created! Please enter the 6-digit verification code sent to your email."
          : "Patient account registered successfully!",
        requiresVerification: requireVerification,
        email: cleanEmail,
        user: {
          id: signUpResult.user.id,
          email: cleanEmail,
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          idNumber: cleanIdNumber,
        },
      });
      return;
    } catch (err: any) {
      console.error("POST /auth/patient/register error:", err);
      sendJson(res, 500, { message: err.message || "Registration failed" });
      return;
    }
  }

  sendJson(res, 404, { message: "Endpoint not found" });
}
