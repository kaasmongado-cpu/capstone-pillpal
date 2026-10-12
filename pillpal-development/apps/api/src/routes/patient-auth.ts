import type { IncomingMessage, ServerResponse } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { prisma } from "@pillpal/database";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({
  path: path.resolve(__dirname, "../../.env"),
});

const supabaseUrl = process.env.SUPABASE_URL;
const supabasePublishableKey = process.env.SUPABASE_PUBLISHABLE_KEY;

if (!supabaseUrl || !supabasePublishableKey) {
  throw new Error("Missing Supabase environment configuration");
}

const supabase = createClient(supabaseUrl, supabasePublishableKey);

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

export async function patientAuthRoute(req: IncomingMessage, res: ServerResponse) {
  const url = new URL(req.url || "/", "http://localhost:4000");
  const pathname = url.pathname;

  // 1. POST /auth/patient/lookup - Lookup email by CSU Student ID or Email
  if (req.method === "POST" && pathname === "/auth/patient/lookup") {
    try {
      const body = await readJsonBody(req);
      const { identifier } = body;

      if (!identifier || !identifier.trim()) {
        sendJson(res, 400, { message: "Identifier is required" });
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
        });
        return;
      }

      sendJson(res, 404, { message: "No registered CSU patient found with this ID or Email." });
      return;
    } catch (err: any) {
      console.error("POST /auth/patient/lookup error:", err);
      sendJson(res, 500, { message: err.message || "Lookup failed" });
      return;
    }
  }

  // 2. POST /auth/patient/register - Self-registration for CSU students & employees
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
        phone,
        gender,
        bloodType,
        allergies,
        medicalConditions,
        emergencyContactName,
        emergencyContactPhone,
      } = body;

      if (!firstName || !lastName || !email || !password || !idNumber || !department) {
        sendJson(res, 400, {
          message: "First name, last name, CSU email, password, ID number, and department are required.",
        });
        return;
      }

      // Check if ID number or email is already registered in Prisma
      const existingUser = await prisma.user.findUnique({
        where: { email: email.toLowerCase().trim() },
      });
      if (existingUser) {
        sendJson(res, 409, { message: "An account with this email already exists. Please sign in." });
        return;
      }

      const existingProfile = await prisma.patientProfile.findUnique({
        where: { idNumber: idNumber.trim() },
      });
      if (existingProfile) {
        sendJson(res, 409, { message: "A patient profile with this CSU ID Number is already registered." });
        return;
      }

      // Register with Supabase
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: email.toLowerCase().trim(),
        password,
      });

      if (authError || !authData.user) {
        sendJson(res, 400, { message: authError?.message || "Failed to create authentication credentials." });
        return;
      }

      // Create User and PatientProfile in NeonDB via Prisma
      const newUser = await prisma.user.create({
        data: {
          supabaseUserId: authData.user.id,
          email: email.toLowerCase().trim(),
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          phone: phone ? phone.trim() : null,
          role: "PATIENT",
          userType: userType === "EMPLOYEE" ? "EMPLOYEE" : "STUDENT",
          status: "ACTIVE",
          patientProfile: {
            create: {
              idNumber: idNumber.trim(),
              department: department.trim(),
              gender: gender || null,
              bloodType: bloodType || "O+",
              allergies: allergies || "No Known Drug Allergies (NKA)",
              medicalConditions: medicalConditions || null,
              emergencyContactName: emergencyContactName || null,
              emergencyContactPhone: emergencyContactPhone || null,
            },
          },
        },
        include: {
          patientProfile: true,
        },
      });

      sendJson(res, 201, {
        message: "Patient account registered successfully!",
        user: {
          id: newUser.id,
          email: newUser.email,
          firstName: newUser.firstName,
          lastName: newUser.lastName,
          idNumber: newUser.patientProfile?.idNumber,
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
