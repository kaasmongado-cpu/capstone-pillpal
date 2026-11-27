import { useEffect, useState } from "react";
import {
  resetPasswordWithOtp,
  sendVerificationOtp,
  updatePassword,
} from "@pillpal/auth";
import { fetchWithAuth } from "@/lib/api";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  AlertCircle,
  Bell,
  Check,
  CheckCircle2,
  Eye,
  EyeOff,
  KeyRound,
  Mail,
  X,
} from "lucide-react";

type NotificationPrefs = {
  consecutiveMissedAlert: boolean;
  dailyComplianceDigest: boolean;
  complianceThreshold: number;
};

const DEFAULT_PREFS: NotificationPrefs = {
  consecutiveMissedAlert: true,
  dailyComplianceDigest: true,
  complianceThreshold: 80,
};

function checkPasswordRules(pwd: string) {
  const hasMinLength = pwd.length >= 8;
  const hasUpper = /[A-Z]/.test(pwd);
  const hasNumber = /\d/.test(pwd);
  return {
    hasMinLength,
    hasUpper,
    hasNumber,
    isValid: hasMinLength && hasUpper && hasNumber,
  };
}

export function Settings() {
  const [userId, setUserId] = useState<string>("");
  const [userEmail, setUserEmail] = useState<string>("");

  // Persisted Notification Preferences
  const [prefs, setPrefs] = useState<NotificationPrefs>(DEFAULT_PREFS);
  const [prefsSaved, setPrefsSaved] = useState(false);

  // Change Password Form State
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [pwdLoading, setPwdLoading] = useState(false);
  const [pwdError, setPwdError] = useState("");
  const [pwdSuccess, setPwdSuccess] = useState("");

  // Email OTP Reset Fallback State
  const [showOtpReset, setShowOtpReset] = useState(false);
  const [otpSent, setOtpSent] = useState(false);
  const [otpCode, setOtpCode] = useState("");
  const [otpNewPassword, setOtpNewPassword] = useState("");
  const [otpLoading, setOtpLoading] = useState(false);
  const [otpCooldown, setOtpCooldown] = useState(0);

  const pwdRules = checkPasswordRules(newPassword);

  useEffect(() => {
    if (otpCooldown <= 0) return;
    const timer = setTimeout(() => setOtpCooldown((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [otpCooldown]);

  useEffect(() => {
    async function loadUserAndPrefs() {
      try {
        const res = await fetchWithAuth("/me");
        if (!res.ok) return;
        const user = await res.json();
        const uid = user.id || "default";
        setUserId(uid);
        setUserEmail(user.email || "");

        const raw = localStorage.getItem(`pillpal_clinician_prefs_${uid}`);
        if (raw) {
          const parsed = JSON.parse(raw);
          setPrefs({
            consecutiveMissedAlert: Boolean(parsed.consecutiveMissedAlert),
            dailyComplianceDigest: Boolean(parsed.dailyComplianceDigest),
            complianceThreshold: Number(parsed.complianceThreshold) || 80,
          });
        }
      } catch {
        // use defaults
      }
    }
    void loadUserAndPrefs();
  }, []);

  function updatePrefs(next: NotificationPrefs) {
    setPrefs(next);
    const key = `pillpal_clinician_prefs_${userId || "default"}`;
    localStorage.setItem(key, JSON.stringify(next));
    setPrefsSaved(true);
    setTimeout(() => setPrefsSaved(false), 1800);
  }

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    setPwdError("");
    setPwdSuccess("");

    if (!currentPassword) {
      setPwdError("Please enter your current password.");
      return;
    }

    if (!pwdRules.isValid) {
      setPwdError("New password must be at least 8 characters with 1 uppercase letter and 1 number.");
      return;
    }

    if (newPassword !== confirmPassword) {
      setPwdError("New passwords do not match.");
      return;
    }

    if (newPassword === currentPassword) {
      setPwdError("New password must be different from your current password.");
      return;
    }

    setPwdLoading(true);
    try {
      const { error } = await updatePassword(newPassword, currentPassword);
      if (error) {
        setPwdError(error.message || "Unable to update password. Check your current password.");
        return;
      }

      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setPwdSuccess("Your password has been updated successfully.");
    } catch {
      setPwdError("Unable to update password. Please try again.");
    } finally {
      setPwdLoading(false);
    }
  }

  async function handleSendOtpCode() {
    if (!userEmail || otpCooldown > 0) return;
    setPwdError("");
    setPwdSuccess("");
    setOtpLoading(true);
    try {
      const { error } = await sendVerificationOtp(userEmail, "forget-password");
      if (error) {
        setPwdError(error.message || "Unable to send reset code.");
        return;
      }
      setShowOtpReset(true);
      setOtpSent(true);
      setOtpCooldown(60);
      setPwdSuccess(`A 6-digit password reset code was sent to ${userEmail}.`);
    } finally {
      setOtpLoading(false);
    }
  }

  async function handleOtpPasswordReset(e: React.FormEvent) {
    e.preventDefault();
    setPwdError("");
    setPwdSuccess("");

    const cleanOtp = otpCode.replace(/\D/g, "");
    if (cleanOtp.length !== 6) {
      setPwdError("Please enter the 6-digit code sent to your email.");
      return;
    }

    const rules = checkPasswordRules(otpNewPassword);
    if (!rules.isValid) {
      setPwdError("New password must be at least 8 characters with 1 uppercase letter and 1 number.");
      return;
    }

    setOtpLoading(true);
    try {
      const { error } = await resetPasswordWithOtp(userEmail, cleanOtp, otpNewPassword);
      if (error) {
        setPwdError(error.message || "Invalid or expired reset code.");
        return;
      }
      setOtpCode("");
      setOtpNewPassword("");
      setOtpSent(false);
      setShowOtpReset(false);
      setPwdSuccess("Password reset successfully via 6-digit email verification.");
    } finally {
      setOtpLoading(false);
    }
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-black tracking-tight text-slate-900">
          Clinical &amp; Account Settings
        </h1>
        <p className="text-xs text-slate-500 mt-0.5">
          Manage clinical notification preferences and account password security.
        </p>
      </div>

      <div className="space-y-5">
        {/* 1. Adherence Alerts Preferences */}
        <Card className="rounded-2xl border border-slate-100 shadow-xs">
          <CardHeader className="pb-3 flex flex-row items-start justify-between">
            <div>
              <div className="flex items-center gap-2 text-[#0284c7]">
                <Bell className="h-4 w-4" />
                <CardTitle className="text-sm font-bold text-slate-900">
                  Patient Adherence Notifications
                </CardTitle>
              </div>
              <CardDescription className="text-xs text-slate-500 mt-0.5">
                Configure alert thresholds when patients miss consecutive medication doses.
              </CardDescription>
            </div>
            {prefsSaved && (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 text-[10px] font-bold text-emerald-700">
                <CheckCircle2 className="h-3 w-3" />
                Saved
              </span>
            )}
          </CardHeader>

          <CardContent className="space-y-4 pt-2 text-xs">
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={prefs.consecutiveMissedAlert}
                onChange={(e) =>
                  updatePrefs({ ...prefs, consecutiveMissedAlert: e.target.checked })
                }
                className="rounded border-slate-300 accent-[#0284c7] h-4 w-4"
              />
              <span>
                Notify me immediately if a patient misses{" "}
                <strong>≥ 2 consecutive doses</strong>
              </span>
            </label>

            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={prefs.dailyComplianceDigest}
                onChange={(e) =>
                  updatePrefs({ ...prefs, dailyComplianceDigest: e.target.checked })
                }
                className="rounded border-slate-300 accent-[#0284c7] h-4 w-4"
              />
              <span>
                Flag patients falling below{" "}
                <strong>{prefs.complianceThreshold}% compliance</strong> in clinical review
              </span>
            </label>

            <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-100">
              <span className="text-slate-500 font-semibold">
                Attention Compliance Threshold:
              </span>
              {[70, 80, 85].map((pct) => (
                <button
                  key={pct}
                  type="button"
                  onClick={() => updatePrefs({ ...prefs, complianceThreshold: pct })}
                  className={`rounded-lg px-2.5 py-1 text-xs font-bold transition-colors cursor-pointer ${
                    prefs.complianceThreshold === pct
                      ? "bg-[#0284c7] text-white"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }`}
                >
                  &lt; {pct}%
                </button>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* 2. Security & Password */}
        <Card className="rounded-2xl border border-slate-100 shadow-xs">
          <CardHeader className="pb-3 border-b border-slate-100">
            <div className="flex items-center gap-2 text-[#0284c7]">
              <KeyRound className="h-4 w-4" />
              <CardTitle className="text-sm font-bold text-slate-900">
                Security &amp; Password
              </CardTitle>
            </div>
            <CardDescription className="text-xs text-slate-500">
              Change your account password or verify via a 6-digit email code sent to{" "}
              <span className="font-semibold text-slate-700">
                {userEmail || "your registered email"}
              </span>
              .
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-5 pt-5">
            {pwdError && (
              <div className="rounded-xl bg-red-50 border border-red-200 p-3 text-xs text-red-700 font-semibold flex items-center gap-2">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{pwdError}</span>
              </div>
            )}

            {pwdSuccess && (
              <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-3 text-xs text-emerald-700 font-semibold flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 shrink-0" />
                <span>{pwdSuccess}</span>
              </div>
            )}

            {!showOtpReset ? (
              <form onSubmit={handleChangePassword} className="space-y-4 max-w-md">
                <div className="space-y-1.5">
                  <Label htmlFor="curr-pwd" className="text-xs">
                    Current Password
                  </Label>
                  <div className="relative">
                    <Input
                      id="curr-pwd"
                      type={showCurrent ? "text" : "password"}
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                      required
                      disabled={pwdLoading}
                      placeholder="Enter current password"
                      className="rounded-xl text-xs pr-9"
                    />
                    <button
                      type="button"
                      onClick={() => setShowCurrent((v) => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                    >
                      {showCurrent ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="new-pwd" className="text-xs">
                    New Password
                  </Label>
                  <div className="relative">
                    <Input
                      id="new-pwd"
                      type={showNew ? "text" : "password"}
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      required
                      disabled={pwdLoading}
                      placeholder="Min. 8 chars, 1 uppercase, 1 number"
                      className="rounded-xl text-xs pr-9"
                    />
                    <button
                      type="button"
                      onClick={() => setShowNew((v) => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                    >
                      {showNew ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  {newPassword.length > 0 && (
                    <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] pt-1">
                      <span
                        className={`inline-flex items-center gap-1 ${
                          pwdRules.hasMinLength ? "text-emerald-700 font-semibold" : "text-slate-400"
                        }`}
                      >
                        {pwdRules.hasMinLength ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
                        8+ chars
                      </span>
                      <span
                        className={`inline-flex items-center gap-1 ${
                          pwdRules.hasUpper ? "text-emerald-700 font-semibold" : "text-slate-400"
                        }`}
                      >
                        {pwdRules.hasUpper ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
                        1 uppercase
                      </span>
                      <span
                        className={`inline-flex items-center gap-1 ${
                          pwdRules.hasNumber ? "text-emerald-700 font-semibold" : "text-slate-400"
                        }`}
                      >
                        {pwdRules.hasNumber ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
                        1 number
                      </span>
                    </div>
                  )}
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="confirm-pwd" className="text-xs">
                    Confirm New Password
                  </Label>
                  <div className="relative">
                    <Input
                      id="confirm-pwd"
                      type={showConfirm ? "text" : "password"}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      required
                      disabled={pwdLoading}
                      placeholder="Re-enter new password"
                      className="rounded-xl text-xs pr-9"
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirm((v) => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                    >
                      {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-3 pt-1">
                  <Button
                    type="submit"
                    disabled={pwdLoading}
                    className="rounded-xl bg-[#0284c7] hover:bg-[#0369a1] text-xs font-bold cursor-pointer"
                  >
                    {pwdLoading ? "Updating..." : "Update Password"}
                  </Button>

                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={otpLoading || !userEmail || otpCooldown > 0}
                    onClick={handleSendOtpCode}
                    className="rounded-xl text-xs font-semibold gap-1.5 cursor-pointer"
                  >
                    <Mail className="h-3.5 w-3.5" />
                    {otpLoading ? "Sending..." : "Reset via Email OTP Instead"}
                  </Button>
                </div>
              </form>
            ) : (
              <form onSubmit={handleOtpPasswordReset} className="space-y-4 max-w-md">
                <p className="text-xs text-slate-600">
                  Enter the 6-digit reset code sent to <strong>{userEmail}</strong> and choose a
                  new password.
                </p>

                <div className="space-y-1.5">
                  <Label htmlFor="settings-otp" className="text-xs">
                    6-Digit Reset Code
                  </Label>
                  <Input
                    id="settings-otp"
                    type="text"
                    inputMode="numeric"
                    maxLength={6}
                    value={otpCode}
                    onChange={(e) =>
                      setOtpCode(e.target.value.replace(/\D/g, "").slice(0, 6))
                    }
                    placeholder="000000"
                    required
                    className="rounded-xl text-center font-mono text-base font-black tracking-[0.45em]"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="settings-otp-pwd" className="text-xs">
                    New Password (8+ chars, 1 uppercase, 1 number)
                  </Label>
                  <Input
                    id="settings-otp-pwd"
                    type="password"
                    value={otpNewPassword}
                    onChange={(e) => setOtpNewPassword(e.target.value)}
                    placeholder="Enter new password"
                    required
                    className="rounded-xl text-xs"
                  />
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    type="submit"
                    disabled={otpLoading || !otpSent}
                    className="rounded-xl bg-[#0284c7] hover:bg-[#0369a1] text-xs font-bold cursor-pointer"
                  >
                    {otpLoading ? "Resetting..." : "Confirm Password Reset"}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={otpCooldown > 0 || otpLoading}
                    onClick={handleSendOtpCode}
                    className="rounded-xl text-xs font-semibold cursor-pointer"
                  >
                    {otpCooldown > 0 ? `Resend in ${otpCooldown}s` : "Resend Code"}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setShowOtpReset(false);
                      setPwdError("");
                    }}
                    className="rounded-xl text-xs text-slate-500 cursor-pointer"
                  >
                    Cancel
                  </Button>
                </div>
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
