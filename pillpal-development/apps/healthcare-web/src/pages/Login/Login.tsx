import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  getSession,
  resetPasswordWithOtp,
  sendVerificationOtp,
  signIn,
  signOut,
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
  ArrowLeft,
  Check,
  CheckCircle2,
  Eye,
  EyeOff,
  RefreshCw,
  ShieldAlert,
  X,
} from "lucide-react";

type LoginMode = "signin" | "forgot_password";

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

export function Login() {
  const navigate = useNavigate();
  const location = useLocation();

  const [mode, setMode] = useState<LoginMode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [checkingAuth, setCheckingAuth] = useState(true);

  // Forgot Password (6-Digit Email OTP) State
  const [resetEmail, setResetEmail] = useState("");
  const [resetOtpSent, setResetOtpSent] = useState(false);
  const [resetOtpCode, setResetOtpCode] = useState("");
  const [resetNewPassword, setResetNewPassword] = useState("");
  const [resetConfirmPassword, setResetConfirmPassword] = useState("");
  const [showResetPassword, setShowResetPassword] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);

  const resetPwdRules = checkPasswordRules(resetNewPassword);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setTimeout(() => setResendCooldown((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [resendCooldown]);

  useEffect(() => {
    const passedError = (location.state as { error?: string } | null)?.error;
    if (passedError) {
      setError(passedError);
    }

    async function checkExistingAuth() {
      try {
        const {
          data: { session },
        } = await getSession();

        if (session) {
          const res = await fetchWithAuth("/me");
          if (res.ok) {
            const user = await res.json();
            if (
              (user.role === "DOCTOR" || user.role === "HEALTH_STAFF") &&
              user.status === "ACTIVE"
            ) {
              navigate("/app/dashboard", { replace: true });
              return;
            }
          }
        }
      } catch {
        // Continue to login
      } finally {
        setCheckingAuth(false);
      }
    }

    void checkExistingAuth();
  }, [location, navigate]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSuccessMsg(null);
    setLoading(true);

    try {
      const { error: signInError } = await signIn(email, password);

      if (signInError) {
        setError(signInError.message ?? "Invalid provider email or password.");
        return;
      }

      const res = await fetchWithAuth("/me");
      if (!res.ok) {
        await signOut();
        setError("Unable to retrieve healthcare provider profile.");
        return;
      }

      const user = await res.json();

      if (user.role !== "DOCTOR" && user.role !== "HEALTH_STAFF") {
        await signOut();
        setError("Access restricted. Only Doctors and Health Staff may access this portal.");
        return;
      }

      if (user.status === "INACTIVE") {
        await signOut();
        setError("Your account has been deactivated. Please contact clinic management.");
        return;
      }

      navigate("/app/dashboard", { replace: true });
    } catch {
      setError("Unable to connect to the healthcare authentication service.");
    } finally {
      setLoading(false);
    }
  }

  async function handleSendResetOtp(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSuccessMsg(null);

    const cleanEmail = resetEmail.trim().toLowerCase();
    if (!cleanEmail || !cleanEmail.includes("@")) {
      setError("Please enter your registered provider email address.");
      return;
    }

    setLoading(true);
    try {
      const { error: sendErr } = await sendVerificationOtp(cleanEmail, "forget-password");
      if (sendErr) {
        setError(sendErr.message || "Unable to send password reset code.");
        return;
      }

      setResetEmail(cleanEmail);
      setResetOtpSent(true);
      setResendCooldown(60);
      setSuccessMsg(`A 6-digit password reset code has been sent to ${cleanEmail}.`);
    } catch {
      setError("Unable to send reset code. Please check your connection.");
    } finally {
      setLoading(false);
    }
  }

  async function handleResendResetOtp() {
    if (resendCooldown > 0 || !resetEmail) return;
    setError(null);
    setLoading(true);
    try {
      const { error: resendErr } = await sendVerificationOtp(resetEmail, "forget-password");
      if (resendErr) {
        setError(resendErr.message || "Unable to resend reset code.");
        return;
      }
      setResendCooldown(60);
      setSuccessMsg(`A fresh 6-digit reset code was sent to ${resetEmail}.`);
    } finally {
      setLoading(false);
    }
  }

  async function handleResetPassword(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSuccessMsg(null);

    const cleanOtp = resetOtpCode.replace(/\D/g, "");
    if (cleanOtp.length !== 6) {
      setError("Please enter the complete 6-digit reset code from your email.");
      return;
    }

    if (!resetPwdRules.isValid) {
      setError("New password must be at least 8 characters with 1 uppercase letter and 1 number.");
      return;
    }

    if (resetNewPassword !== resetConfirmPassword) {
      setError("Passwords do not match. Please re-enter your new password.");
      return;
    }

    setLoading(true);
    try {
      const { error: resetErr } = await resetPasswordWithOtp(
        resetEmail,
        cleanOtp,
        resetNewPassword,
      );
      if (resetErr) {
        setError(resetErr.message || "Invalid or expired reset code.");
        return;
      }

      setEmail(resetEmail);
      setPassword("");
      setResetOtpSent(false);
      setResetOtpCode("");
      setResetNewPassword("");
      setResetConfirmPassword("");
      setMode("signin");
      setSuccessMsg("Password updated! You can now sign in with your new password.");
    } catch {
      setError("Failed to reset password. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  if (checkingAuth) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white border border-slate-200 p-1.5 shadow-sm animate-pulse">
          <img
            src="/pillpal-logo.png"
            alt="PILLPAL Logo"
            className="h-full w-full object-contain"
          />
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50/80 px-4 py-12">
      <div className="w-full max-w-md space-y-6">
        {/* Brand Header */}
        <div className="text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-white border border-slate-200/80 p-1.5 shadow-md">
            <img
              src="/pillpal-logo.png"
              alt="PILLPAL Logo"
              className="h-full w-full object-contain"
            />
          </div>
          <h1 className="mt-4 text-2xl font-black tracking-tight text-slate-900">
            PILLPAL Healthcare
          </h1>
          <p className="mt-1 text-xs font-semibold text-slate-500">
            CSU University Center for Health and Wellness
          </p>
        </div>

        {/* Login / Forgot Password Card */}
        <Card className="border border-slate-100 shadow-xl shadow-slate-200/50 rounded-2xl">
          <CardHeader className="space-y-1 pb-4">
            <CardTitle className="text-lg font-bold text-slate-900">
              {mode === "signin" ? "Clinician Sign In" : "Reset Clinician Password"}
            </CardTitle>
            <CardDescription className="text-xs text-slate-500">
              {mode === "signin"
                ? "Enter your CSU clinician credentials to access patient records and clinical workflows."
                : resetOtpSent
                  ? `Enter the 6-digit code sent to ${resetEmail} and choose a new password.`
                  : "Enter your registered provider email to receive a 6-digit verification code."}
            </CardDescription>
          </CardHeader>

          <CardContent>
            {error && (
              <div className="mb-4 flex items-start gap-2.5 rounded-xl border border-red-200 bg-red-50/80 p-3 text-xs text-red-700">
                <ShieldAlert className="h-4 w-4 shrink-0 text-red-500 mt-0.5" />
                <span className="leading-snug">{error}</span>
              </div>
            )}

            {successMsg && (
              <div className="mb-4 flex items-start gap-2.5 rounded-xl border border-emerald-200 bg-emerald-50/80 p-3 text-xs text-emerald-800">
                <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600 mt-0.5" />
                <span className="leading-snug">{successMsg}</span>
              </div>
            )}

            {mode === "signin" ? (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="email">Provider Email</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="e.g. doctor@carsu.edu.ph or clinician@gmail.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    autoComplete="email"
                    disabled={loading}
                  />
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="password">Password</Label>
                    <button
                      type="button"
                      onClick={() => {
                        setResetEmail(email);
                        setResetOtpSent(false);
                        setError(null);
                        setSuccessMsg(null);
                        setMode("forgot_password");
                      }}
                      className="text-[11px] font-bold text-[#0284c7] hover:underline cursor-pointer"
                    >
                      Forgot password?
                    </button>
                  </div>
                  <div className="relative">
                    <Input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      autoComplete="current-password"
                      disabled={loading}
                      className="pr-10"
                    />
                    <button
                      type="button"
                      aria-label={showPassword ? "Hide password" : "Show password"}
                      onClick={() => setShowPassword((v) => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                    >
                      {showPassword ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                </div>

                <Button
                  type="submit"
                  className="w-full font-bold h-10 mt-2 bg-[#0284c7] hover:bg-[#0369a1] cursor-pointer"
                  disabled={loading}
                >
                  {loading ? "Signing in..." : "Sign In to Healthcare Portal"}
                </Button>
              </form>
            ) : (
              <form
                onSubmit={resetOtpSent ? handleResetPassword : handleSendResetOtp}
                className="space-y-4"
              >
                {!resetOtpSent ? (
                  <div className="space-y-1.5">
                    <Label htmlFor="reset-email">Registered Provider Email</Label>
                    <Input
                      id="reset-email"
                      type="email"
                      placeholder="e.g. doctor@carsu.edu.ph"
                      value={resetEmail}
                      onChange={(e) => setResetEmail(e.target.value)}
                      required
                      disabled={loading}
                    />
                  </div>
                ) : (
                  <>
                    <div className="space-y-1.5">
                      <Label htmlFor="reset-otp">6-Digit Reset Code</Label>
                      <Input
                        id="reset-otp"
                        type="text"
                        inputMode="numeric"
                        maxLength={6}
                        placeholder="000000"
                        value={resetOtpCode}
                        onChange={(e) =>
                          setResetOtpCode(e.target.value.replace(/\D/g, "").slice(0, 6))
                        }
                        required
                        disabled={loading}
                        className="text-center font-mono text-lg font-black tracking-[0.45em] h-11"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <Label htmlFor="reset-new-password">New Password</Label>
                      <div className="relative">
                        <Input
                          id="reset-new-password"
                          type={showResetPassword ? "text" : "password"}
                          placeholder="Min. 8 chars, 1 uppercase, 1 number"
                          value={resetNewPassword}
                          onChange={(e) => setResetNewPassword(e.target.value)}
                          required
                          disabled={loading}
                          className="pr-10"
                        />
                        <button
                          type="button"
                          onClick={() => setShowResetPassword((v) => !v)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                        >
                          {showResetPassword ? (
                            <EyeOff className="h-4 w-4" />
                          ) : (
                            <Eye className="h-4 w-4" />
                          )}
                        </button>
                      </div>
                      {resetNewPassword.length > 0 && (
                        <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] pt-1">
                          <span
                            className={`inline-flex items-center gap-1 ${
                              resetPwdRules.hasMinLength
                                ? "text-emerald-700 font-semibold"
                                : "text-slate-400"
                            }`}
                          >
                            {resetPwdRules.hasMinLength ? (
                              <Check className="h-3 w-3" />
                            ) : (
                              <X className="h-3 w-3" />
                            )}
                            8+ chars
                          </span>
                          <span
                            className={`inline-flex items-center gap-1 ${
                              resetPwdRules.hasUpper
                                ? "text-emerald-700 font-semibold"
                                : "text-slate-400"
                            }`}
                          >
                            {resetPwdRules.hasUpper ? (
                              <Check className="h-3 w-3" />
                            ) : (
                              <X className="h-3 w-3" />
                            )}
                            1 uppercase
                          </span>
                          <span
                            className={`inline-flex items-center gap-1 ${
                              resetPwdRules.hasNumber
                                ? "text-emerald-700 font-semibold"
                                : "text-slate-400"
                            }`}
                          >
                            {resetPwdRules.hasNumber ? (
                              <Check className="h-3 w-3" />
                            ) : (
                              <X className="h-3 w-3" />
                            )}
                            1 number
                          </span>
                        </div>
                      )}
                    </div>

                    <div className="space-y-1.5">
                      <Label htmlFor="reset-confirm-password">Confirm New Password</Label>
                      <div className="relative">
                        <Input
                          id="reset-confirm-password"
                          type={showResetConfirm ? "text" : "password"}
                          placeholder="Re-enter new password"
                          value={resetConfirmPassword}
                          onChange={(e) => setResetConfirmPassword(e.target.value)}
                          required
                          disabled={loading}
                          className="pr-10"
                        />
                        <button
                          type="button"
                          onClick={() => setShowResetConfirm((v) => !v)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                        >
                          {showResetConfirm ? (
                            <EyeOff className="h-4 w-4" />
                          ) : (
                            <Eye className="h-4 w-4" />
                          )}
                        </button>
                      </div>
                    </div>
                  </>
                )}

                <Button
                  type="submit"
                  className="w-full font-bold h-10 bg-[#0284c7] hover:bg-[#0369a1] cursor-pointer"
                  disabled={loading}
                >
                  {loading
                    ? "Processing..."
                    : resetOtpSent
                      ? "Reset Password"
                      : "Send 6-Digit Reset Code"}
                </Button>

                <div className="flex items-center justify-between pt-1 text-xs">
                  <button
                    type="button"
                    onClick={() => {
                      setMode("signin");
                      setResetOtpSent(false);
                      setError(null);
                      setSuccessMsg(null);
                    }}
                    className="inline-flex items-center gap-1 font-semibold text-slate-500 hover:text-slate-800 cursor-pointer"
                  >
                    <ArrowLeft className="h-3.5 w-3.5" />
                    Back to Sign In
                  </button>

                  {resetOtpSent && (
                    <button
                      type="button"
                      disabled={resendCooldown > 0 || loading}
                      onClick={handleResendResetOtp}
                      className="inline-flex items-center gap-1 font-bold text-[#0284c7] hover:underline disabled:opacity-50 cursor-pointer"
                    >
                      <RefreshCw className="h-3.5 w-3.5" />
                      {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : "Resend Code"}
                    </button>
                  )}
                </div>
              </form>
            )}
          </CardContent>
        </Card>

        {/* Bottom Help Text */}
        <div className="text-center text-xs text-slate-400">
          <p>Need access? Contact CSU Clinic Administration to be invited.</p>
        </div>
      </div>
    </div>
  );
}
