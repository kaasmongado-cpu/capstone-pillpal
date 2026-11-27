import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Alert,
  Linking,
  Platform,
  Modal,
  TextInput,
  RefreshControl,
  Image,
} from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Rect } from "react-native-svg";
import { BrandHeader } from "@/components/BrandHeader";
import {
  ShieldAlert,
  PhoneCall,
  LogOut,
  HeartPulse,
  GraduationCap,
  Trash2,
  Pencil,
  KeyRound,
  X,
  CheckCircle2,
  Eye,
  EyeOff,
  Mail,
} from "lucide-react-native";
import {
  resetPasswordWithOtp,
  sendVerificationOtp,
  setInitialPassword,
  updatePassword,
} from "@pillpal/auth";
import {
  getCachedUser,
  saveCachedUser,
  clearAuthSession,
  CachedUser,
} from "@/services/auth/session";
import { fetchWithAuth } from "@/services/api/client";
import { clearLocalDatabase } from "@/services/db/database";
import {
  BLOOD_TYPES,
  GENDER_OPTIONS,
  evaluatePasswordStrength,
  hasDocumentedDrugAllergy,
  isValidIsoDate,
  isValidPhPhone,
} from "@/constants/registration";

const NKA_VALUE = "No Known Drug Allergies (NKA)";

// Deterministic Code-39-like visual barcode bars generated from the actual CSU ID string
const CODE39_MAP: Record<string, string> = {
  "0": "nnnwwnwnn",
  "1": "wnnwnnnnw",
  "2": "nnwwnnnnw",
  "3": "wnwwnnnnn",
  "4": "nnnwwnnnw",
  "5": "wnnwwnnnn",
  "6": "nnwwwnnnn",
  "7": "nnnwnnwnw",
  "8": "wnnwnnwnn",
  "9": "nnwwnnwnn",
  "-": "nwnnnnwnw",
  "*": "nwnnwnwnn",
  A: "wnnnnwnnw",
  B: "nnwnnwnnw",
  C: "wnwnnwnnn",
  D: "nnnnwwnnw",
  E: "wnnnwwnnn",
  F: "nnwnwwnnn",
  G: "nnnnnwwnw",
  H: "wnnnnwwnn",
  I: "nnwnnwwnn",
  J: "nnnnwwwnn",
  K: "wnnnnnnww",
  L: "nnwnnnnww",
  M: "wnwnnnnwn",
  N: "nnnnwnnww",
  O: "wnnnwnnwn",
  P: "nnwnwnnwn",
  Q: "nnnnnnwww",
  R: "wnnnnnwwn",
  S: "nnwnnnwwn",
  T: "nnnnwnwwn",
  U: "wwnnnnnnw",
  V: "nwwnnnnnw",
  W: "wwwnnnnnn",
  X: "nwnnwnnnw",
  Y: "wwnnwnnnn",
  Z: "nwwnwnnnn",
};

function CsuIdBarcode({ value }: { value: string }) {
  const clean = value.toUpperCase().replace(/[^0-9A-Z-]/g, "") || "CSU-PATIENT";
  const encoded = `*${clean}*`;
  const bars: { x: number; w: number }[] = [];
  let cursor = 4;

  for (const ch of encoded) {
    const pattern = CODE39_MAP[ch] || CODE39_MAP["-"];
    for (let i = 0; i < pattern.length; i++) {
      const width = pattern[i] === "w" ? 4 : 1.6;
      if (i % 2 === 0) {
        bars.push({ x: cursor, w: width });
      }
      cursor += width;
    }
    cursor += 2; // inter-character gap
  }

  const totalWidth = Math.max(120, cursor + 4);
  return (
    <Svg width="100%" height={48} viewBox={`0 0 ${totalWidth} 48`} preserveAspectRatio="none">
      {bars.map((b, idx) => (
        <Rect key={idx} x={b.x} y={0} width={b.w} height={48} fill="#0f172a" />
      ))}
    </Svg>
  );
}

export default function ProfileScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [user, setUser] = useState<CachedUser | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  // Edit Profile Modal State
  const [editVisible, setEditVisible] = useState(false);
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState("");
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

  // Security / Change Password Modal State
  const [hasPortalPassword, setHasPortalPassword] = useState(true);
  const [securityVisible, setSecurityVisible] = useState(false);
  const [showOtpMode, setShowOtpMode] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [otpCode, setOtpCode] = useState("");
  const [otpNewPassword, setOtpNewPassword] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [otpCooldown, setOtpCooldown] = useState(0);
  const [secLoading, setSecLoading] = useState(false);
  const [secError, setSecError] = useState("");
  const [secSuccess, setSecSuccess] = useState("");

  useEffect(() => {
    if (otpCooldown <= 0) return;
    const t = setTimeout(() => setOtpCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [otpCooldown]);

  const mapServerUserToCache = (data: any): CachedUser => {
    const p = data?.patientProfile;
    return {
      id: data.id,
      email: data.email || "",
      firstName: data.firstName || "",
      lastName: data.lastName || "",
      idNumber: p?.idNumber || "",
      department: p?.department || "",
      userType: data.userType || "STUDENT",
      phone: data.phone || "",
      dateOfBirth: p?.dateOfBirth ? new Date(p.dateOfBirth).toISOString().slice(0, 10) : "",
      gender: p?.gender || "",
      bloodType: p?.bloodType || "",
      allergies: p?.allergies || "",
      medicalConditions: p?.medicalConditions || "",
      emergencyContactName: p?.emergencyContactName || "",
      emergencyContactPhone: p?.emergencyContactPhone || "",
      privacyConsentAt: p?.privacyConsentAt || "",
      role: data.role || "PATIENT",
    };
  };

  const loadProfile = useCallback(async () => {
    const cached = await getCachedUser();
    if (cached) setUser(cached);

    try {
      const res = await fetchWithAuth("/me");
      if (res.ok) {
        const data = await res.json();
        setHasPortalPassword(data.hasPassword !== false);
        const mapped = mapServerUserToCache(data);
        setUser(mapped);
        await saveCachedUser(mapped);
      }
    } catch {
      // offline fallback
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void loadProfile();
    }, [loadProfile]),
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadProfile();
    setRefreshing(false);
  }, [loadProfile]);

  function openEditModal() {
    const hasAllergy = hasDocumentedDrugAllergy(user?.allergies);
    setIsNka(!hasAllergy);
    setEditForm({
      dateOfBirth: user?.dateOfBirth || "",
      gender: user?.gender || "",
      phone: user?.phone || "",
      bloodType: user?.bloodType || "",
      allergies: hasAllergy ? user?.allergies || "" : NKA_VALUE,
      medicalConditions: user?.medicalConditions || "",
      emergencyContactName: user?.emergencyContactName || "",
      emergencyContactPhone: user?.emergencyContactPhone || "",
    });
    setEditError("");
    setEditVisible(true);
  }

  async function handleSaveEdit() {
    setEditError("");
    if (editForm.dateOfBirth.trim() && !isValidIsoDate(editForm.dateOfBirth)) {
      setEditError("Enter a valid Date of Birth in YYYY-MM-DD format.");
      return;
    }
    if (editForm.phone.trim() && !isValidPhPhone(editForm.phone)) {
      setEditError("Enter a valid Philippine mobile number (e.g. 0912 345 6789).");
      return;
    }
    if (
      editForm.emergencyContactPhone.trim() &&
      !isValidPhPhone(editForm.emergencyContactPhone)
    ) {
      setEditError("Enter a valid mobile number for your emergency contact.");
      return;
    }
    if (!isNka && !editForm.allergies.trim()) {
      setEditError("Please enter your drug allergies or select NKA.");
      return;
    }

    setEditSaving(true);
    try {
      const res = await fetchWithAuth("/me/profile", {
        method: "PATCH",
        body: JSON.stringify({
          ...editForm,
          allergies: isNka ? NKA_VALUE : editForm.allergies.trim(),
        }),
      });
      const body = await res.json();
      if (!res.ok) {
        throw new Error(body?.message || "Unable to update profile.");
      }
      const mapped = mapServerUserToCache(body);
      setUser(mapped);
      await saveCachedUser(mapped);
      setEditVisible(false);
    } catch (err: any) {
      setEditError(err?.message || "Failed to save profile changes.");
    } finally {
      setEditSaving(false);
    }
  }

  async function handleSetInitialPassword() {
    setSecError("");
    setSecSuccess("");
    const strength = evaluatePasswordStrength(newPassword);
    if (!strength.isValid) {
      setSecError("Password must be 8+ chars with 1 uppercase letter and 1 number.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setSecError("Passwords do not match.");
      return;
    }

    setSecLoading(true);
    try {
      const { error } = await setInitialPassword(newPassword);
      if (error) {
        setSecError(error.message || "Unable to create portal password.");
        return;
      }
      setNewPassword("");
      setConfirmPassword("");
      setHasPortalPassword(true);
      setSecSuccess(
        "Portal password created! You can now sign in with Google or your Email / CSU ID.",
      );
    } catch {
      setSecError("Unable to create portal password right now.");
    } finally {
      setSecLoading(false);
    }
  }

  async function handleChangePassword() {
    setSecError("");
    setSecSuccess("");
    const strength = evaluatePasswordStrength(newPassword);
    if (!currentPassword) {
      setSecError("Please enter your current password.");
      return;
    }
    if (!strength.isValid) {
      setSecError("New password must be 8+ chars with 1 uppercase letter and 1 number.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setSecError("New passwords do not match.");
      return;
    }

    setSecLoading(true);
    try {
      const { error } = await updatePassword(newPassword, currentPassword);
      if (error) {
        setSecError(error.message || "Unable to update password.");
        return;
      }
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setSecSuccess("Password updated successfully.");
    } catch {
      setSecError("Unable to update password right now.");
    } finally {
      setSecLoading(false);
    }
  }

  async function handleSendOtp() {
    if (!user?.email || otpCooldown > 0) return;
    setSecError("");
    setSecSuccess("");
    setSecLoading(true);
    try {
      const { error } = await sendVerificationOtp(user.email, "forget-password");
      if (error) {
        setSecError(error.message || "Unable to send verification code.");
        return;
      }
      setOtpSent(true);
      setOtpCooldown(60);
      setSecSuccess(`Verification code sent to ${user.email}.`);
    } catch {
      setSecError("Failed to send code.");
    } finally {
      setSecLoading(false);
    }
  }

  async function handleResetWithOtp() {
    setSecError("");
    setSecSuccess("");
    if (!user?.email || otpCode.trim().length < 6) {
      setSecError("Please enter the 6-digit email code.");
      return;
    }
    if (!evaluatePasswordStrength(otpNewPassword).isValid) {
      setSecError("Password must be 8+ chars with 1 uppercase letter and 1 number.");
      return;
    }

    setSecLoading(true);
    try {
      const { error } = await resetPasswordWithOtp(user.email, otpCode.trim(), otpNewPassword);
      if (error) {
        setSecError(error.message || "Invalid or expired code.");
        return;
      }
      setOtpCode("");
      setOtpNewPassword("");
      setOtpSent(false);
      setSecSuccess("Password reset complete!");
    } catch {
      setSecError("Unable to reset password right now.");
    } finally {
      setSecLoading(false);
    }
  }

  async function handleLogout() {
    if (Platform.OS === "web") {
      if (globalThis.confirm?.("Are you sure you want to sign out of PILLPAL?")) {
        await clearAuthSession();
        await clearLocalDatabase();
        router.replace("/login");
      }
      return;
    }

    Alert.alert("Sign Out", "Are you sure you want to sign out of the PILLPAL Patient Portal?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Sign Out",
        style: "destructive",
        onPress: async () => {
          await clearAuthSession();
          await clearLocalDatabase();
          router.replace("/login");
        },
      },
    ]);
  }

  function callNumber(phone: string) {
    const digits = phone.replace(/[^\d+]/g, "");
    if (digits) void Linking.openURL(`tel:${digits}`);
  }

  const hasAllergy = hasDocumentedDrugAllergy(user?.allergies);
  const formattedDob = user?.dateOfBirth
    ? new Date(`${user.dateOfBirth}T00:00:00`).toLocaleDateString("en-PH", {
        year: "numeric",
        month: "short",
        day: "numeric",
      })
    : "Not set";

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingTop: Math.max(insets.top + 12, 20) },
        ]}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#10b981" />
        }
      >
        {/* Branded Header */}
        <BrandHeader
          title="Health Pass"
          subtitle="Caraga State University • Official Medical Identity"
          rightSlot={
            <TouchableOpacity style={styles.editPillBtn} onPress={openEditModal}>
              <Pencil size={14} color="#047857" />
              <Text style={styles.editPillText}>Edit</Text>
            </TouchableOpacity>
          }
        />

        {/* Digital CSU Campus Health Pass Badge */}
        <View style={styles.idCard}>
          <View style={styles.idCardHeader}>
            <View style={[styles.csuEmblem, { backgroundColor: "#ffffff", padding: 4 }]}>
              <Image
                source={require("../../assets/pillpal-logo.png")}
                style={{ width: 28, height: 28 }}
                resizeMode="contain"
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.cardUnivName}>CARAGA STATE UNIVERSITY</Text>
              <Text style={styles.cardHealthDivision}>CSU UNIVERSITY CENTER FOR HEALTH AND WELLNESS</Text>
            </View>
            <View style={styles.activeTag}>
              <Text style={styles.activeTagText}>{user?.userType || "STUDENT"}</Text>
            </View>
          </View>

          <View style={styles.idCardBody}>
            <View style={styles.avatarBox}>
              <Text style={styles.avatarInitials}>
                {user
                  ? `${user.firstName?.[0] || ""}${user.lastName?.[0] || ""}` || "PT"
                  : "PT"}
              </Text>
            </View>

            <View style={{ flex: 1 }}>
              <Text style={styles.studentName}>
                {user ? `${user.firstName} ${user.lastName}`.trim() || "CSU Patient" : "CSU Patient"}
              </Text>
              <View style={styles.metaRow}>
                <GraduationCap size={13} color="#cbd5e1" />
                <Text style={styles.metaText} numberOfLines={2}>
                  {user?.department || "Not set"}
                </Text>
              </View>
              <View style={styles.metaRow}>
                <Text style={styles.idNumberLabel}>CSU ID:</Text>
                <Text style={styles.idNumberVal}>{user?.idNumber || "Not set"}</Text>
              </View>
            </View>
          </View>

          {/* Real Deterministic SVG Barcode for CSU ID */}
          <View style={styles.barcodeContainer}>
            <CsuIdBarcode value={user?.idNumber || "CSU-PATIENT"} />
            <Text style={styles.barcodeLabel}>
              {user?.idNumber || "ID NOT SET"} • CSU INFIRMARY VERIFIED ID
            </Text>
          </View>
        </View>

        {/* Emergency Clinical Safety Strip */}
        <View style={styles.safetyCard}>
          <View style={styles.safetyHeader}>
            <ShieldAlert size={18} color="#b91c1c" />
            <Text style={styles.safetyTitle}>EMERGENCY CLINICAL SAFETY DATA</Text>
          </View>

          <View style={styles.safetyGrid}>
            <View style={styles.safetyItem}>
              <Text style={styles.safetyLabel}>BLOOD TYPE</Text>
              <Text style={styles.safetyValue}>{user?.bloodType || "Not set"}</Text>
            </View>

            <View
              style={[
                styles.safetyItem,
                !hasAllergy && { backgroundColor: "#ecfdf5", borderColor: "#a7f3d0" },
              ]}
            >
              <Text style={[styles.safetyLabel, !hasAllergy && { color: "#065f46" }]}>
                KNOWN ALLERGIES
              </Text>
              <Text
                style={[styles.safetyValue, { color: hasAllergy ? "#dc2626" : "#047857" }]}
              >
                {user?.allergies || NKA_VALUE}
              </Text>
            </View>
          </View>

          {/* Detailed Personal & Emergency Info */}
          <View style={styles.detailList}>
            <View style={styles.detailRow}>
              <Text style={styles.detailKey}>Date of Birth / Sex</Text>
              <Text style={styles.detailVal}>
                {formattedDob} • {user?.gender || "Not set"}
              </Text>
            </View>
            <View style={styles.detailRow}>
              <Text style={styles.detailKey}>Mobile Number</Text>
              <Text style={styles.detailVal}>{user?.phone || "Not set"}</Text>
            </View>
            <View style={styles.detailRow}>
              <Text style={styles.detailKey}>Chronic Conditions</Text>
              <Text style={styles.detailVal}>{user?.medicalConditions || "None recorded"}</Text>
            </View>
            <View style={styles.detailRow}>
              <Text style={styles.detailKey}>Emergency Contact</Text>
              <TouchableOpacity
                disabled={!user?.emergencyContactPhone}
                onPress={() =>
                  user?.emergencyContactPhone && callNumber(user.emergencyContactPhone)
                }
              >
                <Text
                  style={[
                    styles.detailVal,
                    user?.emergencyContactPhone ? { color: "#047857" } : undefined,
                  ]}
                >
                  {user?.emergencyContactName || "Not set"}
                  {user?.emergencyContactPhone ? ` (${user.emergencyContactPhone})` : ""}
                </Text>
              </TouchableOpacity>
            </View>
            {Boolean(user?.privacyConsentAt) && (
              <View style={styles.detailRow}>
                <Text style={styles.detailKey}>RA 10173 Consent</Text>
                <Text style={styles.detailVal}>
                  Recorded{" "}
                  {new Date(user!.privacyConsentAt!).toLocaleDateString("en-PH")}
                </Text>
              </View>
            )}
          </View>

          {/* 1-Tap Emergency Call Hotline */}
          <TouchableOpacity
            style={styles.emergencyBtn}
            onPress={() => callNumber("0853412786")}
          >
            <PhoneCall size={18} color="#ffffff" />
            <Text style={styles.emergencyBtnText}>
              Call CSU Clinic Emergency: (085) 341-2786
            </Text>
          </TouchableOpacity>
        </View>

        {/* Account Security Button */}
        <TouchableOpacity
          style={styles.actionRowBtn}
          onPress={() => {
            setSecError("");
            setSecSuccess("");
            setSecurityVisible(true);
          }}
        >
          <KeyRound size={18} color="#047857" />
          <Text style={styles.actionRowText}>Account Security &amp; Change Password</Text>
        </TouchableOpacity>

        {/* Clear Local Cache Button */}
        <TouchableOpacity
          style={[
            styles.logoutBtn,
            { borderColor: "#fecaca", backgroundColor: "#fff5f5", marginBottom: 12 },
          ]}
          onPress={async () => {
            await clearLocalDatabase();
            if (Platform.OS === "web") {
              globalThis.alert?.("Local cache cleared! Pull down to refresh.");
            } else {
              Alert.alert(
                "Local Storage Cleared",
                "Offline cache cleared from this device. Pull down on Today to resync.",
              );
            }
          }}
        >
          <Trash2 size={18} color="#ef4444" />
          <Text style={[styles.logoutBtnText, { color: "#dc2626" }]}>
            Clear Offline Cache on Device
          </Text>
        </TouchableOpacity>

        {/* Sign Out */}
        <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
          <LogOut size={18} color="#dc2626" />
          <Text style={styles.logoutBtnText}>Sign Out of Patient Account</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* Edit Profile Modal */}
      <Modal visible={editVisible} animationType="slide" transparent>
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalSheet, { maxHeight: "90%" }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Edit Contact &amp; Health Info</Text>
              <TouchableOpacity onPress={() => setEditVisible(false)}>
                <X size={22} color="#64748b" />
              </TouchableOpacity>
            </View>

            {Boolean(editError) && <Text style={styles.errorBanner}>{editError}</Text>}

            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              <Text style={styles.fieldLabel}>Date of Birth (YYYY-MM-DD)</Text>
              <TextInput
                style={styles.textInput}
                value={editForm.dateOfBirth}
                onChangeText={(v) => setEditForm({ ...editForm, dateOfBirth: v })}
                placeholder="2004-05-18"
              />

              <Text style={styles.fieldLabel}>Sex</Text>
              <View style={styles.chipRow}>
                {GENDER_OPTIONS.map((g) => (
                  <TouchableOpacity
                    key={g}
                    style={[styles.selectChip, editForm.gender === g && styles.selectChipActive]}
                    onPress={() => setEditForm({ ...editForm, gender: g })}
                  >
                    <Text
                      style={[
                        styles.selectChipText,
                        editForm.gender === g && styles.selectChipTextActive,
                      ]}
                    >
                      {g}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.fieldLabel}>Mobile Phone</Text>
              <TextInput
                style={styles.textInput}
                keyboardType="phone-pad"
                value={editForm.phone}
                onChangeText={(v) => setEditForm({ ...editForm, phone: v })}
                placeholder="0912 345 6789"
              />

              <Text style={styles.fieldLabel}>Blood Type</Text>
              <View style={styles.chipRow}>
                {BLOOD_TYPES.map((bt) => (
                  <TouchableOpacity
                    key={bt}
                    style={[
                      styles.selectChip,
                      editForm.bloodType === bt && styles.selectChipActive,
                    ]}
                    onPress={() => setEditForm({ ...editForm, bloodType: bt })}
                  >
                    <Text
                      style={[
                        styles.selectChipText,
                        editForm.bloodType === bt && styles.selectChipTextActive,
                      ]}
                    >
                      {bt}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <View
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginTop: 12,
                }}
              >
                <Text style={[styles.fieldLabel, { marginTop: 0 }]}>Known Drug Allergies</Text>
                <TouchableOpacity
                  style={[styles.nkaChip, isNka && styles.nkaChipActive]}
                  onPress={() => {
                    const next = !isNka;
                    setIsNka(next);
                    setEditForm({ ...editForm, allergies: next ? NKA_VALUE : "" });
                  }}
                >
                  <CheckCircle2 size={12} color={isNka ? "#ffffff" : "#047857"} />
                  <Text style={[styles.nkaChipText, isNka && { color: "#ffffff" }]}>NKA</Text>
                </TouchableOpacity>
              </View>
              <TextInput
                style={[styles.textInput, isNka && { backgroundColor: "#ecfdf5", color: "#065f46" }]}
                editable={!isNka}
                value={isNka ? NKA_VALUE : editForm.allergies}
                onChangeText={(v) => setEditForm({ ...editForm, allergies: v })}
                placeholder="e.g. Penicillin, Ibuprofen"
              />

              <Text style={styles.fieldLabel}>Chronic Medical Conditions</Text>
              <TextInput
                style={styles.textInput}
                value={editForm.medicalConditions}
                onChangeText={(v) => setEditForm({ ...editForm, medicalConditions: v })}
                placeholder="e.g. Asthma (optional)"
              />

              <Text style={styles.fieldLabel}>Emergency Contact Name &amp; Relation</Text>
              <TextInput
                style={styles.textInput}
                value={editForm.emergencyContactName}
                onChangeText={(v) => setEditForm({ ...editForm, emergencyContactName: v })}
                placeholder="e.g. Elena Reyes (Mother)"
              />

              <Text style={styles.fieldLabel}>Emergency Contact Phone</Text>
              <TextInput
                style={styles.textInput}
                keyboardType="phone-pad"
                value={editForm.emergencyContactPhone}
                onChangeText={(v) => setEditForm({ ...editForm, emergencyContactPhone: v })}
                placeholder="09XX XXX XXXX"
              />

              <TouchableOpacity
                style={[styles.saveBtn, editSaving && { opacity: 0.7 }]}
                disabled={editSaving}
                onPress={() => void handleSaveEdit()}
              >
                <Text style={styles.saveBtnText}>
                  {editSaving ? "Saving Profile..." : "Save Profile Changes"}
                </Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Account Security Modal */}
      <Modal visible={securityVisible} animationType="slide" transparent>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Account Security</Text>
              <TouchableOpacity onPress={() => setSecurityVisible(false)}>
                <X size={22} color="#64748b" />
              </TouchableOpacity>
            </View>

            {hasPortalPassword && (
              <TouchableOpacity
                onPress={() => {
                  setSecError("");
                  setSecSuccess("");
                  setShowOtpMode((v) => !v);
                }}
                style={{ marginBottom: 10 }}
              >
                <Text style={{ fontSize: 12, fontWeight: "700", color: "#047857" }}>
                  {showOtpMode
                    ? "← Switch to Current Password"
                    : "Forgot password? Reset via Email OTP →"}
                </Text>
              </TouchableOpacity>
            )}

            {Boolean(secError) && <Text style={styles.errorBanner}>{secError}</Text>}
            {Boolean(secSuccess) && <Text style={styles.successBanner}>{secSuccess}</Text>}

            {!hasPortalPassword ? (
              <>
                <Text
                  style={{
                    fontSize: 12,
                    color: "#0369a1",
                    backgroundColor: "#f0f9ff",
                    borderWidth: 1,
                    borderColor: "#bae6fd",
                    borderRadius: 12,
                    padding: 10,
                    marginBottom: 8,
                    lineHeight: 17,
                  }}
                >
                  You signed up with Google and haven&apos;t created a PILLPAL password yet. Set
                  one below to also sign in with your Email or CSU ID.
                </Text>

                <Text style={styles.fieldLabel}>Create Portal Password</Text>
                <View style={styles.pwdWrap}>
                  <TextInput
                    style={styles.pwdInput}
                    secureTextEntry={!showPwd}
                    value={newPassword}
                    onChangeText={setNewPassword}
                    placeholder="Min. 8 chars, 1 uppercase, 1 number"
                  />
                  <TouchableOpacity onPress={() => setShowPwd((v) => !v)}>
                    {showPwd ? <EyeOff size={18} color="#64748b" /> : <Eye size={18} color="#64748b" />}
                  </TouchableOpacity>
                </View>

                <Text style={styles.fieldLabel}>Confirm Password</Text>
                <TextInput
                  style={styles.textInput}
                  secureTextEntry={!showPwd}
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  placeholder="Re-enter password"
                />

                <TouchableOpacity
                  style={[styles.saveBtn, secLoading && { opacity: 0.7 }]}
                  disabled={secLoading}
                  onPress={() => void handleSetInitialPassword()}
                >
                  <Text style={styles.saveBtnText}>
                    {secLoading ? "Saving..." : "Create Portal Password"}
                  </Text>
                </TouchableOpacity>
              </>
            ) : !showOtpMode ? (
              <>
                <Text style={styles.fieldLabel}>Current Password</Text>
                <View style={styles.pwdWrap}>
                  <TextInput
                    style={styles.pwdInput}
                    secureTextEntry={!showPwd}
                    value={currentPassword}
                    onChangeText={setCurrentPassword}
                    placeholder="Enter current password"
                  />
                  <TouchableOpacity onPress={() => setShowPwd((v) => !v)}>
                    {showPwd ? <EyeOff size={18} color="#64748b" /> : <Eye size={18} color="#64748b" />}
                  </TouchableOpacity>
                </View>

                <Text style={styles.fieldLabel}>New Password</Text>
                <TextInput
                  style={styles.textInput}
                  secureTextEntry={!showPwd}
                  value={newPassword}
                  onChangeText={setNewPassword}
                  placeholder="Min. 8 chars, 1 uppercase, 1 number"
                />

                <Text style={styles.fieldLabel}>Confirm New Password</Text>
                <TextInput
                  style={styles.textInput}
                  secureTextEntry={!showPwd}
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  placeholder="Re-enter new password"
                />

                <TouchableOpacity
                  style={[styles.saveBtn, secLoading && { opacity: 0.7 }]}
                  disabled={secLoading}
                  onPress={() => void handleChangePassword()}
                >
                  <Text style={styles.saveBtnText}>
                    {secLoading ? "Updating..." : "Update Password"}
                  </Text>
                </TouchableOpacity>
              </>
            ) : (
              <>
                <Text style={{ fontSize: 12, color: "#475569", marginBottom: 10 }}>
                  Send a 6-digit code to {user?.email} to reset or set a portal password.
                </Text>
                <TouchableOpacity
                  style={styles.otpSendBtn}
                  disabled={secLoading || otpCooldown > 0}
                  onPress={() => void handleSendOtp()}
                >
                  <Mail size={16} color="#047857" />
                  <Text style={styles.otpSendBtnText}>
                    {otpCooldown > 0
                      ? `Resend Code in ${otpCooldown}s`
                      : otpSent
                        ? "Resend 6-Digit Code"
                        : "Send 6-Digit Email Code"}
                  </Text>
                </TouchableOpacity>

                {otpSent && (
                  <>
                    <Text style={styles.fieldLabel}>6-Digit Email Code</Text>
                    <TextInput
                      style={styles.textInput}
                      keyboardType="number-pad"
                      maxLength={6}
                      value={otpCode}
                      onChangeText={setOtpCode}
                      placeholder="123456"
                    />
                    <Text style={styles.fieldLabel}>New Password</Text>
                    <TextInput
                      style={styles.textInput}
                      secureTextEntry
                      value={otpNewPassword}
                      onChangeText={setOtpNewPassword}
                      placeholder="Min. 8 chars, 1 uppercase, 1 number"
                    />
                    <TouchableOpacity
                      style={[styles.saveBtn, secLoading && { opacity: 0.7 }]}
                      disabled={secLoading}
                      onPress={() => void handleResetWithOtp()}
                    >
                      <Text style={styles.saveBtnText}>
                        {secLoading ? "Verifying..." : "Reset Password"}
                      </Text>
                    </TouchableOpacity>
                  </>
                )}
              </>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f8fafc" },
  content: { padding: 20, paddingTop: 54, paddingBottom: 110 },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 18,
  },
  title: { fontSize: 22, fontWeight: "900", color: "#0f172a" },
  subtitle: { fontSize: 12, fontWeight: "600", color: "#64748b", marginTop: 2 },
  editPillBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "#ecfdf5",
    borderWidth: 1,
    borderColor: "#a7f3d0",
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 12,
  },
  editPillText: { fontSize: 12, fontWeight: "800", color: "#047857" },
  idCard: {
    backgroundColor: "#064e3b",
    borderRadius: 24,
    padding: 20,
    shadowColor: "#064e3b",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 14,
    elevation: 6,
    marginBottom: 20,
  },
  idCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#047857",
    paddingBottom: 14,
  },
  csuEmblem: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: "#10b981",
    alignItems: "center",
    justifyContent: "center",
  },
  cardUnivName: { fontSize: 13, fontWeight: "900", color: "#ffffff", letterSpacing: 0.4 },
  cardHealthDivision: { fontSize: 9, fontWeight: "700", color: "#a7f3d0", letterSpacing: 0.2 },
  activeTag: {
    backgroundColor: "#10b981",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  activeTagText: { fontSize: 9, fontWeight: "900", color: "#ffffff" },
  idCardBody: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    marginTop: 16,
    marginBottom: 16,
  },
  avatarBox: {
    width: 58,
    height: 58,
    borderRadius: 18,
    backgroundColor: "#047857",
    borderWidth: 2,
    borderColor: "#10b981",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarInitials: { fontSize: 20, fontWeight: "900", color: "#ffffff" },
  studentName: { fontSize: 18, fontWeight: "800", color: "#ffffff" },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 3 },
  metaText: { fontSize: 11, color: "#cbd5e1", fontWeight: "600", flex: 1 },
  idNumberLabel: { fontSize: 11, color: "#a7f3d0", fontWeight: "700" },
  idNumberVal: { fontSize: 12, fontFamily: "monospace", fontWeight: "800", color: "#ffffff" },
  barcodeContainer: {
    backgroundColor: "#ffffff",
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
    alignItems: "center",
  },
  barcodeLabel: {
    fontSize: 10,
    fontFamily: "monospace",
    fontWeight: "800",
    color: "#475569",
    marginTop: 6,
    letterSpacing: 0.5,
  },
  safetyCard: {
    backgroundColor: "#ffffff",
    borderRadius: 22,
    padding: 18,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    marginBottom: 14,
  },
  safetyHeader: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 12 },
  safetyTitle: { fontSize: 11, fontWeight: "900", color: "#b91c1c", letterSpacing: 0.6 },
  safetyGrid: { flexDirection: "row", gap: 12, marginBottom: 14 },
  safetyItem: {
    flex: 1,
    backgroundColor: "#fef2f2",
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: "#fecaca",
  },
  safetyLabel: { fontSize: 10, fontWeight: "800", color: "#991b1b", marginBottom: 2 },
  safetyValue: { fontSize: 13, fontWeight: "900", color: "#0f172a" },
  detailList: { gap: 8, marginBottom: 14, borderTopWidth: 1, borderTopColor: "#f1f5f9", paddingTop: 12 },
  detailRow: { flexDirection: "row", justifyContent: "space-between", gap: 10 },
  detailKey: { fontSize: 11, fontWeight: "700", color: "#64748b" },
  detailVal: { fontSize: 11, fontWeight: "800", color: "#0f172a", textAlign: "right", flex: 1 },
  emergencyBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#dc2626",
    paddingVertical: 12,
    borderRadius: 14,
  },
  emergencyBtnText: { color: "#ffffff", fontSize: 12, fontWeight: "800" },
  actionRowBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#cbd5e1",
    paddingVertical: 13,
    borderRadius: 16,
    marginBottom: 12,
  },
  actionRowText: { color: "#0f172a", fontSize: 13, fontWeight: "700" },
  logoutBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#fecaca",
    paddingVertical: 13,
    borderRadius: 16,
  },
  logoutBtnText: { color: "#dc2626", fontSize: 13, fontWeight: "700" },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.55)",
    justifyContent: "flex-end",
  },
  modalSheet: {
    backgroundColor: "#ffffff",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    paddingBottom: 32,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  modalTitle: { fontSize: 17, fontWeight: "900", color: "#0f172a" },
  errorBanner: {
    backgroundColor: "#fef2f2",
    color: "#b91c1c",
    fontSize: 12,
    fontWeight: "700",
    padding: 10,
    borderRadius: 10,
    marginBottom: 10,
  },
  successBanner: {
    backgroundColor: "#ecfdf5",
    color: "#065f46",
    fontSize: 12,
    fontWeight: "700",
    padding: 10,
    borderRadius: 10,
    marginBottom: 10,
  },
  fieldLabel: { fontSize: 12, fontWeight: "700", color: "#334155", marginBottom: 6, marginTop: 10 },
  textInput: {
    backgroundColor: "#f8fafc",
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 12,
    paddingHorizontal: 14,
    height: 44,
    fontSize: 13,
    color: "#0f172a",
  },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  selectChip: {
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#cbd5e1",
    backgroundColor: "#f8fafc",
  },
  selectChipActive: { borderColor: "#10b981", backgroundColor: "#ecfdf5" },
  selectChipText: { fontSize: 11, fontWeight: "700", color: "#475569" },
  selectChipTextActive: { color: "#047857", fontWeight: "900" },
  nkaChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#a7f3d0",
    backgroundColor: "#ecfdf5",
  },
  nkaChipActive: { backgroundColor: "#059669", borderColor: "#059669" },
  nkaChipText: { fontSize: 10, fontWeight: "900", color: "#047857" },
  saveBtn: {
    backgroundColor: "#10b981",
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: "center",
    marginTop: 18,
  },
  saveBtnText: { color: "#ffffff", fontSize: 14, fontWeight: "800" },
  pwdWrap: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#f8fafc",
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 12,
    paddingHorizontal: 14,
    height: 44,
  },
  pwdInput: { flex: 1, fontSize: 13, color: "#0f172a" },
  otpSendBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#ecfdf5",
    borderWidth: 1,
    borderColor: "#a7f3d0",
    paddingVertical: 11,
    borderRadius: 12,
  },
  otpSendBtnText: { fontSize: 12, fontWeight: "800", color: "#047857" },
});
