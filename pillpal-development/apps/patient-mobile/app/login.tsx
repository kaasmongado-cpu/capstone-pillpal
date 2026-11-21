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
} from "react-native";
import { useRouter } from "expo-router";
import { HeartPulse, Lock, Mail, Fingerprint, ShieldAlert, Sparkles } from "lucide-react-native";
import { signIn } from "@pillpal/auth";
import {
  saveAuthToken,
  saveCachedUser,
  isBiometricsAvailable,
  authenticateWithBiometrics,
  getCachedUser,
} from "@/services/auth/session";

const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || "http://localhost:4000";

export default function LoginScreen() {
  const router = useRouter();
  const [identifier, setIdentifier] = useState("maria.santos@carsu.edu.ph");
  const [password, setPassword] = useState("Password123!");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [biometricsAvailable, setBiometricsAvailable] = useState(false);

  useEffect(() => {
    async function checkBio() {
      const available = await isBiometricsAvailable();
      setBiometricsAvailable(available);

      // Auto-prompt biometrics if user previously logged in
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
    setLoading(true);

    try {
      let targetEmail = identifier.trim().toLowerCase();

      // If user typed CSU ID number instead of email (no @), resolve email from backend
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
            "Cannot connect to CSU authentication service. Please verify your connection."
          );
        }
      }

      // Execute Supabase Auth
      const { data, error: authError } = await signIn(targetEmail, password);
      if (authError || !data.session) {
        if (authError?.message?.toLowerCase().includes("failed to fetch")) {
          throw new Error("Cannot connect to server. Check your internet or Supabase status.");
        }
        throw new Error(authError?.message || "Invalid CSU patient credentials.");
      }

      await saveAuthToken(data.session.access_token);

      // Fetch patient profile to cache for offline use
      try {
        const meRes = await fetch(`${API_BASE_URL}/me`, {
          headers: { Authorization: `Bearer ${data.session.access_token}` },
        });

        if (meRes.ok) {
          const profile = await meRes.json();
          await saveCachedUser({
            id: profile.id,
            email: profile.email,
            firstName: profile.firstName,
            lastName: profile.lastName,
            idNumber: profile.patientProfile?.idNumber || "2022-04912",
            department: profile.patientProfile?.department || "College of Nursing",
            bloodType: profile.patientProfile?.bloodType || "O+",
            allergies: profile.patientProfile?.allergies || "No Known Drug Allergies (NKA)",
            role: profile.role,
          });
        }
      } catch {
        // Continue with default cached credentials if offline
        await saveCachedUser({
          id: data.session.user.id,
          email: targetEmail,
          firstName: "Maria",
          lastName: "Santos",
          idNumber: "2022-04912",
          department: "College of Nursing",
          bloodType: "O+",
          allergies: "No Known Drug Allergies (NKA)",
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

  async function handleBiometricLogin() {
    const success = await authenticateWithBiometrics();
    if (success) {
      router.replace("/(tabs)");
    }
  }

  function fastFill(email: string, pass: string) {
    setIdentifier(email);
    setPassword(pass);
    setError(null);
  }

  async function enterOfflineDemo() {
    setError(null);
    await saveCachedUser({
      id: "demo_maria_santos",
      email: "maria.santos@carsu.edu.ph",
      firstName: "Maria",
      lastName: "Santos",
      idNumber: "2022-04912",
      department: "College of Nursing",
      bloodType: "O+",
      allergies: "Penicillin (Moderate)",
      role: "PATIENT",
    });
    router.replace("/(tabs)");
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        {/* CSU Brand Header */}
        <View style={styles.header}>
          <View style={styles.iconCircle}>
            <HeartPulse size={36} color="#ffffff" strokeWidth={2.4} />
          </View>
          <Text style={styles.title}>PILLPAL</Text>
          <Text style={styles.subtitle}>Caraga State University • Patient Portal</Text>
          <View style={styles.csuBadge}>
            <Text style={styles.csuBadgeText}>CSU HEALTH SERVICES</Text>
          </View>
        </View>

        {/* Login Card */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Student & Patient Sign In</Text>
          <Text style={styles.cardDesc}>
            Enter your CSU email or Student ID to access your dosing schedule and medication scanner.
          </Text>

          {error && (
            <View style={styles.errorBox}>
              <ShieldAlert size={18} color="#dc2626" />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}

          {/* Identifier Input */}
          <Text style={styles.inputLabel}>CSU Email or Student ID</Text>
          <View style={styles.inputWrapper}>
            <Mail size={18} color="#94a3b8" />
            <TextInput
              style={styles.input}
              placeholder="e.g. maria.santos@carsu.edu.ph or 2022-04912"
              placeholderTextColor="#94a3b8"
              value={identifier}
              onChangeText={setIdentifier}
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>

          {/* Password Input */}
          <Text style={styles.inputLabel}>Password</Text>
          <View style={styles.inputWrapper}>
            <Lock size={18} color="#94a3b8" />
            <TextInput
              style={styles.input}
              placeholder="••••••••••••"
              placeholderTextColor="#94a3b8"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
            />
          </View>

          {/* Submit Button */}
          <TouchableOpacity
            style={[styles.loginBtn, loading && styles.disabledBtn]}
            onPress={handleLogin}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#ffffff" />
            ) : (
              <Text style={styles.loginBtnText}>Sign In to Portal</Text>
            )}
          </TouchableOpacity>

          {/* Biometrics Action */}
          {biometricsAvailable && (
            <TouchableOpacity style={styles.biometricBtn} onPress={handleBiometricLogin}>
              <Fingerprint size={20} color="#10b981" />
              <Text style={styles.biometricBtnText}>Sign In with Face ID / Fingerprint</Text>
            </TouchableOpacity>
          )}

          {/* Demo Shortcuts */}
          <View style={styles.demoSection}>
            <View style={styles.demoHeader}>
              <Sparkles size={14} color="#d97706" />
              <Text style={styles.demoTitle}>Quick Demo Credentials</Text>
            </View>
            <View style={styles.demoButtonsRow}>
              <TouchableOpacity
                style={styles.demoChip}
                onPress={() => fastFill("maria.santos@carsu.edu.ph", "Password123!")}
              >
                <Text style={styles.demoChipText}>Maria Santos (Nursing)</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.demoChip}
                onPress={() => fastFill("juan.delacruz@carsu.edu.ph", "Password123!")}
              >
                <Text style={styles.demoChipText}>Juan Dela Cruz (Eng.)</Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={[styles.biometricBtn, { marginTop: 10, borderColor: "#cbd5e1", backgroundColor: "#f8fafc" }]}
              onPress={enterOfflineDemo}
            >
              <Text style={[styles.biometricBtnText, { color: "#334155" }]}>
                Enter Offline Demo Mode (Test OCR & Local DB)
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f8fafc",
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: "center",
    padding: 24,
  },
  header: {
    alignItems: "center",
    marginBottom: 24,
  },
  iconCircle: {
    width: 68,
    height: 68,
    borderRadius: 22,
    backgroundColor: "#10b981",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#10b981",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 8,
    marginBottom: 12,
  },
  title: {
    fontSize: 26,
    fontWeight: "900",
    color: "#0f172a",
    letterSpacing: 0.5,
  },
  subtitle: {
    fontSize: 12,
    fontWeight: "600",
    color: "#64748b",
    marginTop: 2,
  },
  csuBadge: {
    marginTop: 8,
    backgroundColor: "#ecfdf5",
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#a7f3d0",
  },
  csuBadgeText: {
    fontSize: 10,
    fontWeight: "800",
    color: "#047857",
    letterSpacing: 0.6,
  },
  card: {
    backgroundColor: "#ffffff",
    borderRadius: 24,
    padding: 22,
    shadowColor: "#0f172a",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 16,
    elevation: 4,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: "#0f172a",
  },
  cardDesc: {
    fontSize: 12,
    color: "#64748b",
    marginTop: 4,
    marginBottom: 16,
    lineHeight: 18,
  },
  errorBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#fef2f2",
    borderColor: "#fecaca",
    borderWidth: 1,
    padding: 10,
    borderRadius: 12,
    marginBottom: 14,
  },
  errorText: {
    color: "#b91c1c",
    fontSize: 12,
    fontWeight: "600",
    flex: 1,
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: "#334155",
    marginBottom: 6,
    marginTop: 8,
  },
  inputWrapper: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "#f8fafc",
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 14,
    paddingHorizontal: 14,
    height: 48,
  },
  input: {
    flex: 1,
    fontSize: 13,
    color: "#0f172a",
  },
  loginBtn: {
    backgroundColor: "#10b981",
    height: 50,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 20,
    shadowColor: "#10b981",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 4,
  },
  disabledBtn: {
    opacity: 0.7,
  },
  loginBtnText: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "800",
  },
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
  biometricBtnText: {
    color: "#065f46",
    fontSize: 13,
    fontWeight: "700",
  },
  demoSection: {
    marginTop: 20,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: "#f1f5f9",
  },
  demoHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 8,
  },
  demoTitle: {
    fontSize: 11,
    fontWeight: "800",
    color: "#b45309",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  demoButtonsRow: {
    flexDirection: "row",
    gap: 8,
  },
  demoChip: {
    flex: 1,
    backgroundColor: "#fffbeb",
    borderWidth: 1,
    borderColor: "#fde68a",
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 10,
    alignItems: "center",
  },
  demoChipText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#92400e",
  },
});

