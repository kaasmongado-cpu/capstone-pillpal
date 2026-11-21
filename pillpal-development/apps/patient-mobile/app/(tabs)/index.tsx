import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
} from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import * as Haptics from "expo-haptics";
import {
  HeartPulse,
  Flame,
  CheckCircle2,
  XCircle,
  Scan,
  AlertTriangle,
  Clock,
  Sparkles,
} from "lucide-react-native";
import {
  getLocalPrescriptions,
  getTodayLocalLogs,
  logDoseLocally,
  saveLocalPrescription,
  LocalPrescription,
  LocalAdherenceLog,
} from "@/services/db/database";
import { getCachedUser, CachedUser } from "@/services/auth/session";

export default function TodayScreen() {
  const router = useRouter();
  const [user, setUser] = useState<CachedUser | null>(null);
  const [prescriptions, setPrescriptions] = useState<LocalPrescription[]>([]);
  const [logs, setLogs] = useState<LocalAdherenceLog[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = useCallback(async () => {
    const cached = await getCachedUser();
    setUser(cached);

    const rxList = await getLocalPrescriptions();

    // If local DB is empty on first install, seed default student medications
    if (rxList.length === 0 && cached) {
      const defaultRx = {
        id: "rx_demo_1",
        patient_id: cached.id,
        doctor_name: "Dr. Evelyn Ramirez",
        name: "Amoxicillin",
        dosage: "500 mg",
        form: "Capsule",
        instructions: "Take with food. Complete 7-day course.",
        frequency: "Three times daily",
        schedule_times: ["08:00 AM", "02:00 PM", "08:00 PM"],
        start_date: new Date().toISOString(),
        status: "ACTIVE",
      };
      await saveLocalPrescription(defaultRx);
      setPrescriptions([defaultRx]);
    } else {
      setPrescriptions(rxList);
    }

    const todayLogs = await getTodayLocalLogs();
    setLogs(todayLogs);
  }, []);

  useFocusEffect(
    useCallback(() => {
      void loadData();
    }, [loadData])
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  }, [loadData]);

  async function handleTakeDose(rxId: string, scheduledTime: string) {
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});

    const newLog = {
      id: `log_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      prescription_id: rxId,
      scheduled_time: scheduledTime,
      taken_time: new Date().toISOString(),
      status: "TAKEN" as const,
      notes: "Logged via Mobile App",
      created_at: new Date().toISOString(),
    };

    await logDoseLocally(newLog);
    await loadData();
  }

  async function handleSkipDose(rxId: string, scheduledTime: string) {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});

    const newLog = {
      id: `log_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      prescription_id: rxId,
      scheduled_time: scheduledTime,
      taken_time: null,
      status: "SKIPPED" as const,
      notes: "Skipped by patient",
      created_at: new Date().toISOString(),
    };

    await logDoseLocally(newLog);
    await loadData();
  }

  const isDoseLogged = (rxId: string, time: string) => {
    return logs.some((l) => l.prescription_id === rxId && l.scheduled_time === time);
  };

  const getDoseStatus = (rxId: string, time: string) => {
    const log = logs.find((l) => l.prescription_id === rxId && l.scheduled_time === time);
    return log?.status;
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#10b981" />}
    >
      {/* Top Greeting Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.greeting}>
            Good day, {user?.firstName || "Maria"}! 👋
          </Text>
          <Text style={styles.subGreeting}>
            {user?.department || "College of Nursing"} • {user?.idNumber || "2022-04912"}
          </Text>
        </View>

        <TouchableOpacity
          style={styles.quickScanBtn}
          onPress={() => router.push("/modal/ocr-scanner")}
        >
          <Scan size={18} color="#047857" />
          <Text style={styles.quickScanText}>Scan Med</Text>
        </TouchableOpacity>
      </View>

      {/* Streak & Adherence Hero Banner */}
      <View style={styles.streakBanner}>
        <View style={styles.streakLeft}>
          <View style={styles.flameIconBox}>
            <Flame size={24} color="#f59e0b" fill="#f59e0b" />
          </View>
          <View>
            <Text style={styles.streakNumber}>12 Days Active</Text>
            <Text style={styles.streakLabel}>Perfect adherence streak</Text>
          </View>
        </View>

        <View style={styles.streakBadge}>
          <Sparkles size={12} color="#059669" />
          <Text style={styles.streakBadgeText}>ON TRACK</Text>
        </View>
      </View>

      {/* Dosing Schedule Section */}
      <View style={styles.sectionHeader}>
        <Clock size={16} color="#0f172a" />
        <Text style={styles.sectionTitle}>Today's Dosing Timetable</Text>
      </View>

      {prescriptions.length === 0 ? (
        <View style={styles.emptyCard}>
          <HeartPulse size={36} color="#94a3b8" />
          <Text style={styles.emptyTitle}>No Active Prescriptions</Text>
          <Text style={styles.emptyDesc}>
            Scan a doctor's prescription slip or pill bottle to populate your intake schedule.
          </Text>
          <TouchableOpacity
            style={styles.emptyScanBtn}
            onPress={() => router.push("/modal/ocr-scanner")}
          >
            <Scan size={18} color="#ffffff" />
            <Text style={styles.emptyScanBtnText}>Open Camera OCR Scanner</Text>
          </TouchableOpacity>
        </View>
      ) : (
        prescriptions.map((rx) => (
          <View key={rx.id} style={styles.rxCard}>
            <View style={styles.rxHeader}>
              <View>
                <Text style={styles.rxName}>{rx.name}</Text>
                <Text style={styles.rxDetail}>
                  {rx.dosage} • {rx.form || "Capsule"} • {rx.frequency}
                </Text>
              </View>
              <View style={styles.doctorTag}>
                <Text style={styles.doctorTagText}>{rx.doctor_name || "CSU Infirmary"}</Text>
              </View>
            </View>

            {rx.instructions && (
              <View style={styles.rxInstructionsBox}>
                <Text style={styles.rxInstructionsText}>📌 {rx.instructions}</Text>
              </View>
            )}

            {/* Schedule Slot Buttons */}
            <View style={styles.slotsRow}>
              {rx.schedule_times.map((time) => {
                const logged = isDoseLogged(rx.id, time);
                const status = getDoseStatus(rx.id, time);

                return (
                  <View key={time} style={styles.slotItem}>
                    <Text style={styles.slotTime}>{time}</Text>

                    {logged ? (
                      <View
                        style={[
                          styles.loggedBadge,
                          status === "TAKEN" ? styles.takenBadge : styles.skippedBadge,
                        ]}
                      >
                        {status === "TAKEN" ? (
                          <>
                            <CheckCircle2 size={14} color="#059669" />
                            <Text style={styles.takenText}>Taken</Text>
                          </>
                        ) : (
                          <>
                            <XCircle size={14} color="#dc2626" />
                            <Text style={styles.skippedText}>Skipped</Text>
                          </>
                        )}
                      </View>
                    ) : (
                      <View style={styles.actionButtonsRow}>
                        <TouchableOpacity
                          style={styles.takeBtn}
                          onPress={() => handleTakeDose(rx.id, time)}
                        >
                          <Text style={styles.takeBtnText}>Take</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={styles.skipBtn}
                          onPress={() => handleSkipDose(rx.id, time)}
                        >
                          <Text style={styles.skipBtnText}>Skip</Text>
                        </TouchableOpacity>
                      </View>
                    )}
                  </View>
                );
              })}
            </View>
          </View>
        ))
      )}

      {/* Emergency Clinic Notice */}
      <View style={styles.emergencyBox}>
        <AlertTriangle size={18} color="#b91c1c" />
        <View style={{ flex: 1 }}>
          <Text style={styles.emergencyTitle}>Caraga State University Health Infirmary</Text>
          <Text style={styles.emergencySubtitle}>
            Emergency Hotline: (085) 341-2786 • Mon-Fri 8:00 AM - 5:00 PM
          </Text>
        </View>
      </View>
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
    paddingBottom: 36,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 18,
  },
  greeting: {
    fontSize: 20,
    fontWeight: "900",
    color: "#0f172a",
  },
  subGreeting: {
    fontSize: 12,
    fontWeight: "600",
    color: "#64748b",
    marginTop: 2,
  },
  quickScanBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#ecfdf5",
    borderWidth: 1,
    borderColor: "#a7f3d0",
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 12,
  },
  quickScanText: {
    fontSize: 12,
    fontWeight: "800",
    color: "#047857",
  },
  streakBanner: {
    backgroundColor: "#ffffff",
    borderRadius: 20,
    padding: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    shadowColor: "#0f172a",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.04,
    shadowRadius: 10,
    elevation: 2,
    marginBottom: 22,
  },
  streakLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  flameIconBox: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: "#fffbeb",
    borderWidth: 1,
    borderColor: "#fef3c7",
    alignItems: "center",
    justifyContent: "center",
  },
  streakNumber: {
    fontSize: 16,
    fontWeight: "900",
    color: "#0f172a",
  },
  streakLabel: {
    fontSize: 11,
    color: "#64748b",
    fontWeight: "600",
  },
  streakBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#ecfdf5",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#a7f3d0",
  },
  streakBadgeText: {
    fontSize: 10,
    fontWeight: "800",
    color: "#047857",
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: "800",
    color: "#0f172a",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  emptyCard: {
    backgroundColor: "#ffffff",
    borderRadius: 20,
    padding: 24,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    marginBottom: 20,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: "#0f172a",
    marginTop: 12,
  },
  emptyDesc: {
    fontSize: 12,
    color: "#64748b",
    textAlign: "center",
    marginTop: 4,
    marginBottom: 18,
    lineHeight: 18,
  },
  emptyScanBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#10b981",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 14,
  },
  emptyScanBtnText: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "800",
  },
  rxCard: {
    backgroundColor: "#ffffff",
    borderRadius: 20,
    padding: 18,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    marginBottom: 14,
    shadowColor: "#0f172a",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 8,
    elevation: 2,
  },
  rxHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  rxName: {
    fontSize: 17,
    fontWeight: "800",
    color: "#0f172a",
  },
  rxDetail: {
    fontSize: 12,
    color: "#64748b",
    fontWeight: "600",
    marginTop: 2,
  },
  doctorTag: {
    backgroundColor: "#f1f5f9",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  doctorTagText: {
    fontSize: 10,
    fontWeight: "700",
    color: "#475569",
  },
  rxInstructionsBox: {
    backgroundColor: "#f8fafc",
    padding: 8,
    borderRadius: 8,
    marginTop: 10,
  },
  rxInstructionsText: {
    fontSize: 11,
    color: "#475569",
    fontWeight: "600",
  },
  slotsRow: {
    marginTop: 14,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  slotItem: {
    flex: 1,
    minWidth: 95,
    backgroundColor: "#f8fafc",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 14,
    padding: 10,
    alignItems: "center",
  },
  slotTime: {
    fontSize: 11,
    fontWeight: "800",
    color: "#0f172a",
    marginBottom: 8,
  },
  actionButtonsRow: {
    flexDirection: "row",
    gap: 6,
    width: "100%",
  },
  takeBtn: {
    flex: 1,
    backgroundColor: "#10b981",
    paddingVertical: 6,
    borderRadius: 8,
    alignItems: "center",
  },
  takeBtnText: {
    color: "#ffffff",
    fontSize: 11,
    fontWeight: "800",
  },
  skipBtn: {
    backgroundColor: "#f1f5f9",
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderRadius: 8,
    alignItems: "center",
  },
  skipBtnText: {
    color: "#64748b",
    fontSize: 11,
    fontWeight: "700",
  },
  loggedBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 8,
    width: "100%",
    justifyContent: "center",
  },
  takenBadge: {
    backgroundColor: "#ecfdf5",
  },
  takenText: {
    fontSize: 11,
    fontWeight: "800",
    color: "#059669",
  },
  skippedBadge: {
    backgroundColor: "#fef2f2",
  },
  skippedText: {
    fontSize: 11,
    fontWeight: "800",
    color: "#dc2626",
  },
  emergencyBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: "#fef2f2",
    borderWidth: 1,
    borderColor: "#fecaca",
    padding: 14,
    borderRadius: 16,
    marginTop: 10,
  },
  emergencyTitle: {
    fontSize: 12,
    fontWeight: "800",
    color: "#991b1b",
  },
  emergencySubtitle: {
    fontSize: 11,
    fontWeight: "600",
    color: "#b91c1c",
    marginTop: 2,
  },
});

