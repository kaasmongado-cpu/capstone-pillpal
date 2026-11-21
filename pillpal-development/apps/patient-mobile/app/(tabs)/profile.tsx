import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Alert,
  Linking,
  Platform,
} from "react-native";
import { useRouter } from "expo-router";
import {
  ShieldAlert,
  PhoneCall,
  QrCode,
  LogOut,
  Fingerprint,
  HeartPulse,
  User,
  GraduationCap,
  Building,
} from "lucide-react-native";
import { getCachedUser, clearAuthSession, CachedUser } from "@/services/auth/session";

export default function ProfileScreen() {
  const router = useRouter();
  const [user, setUser] = useState<CachedUser | null>(null);

  useEffect(() => {
    async function load() {
      const cached = await getCachedUser();
      setUser(cached);
    }
    void load();
  }, []);

  async function handleLogout() {
    if (Platform.OS === "web") {
      if (globalThis.confirm?.("Are you sure you want to sign out of the PILLPAL Patient Portal?")) {
        await clearAuthSession();
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
          router.replace("/login");
        },
      },
    ]);
  }

  function callEmergency() {
    void Linking.openURL("tel:0853412786");
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Digital Health Pass</Text>
        <Text style={styles.subtitle}>
          Caraga State University • Official Student Medical ID
        </Text>
      </View>

      {/* Digital CSU Campus Health Pass Badge */}
      <View style={styles.idCard}>
        {/* Card Header Strip */}
        <View style={styles.idCardHeader}>
          <View style={styles.csuEmblem}>
            <HeartPulse size={20} color="#ffffff" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.cardUnivName}>CARAGA STATE UNIVERSITY</Text>
            <Text style={styles.cardHealthDivision}>HEALTH SERVICES DIVISION • INFIRMARY</Text>
          </View>
          <View style={styles.activeTag}>
            <Text style={styles.activeTagText}>VALID</Text>
          </View>
        </View>

        {/* Patient Identity */}
        <View style={styles.idCardBody}>
          <View style={styles.avatarBox}>
            <Text style={styles.avatarInitials}>
              {user ? `${user.firstName[0]}${user.lastName[0]}` : "MS"}
            </Text>
          </View>

          <View style={{ flex: 1 }}>
            <Text style={styles.studentName}>
              {user ? `${user.firstName} ${user.lastName}` : "Maria Santos"}
            </Text>
            <View style={styles.metaRow}>
              <GraduationCap size={13} color="#cbd5e1" />
              <Text style={styles.metaText}>{user?.department || "College of Nursing"}</Text>
            </View>
            <View style={styles.metaRow}>
              <Text style={styles.idNumberLabel}>CSU ID:</Text>
              <Text style={styles.idNumberVal}>{user?.idNumber || "2022-04912"}</Text>
            </View>
          </View>
        </View>

        {/* QR Code Section for Kiosk Check-in */}
        <View style={styles.qrContainer}>
          <QrCode size={110} color="#0f172a" />
          <Text style={styles.qrHint}>Scan at CSU Clinic Kiosk for instant check-in</Text>
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
            <Text style={styles.safetyValue}>{user?.bloodType || "O+"}</Text>
          </View>

          <View style={styles.safetyItem}>
            <Text style={styles.safetyLabel}>KNOWN ALLERGIES</Text>
            <Text style={[styles.safetyValue, { color: "#dc2626" }]}>
              {user?.allergies || "No Known Drug Allergies (NKA)"}
            </Text>
          </View>
        </View>

        {/* 1-Tap Emergency Call Hotline */}
        <TouchableOpacity style={styles.emergencyBtn} onPress={callEmergency}>
          <PhoneCall size={18} color="#ffffff" />
          <Text style={styles.emergencyBtnText}>Call CSU Clinic Emergency: (085) 341-2786</Text>
        </TouchableOpacity>
      </View>

      {/* Settings / Sign Out */}
      <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
        <LogOut size={18} color="#dc2626" />
        <Text style={styles.logoutBtnText}>Sign Out of Patient Account</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f8fafc",
  },
  content: {
    padding: 20,
    paddingTop: 54,
    paddingBottom: 40,
  },
  header: {
    marginBottom: 20,
  },
  title: {
    fontSize: 22,
    fontWeight: "900",
    color: "#0f172a",
  },
  subtitle: {
    fontSize: 12,
    fontWeight: "600",
    color: "#64748b",
    marginTop: 2,
  },
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
  cardUnivName: {
    fontSize: 13,
    fontWeight: "900",
    color: "#ffffff",
    letterSpacing: 0.4,
  },
  cardHealthDivision: {
    fontSize: 9,
    fontWeight: "700",
    color: "#a7f3d0",
    letterSpacing: 0.2,
  },
  activeTag: {
    backgroundColor: "#10b981",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  activeTagText: {
    fontSize: 9,
    fontWeight: "900",
    color: "#ffffff",
  },
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
  avatarInitials: {
    fontSize: 20,
    fontWeight: "900",
    color: "#ffffff",
  },
  studentName: {
    fontSize: 18,
    fontWeight: "800",
    color: "#ffffff",
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 3,
  },
  metaText: {
    fontSize: 11,
    color: "#cbd5e1",
    fontWeight: "600",
  },
  idNumberLabel: {
    fontSize: 11,
    color: "#a7f3d0",
    fontWeight: "700",
  },
  idNumberVal: {
    fontSize: 12,
    fontFamily: "monospace",
    fontWeight: "800",
    color: "#ffffff",
  },
  qrContainer: {
    backgroundColor: "#ffffff",
    borderRadius: 16,
    padding: 16,
    alignItems: "center",
  },
  qrHint: {
    fontSize: 10,
    fontWeight: "700",
    color: "#64748b",
    marginTop: 8,
  },
  safetyCard: {
    backgroundColor: "#ffffff",
    borderRadius: 22,
    padding: 18,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    marginBottom: 20,
  },
  safetyHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 12,
  },
  safetyTitle: {
    fontSize: 11,
    fontWeight: "900",
    color: "#b91c1c",
    letterSpacing: 0.6,
  },
  safetyGrid: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 14,
  },
  safetyItem: {
    flex: 1,
    backgroundColor: "#fef2f2",
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: "#fecaca",
  },
  safetyLabel: {
    fontSize: 10,
    fontWeight: "800",
    color: "#991b1b",
    marginBottom: 2,
  },
  safetyValue: {
    fontSize: 14,
    fontWeight: "900",
    color: "#0f172a",
  },
  emergencyBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#dc2626",
    paddingVertical: 12,
    borderRadius: 14,
  },
  emergencyBtnText: {
    color: "#ffffff",
    fontSize: 12,
    fontWeight: "800",
  },
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
  logoutBtnText: {
    color: "#dc2626",
    fontSize: 13,
    fontWeight: "700",
  },
});

