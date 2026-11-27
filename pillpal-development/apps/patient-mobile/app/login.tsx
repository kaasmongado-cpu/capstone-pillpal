import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Modal,
  Image,
} from "react-native";
import { useRouter } from "expo-router";
import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";
import {
  HeartPulse,
  Lock,
  Mail,
  Fingerprint,
  ShieldAlert,
  ShieldCheck,
  User,
  GraduationCap,
  Building,
  CheckCircle2,
  KeyRound,
  RefreshCw,
  ArrowLeft,
  ChevronDown,
  Eye,
  EyeOff,
  Phone,
  Calendar,
  Check,
} from "lucide-react-native";
import {
  signIn,
  verifyEmailOtp,
  sendVerificationOtp,
  resetPasswordWithOtp,
  getGoogleAuthUrl,
  exchangeOAuthCode,
} from "@pillpal/auth";
import { clearLocalDatabase } from "@/services/db/database";
import {
  saveAuthToken,
  saveCachedUser,
  isBiometricsAvailable,
  authenticateWithBiometrics,
  getCachedUser,
} from "@/services/auth/session";
import {
  BLOOD_TYPES,
  CSU_COLLEGES,
  EMPLOYEE_UNITS,
  GENDER_OPTIONS,
  evaluatePasswordStrength,
  isValidCsuId,
  isValidEmailFormat,
  isValidIsoDate,
  isValidPhPhone,
} from "@/constants/registration";

const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || "http://localhost:4000";

export default function LoginScreen() {
  const router = useRouter();

  // Mode: "SIGN_IN" | "REGISTER" | "VERIFY_OTP" | "FORGOT_PASSWORD"
  const [mode, setMode] = useState<
    "SIGN_IN" | "REGISTER" | "VERIFY_OTP" | "FORGOT_PASSWORD"
  >("SIGN_IN");

  // Sign In State
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [showSignInPassword, setShowSignInPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [biometricsAvailable, setBiometricsAvailable] = useState(false);

  // 2-Step Registration Form State
  const [regStep, setRegStep] = useState<1 | 2>(1);
  const [regFirstName, setRegFirstName] = useState("");
  const [regLastName, setRegLastName] = useState("");
  const [regUserType, setRegUserType] = useState<"" | "STUDENT" | "EMPLOYEE">("");
  const [regIdNumber, setRegIdNumber] = useState("");
  const [regEmail, setRegEmail] = useState("");
  const [regPassword, setRegPassword] = useState("");
  const [regConfirmPassword, setRegConfirmPassword] = useState("");
  const [showRegPassword, setShowRegPassword] = useState(false);
  const [showRegConfirmPassword, setShowRegConfirmPassword] = useState(false);
  const [regDepartment, setRegDepartment] = useState("");
  const [showCollegePicker, setShowCollegePicker] = useState(false);

  // Step 2 Clinical Intake State
  const [regDob, setRegDob] = useState("");
  const [regGender, setRegGender] = useState("");
  const [showGenderPicker, setShowGenderPicker] = useState(false);
  const [regPhone, setRegPhone] = useState("");
  const [regBloodType, setRegBloodType] = useState("");
  const [showBloodTypePicker, setShowBloodTypePicker] = useState(false);
  const [noKnownAllergies, setNoKnownAllergies] = useState(false);
  const [regAllergies, setRegAllergies] = useState("");
  const [regConditions, setRegConditions] = useState("");
  const [regEmergencyName, setRegEmergencyName] = useState("");
  const [regEmergencyPhone, setRegEmergencyPhone] = useState("");
  const [privacyConsent, setPrivacyConsent] = useState(false);
  const [showPrivacyModal, setShowPrivacyModal] = useState(false);

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

  const passwordStrength = evaluatePasswordStrength(regPassword);
  const passwordsMatch =
    regConfirmPassword.length > 0 && regPassword === regConfirmPassword;
  const availableUnits = regUserType === "EMPLOYEE" ? EMPLOYEE_UNITS : CSU_COLLEGES;

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setTimeout(() => setResendCooldown((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [resendCooldown]);

  useEffect(() => {
    async function checkBio() {
      const available = await isBiometricsAvailable();
      setBiometricsAvailable(available);

      const cached = await getCachedUser();
      if (cached && available) {
        const success = await authenticateWithBiometrics();
        if (success) {
          router.replace("/(tabs)");
        }
      }
    }
    void checkBio();
  }, [router]);

  async function handleLogin() {
    setError(null);
    setSuccessMsg(null);
    setLoading(true);

    try {
      let targetEmail = identifier.trim().toLowerCase();

      if (!targetEmail.includes("@")) {
        try {
          const lookupRes = await fetch(`${API_BASE_URL}/auth/patient/lookup`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ identifier: targetEmail }),
          });

          if (!lookupRes.ok) {
            throw new Error("No CSU patient account found with this ID Number.");
          }

          const lookupData = await lookupRes.json();
          targetEmail = lookupData.email;
        } catch (fetchErr: any) {
          throw new Error(
            fetchErr.message ||
              "Cannot connect to CSU authentication service. Please verify your connection.",
          );
        }
      }

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
          setMode("VERIFY_OTP");
          setSuccessMsg(
            `Your email isn't verified yet. We sent a 6-digit verification code to ${targetEmail}.`,
          );
          return;
        }

        if (authError?.message?.toLowerCase().includes("failed to fetch")) {
          throw new Error(
            "Cannot connect to server. Check your network or API server status.",
          );
        }

        const isInvalidCreds =
          authError?.code === "INVALID_EMAIL_OR_PASSWORD" ||
          authError?.status === 401 ||
          authError?.message?.toLowerCase().includes("invalid email or password");

        if (isInvalidCreds) {
          throw new Error(
            "Invalid email or password. Signed up with Google? Use 'Continue with Google' or tap 'Forgot password?' to create a portal password.",
          );
        }

        throw new Error(authError?.message || "Invalid CSU patient credentials.");
      }

      await saveAuthToken(data.session.access_token);
      await clearLocalDatabase();

      try {
        const meRes = await fetch(`${API_BASE_URL}/me`, {
          headers: { Authorization: `Bearer ${data.session.access_token}` },
        });

        if (meRes.ok) {
          const profile = await meRes.json();
          await saveCachedUser({
            id: profile.id,
            email: profile.email,
            firstName: profile.firstName || "",
            lastName: profile.lastName || "",
            idNumber: profile.patientProfile?.idNumber || "",
            department: profile.patientProfile?.department || "",
            bloodType: profile.patientProfile?.bloodType || "",
            allergies: profile.patientProfile?.allergies || "",
            role: profile.role,
          });
        }
      } catch {
        const nameParts = (data.session.user.name || "").trim().split(/\s+/);
        await saveCachedUser({
          id: data.session.user.id,
          email: targetEmail,
          firstName: nameParts[0] || "",
          lastName: nameParts.slice(1).join(" "),
          idNumber: "",
          department: "",
          bloodType: "",
          allergies: "",
          role: "PATIENT",
        });
      }

      router.replace("/(tabs)");
    } catch (err: any) {
      setError(err.message || "Failed to sign in. Please verify your credentials.");
    } finally {
      setLoading(false);
    }
  }

  function handleNextRegisterStep() {
    setError(null);
    setSuccessMsg(null);

    if (!regFirstName.trim() || !regLastName.trim()) {
      setError("Please enter your first and last name.");
      return;
    }

    if (!regUserType) {
      setError("Please select your CSU account type (Student or Employee).");
      return;
    }

    if (!isValidCsuId(regIdNumber)) {
      setError("Please enter a valid CSU ID Number (e.g. 221-00675 or 2022-04912).");
      return;
    }

    if (!regDepartment.trim()) {
      setError("Please select your college or university unit.");
      return;
    }

    if (!isValidEmailFormat(regEmail)) {
      setError(
        "Please enter a valid email address (e.g. yourname@gmail.com or yourname@carsu.edu.ph).",
      );
      return;
    }

    if (!passwordStrength.isValid) {
      setError(
        "Password must be at least 8 characters with 1 uppercase letter and 1 number.",
      );
      return;
    }

    if (regPassword !== regConfirmPassword) {
      setError("Passwords do not match. Please re-enter your password.");
      return;
    }

    setRegStep(2);
  }

  async function handleRegister() {
    setError(null);
    setSuccessMsg(null);

    if (!isValidIsoDate(regDob)) {
      setError("Please enter a valid Date of Birth in YYYY-MM-DD format (e.g. 2003-05-14).");
      return;
    }

    if (!regGender) {
      setError("Please select your sex.");
      return;
    }

    if (!regPhone.trim() || !isValidPhPhone(regPhone)) {
      setError("Please enter a valid Philippine mobile number (e.g. 0912 345 6789).");
      return;
    }

    if (!noKnownAllergies && !regAllergies.trim()) {
      setError(
        "Please enter known drug allergies or select 'No Known Drug Allergies (NKA)'.",
      );
      return;
    }

    if (regEmergencyPhone.trim() && !isValidPhPhone(regEmergencyPhone)) {
      setError("Please enter a valid mobile number for your emergency contact.");
      return;
    }

    if (!privacyConsent) {
      setError(
        "You must consent to the CSU Data Privacy Notice (RA 10173) before signing up.",
      );
      return;
    }

    const cleanEmail = regEmail.trim().toLowerCase();
    const resolvedAllergies = noKnownAllergies
      ? "No Known Drug Allergies (NKA)"
      : regAllergies.trim();

    setLoading(true);

    try {
      const regRes = await fetch(`${API_BASE_URL}/auth/patient/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName: regFirstName.trim(),
          lastName: regLastName.trim(),
          idNumber: regIdNumber.trim(),
          email: cleanEmail,
          password: regPassword,
          department: regDepartment.trim(),
          userType: regUserType || "STUDENT",
          dateOfBirth: regDob.trim(),
          gender: regGender,
          phone: regPhone.trim(),
          bloodType: regBloodType || undefined,
          allergies: resolvedAllergies,
          medicalConditions: regConditions.trim() || undefined,
          emergencyContactName: regEmergencyName.trim() || undefined,
          emergencyContactPhone: regEmergencyPhone.trim() || undefined,
          privacyConsent: true,
        }),
      });

      const regBody = await regRes.json();
      if (!regRes.ok) {
        throw new Error(regBody.message || "Registration failed. Please check your inputs.");
      }

      if (regBody.requiresVerification) {
        setOtpEmail(cleanEmail);
        setOtpPendingPassword(regPassword);
        setOtpCode("");
        setResendCooldown(60);
        setMode("VERIFY_OTP");
        setSuccessMsg(
          `We sent a 6-digit verification code to ${cleanEmail}. Enter it below to verify your real email.`,
        );
        return;
      }

      const { data: authData, error: authErr } = await signIn(cleanEmail, regPassword);
      if (authErr || !authData.session) {
        setSuccessMsg("CSU Patient Account registered! Please sign in with your email.");
        setIdentifier(cleanEmail);
        setPassword(regPassword);
        setMode("SIGN_IN");
      } else {
        await saveAuthToken(authData.session.access_token);
        await clearLocalDatabase();
        await saveCachedUser({
          id: authData.session.user.id,
          email: cleanEmail,
          firstName: regFirstName.trim(),
          lastName: regLastName.trim(),
          idNumber: regIdNumber.trim(),
          department: regDepartment.trim(),
          bloodType: regBloodType,
          allergies: resolvedAllergies,
          role: "PATIENT",
        });
        router.replace("/(tabs)");
      }
    } catch (err: any) {
      setError(err.message || "Failed to create CSU account.");
    } finally {
      setLoading(false);
    }
  }

  async function completeSessionLogin(token: string, fallbackEmail: string, fallbackId: string) {
    await saveAuthToken(token);
    await clearLocalDatabase();
    try {
      const meRes = await fetch(`${API_BASE_URL}/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (meRes.ok) {
        const profile = await meRes.json();
        await saveCachedUser({
          id: profile.id,
          email: profile.email,
          firstName: profile.firstName || "",
          lastName: profile.lastName || "",
          idNumber: profile.patientProfile?.idNumber || regIdNumber.trim(),
          department: profile.patientProfile?.department || regDepartment.trim(),
          bloodType: profile.patientProfile?.bloodType || "",
          allergies: profile.patientProfile?.allergies || "",
          role: profile.role,
        });
        router.replace("/(tabs)");
        return;
      }
    } catch {
      // fallback cache below
    }
    await saveCachedUser({
      id: fallbackId,
      email: fallbackEmail,
      firstName: regFirstName.trim(),
      lastName: regLastName.trim(),
      idNumber: regIdNumber.trim(),
      department: regDepartment.trim(),
      bloodType: regBloodType,
      allergies: noKnownAllergies ? "No Known Drug Allergies (NKA)" : regAllergies.trim(),
      role: "PATIENT",
    });
    router.replace("/(tabs)");
  }

  async function handleVerifyOtp() {
    setError(null);
    setSuccessMsg(null);
    const cleanOtp = otpCode.replace(/\D/g, "").trim();
    if (cleanOtp.length !== 6) {
      setError("Please enter the complete 6-digit verification code.");
      return;
    }

    setLoading(true);
    try {
      const { data, error: verifyErr } = await verifyEmailOtp(otpEmail, cleanOtp);
      if (verifyErr) {
        throw new Error(verifyErr.message || "Invalid or expired verification code.");
      }

      if (data.session) {
        await completeSessionLogin(data.session.access_token, otpEmail, data.session.user.id);
        return;
      }

      if (otpPendingPassword) {
        const { data: loginData, error: loginErr } = await signIn(otpEmail, otpPendingPassword);
        if (!loginErr && loginData.session) {
          await completeSessionLogin(
            loginData.session.access_token,
            otpEmail,
            loginData.session.user.id,
          );
          return;
        }
      }

      setSuccessMsg("Email verified! Please sign in with your credentials.");
      setIdentifier(otpEmail);
      setPassword(otpPendingPassword);
      setMode("SIGN_IN");
    } catch (err: any) {
      setError(err.message || "Verification failed. Please check the 6-digit code.");
    } finally {
      setLoading(false);
    }
  }

  async function handleResendOtp() {
    if (resendCooldown > 0 || !otpEmail) return;
    setError(null);
    setLoading(true);
    try {
      const { error: resendErr } = await sendVerificationOtp(otpEmail, "email-verification");
      if (resendErr) throw new Error(resendErr.message);
      setResendCooldown(60);
      setSuccessMsg(`A new 6-digit code was sent to ${otpEmail}.`);
    } catch (err: any) {
      setError(err.message || "Unable to resend verification code.");
    } finally {
      setLoading(false);
    }
  }

  async function handleSendResetOtp() {
    setError(null);
    setSuccessMsg(null);
    setLoading(true);
    try {
      let targetEmail = resetEmail.trim().toLowerCase();
      if (!targetEmail) throw new Error("Please enter your Email or CSU Student ID.");

      if (!targetEmail.includes("@")) {
        const lookupRes = await fetch(`${API_BASE_URL}/auth/patient/lookup`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ identifier: targetEmail }),
        });
        if (!lookupRes.ok) throw new Error("No account found with this CSU ID Number.");
        const lookupData = await lookupRes.json();
        targetEmail = lookupData.email;
      }

      const { error: sendErr } = await sendVerificationOtp(targetEmail, "forget-password");
      if (sendErr) throw new Error(sendErr.message);

      setResetEmail(targetEmail);
      setResetOtpSent(true);
      setResendCooldown(60);
      setSuccessMsg(`6-digit password reset code sent to ${targetEmail}.`);
    } catch (err: any) {
      setError(err.message || "Failed to send reset code.");
    } finally {
      setLoading(false);
    }
  }

  async function handleResetPassword() {
    setError(null);
    setSuccessMsg(null);
    const cleanOtp = resetOtpCode.replace(/\D/g, "").trim();
    if (cleanOtp.length !== 6) {
      setError("Please enter the 6-digit reset code from your email.");
      return;
    }
    const resetStrength = evaluatePasswordStrength(resetNewPassword);
    if (!resetStrength.isValid) {
      setError(
        "New password must be at least 8 characters with 1 uppercase letter and 1 number.",
      );
      return;
    }

    setLoading(true);
    try {
      const { error: resetErr } = await resetPasswordWithOtp(
        resetEmail,
        cleanOtp,
        resetNewPassword,
      );
      if (resetErr) throw new Error(resetErr.message);

      setSuccessMsg("Password updated! Sign in with your new password.");
      setIdentifier(resetEmail);
      setPassword(resetNewPassword);
      setResetOtpSent(false);
      setResetOtpCode("");
      setResetNewPassword("");
      setMode("SIGN_IN");
    } catch (err: any) {
      setError(err.message || "Failed to reset password.");
    } finally {
      setLoading(false);
    }
  }

  async function handleBiometricLogin() {
    const success = await authenticateWithBiometrics();
    if (success) {
      router.replace("/(tabs)");
    }
  }

  async function handleGoogleSignIn() {
    setError(null);
    setSuccessMsg(null);
    setLoading(true);
    try {
      const redirectUrl =
        Platform.OS === "web" && typeof window !== "undefined"
          ? `${window.location.origin}/auth-callback`
          : Linking.createURL("auth-callback");

      const { url, error: googleErr } = await getGoogleAuthUrl(redirectUrl);
      if (googleErr || !url) {
        throw new Error(
          googleErr?.message ||
            "Google Sign-In is not configured yet. Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to .env.",
        );
      }

      if (Platform.OS === "web" && typeof window !== "undefined") {
        window.location.href = url;
        return;
      }

      const result = await WebBrowser.openAuthSessionAsync(url, redirectUrl);
      if (result.type !== "success" || !result.url) {
        return;
      }

      const parsed = Linking.parse(result.url);
      const urlError = parsed.queryParams?.error;
      if (typeof urlError === "string" && urlError) {
        throw new Error(urlError);
      }

      const code = typeof parsed.queryParams?.code === "string" ? parsed.queryParams.code : "";
      if (!code) {
        throw new Error("No Google sign-in code returned. Please try again.");
      }

      const { data, error: exchangeErr } = await exchangeOAuthCode(code);
      if (exchangeErr || !data.session || !data.user) {
        throw new Error(exchangeErr?.message || "Unable to complete Google sign-in.");
      }

      await saveAuthToken(data.session.access_token);
      await clearLocalDatabase();

      if (data.needsProfileOnboarding) {
        router.replace("/complete-profile");
        return;
      }

      await saveCachedUser({
        id: data.user.id,
        email: data.user.email,
        firstName: data.user.firstName || "",
        lastName: data.user.lastName || "",
        idNumber: data.user.patientProfile?.idNumber || "",
        department: data.user.patientProfile?.department || "",
        bloodType: data.user.patientProfile?.bloodType || "",
        allergies: data.user.patientProfile?.allergies || "",
        role: data.user.role || "PATIENT",
      });

      router.replace("/(tabs)");
    } catch (err: any) {
      setError(err?.message || "Unable to sign in with Google.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        {/* CSU Brand Header */}
        <View style={styles.header}>
          <View
            style={[
              styles.iconCircle,
              {
                backgroundColor: "#ffffff",
                borderWidth: 1,
                borderColor: "#e2e8f0",
                padding: 8,
              },
            ]}
          >
            <Image
              source={require("../assets/pillpal-logo.png")}
              style={{ width: 54, height: 54 }}
              resizeMode="contain"
            />
          </View>
          <Text style={styles.title}>PILLPAL</Text>
          <Text style={styles.subtitle}>CSU University Center for Health and Wellness</Text>
          <View style={styles.csuBadge}>
            <ShieldCheck size={12} color="#047857" />
            <Text style={styles.csuBadgeText}>PATIENT PORTAL • RA 10173</Text>
          </View>
        </View>

        {/* Mode Switch Tabs */}
        {(mode === "SIGN_IN" || mode === "REGISTER") && (
          <View style={styles.modeTabsRow}>
            <TouchableOpacity
              style={[styles.modeTab, mode === "SIGN_IN" && styles.modeTabActive]}
              onPress={() => {
                setMode("SIGN_IN");
                setError(null);
              }}
            >
              <Text style={[styles.modeTabText, mode === "SIGN_IN" && styles.modeTabTextActive]}>
                Sign In
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.modeTab, mode === "REGISTER" && styles.modeTabActive]}
              onPress={() => {
                setMode("REGISTER");
                setRegStep(1);
                setError(null);
              }}
            >
              <Text style={[styles.modeTabText, mode === "REGISTER" && styles.modeTabTextActive]}>
                Create CSU Account
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Card Body */}
        <View style={styles.card}>
          {error && (
            <View style={styles.errorBox}>
              <ShieldAlert size={18} color="#dc2626" />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}

          {successMsg && (
            <View style={styles.successBox}>
              <CheckCircle2 size={18} color="#047857" />
              <Text style={styles.successText}>{successMsg}</Text>
            </View>
          )}

          {/* VIEW A: SIGN IN FORM */}
          {mode === "SIGN_IN" ? (
            <>
              <Text style={styles.cardTitle}>Student &amp; Patient Sign In</Text>
              <Text style={styles.cardDesc}>
                Enter your email or CSU Student/Employee ID to access your care plan.
              </Text>

              <Text style={styles.inputLabel}>Email Address or CSU ID Number</Text>
              <View style={styles.inputWrapper}>
                <Mail size={18} color="#94a3b8" />
                <TextInput
                  style={styles.input}
                  placeholder="e.g. student@gmail.com, carsu.edu.ph, or 221-00675"
                  placeholderTextColor="#94a3b8"
                  value={identifier}
                  onChangeText={setIdentifier}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </View>

              <View style={styles.labelRowBetween}>
                <Text style={styles.inputLabel}>Password</Text>
                <TouchableOpacity
                  onPress={() => {
                    setResetEmail(identifier);
                    setResetOtpSent(false);
                    setError(null);
                    setSuccessMsg(null);
                    setMode("FORGOT_PASSWORD");
                  }}
                >
                  <Text style={styles.linkText}>Forgot password?</Text>
                </TouchableOpacity>
              </View>
              <View style={styles.inputWrapper}>
                <Lock size={18} color="#94a3b8" />
                <TextInput
                  style={styles.input}
                  placeholder="••••••••••••"
                  placeholderTextColor="#94a3b8"
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry={!showSignInPassword}
                />
                <TouchableOpacity onPress={() => setShowSignInPassword((v) => !v)}>
                  {showSignInPassword ? (
                    <EyeOff size={18} color="#64748b" />
                  ) : (
                    <Eye size={18} color="#64748b" />
                  )}
                </TouchableOpacity>
              </View>

              <TouchableOpacity
                style={[styles.loginBtn, loading && styles.disabledBtn]}
                onPress={handleLogin}
                disabled={loading}
              >
                {loading ? (
                  <ActivityIndicator color="#ffffff" />
                ) : (
                  <Text style={styles.loginBtnText}>Sign In to CSU Portal</Text>
                )}
              </TouchableOpacity>

              <View style={styles.dividerRow}>
                <View style={styles.dividerLine} />
                <Text style={styles.dividerText}>OR CONTINUE WITH</Text>
                <View style={styles.dividerLine} />
              </View>

              <TouchableOpacity
                style={[styles.googleBtn, loading && styles.disabledBtn]}
                onPress={handleGoogleSignIn}
                disabled={loading}
              >
                <Text style={styles.googleG}>G</Text>
                <Text style={styles.googleBtnText}>Continue with Google (Gmail / CSU)</Text>
              </TouchableOpacity>

              {biometricsAvailable && (
                <TouchableOpacity style={styles.biometricBtn} onPress={handleBiometricLogin}>
                  <Fingerprint size={20} color="#10b981" />
                  <Text style={styles.biometricBtnText}>Sign In with Face ID / Fingerprint</Text>
                </TouchableOpacity>
              )}
            </>
          ) : mode === "REGISTER" ? (
            /* VIEW B: 2-STEP CSU PATIENT REGISTRATION */
            <>
              <Text style={styles.cardTitle}>Register for CSU Health Services</Text>
              <Text style={styles.cardDesc}>
                {regStep === 1
                  ? "Step 1 of 2 — Set up your CSU identity and login credentials."
                  : "Step 2 of 2 — Complete your health intake & RA 10173 privacy consent."}
              </Text>

              {/* Step Pills */}
              <View style={styles.stepperRow}>
                <View style={[styles.stepPill, regStep === 1 ? styles.stepPillActive : styles.stepPillDone]}>
                  <Text style={[styles.stepPillText, regStep === 1 ? styles.stepPillTextActive : styles.stepPillTextDone]}>
                    1. Account &amp; ID
                  </Text>
                </View>
                <View style={styles.stepConnector} />
                <View style={[styles.stepPill, regStep === 2 && styles.stepPillActive]}>
                  <Text style={[styles.stepPillText, regStep === 2 && styles.stepPillTextActive]}>
                    2. Health Intake
                  </Text>
                </View>
              </View>

              {regStep === 1 ? (
                <>
                  <View style={{ flexDirection: "row", gap: 10 }}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.inputLabel}>First Name *</Text>
                      <View style={styles.inputWrapper}>
                        <User size={16} color="#94a3b8" />
                        <TextInput
                          style={styles.input}
                          placeholder="e.g. Ana"
                          placeholderTextColor="#94a3b8"
                          value={regFirstName}
                          onChangeText={setRegFirstName}
                        />
                      </View>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.inputLabel}>Last Name *</Text>
                      <View style={styles.inputWrapper}>
                        <TextInput
                          style={styles.input}
                          placeholder="e.g. Reyes"
                          placeholderTextColor="#94a3b8"
                          value={regLastName}
                          onChangeText={setRegLastName}
                        />
                      </View>
                    </View>
                  </View>

                  {/* Account Type Toggle */}
                  <Text style={styles.inputLabel}>Account Type *</Text>
                  <View style={{ flexDirection: "row", gap: 8 }}>
                    {(["STUDENT", "EMPLOYEE"] as const).map((typeOpt) => {
                      const active = regUserType === typeOpt;
                      return (
                        <TouchableOpacity
                          key={typeOpt}
                          style={[styles.choiceChip, active && styles.choiceChipActive]}
                          onPress={() => {
                            const nextUnits =
                              typeOpt === "EMPLOYEE" ? EMPLOYEE_UNITS : CSU_COLLEGES;
                            setRegUserType(typeOpt);
                            if (!(nextUnits as readonly string[]).includes(regDepartment)) {
                              setRegDepartment("");
                            }
                          }}
                        >
                          <Text
                            style={[
                              styles.choiceChipText,
                              active && styles.choiceChipTextActive,
                            ]}
                          >
                            {typeOpt === "STUDENT" ? "CSU Student" : "CSU Employee"}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>

                  <Text style={styles.inputLabel}>CSU ID Number *</Text>
                  <View style={styles.inputWrapper}>
                    <GraduationCap size={18} color="#94a3b8" />
                    <TextInput
                      style={styles.input}
                      placeholder="e.g. 221-00675 or 2022-04912"
                      placeholderTextColor="#94a3b8"
                      value={regIdNumber}
                      onChangeText={setRegIdNumber}
                      autoCapitalize="none"
                    />
                  </View>

                  <Text style={styles.inputLabel}>
                    {regUserType === "EMPLOYEE" ? "College / University Office *" : "College *"}
                  </Text>
                  <TouchableOpacity
                    style={styles.inputWrapper}
                    activeOpacity={0.75}
                    onPress={() => setShowCollegePicker((prev) => !prev)}
                  >
                    <Building size={18} color="#94a3b8" />
                    <Text
                      style={[
                        styles.input,
                        { color: regDepartment ? "#0f172a" : "#94a3b8" },
                      ]}
                      numberOfLines={1}
                    >
                      {regDepartment ||
                        (regUserType === "EMPLOYEE"
                          ? "Select College or Office"
                          : "Select College")}
                    </Text>
                    <ChevronDown size={18} color="#64748b" />
                  </TouchableOpacity>
                  {showCollegePicker && (
                    <View style={styles.pickerDropdown}>
                      {availableUnits.map((unit) => {
                        const selected = regDepartment === unit;
                        return (
                          <TouchableOpacity
                            key={unit}
                            style={[
                              styles.pickerOption,
                              selected && styles.pickerOptionSelected,
                            ]}
                            onPress={() => {
                              setRegDepartment(unit);
                              setShowCollegePicker(false);
                            }}
                          >
                            <Text
                              style={[
                                styles.pickerOptionText,
                                selected && styles.pickerOptionTextSelected,
                              ]}
                            >
                              {unit}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  )}

                  <Text style={styles.inputLabel}>Email Address (Gmail or CSU Email) *</Text>
                  <View style={styles.inputWrapper}>
                    <Mail size={18} color="#94a3b8" />
                    <TextInput
                      style={styles.input}
                      placeholder="e.g. name@gmail.com or name@carsu.edu.ph"
                      placeholderTextColor="#94a3b8"
                      value={regEmail}
                      onChangeText={setRegEmail}
                      autoCapitalize="none"
                      autoCorrect={false}
                      keyboardType="email-address"
                    />
                  </View>

                  <Text style={styles.inputLabel}>Password *</Text>
                  <View style={styles.inputWrapper}>
                    <Lock size={18} color="#94a3b8" />
                    <TextInput
                      style={styles.input}
                      placeholder="8+ chars, 1 uppercase, 1 number"
                      placeholderTextColor="#94a3b8"
                      value={regPassword}
                      onChangeText={setRegPassword}
                      secureTextEntry={!showRegPassword}
                    />
                    <TouchableOpacity onPress={() => setShowRegPassword((v) => !v)}>
                      {showRegPassword ? (
                        <EyeOff size={18} color="#64748b" />
                      ) : (
                        <Eye size={18} color="#64748b" />
                      )}
                    </TouchableOpacity>
                  </View>
                  {regPassword.length > 0 && (
                    <View style={styles.strengthBox}>
                      <View style={styles.strengthBars}>
                        {[1, 2, 3, 4].map((bar) => (
                          <View
                            key={bar}
                            style={[
                              styles.strengthBar,
                              {
                                backgroundColor:
                                  passwordStrength.score >= bar
                                    ? passwordStrength.score >= 3
                                      ? "#10b981"
                                      : "#f59e0b"
                                    : "#e2e8f0",
                              },
                            ]}
                          />
                        ))}
                        <Text style={styles.strengthLabel}>{passwordStrength.label}</Text>
                      </View>
                      <Text style={styles.strengthHint}>
                        {passwordStrength.hasMinLength ? "✓" : "•"} 8+ chars{"  "}
                        {passwordStrength.hasUpper ? "✓" : "•"} 1 uppercase{"  "}
                        {passwordStrength.hasNumber ? "✓" : "•"} 1 number
                      </Text>
                    </View>
                  )}

                  <Text style={styles.inputLabel}>Confirm Password *</Text>
                  <View style={styles.inputWrapper}>
                    <Lock size={18} color="#94a3b8" />
                    <TextInput
                      style={styles.input}
                      placeholder="Re-enter your password"
                      placeholderTextColor="#94a3b8"
                      value={regConfirmPassword}
                      onChangeText={setRegConfirmPassword}
                      secureTextEntry={!showRegConfirmPassword}
                    />
                    <TouchableOpacity onPress={() => setShowRegConfirmPassword((v) => !v)}>
                      {showRegConfirmPassword ? (
                        <EyeOff size={18} color="#64748b" />
                      ) : (
                        <Eye size={18} color="#64748b" />
                      )}
                    </TouchableOpacity>
                  </View>
                  {regConfirmPassword.length > 0 && (
                    <Text
                      style={{
                        fontSize: 11,
                        fontWeight: "700",
                        marginTop: 4,
                        color: passwordsMatch ? "#047857" : "#dc2626",
                      }}
                    >
                      {passwordsMatch ? "Passwords match" : "Passwords do not match"}
                    </Text>
                  )}

                  <TouchableOpacity
                    style={styles.loginBtn}
                    onPress={handleNextRegisterStep}
                  >
                    <Text style={styles.loginBtnText}>Continue to Health Intake</Text>
                  </TouchableOpacity>

                  <View style={styles.dividerRow}>
                    <View style={styles.dividerLine} />
                    <Text style={styles.dividerText}>OR SIGN UP INSTANTLY</Text>
                    <View style={styles.dividerLine} />
                  </View>

                  <TouchableOpacity
                    style={[styles.googleBtn, loading && styles.disabledBtn]}
                    onPress={handleGoogleSignIn}
                    disabled={loading}
                  >
                    <Text style={styles.googleG}>G</Text>
                    <Text style={styles.googleBtnText}>Continue with Google (Gmail / CSU)</Text>
                  </TouchableOpacity>
                </>
              ) : (
                <>
                  <Text style={styles.inputLabel}>Date of Birth (YYYY-MM-DD) *</Text>
                  <View style={styles.inputWrapper}>
                    <Calendar size={18} color="#94a3b8" />
                    <TextInput
                      style={styles.input}
                      placeholder="e.g. 2003-05-14"
                      placeholderTextColor="#94a3b8"
                      value={regDob}
                      onChangeText={setRegDob}
                      keyboardType="numbers-and-punctuation"
                    />
                  </View>

                  <Text style={styles.inputLabel}>Sex *</Text>
                  <TouchableOpacity
                    style={styles.inputWrapper}
                    activeOpacity={0.75}
                    onPress={() => setShowGenderPicker((prev) => !prev)}
                  >
                    <Text
                      style={[
                        styles.input,
                        { color: regGender ? "#0f172a" : "#94a3b8" },
                      ]}
                    >
                      {regGender || "Select Sex"}
                    </Text>
                    <ChevronDown size={18} color="#64748b" />
                  </TouchableOpacity>
                  {showGenderPicker && (
                    <View style={styles.pickerDropdown}>
                      {GENDER_OPTIONS.map((g) => (
                        <TouchableOpacity
                          key={g}
                          style={[
                            styles.pickerOption,
                            regGender === g && styles.pickerOptionSelected,
                          ]}
                          onPress={() => {
                            setRegGender(g);
                            setShowGenderPicker(false);
                          }}
                        >
                          <Text
                            style={[
                              styles.pickerOptionText,
                              regGender === g && styles.pickerOptionTextSelected,
                            ]}
                          >
                            {g}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  )}

                  <Text style={styles.inputLabel}>Mobile Number *</Text>
                  <View style={styles.inputWrapper}>
                    <Phone size={18} color="#94a3b8" />
                    <TextInput
                      style={styles.input}
                      placeholder="e.g. 0912 345 6789"
                      placeholderTextColor="#94a3b8"
                      value={regPhone}
                      onChangeText={setRegPhone}
                      keyboardType="phone-pad"
                    />
                  </View>

                  <Text style={styles.inputLabel}>Blood Type (Optional)</Text>
                  <TouchableOpacity
                    style={styles.inputWrapper}
                    activeOpacity={0.75}
                    onPress={() => setShowBloodTypePicker((prev) => !prev)}
                  >
                    <Text
                      style={[
                        styles.input,
                        { color: regBloodType ? "#0f172a" : "#94a3b8" },
                      ]}
                    >
                      {regBloodType || "Select Blood Type"}
                    </Text>
                    <ChevronDown size={18} color="#64748b" />
                  </TouchableOpacity>
                  {showBloodTypePicker && (
                    <View style={styles.pickerDropdown}>
                      {BLOOD_TYPES.map((bt) => (
                        <TouchableOpacity
                          key={bt}
                          style={[
                            styles.pickerOption,
                            regBloodType === bt && styles.pickerOptionSelected,
                          ]}
                          onPress={() => {
                            setRegBloodType(bt);
                            setShowBloodTypePicker(false);
                          }}
                        >
                          <Text
                            style={[
                              styles.pickerOptionText,
                              regBloodType === bt && styles.pickerOptionTextSelected,
                            ]}
                          >
                            {bt}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  )}

                  {/* Explicit Drug Allergy Screening */}
                  <View style={styles.allergyBox}>
                    <View style={styles.labelRowBetween}>
                      <Text style={[styles.inputLabel, { marginTop: 0 }]}>
                        Known Drug Allergies *
                      </Text>
                      <TouchableOpacity
                        style={styles.checkboxInline}
                        onPress={() => {
                          setNoKnownAllergies((prev) => {
                            if (!prev) setRegAllergies("");
                            return !prev;
                          });
                        }}
                      >
                        <View style={[styles.checkboxBox, noKnownAllergies && styles.checkboxBoxChecked]}>
                          {noKnownAllergies && <Check size={12} color="#ffffff" />}
                        </View>
                        <Text style={styles.checkboxInlineLabel}>None (NKA)</Text>
                      </TouchableOpacity>
                    </View>
                    {!noKnownAllergies && (
                      <View style={[styles.inputWrapper, { backgroundColor: "#ffffff" }]}>
                        <TextInput
                          style={styles.input}
                          placeholder="e.g. Penicillin, Aspirin, Ibuprofen"
                          placeholderTextColor="#94a3b8"
                          value={regAllergies}
                          onChangeText={setRegAllergies}
                        />
                      </View>
                    )}
                  </View>

                  <Text style={styles.inputLabel}>Pre-existing Medical Conditions (Optional)</Text>
                  <View style={styles.inputWrapper}>
                    <TextInput
                      style={styles.input}
                      placeholder="e.g. Asthma, Hypertension (blank if none)"
                      placeholderTextColor="#94a3b8"
                      value={regConditions}
                      onChangeText={setRegConditions}
                    />
                  </View>

                  <Text style={styles.inputLabel}>Emergency Contact Name &amp; Relation (Optional)</Text>
                  <View style={styles.inputWrapper}>
                    <TextInput
                      style={styles.input}
                      placeholder="e.g. Elena Reyes (Mother)"
                      placeholderTextColor="#94a3b8"
                      value={regEmergencyName}
                      onChangeText={setRegEmergencyName}
                    />
                  </View>

                  <Text style={styles.inputLabel}>Emergency Contact Phone (Optional)</Text>
                  <View style={styles.inputWrapper}>
                    <Phone size={18} color="#94a3b8" />
                    <TextInput
                      style={styles.input}
                      placeholder="e.g. 09XX XXX XXXX"
                      placeholderTextColor="#94a3b8"
                      value={regEmergencyPhone}
                      onChangeText={setRegEmergencyPhone}
                      keyboardType="phone-pad"
                    />
                  </View>

                  {/* RA 10173 Privacy Consent */}
                  <View style={styles.privacyBox}>
                    <TouchableOpacity
                      style={styles.privacyRow}
                      activeOpacity={0.8}
                      onPress={() => setPrivacyConsent((prev) => !prev)}
                    >
                      <View
                        style={[
                          styles.checkboxBox,
                          { marginTop: 2 },
                          privacyConsent && styles.checkboxBoxChecked,
                        ]}
                      >
                        {privacyConsent && <Check size={12} color="#ffffff" />}
                      </View>
                      <Text style={styles.privacyText}>
                        I consent to the collection and processing of my personal and clinical
                        information by the CSU Health Services Infirmary in accordance with the{" "}
                        <Text style={{ fontWeight: "800" }}>
                          Data Privacy Act of 2012 (RA 10173)
                        </Text>
                        .
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => setShowPrivacyModal(true)}>
                      <Text style={styles.privacyLink}>Read Data Privacy Notice</Text>
                    </TouchableOpacity>
                  </View>

                  <View style={{ flexDirection: "row", gap: 10, marginTop: 18 }}>
                    <TouchableOpacity
                      style={styles.backBtn}
                      onPress={() => {
                        setError(null);
                        setRegStep(1);
                      }}
                      disabled={loading}
                    >
                      <ArrowLeft size={16} color="#475569" />
                      <Text style={styles.backBtnText}>Back</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[
                        styles.loginBtn,
                        { flex: 1, marginTop: 0 },
                        (loading || !privacyConsent) && styles.disabledBtn,
                      ]}
                      onPress={handleRegister}
                      disabled={loading || !privacyConsent}
                    >
                      {loading ? (
                        <ActivityIndicator color="#ffffff" />
                      ) : (
                        <Text style={styles.loginBtnText}>Sign Up &amp; Send Code</Text>
                      )}
                    </TouchableOpacity>
                  </View>
                </>
              )}
            </>
          ) : null}

          {/* VIEW C: 6-DIGIT EMAIL OTP VERIFICATION */}
          {mode === "VERIFY_OTP" ? (
            <>
              <Text style={styles.cardTitle}>Verify Your Email Address</Text>
              <Text style={styles.cardDesc}>
                Enter the 6-digit verification code sent to {otpEmail}.
              </Text>

              <Text style={styles.inputLabel}>6-Digit Verification Code</Text>
              <View style={styles.inputWrapper}>
                <KeyRound size={18} color="#059669" />
                <TextInput
                  style={[
                    styles.input,
                    { letterSpacing: 10, fontSize: 20, fontWeight: "900", textAlign: "center" },
                  ]}
                  placeholder="000000"
                  placeholderTextColor="#94a3b8"
                  value={otpCode}
                  onChangeText={(txt) => setOtpCode(txt.replace(/\D/g, "").slice(0, 6))}
                  keyboardType="number-pad"
                  maxLength={6}
                />
              </View>

              <TouchableOpacity
                style={[styles.loginBtn, (loading || otpCode.length !== 6) && styles.disabledBtn]}
                onPress={handleVerifyOtp}
                disabled={loading || otpCode.length !== 6}
              >
                {loading ? (
                  <ActivityIndicator color="#ffffff" />
                ) : (
                  <Text style={styles.loginBtnText}>Verify Email &amp; Sign In</Text>
                )}
              </TouchableOpacity>

              <View style={styles.otpFooterRow}>
                <TouchableOpacity
                  style={{ flexDirection: "row", alignItems: "center", gap: 4 }}
                  onPress={() => {
                    setMode("SIGN_IN");
                    setError(null);
                    setSuccessMsg(null);
                  }}
                >
                  <ArrowLeft size={14} color="#64748b" />
                  <Text style={{ fontSize: 12, fontWeight: "700", color: "#64748b" }}>
                    Back to Sign In
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 4,
                    opacity: resendCooldown > 0 ? 0.5 : 1,
                  }}
                  disabled={resendCooldown > 0 || loading}
                  onPress={handleResendOtp}
                >
                  <RefreshCw size={14} color="#059669" />
                  <Text style={{ fontSize: 12, fontWeight: "800", color: "#059669" }}>
                    {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : "Resend Code"}
                  </Text>
                </TouchableOpacity>
              </View>
            </>
          ) : null}

          {/* VIEW D: FORGOT PASSWORD */}
          {mode === "FORGOT_PASSWORD" ? (
            <>
              <Text style={styles.cardTitle}>Reset Your Password</Text>
              <Text style={styles.cardDesc}>
                {resetOtpSent
                  ? `Enter the 6-digit code sent to ${resetEmail} and choose a new password.`
                  : "Enter your registered Email or CSU Student ID to receive a 6-digit reset code."}
              </Text>

              {!resetOtpSent ? (
                <>
                  <Text style={styles.inputLabel}>Registered Email or CSU Student ID</Text>
                  <View style={styles.inputWrapper}>
                    <Mail size={18} color="#94a3b8" />
                    <TextInput
                      style={styles.input}
                      placeholder="e.g. student@gmail.com or 221-00675"
                      placeholderTextColor="#94a3b8"
                      value={resetEmail}
                      onChangeText={setResetEmail}
                      autoCapitalize="none"
                      autoCorrect={false}
                    />
                  </View>

                  <TouchableOpacity
                    style={[styles.loginBtn, loading && styles.disabledBtn]}
                    onPress={handleSendResetOtp}
                    disabled={loading}
                  >
                    {loading ? (
                      <ActivityIndicator color="#ffffff" />
                    ) : (
                      <Text style={styles.loginBtnText}>Send 6-Digit Reset Code</Text>
                    )}
                  </TouchableOpacity>
                </>
              ) : (
                <>
                  <Text style={styles.inputLabel}>6-Digit Reset Code</Text>
                  <View style={styles.inputWrapper}>
                    <KeyRound size={18} color="#059669" />
                    <TextInput
                      style={[
                        styles.input,
                        { letterSpacing: 10, fontSize: 20, fontWeight: "900", textAlign: "center" },
                      ]}
                      placeholder="000000"
                      placeholderTextColor="#94a3b8"
                      value={resetOtpCode}
                      onChangeText={(txt) => setResetOtpCode(txt.replace(/\D/g, "").slice(0, 6))}
                      keyboardType="number-pad"
                      maxLength={6}
                    />
                  </View>

                  <Text style={styles.inputLabel}>New Password (8+ chars, 1 uppercase, 1 number)</Text>
                  <View style={styles.inputWrapper}>
                    <Lock size={18} color="#94a3b8" />
                    <TextInput
                      style={styles.input}
                      placeholder="••••••••••••"
                      placeholderTextColor="#94a3b8"
                      value={resetNewPassword}
                      onChangeText={setResetNewPassword}
                      secureTextEntry={!showResetPassword}
                    />
                    <TouchableOpacity onPress={() => setShowResetPassword((v) => !v)}>
                      {showResetPassword ? (
                        <EyeOff size={18} color="#64748b" />
                      ) : (
                        <Eye size={18} color="#64748b" />
                      )}
                    </TouchableOpacity>
                  </View>

                  <TouchableOpacity
                    style={[styles.loginBtn, loading && styles.disabledBtn]}
                    onPress={handleResetPassword}
                    disabled={loading}
                  >
                    {loading ? (
                      <ActivityIndicator color="#ffffff" />
                    ) : (
                      <Text style={styles.loginBtnText}>Reset Password</Text>
                    )}
                  </TouchableOpacity>
                </>
              )}

              <TouchableOpacity
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 4,
                  marginTop: 14,
                }}
                onPress={() => {
                  setMode("SIGN_IN");
                  setResetOtpSent(false);
                  setError(null);
                  setSuccessMsg(null);
                }}
              >
                <ArrowLeft size={14} color="#64748b" />
                <Text style={{ fontSize: 12, fontWeight: "700", color: "#64748b" }}>
                  Back to Sign In
                </Text>
              </TouchableOpacity>
            </>
          ) : null}
        </View>
      </ScrollView>

      {/* RA 10173 Privacy Modal */}
      <Modal
        visible={showPrivacyModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowPrivacyModal(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>CSU Health Services Data Privacy Notice</Text>
            <Text style={styles.modalSubtitle}>
              Republic Act No. 10173 (Data Privacy Act of 2012)
            </Text>
            <ScrollView style={{ maxHeight: 240, marginVertical: 12 }}>
              <Text style={styles.modalBody}>
                1. Information Collected: Your name, CSU ID, college/unit, email, mobile
                number, date of birth, sex, blood type, drug allergies, medical conditions,
                emergency contact, and medication records.{"\n\n"}
                2. Purpose: Used exclusively by authorized Caraga State University Health
                Services Infirmary doctors and staff for clinical care, drug-allergy safety
                screening, and medication adherence support.{"\n\n"}
                3. Confidentiality: Protected as Sensitive Personal Information (SPI) under
                RA 10173 and accessible only to you and authorized CSU health personnel.
              </Text>
            </ScrollView>
            <View style={{ flexDirection: "row", gap: 10 }}>
              <TouchableOpacity
                style={[styles.backBtn, { flex: 1 }]}
                onPress={() => setShowPrivacyModal(false)}
              >
                <Text style={styles.backBtnText}>Close</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.loginBtn, { flex: 1, marginTop: 0, height: 44 }]}
                onPress={() => {
                  setPrivacyConsent(true);
                  setShowPrivacyModal(false);
                }}
              >
                <Text style={styles.loginBtnText}>I Consent</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f8fafc" },
  scrollContent: {
    flexGrow: 1,
    justifyContent: "center",
    padding: 20,
    paddingTop: 44,
    paddingBottom: 44,
  },
  header: { alignItems: "center", marginBottom: 18 },
  iconCircle: {
    width: 64,
    height: 64,
    borderRadius: 20,
    backgroundColor: "#10b981",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 10,
  },
  title: { fontSize: 25, fontWeight: "900", color: "#0f172a", letterSpacing: 0.5 },
  subtitle: { fontSize: 12, fontWeight: "600", color: "#64748b", marginTop: 2 },
  csuBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginTop: 8,
    backgroundColor: "#ecfdf5",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#a7f3d0",
  },
  csuBadgeText: { fontSize: 10, fontWeight: "800", color: "#047857", letterSpacing: 0.5 },
  modeTabsRow: {
    flexDirection: "row",
    backgroundColor: "#e2e8f0",
    borderRadius: 14,
    padding: 4,
    marginBottom: 14,
  },
  modeTab: { flex: 1, paddingVertical: 9, alignItems: "center", borderRadius: 11 },
  modeTabActive: { backgroundColor: "#ffffff" },
  modeTabText: { fontSize: 12, fontWeight: "700", color: "#64748b" },
  modeTabTextActive: { color: "#0f172a", fontWeight: "800" },
  card: {
    backgroundColor: "#ffffff",
    borderRadius: 24,
    padding: 20,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  cardTitle: { fontSize: 18, fontWeight: "800", color: "#0f172a" },
  cardDesc: { fontSize: 12, color: "#64748b", marginTop: 4, marginBottom: 14, lineHeight: 18 },
  stepperRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
    gap: 8,
  },
  stepPill: {
    backgroundColor: "#f1f5f9",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 99,
  },
  stepPillActive: { backgroundColor: "#10b981" },
  stepPillDone: { backgroundColor: "#d1fae5" },
  stepPillText: { fontSize: 11, fontWeight: "700", color: "#64748b" },
  stepPillTextActive: { color: "#ffffff" },
  stepPillTextDone: { color: "#065f46" },
  stepConnector: { width: 18, height: 2, backgroundColor: "#e2e8f0" },
  errorBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#fef2f2",
    borderColor: "#fecaca",
    borderWidth: 1,
    padding: 10,
    borderRadius: 12,
    marginBottom: 12,
  },
  errorText: { color: "#b91c1c", fontSize: 12, fontWeight: "600", flex: 1 },
  successBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#f0fdf4",
    borderColor: "#bbf7d0",
    borderWidth: 1,
    padding: 10,
    borderRadius: 12,
    marginBottom: 12,
  },
  successText: { color: "#065f46", fontSize: 12, fontWeight: "600", flex: 1 },
  labelRowBetween: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  linkText: { fontSize: 11, fontWeight: "700", color: "#059669" },
  inputLabel: { fontSize: 11, fontWeight: "700", color: "#334155", marginBottom: 5, marginTop: 10 },
  inputWrapper: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "#f8fafc",
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 14,
    paddingHorizontal: 12,
    height: 46,
  },
  input: { flex: 1, fontSize: 13, color: "#0f172a" },
  choiceChip: {
    flex: 1,
    height: 40,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#cbd5e1",
    backgroundColor: "#f8fafc",
    alignItems: "center",
    justifyContent: "center",
  },
  choiceChipActive: { borderColor: "#10b981", backgroundColor: "#ecfdf5" },
  choiceChipText: { fontSize: 12, fontWeight: "700", color: "#64748b" },
  choiceChipTextActive: { color: "#047857" },
  strengthBox: { marginTop: 6, gap: 4 },
  strengthBars: { flexDirection: "row", alignItems: "center", gap: 4 },
  strengthBar: { flex: 1, height: 4, borderRadius: 4 },
  strengthLabel: { fontSize: 10, fontWeight: "700", color: "#64748b", marginLeft: 4 },
  strengthHint: { fontSize: 10, color: "#64748b", fontWeight: "600" },
  allergyBox: {
    marginTop: 12,
    padding: 10,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    backgroundColor: "#f8fafc",
    gap: 8,
  },
  checkboxInline: { flexDirection: "row", alignItems: "center", gap: 6 },
  checkboxInlineLabel: { fontSize: 11, fontWeight: "700", color: "#047857" },
  checkboxBox: {
    width: 18,
    height: 18,
    borderRadius: 5,
    borderWidth: 1.5,
    borderColor: "#94a3b8",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#ffffff",
  },
  checkboxBoxChecked: { backgroundColor: "#10b981", borderColor: "#10b981" },
  privacyBox: {
    marginTop: 14,
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#a7f3d0",
    backgroundColor: "#ecfdf5",
    gap: 8,
  },
  privacyRow: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  privacyText: { flex: 1, fontSize: 11, color: "#334155", lineHeight: 16 },
  privacyLink: { fontSize: 11, fontWeight: "800", color: "#047857", textDecorationLine: "underline" },
  loginBtn: {
    backgroundColor: "#10b981",
    height: 48,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 18,
  },
  disabledBtn: { opacity: 0.6 },
  loginBtnText: { color: "#ffffff", fontSize: 13, fontWeight: "800" },
  backBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    borderWidth: 1,
    borderColor: "#cbd5e1",
    backgroundColor: "#ffffff",
    borderRadius: 14,
    paddingHorizontal: 14,
    height: 48,
  },
  backBtnText: { fontSize: 13, fontWeight: "700", color: "#475569" },
  dividerRow: { flexDirection: "row", alignItems: "center", marginVertical: 14, gap: 10 },
  dividerLine: { flex: 1, height: 1, backgroundColor: "#e2e8f0" },
  dividerText: { fontSize: 10, fontWeight: "800", color: "#94a3b8" },
  googleBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderWidth: 1,
    borderColor: "#cbd5e1",
    backgroundColor: "#ffffff",
    height: 46,
    borderRadius: 14,
  },
  googleG: { fontSize: 15, fontWeight: "900", color: "#4285F4" },
  googleBtnText: { color: "#0f172a", fontSize: 12, fontWeight: "700" },
  biometricBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderWidth: 1,
    borderColor: "#a7f3d0",
    backgroundColor: "#f0fdf4",
    height: 46,
    borderRadius: 14,
    marginTop: 10,
  },
  biometricBtnText: { color: "#065f46", fontSize: 12, fontWeight: "700" },
  otpFooterRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 14,
  },
  pickerDropdown: {
    marginTop: 6,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#cbd5e1",
    backgroundColor: "#ffffff",
    overflow: "hidden",
  },
  pickerOption: {
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderBottomWidth: 1,
    borderBottomColor: "#f1f5f9",
  },
  pickerOptionSelected: { backgroundColor: "#ecfdf5" },
  pickerOptionText: { fontSize: 12, color: "#334155", fontWeight: "600" },
  pickerOptionTextSelected: { color: "#047857", fontWeight: "800" },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(15,23,42,0.5)",
    justifyContent: "center",
    padding: 20,
  },
  modalCard: {
    backgroundColor: "#ffffff",
    borderRadius: 24,
    padding: 20,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  modalTitle: { fontSize: 15, fontWeight: "900", color: "#0f172a" },
  modalSubtitle: { fontSize: 11, color: "#64748b", marginTop: 2 },
  modalBody: { fontSize: 12, color: "#334155", lineHeight: 18 },
});
