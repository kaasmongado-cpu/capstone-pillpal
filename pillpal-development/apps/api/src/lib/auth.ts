import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { bearer, emailOTP } from "better-auth/plugins";
import { prisma } from "@pillpal/database";
import { sendVerificationOtpEmail } from "../services/email.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({
  path: path.resolve(__dirname, "../../../../.env"),
});
dotenv.config({
  path: path.resolve(__dirname, "../../.env"),
});

const requireEmailVerification =
  process.env.REQUIRE_EMAIL_VERIFICATION !== "false";

const normalizeUrl = (u?: string) => {
  const cleaned = (u || "").trim().replace(/^["']|["']$/g, "").replace(/\/+$/, "");
  return cleaned;
};

function resolveBetterAuthBaseUrl(): string {
  const raw = normalizeUrl(process.env.BETTER_AUTH_URL);
  if (!raw) return "http://localhost:4000";
  if (/^https?:\/\//i.test(raw)) return raw;
  return `https://${raw}`;
}

const trustedOrigins = [
  "http://localhost:4000",
  "http://localhost:5173",
  "http://localhost:5174",
  "http://localhost:5175",
  "http://localhost:5176",
  "http://localhost:8081",
  "http://localhost:19006",
  "http://127.0.0.1:4000",
  "http://127.0.0.1:5173",
  "http://127.0.0.1:5174",
  "http://127.0.0.1:5175",
  "http://127.0.0.1:8081",
  "http://10.0.2.2:4000",
  "exp://",
  "pillpal://",
  "https://pillpal-api.vercel.app",
  "https://pillpa-apil.vercel.app",
  "https://pillpal-patient.vercel.app",
  "https://pillpal-healthcare.vercel.app",
  "https://pillpal-admin-web.vercel.app",
  normalizeUrl(process.env.BETTER_AUTH_URL),
  normalizeUrl(process.env.ADMIN_WEB_URL),
  normalizeUrl(process.env.HEALTHCARE_WEB_URL),
  normalizeUrl(process.env.PATIENT_WEB_URL),
  ...(process.env.CORS_ALLOWED_ORIGINS || "").split(",").map(normalizeUrl),
].filter((origin): origin is string => Boolean(origin));

const googleClientId = process.env.GOOGLE_CLIENT_ID;
const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET;

export const isGoogleAuthEnabled = Boolean(googleClientId && googleClientSecret);

export const auth = betterAuth({
  baseURL: resolveBetterAuthBaseUrl(),
  secret:
    process.env.BETTER_AUTH_SECRET ||
    "pillpal_dev_fallback_secret_change_in_production_32chars",
  database: prismaAdapter(prisma, {
    provider: "postgresql",
  }),
  trustedOrigins,
  advanced: {
    // Clients authenticate via Authorization: Bearer tokens (including React Native iOS/Android
    // which do not send browser Origin headers). Browser CORS is enforced in server.ts.
    disableCSRFCheck: true,
    disableOriginCheck: true,
  },
  account: {
    storeStateStrategy: "database",
    skipStateCookieCheck: true,
    accountLinking: {
      enabled: true,
      trustedProviders: ["google"],
    },
  },
  databaseHooks: {
    user: {
      create: {
        before: async (user) => {
          const fullName = (user.name || "").trim();
          const parts = fullName.split(/\s+/).filter(Boolean);
          const derivedFirst = parts[0] || user.email.split("@")[0] || "Student";
          const derivedLast = parts.length > 1 ? parts.slice(1).join(" ") : "Patient";

          return {
            data: {
              ...user,
              firstName: (user as any).firstName || derivedFirst,
              lastName: (user as any).lastName || derivedLast,
              role: (user as any).role || "PATIENT",
              userType: (user as any).userType || "STUDENT",
              status: (user as any).status || "ACTIVE",
            },
          };
        },
      },
    },
  },
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
    requireEmailVerification,
    autoSignIn: !requireEmailVerification,
  },
  ...(googleClientId && googleClientSecret
    ? {
        socialProviders: {
          google: {
            clientId: googleClientId,
            clientSecret: googleClientSecret,
          },
        },
      }
    : {}),
  user: {
    additionalFields: {
      firstName: {
        type: "string",
        required: false,
        defaultValue: "",
      },
      lastName: {
        type: "string",
        required: false,
        defaultValue: "",
      },
      phone: {
        type: "string",
        required: false,
      },
      workId: {
        type: "string",
        required: false,
      },
      specialization: {
        type: "string",
        required: false,
      },
      role: {
        type: "string",
        required: false,
        defaultValue: "PATIENT",
      },
      userType: {
        type: "string",
        required: false,
        defaultValue: "STUDENT",
      },
      status: {
        type: "string",
        required: false,
        defaultValue: "ACTIVE",
      },
    },
  },
  plugins: [
    bearer(),
    emailOTP({
      otpLength: 6,
      expiresIn: 300, // 5 minutes
      overrideDefaultEmailVerification: true,
      sendVerificationOnSignUp: true,
      async sendVerificationOTP({ email, otp, type }) {
        await sendVerificationOtpEmail({
          to: email,
          otp,
          type,
        });
      },
    }),
  ],
});

export type BetterAuthSession = typeof auth.$Infer.Session;
