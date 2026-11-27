import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Modal,
  Image,
} from "react-native";
import { useRouter } from "expo-router";
import {
  GraduationCap,
  Building,
  User,
  ShieldAlert,
  CheckCircle2,
  LogOut,
  ChevronDown,
  Calendar,
  Phone,
  Check,
  ArrowLeft,
  Lock,
  Eye,
  EyeOff,
} from "lucide-react-native";
import { completePatientProfile } from "@pillpal/auth";
import { fetchWithAuth } from "@/services/api/client";
import { saveCachedUser, clearAuthSession } from "@/services/auth/session";
import { clearLocalDatabase } from "@/services/db/database";
import {
  BLOOD_TYPES,
  CSU_COLLEGES,
  EMPLOYEE_UNITS,
  GENDER_OPTIONS,
  evaluatePasswordStrength,
  isValidCsuId,
  isValidIsoDate,
  isValidPhPhone,
} from "@/constants/registration";

export default function CompleteProfileScreen() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [step, setStep] = useState<1 | 2>(1);
  const [email, setEmail] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [userType, setUserType] = useState<"" | "STUDENT" | "EMPLOYEE">("");
  const [idNumber, setIdNumber] = useState("");
  const [department, setDepartment] = useState("");
  const [showCollegePicker, setShowCollegePicker] = useState(false);

  // Step 2 Clinical Intake
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [gender, setGender] = useState("");
  const [showGenderPicker, setShowGenderPicker] = useState(false);
  const [phone, setPhone] = useState("");
  const [bloodType, setBloodType] = useState("");
  const [showBloodTypePicker, setShowBloodTypePicker] = useState(false);
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
  const [error, setError] = useState<string | null>(null);

  const availableUnits = userType === "EMPLOYEE" ? EMPLOYEE_UNITS : CSU_COLLEGES;

  useEffect(() => {
    async function loadMe() {
      try {
        const res = await fetchWithAuth("/me");
        if (!res.ok) {
          router.replace("/login");
          return;
        }
        const me = await res.json();
        if (me.patientProfile) {
          await saveCachedUser({
            id: me.id,
            email: me.email,
            firstName: me.firstName,
            lastName: me.lastName,
            idNumber: me.patientProfile.idNumber,
            department: me.patientProfile.department,
            bloodType: me.patientProfile.bloodType || "",
            allergies: me.patientProfile.allergies || "",
            role: me.role,
          });
          router.replace("/(tabs)");
          return;
        }
        setEmail(me.email || "");
        setFirstName(me.firstName || "");
        setLastName(me.lastName || "");
      } catch {
        router.replace("/login");
      } finally {
        setChecking(false);
      }
    }
    void loadMe();
  }, [router]);

  function handleNextStep() {
    setError(null);
    if (!firstName.trim() || !lastName.trim()) {
      setError("Please enter your first and last name.");
      return;
    }
    if (!userType) {
      setError("Please select your account type (Student or Employee).");
      return;
    }
    if (!isValidCsuId(idNumber)) {
      setError("Invalid CSU ID Number format. Example: 221-00675 or 2022-04912.");
      return;
    }
    if (!department.trim()) {
      setError("Please select your college or university unit.");
      return;
    }
    setStep(2);
  }

  async function handleSave() {
    setError(null);

    if (!isValidIsoDate(dateOfBirth)) {
      setError("Please enter your Date of Birth in YYYY-MM-DD format (e.g. 2003-05-14).");
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
        "Please list your known drug allergies or select 'No Known Drug Allergies (NKA)'.",
      );
      return;
    }
    if (emergencyContactPhone.trim() && !isValidPhPhone(emergencyContactPhone)) {
      setError("Please enter a valid mobile number for your emergency contact.");
      return;
    }
    if (portalPassword.length > 0) {
      if (!evaluatePasswordStrength(portalPassword).isValid) {
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
      setError("Please consent to the CSU Data Privacy Notice (RA 10173) to continue.");
      return;
    }

    const resolvedAllergies = noKnownAllergies
      ? "No Known Drug Allergies (NKA)"
      : allergies.trim();

    setLoading(true);
    try {
      const { user, error: saveErr } = await completePatientProfile({
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        idNumber: idNumber.trim(),
        department: department.trim(),
        userType: userType || "STUDENT",
        dateOfBirth: dateOfBirth.trim(),
        gender,
        phone: phone.trim(),
        bloodType: bloodType.trim() || undefined,
        allergies: resolvedAllergies,
        medicalConditions: medicalConditions.trim() || undefined,
        emergencyContactName: emergencyContactName.trim() || undefined,
        emergencyContactPhone: emergencyContactPhone.trim() || undefined,
        privacyConsent: true,
        password: portalPassword || undefined,
      });

      if (saveErr || !user) {
        setError(saveErr?.message || "Unable to save CSU health profile.");
        return;
      }

      await saveCachedUser({
        id: user.id,
        email: user.email,
        firstName: user.firstName || firstName.trim(),
        lastName: user.lastName || lastName.trim(),
        idNumber: user.patientProfile?.idNumber || idNumber.trim(),
        department: user.patientProfile?.department || department.trim(),
        bloodType: user.patientProfile?.bloodType || bloodType.trim(),
        allergies: user.patientProfile?.allergies || resolvedAllergies,
        role: user.role || "PATIENT",
      });

      router.replace("/(tabs)");
    } catch (err: any) {
      setError(err?.message || "Failed to complete CSU profile.");
    } finally {
      setLoading(false);
    }
  }

  if (checking) {
    return (
      <View style={[styles.container, { alignItems: "center", justifyContent: "center" }]}>
        <ActivityIndicator size="large" color="#10b981" />
        <Text style={{ marginTop: 12, fontSize: 13, color: "#64748b", fontWeight: "600" }}>
          Loading your Google profile...
        </Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <View
            style={[
              styles.iconCircle,
              { backgroundColor: "#ffffff", borderWidth: 1, borderColor: "#e2e8f0", padding: 6 },
            ]}
          >
            <Image
              source={require("../assets/pillpal-logo.png")}
              style={{ width: 48, height: 48 }}
              resizeMode="contain"
            />
          </View>
          <Text style={styles.title}>Complete Your CSU Profile</Text>
          <Text style={styles.subtitle}>
            Signed in with Google as {email}. Complete this one-time clinical intake to access
            clinic prescriptions.
          </Text>
        </View>

        <View style={styles.card}>
          <View style={styles.verifiedBanner}>
            <CheckCircle2 size={16} color="#059669" />
            <Text style={styles.verifiedBannerText}>Google Email Verified Automatically</Text>
          </View>

          <View style={styles.stepperRow}>
            <View style={[styles.stepPill, step === 1 ? styles.stepPillActive : styles.stepPillDone]}>
              <Text style={[styles.stepPillText, step === 1 ? styles.stepPillTextActive : styles.stepPillTextDone]}>
                1. CSU Identity
              </Text>
            </View>
            <View style={styles.stepConnector} />
            <View style={[styles.stepPill, step === 2 && styles.stepPillActive]}>
              <Text style={[styles.stepPillText, step === 2 && styles.stepPillTextActive]}>
                2. Health Intake
              </Text>
            </View>
          </View>

          {error && (
            <View style={styles.errorBox}>
              <ShieldAlert size={18} color="#dc2626" />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}

          {step === 1 ? (
            <>
              <View style={{ flexDirection: "row", gap: 10 }}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.label}>First Name *</Text>
                  <View style={styles.inputRow}>
                    <User size={16} color="#94a3b8" />
                    <TextInput
                      style={styles.input}
                      value={firstName}
                      onChangeText={setFirstName}
                      placeholder="First Name"
                      placeholderTextColor="#94a3b8"
                    />
                  </View>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.label}>Last Name *</Text>
                  <View style={styles.inputRow}>
                    <TextInput
                      style={styles.input}
                      value={lastName}
                      onChangeText={setLastName}
                      placeholder="Last Name"
                      placeholderTextColor="#94a3b8"
                    />
                  </View>
                </View>
              </View>

              <Text style={styles.label}>Account Type *</Text>
              <View style={{ flexDirection: "row", gap: 8 }}>
                {(["STUDENT", "EMPLOYEE"] as const).map((typeOpt) => {
                  const active = userType === typeOpt;
                  return (
                    <TouchableOpacity
                      key={typeOpt}
                      style={[styles.choiceChip, active && styles.choiceChipActive]}
                      onPress={() => {
                        const nextUnits =
                          typeOpt === "EMPLOYEE" ? EMPLOYEE_UNITS : CSU_COLLEGES;
                        setUserType(typeOpt);
                        if (!(nextUnits as readonly string[]).includes(department)) {
                          setDepartment("");
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

              <Text style={styles.label}>CSU Student / Employee ID Number *</Text>
              <View style={styles.inputRow}>
                <GraduationCap size={18} color="#94a3b8" />
                <TextInput
                  style={styles.input}
                  value={idNumber}
                  onChangeText={setIdNumber}
                  placeholder="e.g. 221-00675 or 2022-04912"
                  placeholderTextColor="#94a3b8"
                  autoCapitalize="none"
                />
              </View>

              <Text style={styles.label}>
                {userType === "EMPLOYEE" ? "College / University Office *" : "College *"}
              </Text>
              <TouchableOpacity
                style={styles.inputRow}
                activeOpacity={0.75}
                onPress={() => setShowCollegePicker((prev) => !prev)}
              >
                <Building size={18} color="#94a3b8" />
                <Text
                  style={[
                    styles.input,
                    { color: department ? "#0f172a" : "#94a3b8" },
                  ]}
                  numberOfLines={1}
                >
                  {department ||
                    (userType === "EMPLOYEE" ? "Select College or Office" : "Select College")}
                </Text>
                <ChevronDown size={18} color="#64748b" />
              </TouchableOpacity>
              {showCollegePicker && (
                <View style={styles.pickerDropdown}>
                  {availableUnits.map((unit) => (
                    <TouchableOpacity
                      key={unit}
                      style={[
                        styles.pickerOption,
                        department === unit && styles.pickerOptionSelected,
                      ]}
                      onPress={() => {
                        setDepartment(unit);
                        setShowCollegePicker(false);
                      }}
                    >
                      <Text
                        style={[
                          styles.pickerOptionText,
                          department === unit && styles.pickerOptionTextSelected,
                        ]}
                      >
                        {unit}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}

              <TouchableOpacity style={styles.submitBtn} onPress={handleNextStep}>
                <Text style={styles.submitBtnText}>Continue to Health Intake</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.signOutLink}
                onPress={async () => {
                  await clearAuthSession();
                  await clearLocalDatabase();
                  router.replace("/login");
                }}
              >
                <LogOut size={14} color="#64748b" />
                <Text style={styles.signOutLinkText}>Sign out and use another account</Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              <Text style={styles.label}>Date of Birth (YYYY-MM-DD) *</Text>
              <View style={styles.inputRow}>
                <Calendar size={18} color="#94a3b8" />
                <TextInput
                  style={styles.input}
                  value={dateOfBirth}
                  onChangeText={setDateOfBirth}
                  placeholder="e.g. 2003-05-14"
                  placeholderTextColor="#94a3b8"
                  keyboardType="numbers-and-punctuation"
                />
              </View>

              <Text style={styles.label}>Sex *</Text>
              <TouchableOpacity
                style={styles.inputRow}
                activeOpacity={0.75}
                onPress={() => setShowGenderPicker((prev) => !prev)}
              >
                <Text style={[styles.input, { color: gender ? "#0f172a" : "#94a3b8" }]}>
                  {gender || "Select Sex"}
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
                        gender === g && styles.pickerOptionSelected,
                      ]}
                      onPress={() => {
                        setGender(g);
                        setShowGenderPicker(false);
                      }}
                    >
                      <Text
                        style={[
                          styles.pickerOptionText,
                          gender === g && styles.pickerOptionTextSelected,
                        ]}
                      >
                        {g}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}

              <Text style={styles.label}>Mobile Number *</Text>
              <View style={styles.inputRow}>
                <Phone size={18} color="#94a3b8" />
                <TextInput
                  style={styles.input}
                  value={phone}
                  onChangeText={setPhone}
                  placeholder="e.g. 0912 345 6789"
                  placeholderTextColor="#94a3b8"
                  keyboardType="phone-pad"
                />
              </View>

              <Text style={styles.label}>Blood Type (Optional)</Text>
              <TouchableOpacity
                style={styles.inputRow}
                activeOpacity={0.75}
                onPress={() => setShowBloodTypePicker((prev) => !prev)}
              >
                <Text style={[styles.input, { color: bloodType ? "#0f172a" : "#94a3b8" }]}>
                  {bloodType || "Select Blood Type"}
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
                        bloodType === bt && styles.pickerOptionSelected,
                      ]}
                      onPress={() => {
                        setBloodType(bt);
                        setShowBloodTypePicker(false);
                      }}
                    >
                      <Text
                        style={[
                          styles.pickerOptionText,
                          bloodType === bt && styles.pickerOptionTextSelected,
                        ]}
                      >
                        {bt}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}

              <View style={styles.allergyBox}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                  <Text style={[styles.label, { marginTop: 0, marginBottom: 0 }]}>
                    Known Drug Allergies *
                  </Text>
                  <TouchableOpacity
                    style={styles.checkboxInline}
                    onPress={() => {
                      setNoKnownAllergies((prev) => {
                        if (!prev) setAllergies("");
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
                  <View style={[styles.inputRow, { backgroundColor: "#ffffff" }]}>
                    <TextInput
                      style={styles.input}
                      value={allergies}
                      onChangeText={setAllergies}
                      placeholder="e.g. Penicillin, Aspirin"
                      placeholderTextColor="#94a3b8"
                    />
                  </View>
                )}
              </View>

              <Text style={styles.label}>Pre-existing Medical Conditions (Optional)</Text>
              <View style={styles.inputRow}>
                <TextInput
                  style={styles.input}
                  value={medicalConditions}
                  onChangeText={setMedicalConditions}
                  placeholder="e.g. Asthma, Hypertension (blank if none)"
                  placeholderTextColor="#94a3b8"
                />
              </View>

              <Text style={styles.label}>Emergency Contact Name &amp; Relation (Optional)</Text>
              <View style={styles.inputRow}>
                <TextInput
                  style={styles.input}
                  value={emergencyContactName}
                  onChangeText={setEmergencyContactName}
                  placeholder="e.g. Elena Reyes (Mother)"
                  placeholderTextColor="#94a3b8"
                />
              </View>

              <Text style={styles.label}>Emergency Contact Phone (Optional)</Text>
              <View style={styles.inputRow}>
                <Phone size={18} color="#94a3b8" />
                <TextInput
                  style={styles.input}
                  value={emergencyContactPhone}
                  onChangeText={setEmergencyContactPhone}
                  placeholder="e.g. 09XX XXX XXXX"
                  placeholderTextColor="#94a3b8"
                  keyboardType="phone-pad"
                />
              </View>

              <View style={styles.allergyBox}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 4 }}>
                  <Lock size={14} color="#059669" />
                  <Text style={[styles.label, { marginTop: 0, marginBottom: 0 }]}>
                    Create a Portal Password (Optional)
                  </Text>
                </View>
                <Text style={{ fontSize: 11, color: "#64748b", marginBottom: 8, lineHeight: 16 }}>
                  Set a password now if you also want to sign in with your Email or CSU ID without
                  Google.
                </Text>
                <View style={[styles.inputRow, { backgroundColor: "#ffffff" }]}>
                  <TextInput
                    style={styles.input}
                    value={portalPassword}
                    onChangeText={setPortalPassword}
                    secureTextEntry={!showPortalPassword}
                    placeholder="Min. 8 chars, 1 uppercase, 1 number"
                    placeholderTextColor="#94a3b8"
                  />
                  <TouchableOpacity onPress={() => setShowPortalPassword((v) => !v)}>
                    {showPortalPassword ? (
                      <EyeOff size={18} color="#64748b" />
                    ) : (
                      <Eye size={18} color="#64748b" />
                    )}
                  </TouchableOpacity>
                </View>
                {portalPassword.length > 0 && (
                  <View style={[styles.inputRow, { backgroundColor: "#ffffff", marginTop: 8 }]}>
                    <TextInput
                      style={styles.input}
                      value={confirmPortalPassword}
                      onChangeText={setConfirmPortalPassword}
                      secureTextEntry={!showPortalPassword}
                      placeholder="Confirm portal password"
                      placeholderTextColor="#94a3b8"
                    />
                  </View>
                )}
              </View>

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
                    I consent to the processing of my personal and clinical information by the
                    CSU Health Services Infirmary under{" "}
                    <Text style={{ fontWeight: "800" }}>RA 10173 (Data Privacy Act of 2012)</Text>.
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => setShowPrivacyModal(true)}>
                  <Text style={styles.privacyLink}>Read Data Privacy Notice</Text>
                </TouchableOpacity>
              </View>

              <View style={{ flexDirection: "row", gap: 10, marginTop: 18 }}>
                <TouchableOpacity
                  style={styles.backBtn}
                  disabled={loading}
                  onPress={() => {
                    setError(null);
                    setStep(1);
                  }}
                >
                  <ArrowLeft size={16} color="#475569" />
                  <Text style={styles.backBtnText}>Back</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.submitBtn,
                    { flex: 1, marginTop: 0 },
                    (loading || !privacyConsent) && { opacity: 0.6 },
                  ]}
                  onPress={handleSave}
                  disabled={loading || !privacyConsent}
                >
                  {loading ? (
                    <ActivityIndicator color="#ffffff" />
                  ) : (
                    <Text style={styles.submitBtnText}>Continue to Portal</Text>
                  )}
                </TouchableOpacity>
              </View>
            </>
          )}
        </View>
      </ScrollView>

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
            <Text style={styles.modalBody}>
              Your personal and clinical intake data is collected solely for Caraga State
              University Health Services Infirmary care, drug-allergy safety screening, and
              medication adherence tracking. Access is restricted to you and authorized CSU
              doctors and health staff.
            </Text>
            <View style={{ flexDirection: "row", gap: 10, marginTop: 14 }}>
              <TouchableOpacity
                style={[styles.backBtn, { flex: 1 }]}
                onPress={() => setShowPrivacyModal(false)}
              >
                <Text style={styles.backBtnText}>Close</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.submitBtn, { flex: 1, marginTop: 0, height: 44 }]}
                onPress={() => {
                  setPrivacyConsent(true);
                  setShowPrivacyModal(false);
                }}
              >
                <Text style={styles.submitBtnText}>I Consent</Text>
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
  scrollContent: { flexGrow: 1, justifyContent: "center", padding: 20, paddingVertical: 36 },
  header: { alignItems: "center", marginBottom: 18 },
  iconCircle: {
    width: 62,
    height: 62,
    borderRadius: 20,
    backgroundColor: "#10b981",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 10,
  },
  title: { fontSize: 21, fontWeight: "900", color: "#0f172a", textAlign: "center" },
  subtitle: { fontSize: 12, color: "#64748b", textAlign: "center", marginTop: 4, maxWidth: 320 },
  card: {
    backgroundColor: "#ffffff",
    borderRadius: 24,
    padding: 20,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  verifiedBanner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: "#ecfdf5",
    borderWidth: 1,
    borderColor: "#a7f3d0",
    borderRadius: 12,
    paddingVertical: 8,
    marginBottom: 12,
  },
  verifiedBannerText: { fontSize: 12, fontWeight: "800", color: "#065f46" },
  stepperRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 10,
    gap: 8,
  },
  stepPill: { backgroundColor: "#f1f5f9", paddingHorizontal: 10, paddingVertical: 5, borderRadius: 99 },
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
    borderWidth: 1,
    borderColor: "#fecaca",
    borderRadius: 12,
    padding: 10,
    marginBottom: 12,
  },
  errorText: { flex: 1, fontSize: 12, fontWeight: "600", color: "#b91c1c" },
  label: { fontSize: 11, fontWeight: "700", color: "#334155", marginBottom: 5, marginTop: 10 },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#f8fafc",
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 12,
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
  submitBtn: {
    backgroundColor: "#10b981",
    borderRadius: 14,
    height: 48,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 18,
  },
  submitBtnText: { color: "#ffffff", fontSize: 13, fontWeight: "800" },
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
  signOutLink: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    marginTop: 16,
  },
  signOutLinkText: { fontSize: 12, fontWeight: "600", color: "#64748b" },
  pickerDropdown: {
    marginTop: 6,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#cbd5e1",
    backgroundColor: "#ffffff",
    overflow: "hidden",
  },
  pickerOption: {
    paddingHorizontal: 12,
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
  modalSubtitle: { fontSize: 11, color: "#64748b", marginTop: 2, marginBottom: 10 },
  modalBody: { fontSize: 12, color: "#334155", lineHeight: 18 },
});
