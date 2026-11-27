import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { Resend } from "resend";
import nodemailer from "nodemailer";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({
  path: path.resolve(__dirname, "../../../../.env"),
});
dotenv.config({
  path: path.resolve(__dirname, "../../.env"),
});

export interface SendEmailInput {
  to: string;
  subject: string;
  html: string;
  text: string;
}

export async function sendEmail(input: SendEmailInput): Promise<{ provider: "resend" | "smtp" | "console"; id?: string }> {
  const from = process.env.EMAIL_FROM || "PILLPAL CSU Infirmary <onboarding@resend.dev>";

  // 1. Primary: Resend API
  if (process.env.RESEND_API_KEY && !process.env.RESEND_API_KEY.startsWith("re_xxx")) {
    const resend = new Resend(process.env.RESEND_API_KEY);
    const { data, error } = await resend.emails.send({
      from,
      to: input.to,
      subject: input.subject,
      html: input.html,
      text: input.text,
    });

    if (error) {
      console.error("❌ Resend email delivery failed:", error);
      // Fall through to SMTP or console if Resend rejects (e.g., unverified test recipient on onboarding@resend.dev)
      if (!process.env.SMTP_USER) {
        console.log("\n================ [EMAIL FALLBACK LOG] ================");
        console.log(`To:      ${input.to}`);
        console.log(`Subject: ${input.subject}`);
        console.log(`Body:\n${input.text}`);
        console.log("======================================================\n");
        return { provider: "console" };
      }
    } else {
      console.log(`✉️  [Resend] Sent email to ${input.to} (id: ${data?.id})`);
      return { provider: "resend", id: data?.id };
    }
  }

  // 2. Secondary: Gmail / Custom SMTP via Nodemailer
  if (process.env.SMTP_USER && process.env.SMTP_PASS) {
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || "smtp.gmail.com",
      port: Number(process.env.SMTP_PORT || 465),
      secure: Number(process.env.SMTP_PORT || 465) === 465,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });

    const info = await transporter.sendMail({
      from: process.env.EMAIL_FROM || `PILLPAL CSU Infirmary <${process.env.SMTP_USER}>`,
      to: input.to,
      subject: input.subject,
      html: input.html,
      text: input.text,
    });

    console.log(`✉️  [SMTP] Sent email to ${input.to} (id: ${info.messageId})`);
    return { provider: "smtp", id: info.messageId };
  }

  // 3. Dev Console Fallback (never blocks local testing or defense demos)
  console.log("\n================ [PILLPAL DEV EMAIL] ================");
  console.log(`To:      ${input.to}`);
  console.log(`Subject: ${input.subject}`);
  console.log(`Body:\n${input.text}`);
  console.log("=====================================================\n");
  return { provider: "console" };
}

export async function sendVerificationOtpEmail(params: {
  to: string;
  otp: string;
  type: "email-verification" | "sign-in" | "forget-password" | "change-email";
}): Promise<void> {
  const { to, otp, type } = params;

  const isReset = type === "forget-password";
  const subject = isReset
    ? `${otp} is your PILLPAL password reset code`
    : `${otp} is your PILLPAL verification code`;

  const headline = isReset
    ? "Reset Your PILLPAL Password"
    : "Verify Your Email Address";

  const description = isReset
    ? "Use the 6-digit code below to reset the password for your Caraga State University PILLPAL account. This code expires in 5 minutes."
    : "Welcome to PILLPAL (Caraga State University Health Services Infirmary). Enter the 6-digit verification code below to activate your patient account. This code expires in 5 minutes.";

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px; background-color: #f8fafc; border-radius: 16px;">
      <div style="background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 16px; padding: 28px; text-align: center;">
        <div style="display: inline-block; background-color: #059669; color: #ffffff; font-weight: 900; font-size: 16px; padding: 8px 16px; border-radius: 10px; letter-spacing: 0.5px;">
          PILLPAL • CSU INFIRMARY
        </div>
        <h2 style="color: #0f172a; margin: 20px 0 8px; font-size: 20px;">${headline}</h2>
        <p style="color: #475569; font-size: 13px; line-height: 1.6; margin: 0 0 24px;">
          ${description}
        </p>
        <div style="background-color: #ecfdf5; border: 2px dashed #10b981; border-radius: 14px; padding: 18px; margin: 0 auto 20px;">
          <span style="font-family: 'Courier New', monospace; font-size: 34px; font-weight: 900; letter-spacing: 10px; color: #065f46;">
            ${otp}
          </span>
        </div>
        <p style="color: #94a3b8; font-size: 11px; margin: 0;">
          If you did not request this code, you can safely ignore this email.
        </p>
      </div>
    </div>
  `;

  const text = `${headline}\n\nYour 6-digit PILLPAL code is: ${otp}\n\nThis code expires in 5 minutes.\nIf you did not request this, please ignore this email.`;

  await sendEmail({ to, subject, html, text });
}

export async function sendProviderInviteEmail(params: {
  to: string;
  firstName: string;
  role: string;
  inviteUrl: string;
}): Promise<void> {
  const { to, firstName, role, inviteUrl } = params;
  const roleLabel = role === "DOCTOR" ? "Clinic Physician" : "Health Staff";

  const subject = "You're invited to PILLPAL Healthcare Portal (CSU Infirmary)";
  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 500px; margin: 0 auto; padding: 24px; background-color: #f8fafc;">
      <div style="background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 16px; padding: 28px;">
        <div style="display: inline-block; background-color: #0284c7; color: #ffffff; font-weight: 900; font-size: 14px; padding: 6px 14px; border-radius: 8px;">
          PILLPAL HEALTHCARE PORTAL
        </div>
        <h2 style="color: #0f172a; margin: 20px 0 10px; font-size: 20px;">Welcome, ${firstName}!</h2>
        <p style="color: #475569; font-size: 14px; line-height: 1.6;">
          You have been registered as a <strong>${roleLabel}</strong> at the Caraga State University Health Services Infirmary.
          Click the button below to establish your account password and access the clinical portal.
        </p>
        <div style="margin: 24px 0; text-align: center;">
          <a href="${inviteUrl}" style="display: inline-block; background-color: #0284c7; color: #ffffff; text-decoration: none; font-weight: 700; font-size: 14px; padding: 12px 24px; border-radius: 10px;">
            Set Your Password
          </a>
        </div>
        <p style="color: #64748b; font-size: 12px; word-break: break-all;">
          Or paste this link into your browser:<br />
          <a href="${inviteUrl}" style="color: #0284c7;">${inviteUrl}</a>
        </p>
        <p style="color: #94a3b8; font-size: 11px; margin-top: 20px;">
          This invitation link expires in 24 hours.
        </p>
      </div>
    </div>
  `;

  const text = `Welcome to PILLPAL Healthcare Portal, ${firstName}!\n\nYou have been registered as ${roleLabel}.\nSet your password here (expires in 24 hours):\n${inviteUrl}`;

  await sendEmail({ to, subject, html, text });
}
