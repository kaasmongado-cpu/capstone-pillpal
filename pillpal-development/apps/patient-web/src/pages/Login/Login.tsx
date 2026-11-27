import { useEffect, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import {
  signIn,
  verifyEmailOtp,
  sendVerificationOtp,
  resetPasswordWithOtp,
  getGoogleAuthUrl,
} from "@pillpal/auth";
import {
  Lock,
  Mail,
  AlertCircle,
  ArrowRight,
  ShieldCheck,
  CheckCircle2,
  KeyRound,
  ArrowLeft,
  RefreshCw,
  Eye,
  EyeOff,
  Check,
  X,
  FileText,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { API_URL } from "@/lib/api";
import {
  BLOOD_TYPES,
  CSU_COLLEGES,
  EMPLOYEE_UNITS,
  GENDER_OPTIONS,
  evaluatePasswordStrength,
  getTodayIsoDate,
  isValidCsuId,
  isValidEmailFormat,
  isValidPhPhone,
} from "@/lib/registration";

type AuthMode = "login" | "register" | "verify_otp" | "forgot_password";

export function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const redirectMessage = (location.state as any)?.error || "";

  const [mode, setMode] = useState<AuthMode>("login");

  // Sign In Form State
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [showSignInPassword, setShowSignInPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(redirectMessage);
  const [successMsg, setSuccessMsg] = useState("");

  // 2-Step Register Form State
  const [registerStep, setRegisterStep] = useState<1 | 2>(1);
  const [showRegPassword, setShowRegPassword] = useState(false);
  const [showRegConfirmPassword, setShowRegConfirmPassword] = useState(false);
  const [noKnownAllergies, setNoKnownAllergies] = useState(false);
  const [privacyConsent, setPrivacyConsent] = useState(false);
  const [showPrivacyModal, setShowPrivacyModal] = useState(false);
  const [registerForm, setRegisterForm] = useState({
    firstName: "",
    lastName: "",
    idNumber: "",
    department: "",
    userType: "",
    email: "",
    password: "",
    confirmPassword: "",
    dateOfBirth: "",
    gender: "",
    phone: "",
    bloodType: "",
    allergies: "",
    medicalConditions: "",
    emergencyContactName: "",
    emergencyContactPhone: "",
  });

  // 6-Digit Email OTP State
  const [otpEmail, setOtpEmail] = useState("");
  const [otpPendingPassword, setOtpPendingPassword] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [resendCooldown, setResendCooldown] = useState(0);

  // Forgot Password State
  const [resetEmail, setResetEmail] = useState("");
  const [resetOtpSent, setResetOtpSent] = useState(false);
  const [resetOtpCode, setResetOtpCode] = useState("");
  const [resetNewPassword, setResetNewPassword] = useState("");
  const [showResetPassword, setShowResetPassword] = useState(false);

  const passwordStrength = evaluatePasswordStrength(registerForm.password);
  const passwordsMatch =
    registerForm.confirmPassword.length > 0 &&
    registerForm.password === registerForm.confirmPassword;
  const availableUnits =
    registerForm.userType === "EMPLOYEE" ? EMPLOYEE_UNITS : CSU_COLLEGES;

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setTimeout(() => setResendCooldown((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [resendCooldown]);

  async function resolveIdentifierToEmail(rawIdentifier: string): Promise<string> {
    const clean = rawIdentifier.trim().toLowerCase();
    if (clean.includes("@")) return clean;

    const lookupRes = await fetch(`${API_URL}/auth/patient/lookup`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ identifier: clean }),
    });

    if (!lookupRes.ok) {
      throw new Error(
        "No CSU patient account found with this ID Number. Please check your ID or sign up first.",
      );
    }

    const lookupData = await lookupRes.json();
    return lookupData.email;
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSuccessMsg("");
    setLoading(true);

    try {
      const targetEmail = await resolveIdentifierToEmail(identifier);

      const { data, error: authError } = await signIn(targetEmail, password);
      if (authError || !data.session) {
        const isUnverified =
          authError?.code === "EMAIL_NOT_VERIFIED" ||
          authError?.status === 403 ||
          authError?.message?.toLowerCase().includes("not verified");

        if (isUnverified) {
          await sendVerificationOtp(targetEmail, "email-verification");
          setOtpEmail(targetEmail);
          setOtpPendingPassword(password);
          setOtpCode("");
          setResendCooldown(60);
          setMode("verify_otp");
          setSuccessMsg(
            `Your email isn't verified yet. We sent a fresh 6-digit verification code to ${targetEmail}.`,
          );
          return;
        }

        const isInvalidCreds =
          authError?.code === "INVALID_EMAIL_OR_PASSWORD" ||
          authError?.status === 401 ||
          authError?.message?.toLowerCase().includes("invalid email or password");

        if (isInvalidCreds) {
          throw new Error(
            "Invalid email or password. Signed up with Google? Use 'Continue with Google' or click 'Forgot password?' to create a portal password.",
          );
        }

        throw new Error(authError?.message || "Invalid email or password.");
      }

      navigate("/app/dashboard");
    } catch (err: any) {
      setError(err.message || "Failed to sign in. Please verify your credentials.");
    } finally {
      setLoading(false);
    }
  }

  function handleNextRegisterStep(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSuccessMsg("");

    if (!registerForm.firstName.trim() || !registerForm.lastName.trim()) {
      setError("Please enter your first and last name.");
      return;
    }

    if (!registerForm.userType) {
      setError("Please select your CSU account type (Student or Employee).");
      return;
    }

    if (!isValidCsuId(registerForm.idNumber)) {
      setError("Please enter a valid CSU ID Number (e.g. 221-00675 or 2022-04912).");
      return;
    }

    if (!registerForm.department) {
      setError("Please select your college or university unit.");
      return;
    }

    if (!isValidEmailFormat(registerForm.email)) {
      setError(
        "Please enter a valid email address (e.g. yourname@gmail.com or yourname@carsu.edu.ph).",
      );
      return;
    }

    if (!passwordStrength.isValid) {
      setError(
        "Password must be at least 8 characters and include an uppercase letter and a number.",
      );
      return;
    }

    if (registerForm.password !== registerForm.confirmPassword) {
      setError("Passwords do not match. Please re-enter your password.");
      return;
    }

    setRegisterStep(2);
  }

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSuccessMsg("");

    if (!registerForm.dateOfBirth) {
      setError("Please enter your date of birth for your clinical health record.");
      return;
    }

    if (!registerForm.gender) {
      setError("Please select your sex.");
      return;
    }

    if (!registerForm.phone.trim() || !isValidPhPhone(registerForm.phone)) {
      setError(
        "Please enter a valid Philippine mobile number (e.g. 0912 345 6789 or +63 912 345 6789).",
      );
      return;
    }

    if (!noKnownAllergies && !registerForm.allergies.trim()) {
      setError(
        "Please list your known drug allergies or check 'No Known Drug Allergies (NKA)'.",
      );
      return;
    }

    if (
      registerForm.emergencyContactPhone.trim() &&
      !isValidPhPhone(registerForm.emergencyContactPhone)
    ) {
      setError("Please enter a valid mobile number for your emergency contact.");
      return;
    }

    if (!privacyConsent) {
      setError(
        "You must consent to the CSU Data Privacy Notice (RA 10173) before creating an account.",
      );
      return;
    }

    const cleanEmail = registerForm.email.toLowerCase().trim();
    const resolvedAllergies = noKnownAllergies
      ? "No Known Drug Allergies (NKA)"
      : registerForm.allergies.trim();

    setLoading(true);

    try {
      const regRes = await fetch(`${API_URL}/auth/patient/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName: registerForm.firstName.trim(),
          lastName: registerForm.lastName.trim(),
          idNumber: registerForm.idNumber.trim(),
          department: registerForm.department,
          userType: registerForm.userType,
          email: cleanEmail,
          password: registerForm.password,
          dateOfBirth: registerForm.dateOfBirth,
          gender: registerForm.gender,
          phone: registerForm.phone.trim(),
          bloodType: registerForm.bloodType || undefined,
          allergies: resolvedAllergies,
          medicalConditions: registerForm.medicalConditions.trim() || undefined,
          emergencyContactName: registerForm.emergencyContactName.trim() || undefined,
          emergencyContactPhone: registerForm.emergencyContactPhone.trim() || undefined,
          privacyConsent: true,
        }),
      });

      const regBody = await regRes.json();
      if (!regRes.ok) {
        throw new Error(regBody.message || "Registration failed.");
      }

      if (regBody.requiresVerification) {
        setOtpEmail(cleanEmail);
        setOtpPendingPassword(registerForm.password);
        setOtpCode("");
        setResendCooldown(60);
        setMode("verify_otp");
        setSuccessMsg(
          `We sent a 6-digit verification code to ${cleanEmail}. Enter it below to activate your account.`,
        );
        return;
      }

      const { data: authData, error: authErr } = await signIn(
        cleanEmail,
        registerForm.password,
      );

      if (authErr || !authData.session) {
        setSuccessMsg("Account created! Please sign in with your email and password.");
        setMode("login");
        setIdentifier(cleanEmail);
        setPassword(registerForm.password);
      } else {
        navigate("/app/dashboard");
      }
    } catch (err: any) {
      setError(err.message || "Registration error. Please check your inputs.");
    } finally {
      setLoading(false);
    }
  }

  async function handleVerifyOtp(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSuccessMsg("");

    const cleanOtp = otpCode.replace(/\D/g, "").trim();
    if (cleanOtp.length !== 6) {
      setError("Please enter the full 6-digit verification code.");
      return;
    }

    setLoading(true);
    try {
      const { data, error: verifyErr } = await verifyEmailOtp(otpEmail, cleanOtp);
      if (verifyErr) {
        throw new Error(verifyErr.message || "Invalid or expired verification code.");
      }

      if (data.session) {
        navigate("/app/dashboard");
        return;
      }

      if (otpPendingPassword) {
        const { data: loginData, error: loginErr } = await signIn(
          otpEmail,
          otpPendingPassword,
        );
        if (!loginErr && loginData.session) {
          navigate("/app/dashboard");
          return;
        }
      }

      setSuccessMsg("Email verified! You can now sign in to your account.");
      setIdentifier(otpEmail);
      setPassword(otpPendingPassword);
      setMode("login");
    } catch (err: any) {
      setError(err.message || "Verification failed. Please check the code and try again.");
    } finally {
      setLoading(false);
    }
  }

  async function handleResendOtp() {
    if (resendCooldown > 0 || !otpEmail) return;
    setError("");
    setLoading(true);
    try {
      const { error: resendErr } = await sendVerificationOtp(
        otpEmail,
        "email-verification",
      );
      if (resendErr) {
        throw new Error(resendErr.message);
      }
      setResendCooldown(60);
      setSuccessMsg(`A new 6-digit verification code was sent to ${otpEmail}.`);
    } catch (err: any) {
      setError(err.message || "Unable to resend verification code.");
    } finally {
      setLoading(false);
    }
  }

  async function handleSendResetOtp(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSuccessMsg("");
    setLoading(true);
    try {
      const targetEmail = await resolveIdentifierToEmail(resetEmail);
      const { error: sendErr } = await sendVerificationOtp(
        targetEmail,
        "forget-password",
      );
      if (sendErr) {
        throw new Error(sendErr.message);
      }
      setResetEmail(targetEmail);
      setResetOtpSent(true);
      setResendCooldown(60);
      setSuccessMsg(`Password reset code sent to ${targetEmail}.`);
    } catch (err: any) {
      setError(err.message || "Unable to send password reset code.");
    } finally {
      setLoading(false);
    }
  }

  async function handleResetPassword(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSuccessMsg("");

    if (resetOtpCode.replace(/\D/g, "").length !== 6) {
      setError("Please enter the 6-digit reset code from your email.");
      return;
    }
    const resetStrength = evaluatePasswordStrength(resetNewPassword);
    if (!resetStrength.isValid) {
      setError(
        "New password must be at least 8 characters and include an uppercase letter and a number.",
      );
      return;
    }

    setLoading(true);
    try {
      const { error: resetErr } = await resetPasswordWithOtp(
        resetEmail,
        resetOtpCode.replace(/\D/g, ""),
        resetNewPassword,
      );
      if (resetErr) {
        throw new Error(resetErr.message);
      }
      setSuccessMsg("Password updated! Sign in with your new password.");
      setIdentifier(resetEmail);
      setPassword(resetNewPassword);
      setResetOtpSent(false);
      setResetOtpCode("");
      setResetNewPassword("");
      setMode("login");
    } catch (err: any) {
      setError(err.message || "Failed to reset password.");
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogleSignIn() {
    setError("");
    setSuccessMsg("");
    setLoading(true);
    try {
      const callbackUrl = `${window.location.origin}/auth/callback`;
      const { url, error: googleErr } = await getGoogleAuthUrl(callbackUrl);
      if (googleErr || !url) {
        setError(
          googleErr?.message ||
            "Google Sign-In is not configured yet. Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to .env.",
        );
        return;
      }
      window.location.href = url;
    } catch (err: any) {
      setError(err?.message || "Unable to start Google Sign-In.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-br from-emerald-50/70 via-slate-50 to-sky-50/60 p-4 py-8">
      <div className="w-full max-w-md space-y-5">
        {/* Brand Header */}
        <div className="flex flex-col items-center text-center space-y-2">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white border border-slate-200/80 p-1.5 shadow-lg shadow-emerald-600/10">
            <img
              src="/pillpal-logo.png"
              alt="PILLPAL Logo"
              className="h-full w-full object-contain"
            />
          </div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-black tracking-tight text-slate-900">
              PILLPAL
            </h1>
            <span className="rounded-md bg-emerald-100 px-2 py-0.5 text-xs font-black text-emerald-800">
              PATIENT
            </span>
          </div>
          <p className="text-xs font-medium text-slate-500 max-w-xs">
            CSU University Center for Health and Wellness
          </p>
        </div>

        {/* Card */}
        <Card className="rounded-3xl border border-slate-200/80 bg-white/95 p-2 shadow-xl backdrop-blur-xs">
          {/* Tab Switcher (hidden during OTP / Password Reset) */}
          {(mode === "login" || mode === "register") && (
            <div className="flex rounded-2xl bg-slate-100 p-1 m-2">
              <button
                type="button"
                onClick={() => {
                  setMode("login");
                  setError("");
                  setSuccessMsg("");
                }}
                className={`flex-1 rounded-xl py-2 text-xs font-extrabold transition-all cursor-pointer ${
                  mode === "login"
                    ? "bg-white text-emerald-800 shadow-xs"
                    : "text-slate-500 hover:text-slate-800"
                }`}
              >
                Sign In
              </button>
              <button
                type="button"
                onClick={() => {
                  setMode("register");
                  setRegisterStep(1);
                  setError("");
                  setSuccessMsg("");
                }}
                className={`flex-1 rounded-xl py-2 text-xs font-extrabold transition-all cursor-pointer ${
                  mode === "register"
                    ? "bg-white text-emerald-800 shadow-xs"
                    : "text-slate-500 hover:text-slate-800"
                }`}
              >
                Student / Patient Sign Up
              </button>
            </div>
          )}

          <CardHeader className="pb-3 pt-3 text-center">
            <CardTitle className="text-base font-black text-slate-900">
              {mode === "login" && "Sign In to Your Health Portal"}
              {mode === "register" && "Register for CSU Health Services"}
              {mode === "verify_otp" && "Verify Your Email Address"}
              {mode === "forgot_password" && "Reset Your Password"}
            </CardTitle>
            <CardDescription className="text-xs text-slate-500">
              {mode === "login" &&
                "Enter your Email or Student ID Number to access your portal."}
              {mode === "register" &&
                (registerStep === 1
                  ? "Step 1 of 2 — Set up your CSU identity and login credentials."
                  : "Step 2 of 2 — Complete your clinical health intake & privacy consent.")}
              {mode === "verify_otp" &&
                `Enter the 6-digit verification code sent to ${otpEmail}.`}
              {mode === "forgot_password" &&
                (resetOtpSent
                  ? `Enter the 6-digit code sent to ${resetEmail} and choose a new password.`
                  : "Enter your registered Email or CSU Student ID to receive a 6-digit reset code.")}
            </CardDescription>

            {/* 2-Step Indicator for Registration */}
            {mode === "register" && (
              <div className="flex items-center justify-center gap-2 pt-2">
                <div
                  className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-bold ${
                    registerStep === 1
                      ? "bg-emerald-600 text-white"
                      : "bg-emerald-100 text-emerald-800"
                  }`}
                >
                  <span>1</span>
                  <span>Account &amp; ID</span>
                </div>
                <div className="h-0.5 w-6 rounded bg-slate-200" />
                <div
                  className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-bold ${
                    registerStep === 2
                      ? "bg-emerald-600 text-white"
                      : "bg-slate-100 text-slate-500"
                  }`}
                >
                  <span>2</span>
                  <span>Health Intake</span>
                </div>
              </div>
            )}
          </CardHeader>

          <CardContent className="space-y-4">
            {error && (
              <div className="rounded-xl bg-red-50 p-3 text-xs font-semibold text-red-700 flex items-start gap-2 border border-red-100 animate-in fade-in">
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-red-600" />
                <span>{error}</span>
              </div>
            )}

            {successMsg && (
              <div className="rounded-xl bg-emerald-50 p-3 text-xs font-semibold text-emerald-800 flex items-start gap-2 border border-emerald-200 animate-in fade-in">
                <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5 text-emerald-600" />
                <span>{successMsg}</span>
              </div>
            )}

            {/* MODE 1: LOGIN */}
            {mode === "login" && (
              <form onSubmit={handleLogin} className="space-y-4">
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="identifier" className="text-xs font-bold text-slate-700">
                      Email Address or Student / Employee ID
                    </Label>
                    <span className="text-[10px] text-slate-400">e.g. 221-00675</span>
                  </div>
                  <div className="relative">
                    <Mail className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                    <Input
                      id="identifier"
                      required
                      placeholder="e.g. student@gmail.com, carsu.edu.ph, or 221-00675"
                      value={identifier}
                      onChange={(e) => setIdentifier(e.target.value)}
                      className="pl-9.5 text-xs rounded-xl h-10"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="password" className="text-xs font-bold text-slate-700">
                      Account Password
                    </Label>
                    <button
                      type="button"
                      onClick={() => {
                        setResetEmail(identifier);
                        setResetOtpSent(false);
                        setError("");
                        setSuccessMsg("");
                        setMode("forgot_password");
                      }}
                      className="text-[11px] font-bold text-emerald-700 hover:underline cursor-pointer"
                    >
                      Forgot password?
                    </button>
                  </div>
                  <div className="relative">
                    <Lock className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                    <Input
                      id="password"
                      type={showSignInPassword ? "text" : "password"}
                      required
                      placeholder="••••••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="pl-9.5 pr-9.5 text-xs rounded-xl h-10"
                    />
                    <button
                      type="button"
                      aria-label={showSignInPassword ? "Hide password" : "Show password"}
                      onClick={() => setShowSignInPassword((v) => !v)}
                      className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600 cursor-pointer"
                    >
                      {showSignInPassword ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                </div>

                <Button
                  type="submit"
                  disabled={loading}
                  className="w-full h-11 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-md shadow-emerald-600/20 cursor-pointer"
                >
                  {loading ? "Signing In..." : "Sign In to Portal"}
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </form>
            )}

            {/* MODE 2: REGISTER — STEP 1 (ACCOUNT & CSU IDENTITY) */}
            {mode === "register" && registerStep === 1 && (
              <form onSubmit={handleNextRegisterStep} className="space-y-3">
                <div className="grid grid-cols-2 gap-2.5">
                  <div className="space-y-1">
                    <Label className="text-xs">First Name *</Label>
                    <Input
                      required
                      placeholder="e.g. Ana"
                      value={registerForm.firstName}
                      onChange={(e) =>
                        setRegisterForm({ ...registerForm, firstName: e.target.value })
                      }
                      className="rounded-xl text-xs h-9"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Last Name *</Label>
                    <Input
                      required
                      placeholder="e.g. Reyes"
                      value={registerForm.lastName}
                      onChange={(e) =>
                        setRegisterForm({ ...registerForm, lastName: e.target.value })
                      }
                      className="rounded-xl text-xs h-9"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2.5">
                  <div className="space-y-1">
                    <Label className="text-xs">Account Type *</Label>
                    <select
                      required
                      value={registerForm.userType}
                      onChange={(e) => {
                        const nextType = e.target.value;
                        const nextUnits =
                          nextType === "EMPLOYEE" ? EMPLOYEE_UNITS : CSU_COLLEGES;
                        const deptStillValid = (nextUnits as readonly string[]).includes(
                          registerForm.department,
                        );
                        setRegisterForm({
                          ...registerForm,
                          userType: nextType,
                          department: deptStillValid ? registerForm.department : "",
                        });
                      }}
                      className="w-full h-9 rounded-xl border border-slate-200 px-2 text-xs bg-white text-slate-800"
                    >
                      <option value="" disabled>
                        Select Account Type
                      </option>
                      <option value="STUDENT">CSU Student</option>
                      <option value="EMPLOYEE">CSU Employee</option>
                    </select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">CSU ID Number *</Label>
                    <Input
                      required
                      placeholder="e.g. 221-00675"
                      value={registerForm.idNumber}
                      onChange={(e) =>
                        setRegisterForm({ ...registerForm, idNumber: e.target.value })
                      }
                      className="rounded-xl text-xs h-9 font-mono"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <Label className="text-xs">
                    {registerForm.userType === "EMPLOYEE"
                      ? "College / University Office *"
                      : "College *"}
                  </Label>
                  <select
                    required
                    value={registerForm.department}
                    onChange={(e) =>
                      setRegisterForm({ ...registerForm, department: e.target.value })
                    }
                    className="w-full h-9 rounded-xl border border-slate-200 px-2 text-xs bg-white text-slate-800"
                  >
                    <option value="" disabled>
                      {registerForm.userType === "EMPLOYEE"
                        ? "Select College or Office"
                        : "Select College"}
                    </option>
                    {availableUnits.map((unit) => (
                      <option key={unit} value={unit}>
                        {unit}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <Label className="text-xs">Email Address (Gmail or CSU Email) *</Label>
                  <Input
                    type="email"
                    required
                    placeholder="e.g. name@gmail.com or name@carsu.edu.ph"
                    value={registerForm.email}
                    onChange={(e) =>
                      setRegisterForm({ ...registerForm, email: e.target.value })
                    }
                    className="rounded-xl text-xs h-9"
                  />
                </div>

                <div className="space-y-1">
                  <Label className="text-xs">Password *</Label>
                  <div className="relative">
                    <Input
                      type={showRegPassword ? "text" : "password"}
                      required
                      placeholder="Min. 8 chars, 1 uppercase, 1 number"
                      value={registerForm.password}
                      onChange={(e) =>
                        setRegisterForm({ ...registerForm, password: e.target.value })
                      }
                      className="rounded-xl text-xs h-9 pr-9"
                    />
                    <button
                      type="button"
                      aria-label={showRegPassword ? "Hide password" : "Show password"}
                      onClick={() => setShowRegPassword((v) => !v)}
                      className="absolute right-2.5 top-2 text-slate-400 hover:text-slate-600 cursor-pointer"
                    >
                      {showRegPassword ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </button>
                  </div>

                  {registerForm.password.length > 0 && (
                    <div className="space-y-1.5 pt-1">
                      <div className="flex items-center gap-1">
                        {[1, 2, 3, 4].map((bar) => (
                          <div
                            key={bar}
                            className={`h-1 flex-1 rounded-full transition-colors ${
                              passwordStrength.score >= bar
                                ? passwordStrength.score >= 3
                                  ? "bg-emerald-500"
                                  : "bg-amber-400"
                                : "bg-slate-200"
                            }`}
                          />
                        ))}
                        <span className="text-[10px] font-bold text-slate-500 ml-1">
                          {passwordStrength.label}
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[10px]">
                        <span
                          className={`inline-flex items-center gap-1 ${
                            passwordStrength.hasMinLength
                              ? "text-emerald-700 font-semibold"
                              : "text-slate-400"
                          }`}
                        >
                          {passwordStrength.hasMinLength ? (
                            <Check className="h-3 w-3" />
                          ) : (
                            <X className="h-3 w-3" />
                          )}
                          8+ chars
                        </span>
                        <span
                          className={`inline-flex items-center gap-1 ${
                            passwordStrength.hasUpper
                              ? "text-emerald-700 font-semibold"
                              : "text-slate-400"
                          }`}
                        >
                          {passwordStrength.hasUpper ? (
                            <Check className="h-3 w-3" />
                          ) : (
                            <X className="h-3 w-3" />
                          )}
                          1 uppercase
                        </span>
                        <span
                          className={`inline-flex items-center gap-1 ${
                            passwordStrength.hasNumber
                              ? "text-emerald-700 font-semibold"
                              : "text-slate-400"
                          }`}
                        >
                          {passwordStrength.hasNumber ? (
                            <Check className="h-3 w-3" />
                          ) : (
                            <X className="h-3 w-3" />
                          )}
                          1 number
                        </span>
                      </div>
                    </div>
                  )}
                </div>

                <div className="space-y-1">
                  <Label className="text-xs">Confirm Password *</Label>
                  <div className="relative">
                    <Input
                      type={showRegConfirmPassword ? "text" : "password"}
                      required
                      placeholder="Re-enter your password"
                      value={registerForm.confirmPassword}
                      onChange={(e) =>
                        setRegisterForm({
                          ...registerForm,
                          confirmPassword: e.target.value,
                        })
                      }
                      className="rounded-xl text-xs h-9 pr-9"
                    />
                    <button
                      type="button"
                      aria-label={
                        showRegConfirmPassword ? "Hide confirm password" : "Show confirm password"
                      }
                      onClick={() => setShowRegConfirmPassword((v) => !v)}
                      className="absolute right-2.5 top-2 text-slate-400 hover:text-slate-600 cursor-pointer"
                    >
                      {showRegConfirmPassword ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                  {registerForm.confirmPassword.length > 0 && (
                    <p
                      className={`text-[10px] font-semibold ${
                        passwordsMatch ? "text-emerald-700" : "text-red-600"
                      }`}
                    >
                      {passwordsMatch ? "Passwords match" : "Passwords do not match"}
                    </p>
                  )}
                </div>

                <Button
                  type="submit"
                  className="w-full h-10 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-md shadow-emerald-600/20 cursor-pointer mt-1"
                >
                  Continue to Health Intake
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </form>
            )}

            {/* MODE 2: REGISTER — STEP 2 (HEALTH & EMERGENCY INTAKE + PRIVACY CONSENT) */}
            {mode === "register" && registerStep === 2 && (
              <form onSubmit={handleRegister} className="space-y-3">
                <div className="grid grid-cols-2 gap-2.5">
                  <div className="space-y-1">
                    <Label className="text-xs">Date of Birth *</Label>
                    <Input
                      type="date"
                      required
                      max={getTodayIsoDate()}
                      value={registerForm.dateOfBirth}
                      onChange={(e) =>
                        setRegisterForm({ ...registerForm, dateOfBirth: e.target.value })
                      }
                      className="rounded-xl text-xs h-9"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Sex *</Label>
                    <select
                      required
                      value={registerForm.gender}
                      onChange={(e) =>
                        setRegisterForm({ ...registerForm, gender: e.target.value })
                      }
                      className="w-full h-9 rounded-xl border border-slate-200 px-2 text-xs bg-white text-slate-800"
                    >
                      <option value="" disabled>
                        Select Sex
                      </option>
                      {GENDER_OPTIONS.map((g) => (
                        <option key={g} value={g}>
                          {g}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2.5">
                  <div className="space-y-1">
                    <Label className="text-xs">Mobile Number *</Label>
                    <Input
                      type="tel"
                      required
                      placeholder="0912 345 6789"
                      value={registerForm.phone}
                      onChange={(e) =>
                        setRegisterForm({ ...registerForm, phone: e.target.value })
                      }
                      className="rounded-xl text-xs h-9"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Blood Type (Optional)</Label>
                    <select
                      value={registerForm.bloodType}
                      onChange={(e) =>
                        setRegisterForm({ ...registerForm, bloodType: e.target.value })
                      }
                      className="w-full h-9 rounded-xl border border-slate-200 px-2 text-xs bg-white text-slate-800"
                    >
                      <option value="">Select Blood Type</option>
                      {BLOOD_TYPES.map((bt) => (
                        <option key={bt} value={bt}>
                          {bt}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Explicit Drug Allergy Screening */}
                <div className="space-y-1.5 rounded-xl border border-slate-200 bg-slate-50/70 p-2.5">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-bold text-slate-700">
                      Known Drug Allergies *
                    </Label>
                    <label className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-emerald-800 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={noKnownAllergies}
                        onChange={(e) => {
                          setNoKnownAllergies(e.target.checked);
                          if (e.target.checked) {
                            setRegisterForm({ ...registerForm, allergies: "" });
                          }
                        }}
                        className="h-3.5 w-3.5 rounded accent-emerald-600"
                      />
                      None (NKA)
                    </label>
                  </div>
                  {!noKnownAllergies && (
                    <Input
                      placeholder="e.g. Penicillin, Aspirin, Ibuprofen"
                      value={registerForm.allergies}
                      onChange={(e) =>
                        setRegisterForm({ ...registerForm, allergies: e.target.value })
                      }
                      className="rounded-xl text-xs h-9 bg-white"
                    />
                  )}
                </div>

                <div className="space-y-1">
                  <Label className="text-xs">Pre-existing Medical Conditions (Optional)</Label>
                  <Input
                    placeholder="e.g. Asthma, Hypertension, G6PD (leave blank if none)"
                    value={registerForm.medicalConditions}
                    onChange={(e) =>
                      setRegisterForm({
                        ...registerForm,
                        medicalConditions: e.target.value,
                      })
                    }
                    className="rounded-xl text-xs h-9"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2.5">
                  <div className="space-y-1">
                    <Label className="text-xs">Emergency Contact (Optional)</Label>
                    <Input
                      placeholder="Name & relation"
                      value={registerForm.emergencyContactName}
                      onChange={(e) =>
                        setRegisterForm({
                          ...registerForm,
                          emergencyContactName: e.target.value,
                        })
                      }
                      className="rounded-xl text-xs h-9"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Emergency Phone</Label>
                    <Input
                      type="tel"
                      placeholder="09XX XXX XXXX"
                      value={registerForm.emergencyContactPhone}
                      onChange={(e) =>
                        setRegisterForm({
                          ...registerForm,
                          emergencyContactPhone: e.target.value,
                        })
                      }
                      className="rounded-xl text-xs h-9"
                    />
                  </div>
                </div>

                {/* RA 10173 Data Privacy Consent */}
                <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-2.5 space-y-1.5">
                  <label className="flex items-start gap-2 text-[11px] leading-relaxed text-slate-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={privacyConsent}
                      onChange={(e) => setPrivacyConsent(e.target.checked)}
                      className="mt-0.5 h-3.5 w-3.5 shrink-0 rounded accent-emerald-600"
                    />
                    <span>
                      I consent to the collection and processing of my personal and health
                      information by the <strong>CSU Health Services Infirmary</strong> in
                      accordance with the{" "}
                      <strong>Data Privacy Act of 2012 (RA 10173)</strong>.{" "}
                      <button
                        type="button"
                        onClick={() => setShowPrivacyModal(true)}
                        className="font-bold text-emerald-700 underline cursor-pointer"
                      >
                        Read Privacy Notice
                      </button>
                    </span>
                  </label>
                </div>

                <div className="flex gap-2 pt-1">
                  <Button
                    type="button"
                    variant="outline"
                    disabled={loading}
                    onClick={() => {
                      setError("");
                      setRegisterStep(1);
                    }}
                    className="h-10 rounded-xl border-slate-200 text-slate-700 font-bold text-xs cursor-pointer"
                  >
                    <ArrowLeft className="mr-1 h-3.5 w-3.5" />
                    Back
                  </Button>
                  <Button
                    type="submit"
                    disabled={loading || !privacyConsent}
                    className="flex-1 h-10 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-md shadow-emerald-600/20 cursor-pointer"
                  >
                    {loading
                      ? "Sending Verification Code..."
                      : "Sign Up & Send 6-Digit Code"}
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </div>
              </form>
            )}

            {/* MODE 3: 6-DIGIT EMAIL OTP VERIFICATION */}
            {mode === "verify_otp" && (
              <form onSubmit={handleVerifyOtp} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="otpCode" className="text-xs font-bold text-slate-700">
                    6-Digit Verification Code
                  </Label>
                  <div className="relative">
                    <KeyRound className="absolute left-3 top-3 h-4 w-4 text-emerald-600" />
                    <Input
                      id="otpCode"
                      type="text"
                      inputMode="numeric"
                      maxLength={6}
                      required
                      placeholder="000000"
                      value={otpCode}
                      onChange={(e) =>
                        setOtpCode(e.target.value.replace(/\D/g, "").slice(0, 6))
                      }
                      className="pl-10 text-center text-lg font-mono font-black tracking-[0.5em] rounded-xl h-12"
                    />
                  </div>
                </div>

                <Button
                  type="submit"
                  disabled={loading || otpCode.length !== 6}
                  className="w-full h-11 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-md shadow-emerald-600/20 cursor-pointer"
                >
                  {loading ? "Verifying Code..." : "Verify Email & Sign In"}
                  <CheckCircle2 className="ml-2 h-4 w-4" />
                </Button>

                <div className="flex items-center justify-between pt-2 text-xs">
                  <button
                    type="button"
                    onClick={() => {
                      setMode("login");
                      setError("");
                      setSuccessMsg("");
                    }}
                    className="inline-flex items-center gap-1 font-semibold text-slate-500 hover:text-slate-800 cursor-pointer"
                  >
                    <ArrowLeft className="h-3.5 w-3.5" />
                    Back to Sign In
                  </button>

                  <button
                    type="button"
                    disabled={resendCooldown > 0 || loading}
                    onClick={handleResendOtp}
                    className="inline-flex items-center gap-1 font-bold text-emerald-700 hover:underline disabled:opacity-50 cursor-pointer"
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                    {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : "Resend Code"}
                  </button>
                </div>
              </form>
            )}

            {/* MODE 4: FORGOT PASSWORD (6-DIGIT OTP) */}
            {mode === "forgot_password" && (
              <form
                onSubmit={resetOtpSent ? handleResetPassword : handleSendResetOtp}
                className="space-y-4"
              >
                {!resetOtpSent ? (
                  <div className="space-y-1.5">
                    <Label className="text-xs font-bold text-slate-700">
                      Registered Email or CSU Student ID
                    </Label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                      <Input
                        required
                        placeholder="e.g. student@gmail.com or 221-00675"
                        value={resetEmail}
                        onChange={(e) => setResetEmail(e.target.value)}
                        className="pl-9.5 text-xs rounded-xl h-10"
                      />
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="space-y-1.5">
                      <Label className="text-xs font-bold text-slate-700">
                        6-Digit Reset Code
                      </Label>
                      <Input
                        type="text"
                        inputMode="numeric"
                        maxLength={6}
                        required
                        placeholder="000000"
                        value={resetOtpCode}
                        onChange={(e) =>
                          setResetOtpCode(e.target.value.replace(/\D/g, "").slice(0, 6))
                        }
                        className="text-center text-lg font-mono font-black tracking-[0.5em] rounded-xl h-12"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs font-bold text-slate-700">
                        New Password (8+ chars, 1 uppercase, 1 number)
                      </Label>
                      <div className="relative">
                        <Input
                          type={showResetPassword ? "text" : "password"}
                          required
                          placeholder="••••••••••••"
                          value={resetNewPassword}
                          onChange={(e) => setResetNewPassword(e.target.value)}
                          className="text-xs rounded-xl h-10 pr-9"
                        />
                        <button
                          type="button"
                          onClick={() => setShowResetPassword((v) => !v)}
                          className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600 cursor-pointer"
                        >
                          {showResetPassword ? (
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
                  disabled={loading}
                  className="w-full h-11 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs cursor-pointer"
                >
                  {loading
                    ? "Processing..."
                    : resetOtpSent
                      ? "Reset Password"
                      : "Send 6-Digit Reset Code"}
                </Button>

                <button
                  type="button"
                  onClick={() => {
                    setMode("login");
                    setResetOtpSent(false);
                    setError("");
                    setSuccessMsg("");
                  }}
                  className="w-full inline-flex items-center justify-center gap-1 text-xs font-semibold text-slate-500 hover:text-slate-800 cursor-pointer"
                >
                  <ArrowLeft className="h-3.5 w-3.5" />
                  Back to Sign In
                </button>
              </form>
            )}

            {/* Continue with Google (Shown on Sign In & Register Step 1) */}
            {(mode === "login" || (mode === "register" && registerStep === 1)) && (
              <div className="space-y-3 pt-1">
                <div className="relative flex items-center justify-center">
                  <div className="w-full border-t border-slate-200" />
                  <span className="bg-white px-3 text-[10px] font-bold uppercase tracking-wider text-slate-400 whitespace-nowrap">
                    or continue with
                  </span>
                  <div className="w-full border-t border-slate-200" />
                </div>

                <Button
                  type="button"
                  variant="outline"
                  disabled={loading}
                  onClick={handleGoogleSignIn}
                  className="w-full h-11 rounded-xl border-slate-200 bg-white hover:bg-slate-50 text-slate-800 font-bold text-xs shadow-2xs gap-2.5 cursor-pointer"
                >
                  <svg className="h-4 w-4" viewBox="0 0 24 24" aria-hidden="true">
                    <path
                      fill="#4285F4"
                      d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17z"
                    />
                    <path
                      fill="#34A853"
                      d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.11-6.72-4.96H1.29v3.14C3.26 21.3 7.31 24 12 24z"
                    />
                    <path
                      fill="#FBBC05"
                      d="M5.28 14.24c-.24-.72-.38-1.49-.38-2.24s.14-1.52.38-2.24V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.99-3.14z"
                    />
                    <path
                      fill="#EA4335"
                      d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.99 3.14c.95-2.85 3.6-4.96 6.72-4.96z"
                    />
                  </svg>
                  Continue with Google (Gmail / CSU)
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Footer Security Badge */}
        <div className="flex items-center justify-center gap-1.5 text-[11px] text-slate-400">
          <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
          <span>Secured by Better Auth • RA 10173 Compliant</span>
        </div>
      </div>

      {/* RA 10173 Data Privacy Notice Modal */}
      {showPrivacyModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center gap-2.5">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700">
                <FileText className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-sm font-black text-slate-900">
                  CSU Health Services Data Privacy Notice
                </h3>
                <p className="text-[11px] text-slate-500">
                  Republic Act No. 10173 (Data Privacy Act of 2012)
                </p>
              </div>
            </div>

            <div className="space-y-2.5 text-xs text-slate-600 leading-relaxed max-h-72 overflow-y-auto pr-1">
              <p>
                <strong>1. Information Collected:</strong> Your name, CSU Student/Employee
                ID, college/unit, email, mobile number, date of birth, sex, blood type,
                known drug allergies, medical conditions, emergency contact, and medication
                adherence records.
              </p>
              <p>
                <strong>2. Purpose of Processing:</strong> Used solely by authorized Caraga
                State University Health Services Infirmary doctors and health staff to
                manage prescriptions, verify drug safety/allergies, schedule clinic visits,
                and support your medication adherence.
              </p>
              <p>
                <strong>3. Confidentiality &amp; Access Control:</strong> Your Sensitive
                Personal Information (SPI) is encrypted in transit and accessible only to you
                and authorized CSU clinical personnel. It is never shared with third parties
                without your explicit consent or legal mandate.
              </p>
              <p>
                <strong>4. Your Rights:</strong> Under RA 10173, you have the right to access,
                update, or request correction of your personal and clinical records through
                your Profile or the CSU Infirmary.
              </p>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowPrivacyModal(false)}
                className="rounded-xl text-xs font-bold cursor-pointer"
              >
                Close
              </Button>
              <Button
                type="button"
                onClick={() => {
                  setPrivacyConsent(true);
                  setShowPrivacyModal(false);
                }}
                className="rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold cursor-pointer"
              >
                I Understand &amp; Consent
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
