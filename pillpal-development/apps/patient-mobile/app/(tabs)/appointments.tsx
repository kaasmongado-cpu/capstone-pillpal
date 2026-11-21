import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Alert,
  Modal,
  TextInput,
  RefreshControl,
  Linking,
  Platform,
} from "react-native";
import {
  Clock,
  User,
  MapPin,
  Video,
  CheckCircle2,
  CalendarPlus,
  X,
  CalendarDays,
} from "lucide-react-native";
import * as Haptics from "expo-haptics";
import { fetchWithAuth } from "@/services/api/client";
import { getAuthToken } from "@/services/auth/session";
import {
  getLocalAppointments,
  saveLocalAppointments,
  enqueueOutboxAction,
  LocalAppointment,
} from "@/services/db/database";

const QUICK_REASONS = [
  "Prescription Refill",
  "Fever / Flu Symptoms",
  "Medication Side Effects",
  "Semester Health Clearance",
  "Follow-up Checkup",
];

const DEMO_FALLBACK: LocalAppointment[] = [
  {
    id: "appt_demo_1",
    reason: "Semester Health Clearance & Follow-up",
    type: "IN_PERSON",
    status: "CONFIRMED",
    scheduledAt: new Date(Date.now() + 25 * 60 * 1000).toISOString(),
    providerName: "Dr. Evelyn Ramirez, MD",
    providerSpecialization: "General Physician",
    telehealthUrl: null,
    clinicalNotes: null,
    checkedInAt: null,
  },
  {
    id: "appt_demo_2",
    reason: "Upper Respiratory Tract Infection (URTI)",
    type: "IN_PERSON",
    status: "COMPLETED",
    scheduledAt: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString(),
    providerName: "Dr. Evelyn Ramirez, MD",
    providerSpecialization: "General Physician",
    telehealthUrl: null,
    clinicalNotes:
      "Prescribed Amoxicillin 500mg TID for 7 days. Advised adequate hydration and rest.",
    checkedInAt: null,
  },
];

export default function AppointmentsScreen() {
  const [appointments, setAppointments] = useState<LocalAppointment[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [bookingVisible, setBookingVisible] = useState(false);
  const [bookingType, setBookingType] = useState<"IN_PERSON" | "TELEHEALTH">("IN_PERSON");
  const [bookingReason, setBookingReason] = useState("Prescription Refill");
  const [bookingNotes, setBookingNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const loadAppointments = useCallback(async () => {
    // 1. Load cached local appointments first (0ms offline-ready)
    const cached = await getLocalAppointments();
    if (cached.length > 0) {
      setAppointments(cached);
    }

    // 2. Try syncing from live API if user has a real auth token
    const token = await getAuthToken();
    if (token) {
      try {
        const res = await fetchWithAuth("/appointments");
        if (res.ok) {
          const data: LocalAppointment[] = await res.json();
          setAppointments(data);
          await saveLocalAppointments(data);
          return;
        }
      } catch {
        // Offline or unreachable — keep cached data
      }
    }

    // 3. Seed demo consultation if local cache is completely empty
    if (cached.length === 0) {
      await saveLocalAppointments(DEMO_FALLBACK);
      setAppointments(DEMO_FALLBACK);
    }
  }, []);

  useEffect(() => {
    void loadAppointments();
  }, [loadAppointments]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadAppointments();
    setRefreshing(false);
  }, [loadAppointments]);

  async function handleLobbyCheckIn(appt: LocalAppointment) {
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});

    const updatedList = appointments.map((item) =>
      item.id === appt.id
        ? { ...item, status: "WAITING", checkedInAt: new Date().toISOString() }
        : item
    );
    setAppointments(updatedList);
    await saveLocalAppointments(updatedList);

    const token = await getAuthToken();
    let syncedOnline = false;

    if (token && !appt.id.startsWith("appt_demo_")) {
      try {
        const res = await fetchWithAuth(`/appointments/${appt.id}/check-in`, {
          method: "POST",
        });
        syncedOnline = res.ok;
      } catch {
        syncedOnline = false;
      }
    }

    if (!syncedOnline && !appt.id.startsWith("appt_demo_")) {
      await enqueueOutboxAction({
        id: `checkin_${appt.id}_${Date.now()}`,
        endpoint: `/appointments/${appt.id}/check-in`,
        http_method: "POST",
        payload: {},
        idempotency_key: `checkin_${appt.id}`,
      });
    }

    if (Platform.OS !== "web") {
      Alert.alert(
        "Lobby Check-In Recorded",
        syncedOnline
          ? "You have checked in at the CSU Health Services Clinic. The triage nurse has been notified."
          : "Check-in saved locally and will automatically sync as soon as campus Wi-Fi connects."
      );
    }
  }

  async function handleBookConsultation() {
    if (!bookingReason.trim()) return;
    setSubmitting(true);
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});

    const scheduledAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const localId = `appt_local_${Date.now()}`;
    const newAppt: LocalAppointment = {
      id: localId,
      reason: bookingReason.trim(),
      type: bookingType,
      status: "PENDING",
      scheduledAt,
      providerName: "Awaiting Triage Assignment",
      providerSpecialization: "CSU Infirmary",
      telehealthUrl: null,
      clinicalNotes: bookingNotes.trim() || null,
      checkedInAt: null,
    };

    try {
      const token = await getAuthToken();
      let createdOnServer = false;

      if (token) {
        try {
          const res = await fetchWithAuth("/appointments", {
            method: "POST",
            body: JSON.stringify({
              reason: bookingReason.trim(),
              type: bookingType,
              scheduledAt,
              patientNotes: bookingNotes.trim(),
            }),
          });
          if (res.ok) {
            const serverAppt = await res.json();
            newAppt.id = serverAppt.id;
            createdOnServer = true;
          }
        } catch {
          createdOnServer = false;
        }
      }

      if (!createdOnServer && token) {
        await enqueueOutboxAction({
          id: `book_${localId}`,
          endpoint: "/appointments",
          http_method: "POST",
          payload: {
            reason: bookingReason.trim(),
            type: bookingType,
            scheduledAt,
            patientNotes: bookingNotes.trim(),
          },
          idempotency_key: `book_${localId}`,
        });
      }

      const nextList = [newAppt, ...appointments];
      setAppointments(nextList);
      await saveLocalAppointments(nextList);
      setBookingVisible(false);
      setBookingNotes("");
    } finally {
      setSubmitting(false);
    }
  }

  const activeAppointments = appointments.filter(
    (a) => a.status === "CONFIRMED" || a.status === "WAITING" || a.status === "PENDING"
  );
  const pastAppointments = appointments.filter(
    (a) => a.status === "COMPLETED" || a.status === "CANCELLED" || a.status === "REJECTED"
  );

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#10b981" />
        }
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>Clinic Consultations</Text>
          <Text style={styles.subtitle}>
            CSU Health Services Infirmary appointments & telehealth
          </Text>
        </View>

        {/* Active & Pending Consultations */}
        {activeAppointments.length === 0 ? (
          <View style={styles.emptyCard}>
            <CalendarDays size={36} color="#94a3b8" />
            <Text style={styles.emptyTitle}>No Upcoming Appointments</Text>
            <Text style={styles.emptyDesc}>
              Request an in-person visit at the CSU Infirmary or a remote telehealth checkup.
            </Text>
          </View>
        ) : (
          activeAppointments.map((appt) => {
            const isWaiting = appt.status === "WAITING";
            const isConfirmed = appt.status === "CONFIRMED";
            const isPending = appt.status === "PENDING";

            return (
              <View key={appt.id} style={styles.card}>
                <View style={styles.badgeRow}>
                  <View
                    style={[
                      styles.confirmedBadge,
                      isPending && { backgroundColor: "#fffbeb", borderColor: "#fde68a" },
                      isWaiting && { backgroundColor: "#eff6ff", borderColor: "#bfdbfe" },
                    ]}
                  >
                    <Text
                      style={[
                        styles.confirmedBadgeText,
                        isPending && { color: "#b45309" },
                        isWaiting && { color: "#1d4ed8" },
                      ]}
                    >
                      {appt.status === "WAITING"
                        ? "WAITING IN LOBBY"
                        : appt.status === "PENDING"
                          ? "AWAITING TRIAGE"
                          : "CONFIRMED CONSULTATION"}
                    </Text>
                  </View>
                  <View style={styles.typeBadge}>
                    <Text style={styles.typeBadgeText}>{appt.type}</Text>
                  </View>
                </View>

                <Text style={styles.appointmentTitle}>{appt.reason}</Text>

                <View style={styles.infoRow}>
                  <Clock size={14} color="#64748b" />
                  <Text style={styles.infoText}>
                    {new Date(appt.scheduledAt).toLocaleString([], {
                      month: "short",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </Text>
                </View>

                <View style={styles.infoRow}>
                  <User size={14} color="#64748b" />
                  <Text style={styles.infoText}>
                    {appt.providerName || "CSU Duty Physician"} ({appt.providerSpecialization || "General"})
                  </Text>
                </View>

                <View style={styles.infoRow}>
                  <MapPin size={14} color="#64748b" />
                  <Text style={styles.infoText}>
                    {appt.type === "TELEHEALTH"
                      ? "Online Video Consultation"
                      : "CSU Main Campus Clinic • Infirmary"}
                  </Text>
                </View>

                {appt.type === "TELEHEALTH" && appt.telehealthUrl ? (
                  <TouchableOpacity
                    style={[styles.checkInBtn, { backgroundColor: "#0284c7" }]}
                    onPress={() => void Linking.openURL(appt.telehealthUrl!)}
                  >
                    <Video size={18} color="#ffffff" />
                    <Text style={styles.checkInBtnText}>Join Video Consultation</Text>
                  </TouchableOpacity>
                ) : (isConfirmed || isWaiting) && (
                  <TouchableOpacity
                    style={[styles.checkInBtn, isWaiting && styles.checkedInBtn]}
                    onPress={() => handleLobbyCheckIn(appt)}
                    disabled={isWaiting}
                  >
                    <CheckCircle2 size={18} color="#ffffff" />
                    <Text style={styles.checkInBtnText}>
                      {isWaiting ? "Checked In • Waiting in Lobby" : "I Have Arrived at Clinic Lobby"}
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
            );
          })
        )}

        {/* Book Consultation Button */}
        <TouchableOpacity style={styles.bookBtn} onPress={() => setBookingVisible(true)}>
          <CalendarPlus size={18} color="#047857" />
          <Text style={styles.bookBtnText}>Book New Consultation</Text>
        </TouchableOpacity>

        {/* Consultation History Section */}
        {pastAppointments.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>Recent Consultations</Text>
            {pastAppointments.map((appt) => (
              <View key={appt.id} style={styles.historyCard}>
                <View style={styles.historyHeader}>
                  <Text style={styles.historyDoctor}>
                    {appt.providerName || "CSU Clinic"}
                  </Text>
                  <Text style={styles.historyDate}>
                    {new Date(appt.scheduledAt).toLocaleDateString()}
                  </Text>
                </View>
                <Text style={styles.historyDiagnosis}>{appt.reason}</Text>
                {appt.clinicalNotes && (
                  <Text style={styles.historyNotes}>{appt.clinicalNotes}</Text>
                )}
              </View>
            ))}
          </>
        )}
      </ScrollView>

      {/* Book Consultation Modal */}
      <Modal visible={bookingVisible} animationType="slide" transparent>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Book CSU Clinic Consultation</Text>
              <TouchableOpacity onPress={() => setBookingVisible(false)}>
                <X size={22} color="#64748b" />
              </TouchableOpacity>
            </View>

            <Text style={styles.fieldLabel}>Consultation Type</Text>
            <View style={styles.typeToggleRow}>
              <TouchableOpacity
                style={[styles.typeOption, bookingType === "IN_PERSON" && styles.typeOptionActive]}
                onPress={() => setBookingType("IN_PERSON")}
              >
                <Text
                  style={[
                    styles.typeOptionText,
                    bookingType === "IN_PERSON" && styles.typeOptionTextActive,
                  ]}
                >
                  In-Person (Clinic)
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.typeOption, bookingType === "TELEHEALTH" && styles.typeOptionActive]}
                onPress={() => setBookingType("TELEHEALTH")}
              >
                <Text
                  style={[
                    styles.typeOptionText,
                    bookingType === "TELEHEALTH" && styles.typeOptionTextActive,
                  ]}
                >
                  Telehealth Video
                </Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.fieldLabel}>Chief Complaint / Reason</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={{ maxHeight: 40, marginBottom: 8 }}
              contentContainerStyle={{ gap: 6 }}
            >
              {QUICK_REASONS.map((r) => (
                <TouchableOpacity
                  key={r}
                  style={[styles.reasonChip, bookingReason === r && styles.reasonChipActive]}
                  onPress={() => setBookingReason(r)}
                >
                  <Text
                    style={[
                      styles.reasonChipText,
                      bookingReason === r && styles.reasonChipTextActive,
                    ]}
                  >
                    {r}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <TextInput
              style={styles.textInput}
              value={bookingReason}
              onChangeText={setBookingReason}
              placeholder="Reason for consultation..."
            />

            <Text style={styles.fieldLabel}>Symptoms / Additional Notes (Optional)</Text>
            <TextInput
              style={[styles.textInput, { height: 74, textAlignVertical: "top", paddingTop: 10 }]}
              value={bookingNotes}
              onChangeText={setBookingNotes}
              placeholder="Describe fever duration, allergies, or preferred time..."
              multiline
            />

            <TouchableOpacity
              style={[styles.submitBookBtn, submitting && { opacity: 0.7 }]}
              onPress={handleBookConsultation}
              disabled={submitting}
            >
              <Text style={styles.submitBookBtnText}>
                {submitting ? "Submitting Request..." : "Submit Appointment Request"}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
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
  emptyCard: {
    backgroundColor: "#ffffff",
    borderRadius: 20,
    padding: 24,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: "800",
    color: "#0f172a",
    marginTop: 10,
  },
  emptyDesc: {
    fontSize: 12,
    color: "#64748b",
    textAlign: "center",
    marginTop: 4,
    lineHeight: 18,
  },
  card: {
    backgroundColor: "#ffffff",
    borderRadius: 22,
    padding: 20,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    marginBottom: 16,
    shadowColor: "#0f172a",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.04,
    shadowRadius: 10,
    elevation: 3,
  },
  badgeRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 10,
  },
  confirmedBadge: {
    backgroundColor: "#ecfdf5",
    borderWidth: 1,
    borderColor: "#a7f3d0",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  confirmedBadgeText: {
    fontSize: 10,
    fontWeight: "800",
    color: "#047857",
  },
  typeBadge: {
    backgroundColor: "#f1f5f9",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  typeBadgeText: {
    fontSize: 10,
    fontWeight: "700",
    color: "#475569",
  },
  appointmentTitle: {
    fontSize: 17,
    fontWeight: "800",
    color: "#0f172a",
    marginBottom: 12,
  },
  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 8,
  },
  infoText: {
    fontSize: 12,
    color: "#475569",
    fontWeight: "600",
  },
  checkInBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#10b981",
    paddingVertical: 13,
    borderRadius: 14,
    marginTop: 14,
  },
  checkedInBtn: {
    backgroundColor: "#0284c7",
  },
  checkInBtnText: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "800",
  },
  bookBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#ecfdf5",
    borderWidth: 1,
    borderColor: "#a7f3d0",
    paddingVertical: 14,
    borderRadius: 16,
    marginBottom: 24,
  },
  bookBtnText: {
    color: "#047857",
    fontSize: 13,
    fontWeight: "800",
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: "800",
    color: "#0f172a",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 12,
  },
  historyCard: {
    backgroundColor: "#ffffff",
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    marginBottom: 10,
  },
  historyHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 4,
  },
  historyDoctor: {
    fontSize: 14,
    fontWeight: "800",
    color: "#0f172a",
  },
  historyDate: {
    fontSize: 11,
    color: "#94a3b8",
    fontWeight: "600",
  },
  historyDiagnosis: {
    fontSize: 12,
    fontWeight: "700",
    color: "#059669",
    marginBottom: 4,
  },
  historyNotes: {
    fontSize: 11,
    color: "#64748b",
    lineHeight: 16,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.5)",
    justifyContent: "flex-end",
  },
  modalSheet: {
    backgroundColor: "#ffffff",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 22,
    paddingBottom: 34,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: "900",
    color: "#0f172a",
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: "#334155",
    marginBottom: 6,
    marginTop: 10,
  },
  typeToggleRow: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 6,
  },
  typeOption: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#cbd5e1",
    alignItems: "center",
    backgroundColor: "#f8fafc",
  },
  typeOptionActive: {
    borderColor: "#10b981",
    backgroundColor: "#ecfdf5",
  },
  typeOptionText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#64748b",
  },
  typeOptionTextActive: {
    color: "#047857",
  },
  reasonChip: {
    backgroundColor: "#f1f5f9",
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 16,
  },
  reasonChipActive: {
    backgroundColor: "#10b981",
  },
  reasonChipText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#475569",
  },
  reasonChipTextActive: {
    color: "#ffffff",
  },
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
  submitBookBtn: {
    backgroundColor: "#10b981",
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: "center",
    marginTop: 18,
  },
  submitBookBtnText: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "800",
  },
});
