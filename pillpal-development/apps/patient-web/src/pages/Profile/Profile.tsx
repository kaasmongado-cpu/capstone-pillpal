import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ShieldCheck,
  PhoneCall,
  HeartPulse,
  LogOut,
  Pencil,
  Save,
  X,
  CheckCircle2,
  AlertCircle,
  Printer,
  KeyRound,
  Eye,
  EyeOff,
  Mail,
} from "lucide-react";
import { fetchWithAuth } from "@/lib/api";
import {
  resetPasswordWithOtp,
  sendVerificationOtp,
  setInitialPassword,
  signOut,
  updatePassword,
} from "@pillpal/auth";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  BLOOD_TYPES,
  GENDER_OPTIONS,
  evaluatePasswordStrength,
  getTodayIsoDate,
  isValidPhPhone,
} from "@/lib/registration";

const NKA_VALUE = "No Known Drug Allergies (NKA)";

function isNkaText(raw?: string | null): boolean {
  const value = (raw || "").trim();
  return !value || /^(none|none recorded|n\/a|nka|no known|no known drug allergies)/i.test(value);
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function Profile() {
  const navigate = useNavigate();
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [saveSuccess, setSaveSuccess] = useState("");
  const [isNka, setIsNka] = useState(true);
  const [editForm, setEditForm] = useState({
    dateOfBirth: "",
    gender: "",
    phone: "",
    bloodType: "",
    allergies: "",
    medicalConditions: "",
    emergencyContactName: "",
    emergencyContactPhone: "",
  });

  // Change Password State
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [pwdLoading, setPwdLoading] = useState(false);
  const [pwdError, setPwdError] = useState("");
  const [pwdSuccess, setPwdSuccess] = useState("");

  // Email OTP Fallback State (works for forgotten passwords or Google-only accounts)
  const [showOtpReset, setShowOtpReset] = useState(false);
  const [otpSent, setOtpSent] = useState(false);
  const [otpCode, setOtpCode] = useState("");
  const [otpNewPassword, setOtpNewPassword] = useState("");
  const [otpLoading, setOtpLoading] = useState(false);
  const [otpCooldown, setOtpCooldown] = useState(0);

  const pwdStrength = evaluatePasswordStrength(newPassword);
  const otpPwdStrength = evaluatePasswordStrength(otpNewPassword);

  useEffect(() => {
    if (otpCooldown <= 0) return;
    const timer = setTimeout(() => setOtpCooldown((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [otpCooldown]);

  function syncEditForm(data: any) {
    const p = data?.patientProfile;
    const dob = p?.dateOfBirth ? new Date(p.dateOfBirth).toISOString().slice(0, 10) : "";
    const allergyVal = p?.allergies || "";
    const nka = isNkaText(allergyVal);
    setIsNka(nka);
    setEditForm({
      dateOfBirth: dob,
      gender: p?.gender || "",
      phone: data?.phone || "",
      bloodType: p?.bloodType || "",
      allergies: nka ? NKA_VALUE : allergyVal,
      medicalConditions: p?.medicalConditions || "",
      emergencyContactName: p?.emergencyContactName || "",
      emergencyContactPhone: p?.emergencyContactPhone || "",
    });
  }

  async function loadProfile() {
    setLoading(true);
    try {
      const res = await fetchWithAuth("/me");
      if (res.ok) {
        const data = await res.json();
        setProfile(data);
        syncEditForm(data);
      }
    } catch (err) {
      console.error("Failed to load profile:", err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadProfile();
  }, []);

  async function handleSaveProfile(e: React.FormEvent) {
    e.preventDefault();
    setSaveError("");
    setSaveSuccess("");

    if (editForm.phone.trim() && !isValidPhPhone(editForm.phone)) {
      setSaveError("Please enter a valid Philippine mobile number (e.g. 0912 345 6789).");
      return;
    }

    if (
      editForm.emergencyContactPhone.trim() &&
      !isValidPhPhone(editForm.emergencyContactPhone)
    ) {
      setSaveError("Please enter a valid mobile number for your emergency contact.");
      return;
    }

    if (!isNka && !editForm.allergies.trim()) {
      setSaveError("Please specify your drug allergies or toggle No Known Drug Allergies (NKA).");
      return;
    }

    setSaving(true);
    try {
      const payload = {
        ...editForm,
        allergies: isNka ? NKA_VALUE : editForm.allergies.trim(),
      };
      const res = await fetchWithAuth("/me/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const body = await res.json();
      if (!res.ok) {
        throw new Error(body?.message || "Failed to update profile.");
      }

      setProfile(body);
      syncEditForm(body);
      setEditing(false);
      setSaveSuccess("Profile details updated and synced across your CSU Health Card.");
      window.dispatchEvent(new Event("pillpal:profile-updated"));
    } catch (err: any) {
      setSaveError(err?.message || "Unable to save profile updates.");
    } finally {
      setSaving(false);
    }
  }

  const hasPortalPassword = profile?.hasPassword !== false;

  async function handleSetInitialPassword(e: React.FormEvent) {
    e.preventDefault();
    setPwdError("");
    setPwdSuccess("");

    if (!pwdStrength.isValid) {
      setPwdError(
        "Password must be at least 8 characters with 1 uppercase letter and 1 number.",
      );
      return;
    }
    if (newPassword !== confirmPassword) {
      setPwdError("Passwords do not match.");
      return;
    }

    setPwdLoading(true);
    try {
      const { error } = await setInitialPassword(newPassword);
      if (error) {
        setPwdError(error.message || "Unable to create portal password.");
        return;
      }
      setNewPassword("");
      setConfirmPassword("");
      setProfile((prev: any) => (prev ? { ...prev, hasPassword: true } : prev));
      setPwdSuccess(
        "Portal password created! You can now sign in with Google or your Email / CSU ID and password.",
      );
    } catch {
      setPwdError("Unable to create portal password right now.");
    } finally {
      setPwdLoading(false);
    }
  }

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    setPwdError("");
    setPwdSuccess("");

    if (!currentPassword) {
      setPwdError("Please enter your current password.");
      return;
    }
    if (!pwdStrength.isValid) {
      setPwdError(
        "New password must be at least 8 characters with 1 uppercase letter and 1 number.",
      );
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
      setPwdError("Unable to update password right now.");
    } finally {
      setPwdLoading(false);
    }
  }

  async function handleSendOtpReset() {
    if (!profile?.email || otpCooldown > 0) return;
    setPwdError("");
    setPwdSuccess("");
    setOtpLoading(true);
    try {
      const { error } = await sendVerificationOtp(profile.email, "forget-password");
      if (error) {
        setPwdError(error.message || "Unable to send verification code.");
        return;
      }
      setShowOtpReset(true);
      setOtpSent(true);
      setOtpCooldown(60);
      setPwdSuccess(`A 6-digit verification code was sent to ${profile.email}.`);
    } catch {
      setPwdError("Unable to send verification code.");
    } finally {
      setOtpLoading(false);
    }
  }

  async function handleCompleteOtpReset(e: React.FormEvent) {
    e.preventDefault();
    setPwdError("");
    setPwdSuccess("");

    if (otpCode.trim().length < 6) {
      setPwdError("Please enter the 6-digit code sent to your email.");
      return;
    }
    if (!otpPwdStrength.isValid) {
      setPwdError("Password must be at least 8 characters with 1 uppercase letter and 1 number.");
      return;
    }

    setOtpLoading(true);
    try {
      const { error } = await resetPasswordWithOtp(
        profile.email,
        otpCode.trim(),
        otpNewPassword,
      );
      if (error) {
        setPwdError(error.message || "Invalid or expired code.");
        return;
      }
      setOtpCode("");
      setOtpNewPassword("");
      setShowOtpReset(false);
      setOtpSent(false);
      setPwdSuccess("Password reset complete! You can now sign in with your new password.");
    } catch {
      setPwdError("Unable to reset password right now.");
    } finally {
      setOtpLoading(false);
    }
  }

  function handlePrintHealthId() {
    const patient = profile?.patientProfile;
    const fullName = profile ? `${profile.firstName} ${profile.lastName}`.trim() : "CSU Patient";
    const win = window.open("", "_blank", "width=560,height=440");
    if (!win) return;

    win.document.write(`
      <!doctype html>
      <html>
        <head>
          <title>CSU Digital Health ID — ${escapeHtml(fullName)}</title>
          <style>
            body { font-family: system-ui, -apple-system, sans-serif; padding: 24px; background: #f8fafc; color: #0f172a; }
            .card { max-width: 440px; margin: 0 auto; border: 2px solid #059669; border-radius: 16px; overflow: hidden; background: #ffffff; }
            .top { background: #065f46; color: #ffffff; padding: 14px 18px; display: flex; justify-content: space-between; align-items: center; }
            .top h1 { margin: 0; font-size: 13px; letter-spacing: 0.04em; }
            .top span { font-size: 10px; background: rgba(255,255,255,0.2); padding: 3px 8px; border-radius: 6px; font-weight: 800; }
            .body { padding: 16px 18px; font-size: 12px; }
            .name { font-size: 18px; font-weight: 900; margin: 0 0 2px; }
            .id { font-family: monospace; font-weight: 700; color: #047857; margin: 0 0 8px; }
            .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; border-top: 1px solid #e2e8f0; padding-top: 10px; margin-top: 10px; }
            .lbl { font-size: 9px; text-transform: uppercase; color: #64748b; font-weight: 700; }
            .val { font-weight: 800; margin-top: 1px; }
            .allergy { color: ${isNkaText(patient?.allergies) ? "#047857" : "#dc2626"}; }
            .foot { background: #ecfdf5; padding: 10px 18px; font-size: 10px; color: #065f46; font-weight: 700; border-top: 1px solid #a7f3d0; }
          </style>
        </head>
        <body>
          <div class="card">
            <div class="top">
              <h1>CARAGA STATE UNIVERSITY • HEALTH ID</h1>
              <span>${escapeHtml(profile?.userType || "STUDENT")}</span>
            </div>
            <div class="body">
              <div class="name">${escapeHtml(fullName)}</div>
              <div class="id">ID: ${escapeHtml(patient?.idNumber || "Not set")} • ${escapeHtml(patient?.department || "Not set")}</div>
              <div class="grid">
                <div><div class="lbl">Blood Type</div><div class="val">${escapeHtml(patient?.bloodType || "Not set")}</div></div>
                <div><div class="lbl">Sex / DOB</div><div class="val">${escapeHtml(patient?.gender || "—")} • ${escapeHtml(formattedDob)}</div></div>
                <div style="grid-column: span 2;"><div class="lbl">Known Drug Allergies</div><div class="val allergy">${escapeHtml(patient?.allergies || NKA_VALUE)}</div></div>
                <div style="grid-column: span 2;"><div class="lbl">Emergency Contact</div><div class="val">${escapeHtml(patient?.emergencyContactName || "Not set")} ${patient?.emergencyContactPhone ? `(${escapeHtml(patient.emergencyContactPhone)})` : ""}</div></div>
              </div>
            </div>
            <div class="foot">CSU Health Services Infirmary Emergency Hotline: (085) 341-2786</div>
          </div>
        </body>
      </html>
    `);
    win.document.close();
    win.focus();
    win.print();
  }

  async function handleLogout() {
    await signOut();
    navigate("/login");
  }

  const patient = profile?.patientProfile;
  const fullName = profile
    ? `${profile.firstName} ${profile.lastName}`.trim()
    : "CSU Patient";
  const formattedDob = patient?.dateOfBirth
    ? new Date(patient.dateOfBirth).toLocaleDateString("en-PH", {
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    : "Not set";
  const allergyIsSafe = isNkaText(patient?.allergies);

  if (loading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-12 w-72 rounded-xl bg-slate-200/70" />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="h-80 rounded-3xl bg-slate-200/70" />
          <div className="lg:col-span-2 h-80 rounded-3xl bg-white border border-slate-200/80" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Title */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-slate-900">
            Patient Profile &amp; Health ID
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Your official Caraga State University student/employee digital medical identity card.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handlePrintHealthId}
            className="rounded-xl text-xs font-bold gap-1.5 cursor-pointer"
          >
            <Printer className="h-3.5 w-3.5" />
            Print Health ID
          </Button>
          {!editing && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setSaveError("");
                setSaveSuccess("");
                syncEditForm(profile);
                setEditing(true);
              }}
              className="rounded-xl text-xs font-bold gap-1.5 cursor-pointer"
            >
              <Pencil className="h-3.5 w-3.5" />
              Edit Contact &amp; Health Info
            </Button>
          )}
        </div>
      </div>

      {saveSuccess && (
        <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-3 text-xs font-semibold text-emerald-800 flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
          <span>{saveSuccess}</span>
        </div>
      )}

      {saveError && (
        <div className="rounded-xl bg-red-50 border border-red-200 p-3 text-xs font-semibold text-red-700 flex items-center gap-2">
          <AlertCircle className="h-4 w-4 text-red-600 shrink-0" />
          <span>{saveError}</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Digital Health Card */}
        <Card className="lg:col-span-1 rounded-3xl border border-emerald-200/80 bg-gradient-to-br from-emerald-600 to-teal-700 text-white p-6 shadow-xl flex flex-col justify-between space-y-6 relative overflow-hidden">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <HeartPulse className="h-6 w-6 text-emerald-200" />
                <span className="font-black tracking-wider text-sm">CSU HEALTH ID</span>
              </div>
              <span className="rounded-md bg-white/20 px-2 py-0.5 text-[10px] font-black uppercase text-white backdrop-blur-xs">
                {profile?.userType || "STUDENT"}
              </span>
            </div>

            <div className="pt-2">
              <p className="text-xs text-emerald-200 uppercase font-bold">Patient Name</p>
              <h3 className="text-xl font-black text-white">{fullName}</h3>
              <p className="font-mono text-sm text-emerald-100 font-bold mt-0.5">
                ID: {patient?.idNumber || "Not set"}
              </p>
              <p className="text-xs text-emerald-100 font-medium">
                {patient?.department || "Not set"}
              </p>
            </div>
          </div>

          <div className="pt-4 border-t border-emerald-500/60 space-y-2 text-xs">
            <div className="flex justify-between">
              <span className="text-emerald-200">Date of Birth:</span>
              <span className="font-bold text-white">{formattedDob}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-emerald-200">Sex:</span>
              <span className="font-bold text-white">{patient?.gender || "Not set"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-emerald-200">Blood Type:</span>
              <span className="font-black text-white">{patient?.bloodType || "Not set"}</span>
            </div>
            <div className="flex justify-between gap-2">
              <span className="text-emerald-200 shrink-0">Known Allergies:</span>
              <span
                className={`font-bold truncate max-w-[160px] ${
                  allergyIsSafe ? "text-emerald-100" : "text-amber-200"
                }`}
              >
                {patient?.allergies || NKA_VALUE}
              </span>
            </div>
          </div>
        </Card>

        {/* Right: Detailed Medical & Contact Information (or Edit Form) + Account Security */}
        <div className="lg:col-span-2 space-y-5">
          {editing ? (
            <Card className="rounded-3xl border border-slate-200/80 bg-white p-6 shadow-xs">
              <form onSubmit={handleSaveProfile} className="space-y-4">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <h3 className="text-sm font-black text-slate-900">
                    Update Contact &amp; Clinical Information
                  </h3>
                  <button
                    type="button"
                    onClick={() => setEditing(false)}
                    className="text-slate-400 hover:text-slate-700 cursor-pointer"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <Label className="text-xs">Date of Birth</Label>
                    <Input
                      type="date"
                      max={getTodayIsoDate()}
                      value={editForm.dateOfBirth}
                      onChange={(e) =>
                        setEditForm({ ...editForm, dateOfBirth: e.target.value })
                      }
                      className="rounded-xl text-xs h-9"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Sex</Label>
                    <select
                      value={editForm.gender}
                      onChange={(e) => setEditForm({ ...editForm, gender: e.target.value })}
                      className="w-full h-9 rounded-xl border border-slate-200 px-2.5 text-xs bg-white text-slate-800"
                    >
                      <option value="">Select Sex</option>
                      {GENDER_OPTIONS.map((g) => (
                        <option key={g} value={g}>
                          {g}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Mobile Number</Label>
                    <Input
                      type="tel"
                      placeholder="0912 345 6789"
                      value={editForm.phone}
                      onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
                      className="rounded-xl text-xs h-9"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Blood Type</Label>
                    <select
                      value={editForm.bloodType}
                      onChange={(e) => setEditForm({ ...editForm, bloodType: e.target.value })}
                      className="w-full h-9 rounded-xl border border-slate-200 px-2.5 text-xs bg-white text-slate-800"
                    >
                      <option value="">Select Blood Type</option>
                      {BLOOD_TYPES.map((bt) => (
                        <option key={bt} value={bt}>
                          {bt}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Explicit NKA Toggle + Drug Allergies */}
                  <div className="space-y-2 sm:col-span-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <Label className="text-xs">Known Drug Allergies</Label>
                      <label className="inline-flex items-center gap-1.5 text-[11px] font-bold text-emerald-700 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={isNka}
                          onChange={(e) => {
                            const checked = e.target.checked;
                            setIsNka(checked);
                            setEditForm({
                              ...editForm,
                              allergies: checked ? NKA_VALUE : "",
                            });
                          }}
                          className="h-3.5 w-3.5 accent-emerald-600 rounded"
                        />
                        No Known Drug Allergies (NKA)
                      </label>
                    </div>
                    <Input
                      disabled={isNka}
                      placeholder="e.g. Penicillin, Aspirin, Ibuprofen"
                      value={isNka ? NKA_VALUE : editForm.allergies}
                      onChange={(e) => setEditForm({ ...editForm, allergies: e.target.value })}
                      className="rounded-xl text-xs h-9 disabled:bg-emerald-50/50 disabled:text-emerald-800"
                    />
                  </div>

                  <div className="space-y-1 sm:col-span-2">
                    <Label className="text-xs">Chronic Medical Conditions</Label>
                    <Input
                      placeholder="e.g. Asthma, Hypertension (leave blank if none)"
                      value={editForm.medicalConditions}
                      onChange={(e) =>
                        setEditForm({ ...editForm, medicalConditions: e.target.value })
                      }
                      className="rounded-xl text-xs h-9"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Emergency Contact Name &amp; Relation</Label>
                    <Input
                      placeholder="e.g. Elena Reyes (Mother)"
                      value={editForm.emergencyContactName}
                      onChange={(e) =>
                        setEditForm({
                          ...editForm,
                          emergencyContactName: e.target.value,
                        })
                      }
                      className="rounded-xl text-xs h-9"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Emergency Contact Phone</Label>
                    <Input
                      type="tel"
                      placeholder="09XX XXX XXXX"
                      value={editForm.emergencyContactPhone}
                      onChange={(e) =>
                        setEditForm({
                          ...editForm,
                          emergencyContactPhone: e.target.value,
                        })
                      }
                      className="rounded-xl text-xs h-9"
                    />
                  </div>
                </div>

                <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={saving}
                    onClick={() => setEditing(false)}
                    className="rounded-xl text-xs font-bold cursor-pointer"
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    size="sm"
                    disabled={saving}
                    className="rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold gap-1.5 cursor-pointer"
                  >
                    <Save className="h-3.5 w-3.5" />
                    {saving ? "Saving..." : "Save Changes"}
                  </Button>
                </div>
              </form>
            </Card>
          ) : (
            <>
              {/* Medical Safety Profile */}
              <Card className="rounded-3xl border border-slate-200/80 bg-white p-6 shadow-xs space-y-4">
                <div className="flex items-center gap-2.5 border-b border-slate-100 pb-3">
                  <ShieldCheck className="h-5 w-5 text-emerald-600" />
                  <h3 className="text-sm font-black text-slate-900">Clinical Safety Records</h3>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                  <div className="rounded-2xl bg-slate-50 p-3.5 border border-slate-100 space-y-1">
                    <span className="text-[10px] font-bold uppercase text-slate-400">
                      Known Drug Allergies
                    </span>
                    <p
                      className={`font-bold text-sm ${
                        allergyIsSafe ? "text-emerald-700" : "text-red-600"
                      }`}
                    >
                      {patient?.allergies || NKA_VALUE}
                    </p>
                  </div>

                  <div className="rounded-2xl bg-slate-50 p-3.5 border border-slate-100 space-y-1">
                    <span className="text-[10px] font-bold uppercase text-slate-400">
                      Chronic Medical Conditions
                    </span>
                    <p className="font-bold text-slate-800 text-sm">
                      {patient?.medicalConditions || "None recorded"}
                    </p>
                  </div>
                </div>
              </Card>

              {/* Contact & Emergency Details */}
              <Card className="rounded-3xl border border-slate-200/80 bg-white p-6 shadow-xs space-y-4">
                <div className="flex items-center gap-2.5 border-b border-slate-100 pb-3">
                  <PhoneCall className="h-5 w-5 text-emerald-600" />
                  <h3 className="text-sm font-black text-slate-900">
                    Contact &amp; Emergency Person
                  </h3>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                  <div className="space-y-1">
                    <span className="text-[10px] font-bold uppercase text-slate-400">
                      Registered Email
                    </span>
                    <p className="font-semibold text-slate-900">
                      {profile?.email || "Not set"}
                    </p>
                  </div>

                  <div className="space-y-1">
                    <span className="text-[10px] font-bold uppercase text-slate-400">
                      Mobile Phone
                    </span>
                    <p className="font-semibold text-slate-900">
                      {profile?.phone || "Not set"}
                    </p>
                  </div>

                  <div className="space-y-1">
                    <span className="text-[10px] font-bold uppercase text-slate-400">
                      Emergency Contact Person
                    </span>
                    <p className="font-semibold text-slate-900">
                      {patient?.emergencyContactName || "Not set"}
                    </p>
                  </div>

                  <div className="space-y-1">
                    <span className="text-[10px] font-bold uppercase text-slate-400">
                      Emergency Contact Phone
                    </span>
                    <p className="font-semibold text-slate-900">
                      {patient?.emergencyContactPhone || "Not set"}
                    </p>
                  </div>

                  <div className="space-y-1 sm:col-span-2">
                    <span className="text-[10px] font-bold uppercase text-slate-400">
                      CSU Health Infirmary Hotline
                    </span>
                    <p className="font-bold text-emerald-700">
                      (085) 341-2786 • clinic@carsu.edu.ph
                    </p>
                  </div>
                </div>

                <div className="pt-4 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs text-slate-400">
                    {patient?.privacyConsentAt
                      ? `RA 10173 Privacy Consent recorded on ${new Date(
                          patient.privacyConsentAt,
                        ).toLocaleDateString("en-PH")}`
                      : "To update CSU ID or college, visit the CSU Clinic."}
                  </span>

                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={handleLogout}
                    className="rounded-xl text-xs font-bold gap-1.5 cursor-pointer"
                  >
                    <LogOut className="h-4 w-4" />
                    Sign Out
                  </Button>
                </div>
              </Card>

              {/* Account Security Card */}
              <Card className="rounded-3xl border border-slate-200/80 bg-white p-6 shadow-xs space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
                  <div className="flex items-center gap-2.5">
                    <KeyRound className="h-5 w-5 text-emerald-600" />
                    <div>
                      <h3 className="text-sm font-black text-slate-900">Account Security</h3>
                      <p className="text-[11px] text-slate-400">
                        {hasPortalPassword
                          ? "Update your portal password or reset via email verification code."
                          : "Create a portal password to also sign in with your Email or CSU ID."}
                      </p>
                    </div>
                  </div>
                  {hasPortalPassword && (
                    <button
                      type="button"
                      onClick={() => {
                        setPwdError("");
                        setPwdSuccess("");
                        setShowOtpReset((prev) => !prev);
                      }}
                      className="text-xs font-bold text-emerald-700 hover:underline cursor-pointer"
                    >
                      {showOtpReset ? "Use Current Password" : "Reset via Email OTP"}
                    </button>
                  )}
                </div>

                {pwdSuccess && (
                  <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-3 text-xs font-semibold text-emerald-800 flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                    <span>{pwdSuccess}</span>
                  </div>
                )}

                {pwdError && (
                  <div className="rounded-xl bg-red-50 border border-red-200 p-3 text-xs font-semibold text-red-700 flex items-center gap-2">
                    <AlertCircle className="h-4 w-4 text-red-600 shrink-0" />
                    <span>{pwdError}</span>
                  </div>
                )}

                {!hasPortalPassword ? (
                  <form onSubmit={handleSetInitialPassword} className="space-y-3 text-xs">
                    <div className="rounded-xl bg-sky-50 border border-sky-200 p-3 text-xs text-sky-900">
                      You registered with <strong>Google</strong> and haven&apos;t created a
                      PILLPAL password yet. Set one below so you can sign in with either Google
                      or your Email / CSU ID.
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <Label className="text-xs">Create Portal Password</Label>
                        <div className="relative">
                          <Input
                            type={showNew ? "text" : "password"}
                            value={newPassword}
                            onChange={(e) => setNewPassword(e.target.value)}
                            placeholder="Min. 8 chars, 1 uppercase, 1 number"
                            className="rounded-xl text-xs h-9 pr-9"
                          />
                          <button
                            type="button"
                            onClick={() => setShowNew((v) => !v)}
                            className="absolute right-2.5 top-2 text-slate-400 hover:text-slate-700 cursor-pointer"
                          >
                            {showNew ? (
                              <EyeOff className="h-4 w-4" />
                            ) : (
                              <Eye className="h-4 w-4" />
                            )}
                          </button>
                        </div>
                      </div>

                      <div className="space-y-1">
                        <Label className="text-xs">Confirm Password</Label>
                        <div className="relative">
                          <Input
                            type={showConfirm ? "text" : "password"}
                            value={confirmPassword}
                            onChange={(e) => setConfirmPassword(e.target.value)}
                            placeholder="Re-enter password"
                            className="rounded-xl text-xs h-9 pr-9"
                          />
                          <button
                            type="button"
                            onClick={() => setShowConfirm((v) => !v)}
                            className="absolute right-2.5 top-2 text-slate-400 hover:text-slate-700 cursor-pointer"
                          >
                            {showConfirm ? (
                              <EyeOff className="h-4 w-4" />
                            ) : (
                              <Eye className="h-4 w-4" />
                            )}
                          </button>
                        </div>
                      </div>
                    </div>

                    {newPassword.length > 0 && (
                      <div className="space-y-1">
                        <div className="flex items-center justify-between text-[10px]">
                          <span className="text-slate-500">Password Strength</span>
                          <span className="font-bold text-emerald-700">{pwdStrength.label}</span>
                        </div>
                        <div className="h-1.5 w-full rounded-full bg-slate-100 overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${
                              pwdStrength.score >= 3
                                ? "bg-emerald-500"
                                : pwdStrength.score === 2
                                  ? "bg-amber-500"
                                  : "bg-red-500"
                            }`}
                            style={{ width: `${(pwdStrength.score / 4) * 100}%` }}
                          />
                        </div>
                      </div>
                    )}

                    <div className="flex justify-end pt-1">
                      <Button
                        type="submit"
                        size="sm"
                        disabled={pwdLoading}
                        className="rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold cursor-pointer"
                      >
                        {pwdLoading ? "Saving..." : "Create Portal Password"}
                      </Button>
                    </div>
                  </form>
                ) : !showOtpReset ? (
                  <form onSubmit={handleChangePassword} className="space-y-3 text-xs">
                    <div className="space-y-1">
                      <Label className="text-xs">Current Password</Label>
                      <div className="relative">
                        <Input
                          type={showCurrent ? "text" : "password"}
                          value={currentPassword}
                          onChange={(e) => setCurrentPassword(e.target.value)}
                          placeholder="Enter current password"
                          className="rounded-xl text-xs h-9 pr-9"
                        />
                        <button
                          type="button"
                          onClick={() => setShowCurrent((v) => !v)}
                          className="absolute right-2.5 top-2 text-slate-400 hover:text-slate-700 cursor-pointer"
                        >
                          {showCurrent ? (
                            <EyeOff className="h-4 w-4" />
                          ) : (
                            <Eye className="h-4 w-4" />
                          )}
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <Label className="text-xs">New Password</Label>
                        <div className="relative">
                          <Input
                            type={showNew ? "text" : "password"}
                            value={newPassword}
                            onChange={(e) => setNewPassword(e.target.value)}
                            placeholder="Min. 8 chars, 1 uppercase, 1 number"
                            className="rounded-xl text-xs h-9 pr-9"
                          />
                          <button
                            type="button"
                            onClick={() => setShowNew((v) => !v)}
                            className="absolute right-2.5 top-2 text-slate-400 hover:text-slate-700 cursor-pointer"
                          >
                            {showNew ? (
                              <EyeOff className="h-4 w-4" />
                            ) : (
                              <Eye className="h-4 w-4" />
                            )}
                          </button>
                        </div>
                      </div>

                      <div className="space-y-1">
                        <Label className="text-xs">Confirm New Password</Label>
                        <div className="relative">
                          <Input
                            type={showConfirm ? "text" : "password"}
                            value={confirmPassword}
                            onChange={(e) => setConfirmPassword(e.target.value)}
                            placeholder="Re-enter new password"
                            className="rounded-xl text-xs h-9 pr-9"
                          />
                          <button
                            type="button"
                            onClick={() => setShowConfirm((v) => !v)}
                            className="absolute right-2.5 top-2 text-slate-400 hover:text-slate-700 cursor-pointer"
                          >
                            {showConfirm ? (
                              <EyeOff className="h-4 w-4" />
                            ) : (
                              <Eye className="h-4 w-4" />
                            )}
                          </button>
                        </div>
                      </div>
                    </div>

                    {newPassword.length > 0 && (
                      <div className="space-y-1">
                        <div className="flex items-center justify-between text-[10px]">
                          <span className="text-slate-500">Password Strength</span>
                          <span className="font-bold text-emerald-700">{pwdStrength.label}</span>
                        </div>
                        <div className="h-1.5 w-full rounded-full bg-slate-100 overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${
                              pwdStrength.score >= 3
                                ? "bg-emerald-500"
                                : pwdStrength.score === 2
                                  ? "bg-amber-500"
                                  : "bg-red-500"
                            }`}
                            style={{ width: `${(pwdStrength.score / 4) * 100}%` }}
                          />
                        </div>
                      </div>
                    )}

                    <div className="flex justify-end pt-1">
                      <Button
                        type="submit"
                        size="sm"
                        disabled={pwdLoading}
                        className="rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold cursor-pointer"
                      >
                        {pwdLoading ? "Updating..." : "Update Password"}
                      </Button>
                    </div>
                  </form>
                ) : (
                  <div className="space-y-3 text-xs">
                    <p className="text-slate-500">
                      Send a 6-digit verification code to{" "}
                      <span className="font-bold text-slate-800">{profile?.email}</span> to reset
                      or set a portal password (also works for Google Sign-In accounts).
                    </p>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={otpLoading || otpCooldown > 0}
                      onClick={handleSendOtpReset}
                      className="rounded-xl text-xs font-bold gap-1.5 cursor-pointer"
                    >
                      <Mail className="h-3.5 w-3.5 text-emerald-600" />
                      {otpCooldown > 0
                        ? `Resend Code in ${otpCooldown}s`
                        : otpSent
                          ? "Resend Verification Code"
                          : "Send 6-Digit Email Code"}
                    </Button>

                    {otpSent && (
                      <form onSubmit={handleCompleteOtpReset} className="space-y-3 pt-2">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div className="space-y-1">
                            <Label className="text-xs">6-Digit Email Code</Label>
                            <Input
                              value={otpCode}
                              onChange={(e) => setOtpCode(e.target.value)}
                              placeholder="123456"
                              maxLength={6}
                              className="rounded-xl text-xs h-9 font-mono tracking-widest"
                            />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs">New Password</Label>
                            <Input
                              type="password"
                              value={otpNewPassword}
                              onChange={(e) => setOtpNewPassword(e.target.value)}
                              placeholder="Min. 8 chars, 1 uppercase, 1 number"
                              className="rounded-xl text-xs h-9"
                            />
                          </div>
                        </div>
                        <div className="flex justify-end">
                          <Button
                            type="submit"
                            size="sm"
                            disabled={otpLoading}
                            className="rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold cursor-pointer"
                          >
                            {otpLoading ? "Verifying..." : "Reset Password"}
                          </Button>
                        </div>
                      </form>
                    )}
                  </div>
                )}
              </Card>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
