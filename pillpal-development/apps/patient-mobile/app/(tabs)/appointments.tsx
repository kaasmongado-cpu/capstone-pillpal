import React, { useState, useCallback, useMemo } from "react";
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
  Platform,
} from "react-native";
import { useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { BrandHeader } from "@/components/BrandHeader";
import {
  Clock,
  User,
  MapPin,
  CheckCircle2,
  CalendarPlus,
  X,
  CalendarDays,
  FileText,
  XCircle,
  ChevronLeft,
  ChevronRight,
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

const CLINIC_TIME_SLOTS = [
  "08:30 AM",
  "09:30 AM",
  "10:30 AM",
  "01:30 PM",
  "02:30 PM",
  "03:30 PM",
];

const WEEKDAY_HEADERS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

function toIsoDate(date: Date): string {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function getDefaultClinicWeekdayIso(): string {
  const cursor = new Date();
  cursor.setHours(12, 0, 0, 0);
  while (cursor.getDay() === 0 || cursor.getDay() === 6) {
    cursor.setDate(cursor.getDate() + 1);
  }
  return toIsoDate(cursor);
}

function formatReadableDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  return new Date(y, m - 1, d).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

type CalendarCell = {
  key: string;
  iso: string;
  day: number;
  isToday: boolean;
  isWeekend: boolean;
  isDisabled: boolean;
} | null;

function buildCalendarWeeks(year: number, month: number): CalendarCell[][] {
  const today = new Date();
  const todayIso = toIsoDate(today);
  const firstDayOfWeek = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const cells: CalendarCell[] = [];
  for (let i = 0; i < firstDayOfWeek; i++) {
    cells.push(null);
  }
  for (let day = 1; day <= daysInMonth; day++) {
    const dt = new Date(year, month, day);
    const iso = toIsoDate(dt);
    const dow = dt.getDay();
    const isWeekend = dow === 0 || dow === 6;
    const isPast = iso < todayIso;
    cells.push({
      key: iso,
      iso,
      day,
      isToday: iso === todayIso,
      isWeekend,
      isDisabled: isPast || isWeekend,
    });
  }
  while (cells.length % 7 !== 0) {
    cells.push(null);
  }

  const weeks: CalendarCell[][] = [];
  for (let i = 0; i < cells.length; i += 7) {
    weeks.push(cells.slice(i, i + 7));
  }
  return weeks;
}

function combineIsoAndSlot(isoDate: string, slot: string): Date {
  const match = slot.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  let hours = 8;
  let minutes = 30;
  if (match && match[1] && match[2] && match[3]) {
    hours = parseInt(match[1], 10);
    minutes = parseInt(match[2], 10);
    const period = match[3].toUpperCase();
    if (period === "PM" && hours < 12) hours += 12;
    if (period === "AM" && hours === 12) hours = 0;
  }
  const [y, m, d] = isoDate.split("-").map((v) => parseInt(v, 10));
  return new Date(y || 2026, (m || 1) - 1, d || 1, hours, minutes, 0, 0);
}

export default function AppointmentsScreen() {
  const insets = useSafeAreaInsets();
  const defaultDateIso = useMemo(() => getDefaultClinicWeekdayIso(), []);
  const [appointments, setAppointments] = useState<LocalAppointment[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  // Booking Modal State
  const [bookingVisible, setBookingVisible] = useState(false);
  const [selectedDateIso, setSelectedDateIso] = useState(defaultDateIso);
  const [calendarMonth, setCalendarMonth] = useState(() => {
    const [y, m] = defaultDateIso.split("-").map(Number);
    return { year: y || new Date().getFullYear(), month: (m || 1) - 1 };
  });
  const [selectedTimeSlot, setSelectedTimeSlot] = useState(CLINIC_TIME_SLOTS[0]);
  const [bookingReason, setBookingReason] = useState("Prescription Refill");
  const [bookingNotes, setBookingNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const calendarWeeks = useMemo(
    () => buildCalendarWeeks(calendarMonth.year, calendarMonth.month),
    [calendarMonth.year, calendarMonth.month],
  );
  const currentMonthLabel = useMemo(
    () =>
      new Date(calendarMonth.year, calendarMonth.month, 1).toLocaleDateString("en-US", {
        month: "long",
        year: "numeric",
      }),
    [calendarMonth.year, calendarMonth.month],
  );
  const canGoPrevMonth = useMemo(() => {
    const now = new Date();
    return (
      calendarMonth.year > now.getFullYear() ||
      (calendarMonth.year === now.getFullYear() && calendarMonth.month > now.getMonth())
    );
  }, [calendarMonth.year, calendarMonth.month]);

  function shiftCalendarMonth(delta: number) {
    setCalendarMonth((prev) => {
      const next = new Date(prev.year, prev.month + delta, 1);
      return { year: next.getFullYear(), month: next.getMonth() };
    });
  }

  // Cancel Modal State
  const [cancelTarget, setCancelTarget] = useState<LocalAppointment | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelling, setCancelling] = useState(false);

  // Consultation Summary Notes Modal
  const [notesTarget, setNotesTarget] = useState<LocalAppointment | null>(null);

  const loadAppointments = useCallback(async () => {
    const cached = await getLocalAppointments();
    const cleanCached = cached.filter((a) => !a.id.startsWith("appt_demo_"));
    setAppointments(cleanCached);

    const token = await getAuthToken();
    if (token) {
      try {
        const res = await fetchWithAuth("/appointments");
        if (res.ok) {
          const data: LocalAppointment[] = await res.json();
          setAppointments(data);
          await saveLocalAppointments(data);
        }
      } catch {
        // Offline — keep cached appointments
      }
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void loadAppointments();
    }, [loadAppointments]),
  );

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
        : item,
    );
    setAppointments(updatedList);
    await saveLocalAppointments(updatedList);

    const token = await getAuthToken();
    let syncedOnline = false;

    if (token && !appt.id.startsWith("appt_local_")) {
      try {
        const res = await fetchWithAuth(`/appointments/${appt.id}/check-in`, {
          method: "POST",
        });
        syncedOnline = res.ok;
      } catch {
        syncedOnline = false;
      }
    }

    if (!syncedOnline && !appt.id.startsWith("appt_local_")) {
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
          : "Check-in saved locally and will automatically sync when online.",
      );
    }
  }

  async function handleConfirmCancel() {
    if (!cancelTarget) return;
    setCancelling(true);
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});

    const reasonText = cancelReason.trim() || "Cancelled by patient.";
    const updatedList = appointments.map((item) =>
      item.id === cancelTarget.id
        ? { ...item, status: "CANCELLED", cancellationReason: reasonText }
        : item,
    );
    setAppointments(updatedList);
    await saveLocalAppointments(updatedList);

    const token = await getAuthToken();
    let synced = false;
    if (token && !cancelTarget.id.startsWith("appt_local_")) {
      try {
        const res = await fetchWithAuth(`/appointments/${cancelTarget.id}/cancel`, {
          method: "POST",
          body: JSON.stringify({ cancellationReason: reasonText }),
        });
        synced = res.ok;
      } catch {
        synced = false;
      }
    }

    if (!synced && !cancelTarget.id.startsWith("appt_local_")) {
      await enqueueOutboxAction({
        id: `cancel_${cancelTarget.id}_${Date.now()}`,
        endpoint: `/appointments/${cancelTarget.id}/cancel`,
        http_method: "POST",
        payload: { cancellationReason: reasonText },
        idempotency_key: `cancel_${cancelTarget.id}`,
      });
    }

    setCancelling(false);
    setCancelTarget(null);
    setCancelReason("");
    void loadAppointments();
  }

  async function handleBookConsultation() {
    if (!bookingReason.trim() || !selectedDateIso) return;
    setSubmitting(true);
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});

    const scheduledDate = combineIsoAndSlot(selectedDateIso, selectedTimeSlot);
    const scheduledAt = scheduledDate.toISOString();
    const combinedNotes = bookingNotes.trim()
      ? `${bookingNotes.trim()} (Preferred Time: ${selectedTimeSlot})`
      : `Preferred Time: ${selectedTimeSlot}`;

    const localId = `appt_local_${Date.now()}`;
    const newAppt: LocalAppointment = {
      id: localId,
      reason: bookingReason.trim(),
      type: "IN_PERSON",
      status: "PENDING",
      scheduledAt,
      providerName: "Awaiting Triage Assignment",
      providerSpecialization: "CSU Infirmary",
      telehealthUrl: null,
      clinicalNotes: null,
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
              type: "IN_PERSON",
              scheduledAt,
              requestedDate: selectedDateIso,
              patientNotes: combinedNotes,
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
            type: "IN_PERSON",
            scheduledAt,
            requestedDate: selectedDateIso,
            patientNotes: combinedNotes,
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
    (a) =>
      a.status === "IN_PROGRESS" ||
      a.status === "CONFIRMED" ||
      a.status === "WAITING" ||
      a.status === "PENDING",
  );
  const pastAppointments = appointments.filter(
    (a) =>
      a.status === "COMPLETED" ||
      a.status === "CANCELLED" ||
      a.status === "REJECTED" ||
      a.status === "NO_SHOW",
  );

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
          title="Clinic Visits"
          subtitle="CSU Health Services Infirmary in-person appointments"
        />

        {/* Active & Pending Consultations */}
        {activeAppointments.length === 0 ? (
          <View style={styles.emptyCard}>
            <CalendarDays size={36} color="#94a3b8" />
            <Text style={styles.emptyTitle}>No Upcoming Appointments</Text>
            <Text style={styles.emptyDesc}>
              Request an in-person consultation visit at the CSU Infirmary.
            </Text>
          </View>
        ) : (
          activeAppointments.map((appt) => {
            const isWaiting = appt.status === "WAITING";
            const isConfirmed = appt.status === "CONFIRMED";
            const isPending = appt.status === "PENDING";
            const isInProgress = appt.status === "IN_PROGRESS";

            return (
              <View key={appt.id} style={styles.card}>
                <View style={styles.badgeRow}>
                  <View
                    style={[
                      styles.confirmedBadge,
                      isPending && { backgroundColor: "#fffbeb", borderColor: "#fde68a" },
                      isWaiting && { backgroundColor: "#eff6ff", borderColor: "#bfdbfe" },
                      isInProgress && { backgroundColor: "#dcfce7", borderColor: "#86efac" },
                    ]}
                  >
                    <Text
                      style={[
                        styles.confirmedBadgeText,
                        isPending && { color: "#b45309" },
                        isWaiting && { color: "#1d4ed8" },
                        isInProgress && { color: "#15803d" },
                      ]}
                    >
                      {isWaiting
                        ? "WAITING IN LOBBY"
                        : isInProgress
                          ? "IN CONSULTATION"
                          : isPending
                            ? "AWAITING TRIAGE"
                            : "CONFIRMED"}
                    </Text>
                  </View>
                  <View style={styles.typeBadge}>
                    <Text style={styles.typeBadgeText}>IN-PERSON</Text>
                  </View>
                </View>

                <Text style={styles.appointmentTitle}>{appt.reason}</Text>

                <View style={styles.infoRow}>
                  <Clock size={14} color="#64748b" />
                  <Text style={styles.infoText}>
                    {new Date(appt.scheduledAt).toLocaleString([], {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </Text>
                </View>

                <View style={styles.infoRow}>
                  <User size={14} color="#64748b" />
                  <Text style={styles.infoText}>
                    {appt.providerName || "CSU Duty Physician"} (
                    {appt.providerSpecialization || "General"})
                  </Text>
                </View>

                <View style={styles.infoRow}>
                  <MapPin size={14} color="#64748b" />
                  <Text style={styles.infoText}>
                    CSU Main Campus Clinic • Infirmary
                  </Text>
                </View>

                {(isConfirmed || isWaiting) && (
                  <TouchableOpacity
                    style={[styles.checkInBtn, isWaiting && styles.checkedInBtn]}
                    onPress={() => void handleLobbyCheckIn(appt)}
                    disabled={isWaiting}
                  >
                    <CheckCircle2 size={18} color="#ffffff" />
                    <Text style={styles.checkInBtnText}>
                      {isWaiting
                        ? "Checked In • Waiting in Lobby"
                        : "I Have Arrived at Clinic Lobby"}
                    </Text>
                  </TouchableOpacity>
                )}

                {!isInProgress && (
                  <TouchableOpacity
                    style={styles.cancelLinkBtn}
                    onPress={() => {
                      setCancelReason("");
                      setCancelTarget(appt);
                    }}
                  >
                    <XCircle size={14} color="#dc2626" />
                    <Text style={styles.cancelLinkText}>
                      {isPending ? "Withdraw Request" : "Cancel Visit"}
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
            <Text style={styles.sectionTitle}>Consultation History</Text>
            {pastAppointments.map((appt) => (
              <View key={appt.id} style={styles.historyCard}>
                <View style={styles.historyHeader}>
                  <Text style={styles.historyDoctor}>{appt.providerName || "CSU Clinic"}</Text>
                  <View
                    style={[
                      styles.histStatusPill,
                      appt.status === "COMPLETED"
                        ? { backgroundColor: "#ecfdf5" }
                        : appt.status === "NO_SHOW"
                          ? { backgroundColor: "#ffe4e6" }
                          : appt.status === "REJECTED"
                            ? { backgroundColor: "#fee2e2" }
                            : { backgroundColor: "#fef3c7" },
                    ]}
                  >
                    <Text
                      style={[
                        styles.histStatusText,
                        appt.status === "COMPLETED"
                          ? { color: "#059669" }
                          : appt.status === "NO_SHOW"
                            ? { color: "#be123c" }
                            : appt.status === "REJECTED"
                              ? { color: "#b91c1c" }
                              : { color: "#92400e" },
                      ]}
                    >
                      {appt.status === "NO_SHOW" ? "NO-SHOW" : appt.status}
                    </Text>
                  </View>
                </View>

                <Text style={styles.historyDiagnosis}>{appt.reason}</Text>
                <Text style={styles.historyDate}>
                  {new Date(appt.scheduledAt).toLocaleString([], {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </Text>

                {appt.status === "REJECTED" && appt.rejectionReason ? (
                  <Text style={styles.historyAlertNote}>
                    Decline reason: {appt.rejectionReason}
                  </Text>
                ) : null}

                {(appt.status === "CANCELLED" || appt.status === "NO_SHOW") &&
                appt.cancellationReason ? (
                  <Text style={styles.historyCancelNote}>{appt.cancellationReason}</Text>
                ) : null}

                {appt.status === "COMPLETED" && (
                  <TouchableOpacity
                    style={styles.viewNotesBtn}
                    onPress={() => setNotesTarget(appt)}
                  >
                    <FileText size={14} color="#0284c7" />
                    <Text style={styles.viewNotesBtnText}>
                      View Doctor&apos;s Consultation Summary
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
            ))}
          </>
        )}
      </ScrollView>

      {/* Book Consultation Modal */}
      <Modal visible={bookingVisible} animationType="slide" transparent>
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalSheet, { maxHeight: "90%" }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Book CSU Clinic Consultation</Text>
              <TouchableOpacity onPress={() => setBookingVisible(false)}>
                <X size={22} color="#64748b" />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              <View style={styles.inPersonBanner}>
                <MapPin size={14} color="#047857" />
                <Text style={styles.inPersonBannerText}>
                  In-Person Visit • CSU Campus Infirmary
                </Text>
              </View>

              <Text style={styles.fieldLabel}>Preferred Date (Clinic Weekdays Mon–Fri)</Text>
              <View style={styles.calendarCard}>
                {/* Month Navigation Header */}
                <View style={styles.calendarHeader}>
                  <TouchableOpacity
                    style={[
                      styles.calendarNavBtn,
                      !canGoPrevMonth && styles.calendarNavBtnDisabled,
                    ]}
                    disabled={!canGoPrevMonth}
                    onPress={() => shiftCalendarMonth(-1)}
                    accessibilityLabel="Previous month"
                  >
                    <ChevronLeft size={16} color={canGoPrevMonth ? "#0f172a" : "#cbd5e1"} />
                  </TouchableOpacity>
                  <Text style={styles.calendarMonthTitle}>{currentMonthLabel}</Text>
                  <TouchableOpacity
                    style={styles.calendarNavBtn}
                    onPress={() => shiftCalendarMonth(1)}
                    accessibilityLabel="Next month"
                  >
                    <ChevronRight size={16} color="#0f172a" />
                  </TouchableOpacity>
                </View>

                {/* Weekday Column Headers */}
                <View style={styles.calendarWeekRow}>
                  {WEEKDAY_HEADERS.map((label, idx) => (
                    <Text
                      key={label}
                      style={[
                        styles.calendarWeekdayLabel,
                        (idx === 0 || idx === 6) && { color: "#cbd5e1" },
                      ]}
                    >
                      {label}
                    </Text>
                  ))}
                </View>

                {/* Day Cells */}
                {calendarWeeks.map((week, wIdx) => (
                  <View key={wIdx} style={styles.calendarWeekRow}>
                    {week.map((cell, cIdx) => {
                      if (!cell) {
                        return <View key={`empty_${wIdx}_${cIdx}`} style={styles.calendarDayCell} />;
                      }
                      const isSelected = selectedDateIso === cell.iso;
                      return (
                        <TouchableOpacity
                          key={cell.key}
                          disabled={cell.isDisabled}
                          onPress={() => {
                            void Haptics.selectionAsync().catch(() => {});
                            setSelectedDateIso(cell.iso);
                          }}
                          style={[
                            styles.calendarDayCell,
                            cell.isToday && !isSelected && styles.calendarDayToday,
                            isSelected && styles.calendarDaySelected,
                          ]}
                        >
                          <Text
                            style={[
                              styles.calendarDayText,
                              cell.isDisabled && styles.calendarDayTextDisabled,
                              cell.isToday && !isSelected && styles.calendarDayTextToday,
                              isSelected && styles.calendarDayTextSelected,
                            ]}
                          >
                            {cell.day}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                ))}

                {/* Selected Date Summary Footer */}
                <View style={styles.calendarFooter}>
                  <View style={styles.selectedDatePill}>
                    <CalendarDays size={12} color="#047857" />
                    <Text style={styles.selectedDateText}>
                      {formatReadableDate(selectedDateIso)}
                    </Text>
                  </View>
                  <Text style={styles.calendarHintText}>Closed Sat–Sun</Text>
                </View>
              </View>

              <Text style={styles.fieldLabel}>Preferred Time Slot</Text>
              <View style={styles.timeGrid}>
                {CLINIC_TIME_SLOTS.map((slot) => {
                  const active = selectedTimeSlot === slot;
                  return (
                    <TouchableOpacity
                      key={slot}
                      style={[styles.slotChip, active && styles.slotChipActive]}
                      onPress={() => setSelectedTimeSlot(slot)}
                    >
                      <Text style={[styles.slotChipText, active && styles.slotChipTextActive]}>
                        {slot}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
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
                placeholder="Describe symptom duration or specific needs..."
                multiline
              />

              <TouchableOpacity
                style={[styles.submitBookBtn, submitting && { opacity: 0.7 }]}
                onPress={() => void handleBookConsultation()}
                disabled={submitting}
              >
                <Text style={styles.submitBookBtnText}>
                  {submitting ? "Submitting Request..." : "Submit Appointment Request"}
                </Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Cancel Appointment Reason Modal */}
      <Modal visible={Boolean(cancelTarget)} animationType="fade" transparent>
        <View style={[styles.modalBackdrop, { justifyContent: "center", padding: 20 }]}>
          <View style={styles.dialogBox}>
            <Text style={styles.modalTitle}>Cancel Appointment</Text>
            <Text style={styles.dialogDesc}>
              Cancel your visit for &quot;{cancelTarget?.reason}&quot;?
            </Text>
            <TextInput
              style={styles.textInput}
              placeholder="Reason (e.g. Class conflict, feeling better)"
              placeholderTextColor="#94a3b8"
              value={cancelReason}
              onChangeText={setCancelReason}
            />
            <View style={{ flexDirection: "row", gap: 10, marginTop: 14 }}>
              <TouchableOpacity
                style={[styles.dialogBtn, { backgroundColor: "#f1f5f9" }]}
                onPress={() => setCancelTarget(null)}
              >
                <Text style={[styles.dialogBtnText, { color: "#475569" }]}>Keep Visit</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.dialogBtn, { backgroundColor: "#dc2626" }]}
                disabled={cancelling}
                onPress={() => void handleConfirmCancel()}
              >
                <Text style={styles.dialogBtnText}>
                  {cancelling ? "Cancelling..." : "Confirm Cancel"}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Doctor's Consultation Summary Modal */}
      <Modal visible={Boolean(notesTarget)} animationType="slide" transparent>
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalSheet, { maxHeight: "75%" }]}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle}>Consultation Summary</Text>
                <Text style={styles.notesMeta}>
                  {notesTarget?.providerName || "CSU Physician"} •{" "}
                  {notesTarget ? new Date(notesTarget.scheduledAt).toLocaleDateString() : ""}
                </Text>
              </View>
              <TouchableOpacity onPress={() => setNotesTarget(null)}>
                <X size={22} color="#64748b" />
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.notesScrollBox}>
              <Text style={styles.notesBodyText}>
                {notesTarget?.clinicalNotes ||
                  "No detailed clinical notes were recorded for this consultation."}
              </Text>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f8fafc" },
  content: { padding: 20, paddingTop: 54, paddingBottom: 110 },
  header: { marginBottom: 20 },
  title: { fontSize: 22, fontWeight: "900", color: "#0f172a" },
  subtitle: { fontSize: 12, fontWeight: "600", color: "#64748b", marginTop: 2 },
  emptyCard: {
    backgroundColor: "#ffffff",
    borderRadius: 20,
    padding: 24,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    marginBottom: 16,
  },
  emptyTitle: { fontSize: 15, fontWeight: "800", color: "#0f172a", marginTop: 10 },
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
  badgeRow: { flexDirection: "row", gap: 8, marginBottom: 10 },
  confirmedBadge: {
    backgroundColor: "#ecfdf5",
    borderWidth: 1,
    borderColor: "#a7f3d0",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  confirmedBadgeText: { fontSize: 10, fontWeight: "800", color: "#047857" },
  typeBadge: {
    backgroundColor: "#f1f5f9",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  typeBadgeText: { fontSize: 10, fontWeight: "700", color: "#475569" },
  appointmentTitle: { fontSize: 17, fontWeight: "800", color: "#0f172a", marginBottom: 12 },
  infoRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 },
  infoText: { fontSize: 12, color: "#475569", fontWeight: "600", flex: 1 },
  checkInBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#10b981",
    paddingVertical: 13,
    borderRadius: 14,
    marginTop: 12,
  },
  checkedInBtn: { backgroundColor: "#0284c7" },
  checkInBtnText: { color: "#ffffff", fontSize: 13, fontWeight: "800" },
  cancelLinkBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    marginTop: 12,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: "#fef2f2",
  },
  cancelLinkText: { color: "#dc2626", fontSize: 12, fontWeight: "700" },
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
  bookBtnText: { color: "#047857", fontSize: 13, fontWeight: "800" },
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
  historyDoctor: { fontSize: 14, fontWeight: "800", color: "#0f172a" },
  histStatusPill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  histStatusText: { fontSize: 9, fontWeight: "900" },
  historyDiagnosis: { fontSize: 13, fontWeight: "700", color: "#0f172a", marginBottom: 2 },
  historyDate: { fontSize: 11, color: "#64748b", fontWeight: "600" },
  historyAlertNote: {
    marginTop: 8,
    fontSize: 11,
    color: "#b91c1c",
    backgroundColor: "#fef2f2",
    padding: 8,
    borderRadius: 8,
  },
  historyCancelNote: {
    marginTop: 8,
    fontSize: 11,
    color: "#92400e",
    backgroundColor: "#fffbeb",
    padding: 8,
    borderRadius: 8,
  },
  viewNotesBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    marginTop: 10,
    paddingVertical: 9,
    borderRadius: 10,
    backgroundColor: "#f0f9ff",
    borderWidth: 1,
    borderColor: "#bae6fd",
  },
  viewNotesBtnText: { fontSize: 12, fontWeight: "800", color: "#0284c7" },
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
    marginBottom: 14,
  },
  modalTitle: { fontSize: 17, fontWeight: "900", color: "#0f172a" },
  fieldLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: "#334155",
    marginBottom: 6,
    marginTop: 12,
  },
  inPersonBanner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#10b981",
    backgroundColor: "#ecfdf5",
    marginBottom: 6,
  },
  inPersonBannerText: { fontSize: 12, fontWeight: "800", color: "#047857" },
  calendarCard: {
    backgroundColor: "#f8fafc",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 16,
    padding: 12,
  },
  calendarHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  calendarNavBtn: {
    width: 30,
    height: 30,
    borderRadius: 9,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    alignItems: "center",
    justifyContent: "center",
  },
  calendarNavBtnDisabled: {
    backgroundColor: "#f1f5f9",
    borderColor: "#e2e8f0",
  },
  calendarMonthTitle: {
    fontSize: 13,
    fontWeight: "900",
    color: "#0f172a",
  },
  calendarWeekRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  calendarWeekdayLabel: {
    flex: 1,
    textAlign: "center",
    fontSize: 10,
    fontWeight: "800",
    color: "#64748b",
    paddingVertical: 4,
  },
  calendarDayCell: {
    flex: 1,
    height: 34,
    marginHorizontal: 2,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  calendarDayToday: {
    borderWidth: 1.5,
    borderColor: "#10b981",
    backgroundColor: "#ecfdf5",
  },
  calendarDaySelected: {
    backgroundColor: "#10b981",
  },
  calendarDayText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#0f172a",
  },
  calendarDayTextDisabled: {
    color: "#cbd5e1",
    fontWeight: "500",
  },
  calendarDayTextToday: {
    color: "#047857",
    fontWeight: "900",
  },
  calendarDayTextSelected: {
    color: "#ffffff",
    fontWeight: "900",
  },
  calendarFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: "#e2e8f0",
  },
  selectedDatePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "#ecfdf5",
    borderWidth: 1,
    borderColor: "#a7f3d0",
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 99,
  },
  selectedDateText: {
    fontSize: 11,
    fontWeight: "800",
    color: "#047857",
  },
  calendarHintText: {
    fontSize: 10,
    fontWeight: "600",
    color: "#94a3b8",
  },
  timeGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  slotChip: {
    width: "31%",
    paddingVertical: 9,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#cbd5e1",
    backgroundColor: "#f8fafc",
    alignItems: "center",
  },
  slotChipActive: { borderColor: "#10b981", backgroundColor: "#ecfdf5" },
  slotChipText: { fontSize: 11, fontWeight: "700", color: "#475569" },
  slotChipTextActive: { color: "#047857", fontWeight: "900" },
  reasonChip: {
    backgroundColor: "#f1f5f9",
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 16,
  },
  reasonChipActive: { backgroundColor: "#10b981" },
  reasonChipText: { fontSize: 11, fontWeight: "700", color: "#475569" },
  reasonChipTextActive: { color: "#ffffff" },
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
  submitBookBtnText: { color: "#ffffff", fontSize: 14, fontWeight: "800" },
  dialogBox: {
    backgroundColor: "#ffffff",
    borderRadius: 20,
    padding: 20,
  },
  dialogDesc: { fontSize: 12, color: "#64748b", marginTop: 4, marginBottom: 12 },
  dialogBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: "center",
  },
  dialogBtnText: { fontSize: 13, fontWeight: "800", color: "#ffffff" },
  notesMeta: { fontSize: 11, color: "#64748b", marginTop: 2 },
  notesScrollBox: {
    backgroundColor: "#f8fafc",
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  notesBodyText: { fontSize: 13, color: "#1e293b", lineHeight: 20 },
});
