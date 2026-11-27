import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { completePatientProfile, getSession, signOut } from "@pillpal/auth";
import { fetchWithAuth } from "@/lib/api";
import {
  AlertCircle,
  CheckCircle2,
  ArrowRight,
  ArrowLeft,
  LogOut,
  FileText,
  Eye,
  EyeOff,
  Lock,
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
import {
  BLOOD_TYPES,
  CSU_COLLEGES,
  EMPLOYEE_UNITS,
  GENDER_OPTIONS,
  evaluatePasswordStrength,
  getTodayIsoDate,
  isValidCsuId,
  isValidPhPhone,
} from "@/lib/registration";

export function CompleteProfile() {
  const navigate = useNavigate();
  const [checking, setChecking] = useState(true);
  const [step, setStep] = useState<1 | 2>(1);
  const [userEmail, setUserEmail] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [idNumber, setIdNumber] = useState("");
  const [department, setDepartment] = useState("");
  const [userType, setUserType] = useState<"" | "STUDENT" | "EMPLOYEE">("");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [gender, setGender] = useState("");
  const [phone, setPhone] = useState("");
  const [bloodType, setBloodType] = useState("");
  const [noKnownAllergies, setNoKnownAllergies] = useState(false);
  const [allergies, setAllergies] = useState("");
  const [medicalConditions, setMedicalConditions] = useState("");
  const [emergencyContactName, setEmergencyContactName] = useState("");
  const [emergencyContactPhone, setEmergencyContactPhone] = useState("");
  const [portalPassword, setPortalPassword] = useState("");
  const [confirmPortalPassword, setConfirmPortalPassword] = useState("");
  const [showPortalPassword, setShowPortalPassword] = useState(false);
  const [privacyConsent, setPrivacyConsent] = useState(false);
  const [showPrivacyModal, setShowPrivacyModal] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const availableUnits = userType === "EMPLOYEE" ? EMPLOYEE_UNITS : CSU_COLLEGES;
  const portalPwdStrength = evaluatePasswordStrength(portalPassword);

  useEffect(() => {
    async function loadMe() {
      try {
        const {
          data: { session },
        } = await getSession();
        if (!session) {
          navigate("/login", { replace: true });
          return;
        }

        const res = await fetchWithAuth("/me");
        if (!res.ok) {
          navigate("/login", { replace: true });
          return;
        }

        const me = await res.json();
        if (me.patientProfile) {
          navigate("/app/dashboard", { replace: true });
          return;
        }

        setUserEmail(me.email || "");
        setFirstName(me.firstName || "");
        setLastName(me.lastName || "");
      } catch {
        navigate("/login", { replace: true });
      } finally {
        setChecking(false);
      }
    }

    void loadMe();
  }, [navigate]);

  function handleNextStep(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (!firstName.trim() || !lastName.trim()) {
      setError("Please enter your first and last name.");
      return;
    }

    if (!userType) {
      setError("Please select your account type (Student or Employee).");
      return;
    }

    if (!isValidCsuId(idNumber)) {
      setError("Please enter a valid CSU ID Number (e.g. 221-00675 or 2022-04912).");
      return;
    }

    if (!department) {
      setError("Please select your college or university unit.");
      return;
    }

    setStep(2);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (!dateOfBirth) {
      setError("Please enter your date of birth.");
      return;
    }

    if (!gender) {
      setError("Please select your sex.");
      return;
    }

    if (!phone.trim() || !isValidPhPhone(phone)) {
      setError("Please enter a valid Philippine mobile number (e.g. 0912 345 6789).");
      return;
    }

    if (!noKnownAllergies && !allergies.trim()) {
      setError(
        "Please list your known drug allergies or check 'No Known Drug Allergies (NKA)'.",
      );
      return;
    }

    if (emergencyContactPhone.trim() && !isValidPhPhone(emergencyContactPhone)) {
      setError("Please enter a valid mobile number for your emergency contact.");
      return;
    }

    if (portalPassword.length > 0) {
      if (!portalPwdStrength.isValid) {
        setError(
          "Portal password must be at least 8 characters and include an uppercase letter and a number.",
        );
        return;
      }
      if (portalPassword !== confirmPortalPassword) {
        setError("Portal passwords do not match.");
        return;
      }
    }

    if (!privacyConsent) {
      setError("Please agree to the CSU Data Privacy Notice (RA 10173) to continue.");
      return;
    }

    setLoading(true);
    try {
      const { error: saveErr } = await completePatientProfile({
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        idNumber: idNumber.trim(),
        department,
        userType: userType || "STUDENT",
        dateOfBirth,
        gender,
        phone: phone.trim(),
        bloodType: bloodType || undefined,
        allergies: noKnownAllergies
          ? "No Known Drug Allergies (NKA)"
          : allergies.trim(),
        medicalConditions: medicalConditions.trim() || undefined,
        emergencyContactName: emergencyContactName.trim() || undefined,
        emergencyContactPhone: emergencyContactPhone.trim() || undefined,
        privacyConsent: true,
        password: portalPassword || undefined,
      });

      if (saveErr) {
        setError(saveErr.message);
        return;
      }

      navigate("/app/dashboard", { replace: true });
    } catch (err: any) {
      setError(err?.message || "Failed to save your CSU health profile.");
    } finally {
      setLoading(false);
    }
  }

  if (checking) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-3">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white border border-slate-200 p-1.5 shadow-sm animate-pulse">
            <img
              src="/pillpal-logo.png"
              alt="PILLPAL Logo"
              className="h-full w-full object-contain"
            />
          </div>
          <p className="text-xs font-semibold text-slate-500">Loading your account...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-br from-emerald-50/70 via-slate-50 to-sky-50/60 p-4 py-8">
      <div className="w-full max-w-md space-y-5">
        <div className="flex flex-col items-center text-center space-y-2">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white border border-slate-200/80 p-1.5 shadow-lg shadow-emerald-600/10">
            <img
              src="/pillpal-logo.png"
              alt="PILLPAL Logo"
              className="h-full w-full object-contain"
            />
          </div>
          <h1 className="text-xl font-black text-slate-900">
            Complete Your CSU Health Profile
          </h1>
          <p className="text-xs text-slate-500 max-w-xs">
            Signed in with Google as{" "}
            <span className="font-bold text-emerald-800">{userEmail}</span>. Complete this
            one-time clinical intake to access clinic services.
          </p>
        </div>

        <Card className="rounded-3xl border border-slate-200/80 bg-white/95 p-2 shadow-xl">
          <CardHeader className="pb-2 text-center">
            <CardTitle className="text-sm font-black text-slate-900 flex items-center justify-center gap-1.5">
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              One-Time Institutional &amp; Clinical Intake
            </CardTitle>
            <CardDescription className="text-xs text-slate-500">
              {step === 1
                ? "Step 1 of 2 — Bind your CSU ID and college/unit."
                : "Step 2 of 2 — Provide basic health, emergency, and privacy consent details."}
            </CardDescription>

            <div className="flex items-center justify-center gap-2 pt-2">
              <div
                className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-bold ${
                  step === 1
                    ? "bg-emerald-600 text-white"
                    : "bg-emerald-100 text-emerald-800"
                }`}
              >
                <span>1</span>
                <span>CSU Identity</span>
              </div>
              <div className="h-0.5 w-6 rounded bg-slate-200" />
              <div
                className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-bold ${
                  step === 2
                    ? "bg-emerald-600 text-white"
                    : "bg-slate-100 text-slate-500"
                }`}
              >
                <span>2</span>
                <span>Health Intake</span>
              </div>
            </div>
          </CardHeader>

          <CardContent>
            {error && (
              <div className="mb-3 rounded-xl bg-red-50 p-3 text-xs font-semibold text-red-700 flex items-start gap-2 border border-red-100">
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-red-600" />
                <span>{error}</span>
              </div>
            )}

            {step === 1 ? (
              <form onSubmit={handleNextStep} className="space-y-3.5">
                <div className="grid grid-cols-2 gap-2.5">
                  <div className="space-y-1">
                    <Label className="text-xs">First Name *</Label>
                    <Input
                      required
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                      className="rounded-xl text-xs h-9"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Last Name *</Label>
                    <Input
                      required
                      value={lastName}
                      onChange={(e) => setLastName(e.target.value)}
                      className="rounded-xl text-xs h-9"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2.5">
                  <div className="space-y-1">
                    <Label className="text-xs">Account Type *</Label>
                    <select
                      required
                      value={userType}
                      onChange={(e) => {
                        const nextType = e.target.value as "" | "STUDENT" | "EMPLOYEE";
                        const nextUnits =
                          nextType === "EMPLOYEE" ? EMPLOYEE_UNITS : CSU_COLLEGES;
                        const deptValid = (nextUnits as readonly string[]).includes(
                          department,
                        );
                        setUserType(nextType);
                        if (!deptValid) setDepartment("");
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
                    <Label className="text-xs font-bold">CSU ID Number *</Label>
                    <Input
                      required
                      placeholder="e.g. 221-00675"
                      value={idNumber}
                      onChange={(e) => setIdNumber(e.target.value)}
                      className="rounded-xl text-xs h-9 font-mono"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <Label className="text-xs">
                    {userType === "EMPLOYEE" ? "College / University Office *" : "College *"}
                  </Label>
                  <select
                    required
                    value={department}
                    onChange={(e) => setDepartment(e.target.value)}
                    className="w-full h-10 rounded-xl border border-slate-200 px-3 text-xs bg-white text-slate-800"
                  >
                    <option value="" disabled>
                      {userType === "EMPLOYEE"
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

                <Button
                  type="submit"
                  className="w-full h-11 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-md shadow-emerald-600/20 cursor-pointer"
                >
                  Continue to Health Intake
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>

                <button
                  type="button"
                  onClick={async () => {
                    await signOut();
                    navigate("/login", { replace: true });
                  }}
                  className="w-full inline-flex items-center justify-center gap-1.5 text-xs font-semibold text-slate-400 hover:text-slate-700 pt-1 cursor-pointer"
                >
                  <LogOut className="h-3.5 w-3.5" />
                  Sign out and use another account
                </button>
              </form>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-3">
                <div className="grid grid-cols-2 gap-2.5">
                  <div className="space-y-1">
                    <Label className="text-xs">Date of Birth *</Label>
                    <Input
                      type="date"
                      required
                      max={getTodayIsoDate()}
                      value={dateOfBirth}
                      onChange={(e) => setDateOfBirth(e.target.value)}
                      className="rounded-xl text-xs h-9"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Sex *</Label>
                    <select
                      required
                      value={gender}
                      onChange={(e) => setGender(e.target.value)}
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
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      className="rounded-xl text-xs h-9"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Blood Type (Optional)</Label>
                    <select
                      value={bloodType}
                      onChange={(e) => setBloodType(e.target.value)}
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
                          if (e.target.checked) setAllergies("");
                        }}
                        className="h-3.5 w-3.5 rounded accent-emerald-600"
                      />
                      None (NKA)
                    </label>
                  </div>
                  {!noKnownAllergies && (
                    <Input
                      placeholder="e.g. Penicillin, Aspirin, Ibuprofen"
                      value={allergies}
                      onChange={(e) => setAllergies(e.target.value)}
                      className="rounded-xl text-xs h-9 bg-white"
                    />
                  )}
                </div>

                <div className="space-y-1">
                  <Label className="text-xs">Pre-existing Medical Conditions (Optional)</Label>
                  <Input
                    placeholder="e.g. Asthma, Hypertension (leave blank if none)"
                    value={medicalConditions}
                    onChange={(e) => setMedicalConditions(e.target.value)}
                    className="rounded-xl text-xs h-9"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2.5">
                  <div className="space-y-1">
                    <Label className="text-xs">Emergency Contact (Optional)</Label>
                    <Input
                      placeholder="Name & relation"
                      value={emergencyContactName}
                      onChange={(e) => setEmergencyContactName(e.target.value)}
                      className="rounded-xl text-xs h-9"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Emergency Phone</Label>
                    <Input
                      type="tel"
                      placeholder="09XX XXX XXXX"
                      value={emergencyContactPhone}
                      onChange={(e) => setEmergencyContactPhone(e.target.value)}
                      className="rounded-xl text-xs h-9"
                    />
                  </div>
                </div>

                <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50/70 p-3">
                  <div className="flex items-center gap-1.5">
                    <Lock className="h-3.5 w-3.5 text-emerald-600" />
                    <Label className="text-xs font-bold text-slate-700">
                      Create a Portal Password (Optional)
                    </Label>
                  </div>
                  <p className="text-[11px] text-slate-500 leading-snug">
                    Set a password now if you also want to sign in using your Email or CSU ID
                    without Google.
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <div className="relative">
                      <Input
                        type={showPortalPassword ? "text" : "password"}
                        placeholder="Min 8 chars, 1 upper, 1 num"
                        value={portalPassword}
                        onChange={(e) => setPortalPassword(e.target.value)}
                        className="rounded-xl text-xs h-9 bg-white pr-8"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPortalPassword((v) => !v)}
                        className="absolute right-2.5 top-2 text-slate-400 hover:text-slate-700 cursor-pointer"
                      >
                        {showPortalPassword ? (
                          <EyeOff className="h-4 w-4" />
                        ) : (
                          <Eye className="h-4 w-4" />
                        )}
                      </button>
                    </div>
                    <Input
                      type={showPortalPassword ? "text" : "password"}
                      placeholder="Confirm password"
                      value={confirmPortalPassword}
                      onChange={(e) => setConfirmPortalPassword(e.target.value)}
                      className="rounded-xl text-xs h-9 bg-white"
                    />
                  </div>
                  {portalPassword.length > 0 && (
                    <div className="flex items-center justify-between text-[10px]">
                      <span className="text-slate-500">Strength: {portalPwdStrength.label}</span>
                      {confirmPortalPassword.length > 0 && (
                        <span
                          className={
                            portalPassword === confirmPortalPassword
                              ? "font-bold text-emerald-700"
                              : "font-bold text-red-600"
                          }
                        >
                          {portalPassword === confirmPortalPassword
                            ? "Passwords match"
                            : "Passwords do not match"}
                        </span>
                      )}
                    </div>
                  )}
                </div>

                <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-2.5">
                  <label className="flex items-start gap-2 text-[11px] leading-relaxed text-slate-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={privacyConsent}
                      onChange={(e) => setPrivacyConsent(e.target.checked)}
                      className="mt-0.5 h-3.5 w-3.5 shrink-0 rounded accent-emerald-600"
                    />
                    <span>
                      I consent to the processing of my personal and clinical information by
                      the <strong>CSU Health Services Infirmary</strong> under{" "}
                      <strong>RA 10173 (Data Privacy Act of 2012)</strong>.{" "}
                      <button
                        type="button"
                        onClick={() => setShowPrivacyModal(true)}
                        className="font-bold text-emerald-700 underline cursor-pointer"
                      >
                        Read Notice
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
                      setStep(1);
                    }}
                    className="h-11 rounded-xl border-slate-200 text-slate-700 font-bold text-xs cursor-pointer"
                  >
                    <ArrowLeft className="mr-1 h-3.5 w-3.5" />
                    Back
                  </Button>
                  <Button
                    type="submit"
                    disabled={loading || !privacyConsent}
                    className="flex-1 h-11 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-md shadow-emerald-600/20 cursor-pointer"
                  >
                    {loading ? "Saving CSU Profile..." : "Continue to Health Portal"}
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </div>
              </form>
            )}
          </CardContent>
        </Card>
      </div>

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
                Your personal and clinical intake data is collected strictly for Caraga State
                University Health Services Infirmary care, prescription safety screening, and
                medication adherence tracking.
              </p>
              <p>
                Access is restricted to you and authorized CSU doctors and health staff. You
                may update your contact, allergy, and emergency records anytime in your
                Profile.
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
