import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
  Modal,
  TextInput,
  Image,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter, useFocusEffect } from "expo-router";
import * as Haptics from "expo-haptics";
import {
  HeartPulse,
  Flame,
  CheckCircle2,
  XCircle,
  Scan,
  Clock,
  Calendar,
  ChevronRight,
  X,
  Activity,
  CalendarCheck2,
  Timer,
  Sun,
  Sunset,
  Moon,
} from "lucide-react-native";
import {
  getLocalPrescriptions,
  getTodayLocalLogs,
  logDoseLocally,
  upsertSyncedServerLog,
  getCachedJson,
  saveCachedJson,
  getLocalAppointments,
  saveLocalAppointments,
  LocalPrescription,
  LocalAdherenceLog,
  LocalAppointment,
} from "@/services/db/database";
import { getCachedUser, CachedUser } from "@/services/auth/session";
import { fetchWithAuth } from "@/services/api/client";
import { pullServerPrescriptions } from "@/services/sync/sync-worker";

interface DailyTrendPoint {
  date: string;
  taken: number;
  missed: number;
  skipped: number;
  total: number;
  rate: number | null;
}

interface MedicationSummary {
  prescriptionId: string;
  name: string;
  dosage: string;
  totalLogs: number;
  takenLogs: number;
  missedLogs: number;
  skippedLogs: number;
  adherenceRate: number | null;
}

interface ServerLogItem {
  id: string;
  medication: string;
  scheduledTime: string;
  takenTime: string | null;
  status: "TAKEN" | "MISSED" | "SKIPPED";
  notes: string | null;
}

interface TimeOfDayBucket {
  period: string;
  label: string;
  taken: number;
  total: number;
  rate: number | null;
}

interface WindowSummary {
  total: number;
  taken: number;
  skipped: number;
  missed: number;
  rate: number | null;
}

interface EndingSoonItem {
  id: string;
  name: string;
  dosage: string;
  daysLeft: number;
}

interface TodayDoseItem {
  prescriptionId: string;
  name: string;
  time: string;
  status: "PENDING" | "TAKEN" | "SKIPPED" | "MISSED";
}

type TimeframeOption = "7" | "30" | "90" | "all";

interface AdherenceSummaryCache {
  overallRate: number | null;
  weekRate: number | null;
  weekDelta?: number | null;
  monthRate: number | null;
  activeStreak: number;
  bestStreak?: number;
  onTimeRate?: number | null;
  avgDelayMinutes?: number | null;
  windowSummary?: WindowSummary;
  timeOfDayBreakdown?: TimeOfDayBucket[];
  riskWindow?: { period: string; label: string; rate: number } | null;
  endingSoon?: EndingSoonItem[];
  todayDoses?: TodayDoseItem[];
  totalLogs: number;
  takenLogs: number;
  missedLogs: number;
  skippedLogs: number;
  dailyTrend: DailyTrendPoint[];
  medicationSummaries: MedicationSummary[];
  logs: ServerLogItem[];
}

function getClinicalTier(rate: number | null): {
  label: string;
  bg: string;
  border: string;
  color: string;
} {
  if (rate === null) {
    return { label: "No Data", bg: "#f1f5f9", border: "#e2e8f0", color: "#64748b" };
  }
  if (rate >= 80) {
    return { label: "Optimal (≥80%)", bg: "#ecfdf5", border: "#a7f3d0", color: "#047857" };
  }
  if (rate >= 60) {
    return { label: "Moderate", bg: "#fffbeb", border: "#fde68a", color: "#b45309" };
  }
  return { label: "At Risk (<60%)", bg: "#fff1f2", border: "#fecdd3", color: "#be123c" };
}

const SKIP_REASONS = [
  "Forgot / Away from medicine",
  "Experiencing nausea / side effect",
  "Medication supply ran out",
  "Felt completely recovered",
  "Other reason",
];

const APPT_PRIORITY: Record<string, number> = {
  IN_PROGRESS: 0,
  WAITING: 1,
  CONFIRMED: 2,
  PENDING: 3,
};

export default function TodayScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [user, setUser] = useState<CachedUser | null>(null);
  const [prescriptions, setPrescriptions] = useState<LocalPrescription[]>([]);
  const [logs, setLogs] = useState<LocalAdherenceLog[]>([]);
  const [nextAppointment, setNextAppointment] = useState<LocalAppointment | null>(null);
  const [adherence, setAdherence] = useState<AdherenceSummaryCache>({
    overallRate: null,
    weekRate: null,
    monthRate: null,
    activeStreak: 0,
    totalLogs: 0,
    takenLogs: 0,
    missedLogs: 0,
    skippedLogs: 0,
    dailyTrend: [],
    medicationSummaries: [],
    logs: [],
  });
  const [refreshing, setRefreshing] = useState(false);
  const [timeframe, setTimeframe] = useState<TimeframeOption>("30");
  const [timeframeLoading, setTimeframeLoading] = useState(false);

  // Modals
  const [analyticsVisible, setAnalyticsVisible] = useState(false);
  const [skipModalTarget, setSkipModalTarget] = useState<{
    rxId: string;
    name: string;
    time: string;
  } | null>(null);
  const [selectedSkipReason, setSelectedSkipReason] = useState(SKIP_REASONS[0]);
  const [customSkipReason, setCustomSkipReason] = useState("");

  const pickNextAppointment = (apts: LocalAppointment[]) => {
    const active = apts
      .filter((a) => !a.id.startsWith("appt_demo_") && a.status in APPT_PRIORITY)
      .sort((a, b) => {
        const diff = (APPT_PRIORITY[a.status] ?? 9) - (APPT_PRIORITY[b.status] ?? 9);
        if (diff !== 0) return diff;
        return new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime();
      });
    return active[0] ?? null;
  };

  const fetchAdherenceWindow = useCallback(async (selectedDays: TimeframeOption) => {
    const cacheKey =
      selectedDays === "30" ? "adherence_summary" : `adherence_summary_${selectedDays}`;
    const query = selectedDays === "all" ? "" : `?days=${selectedDays}`;
    try {
      const adhRes = await fetchWithAuth(`/adherence${query}`);
      if (adhRes.ok) {
        const adhData = await adhRes.json();
        const summary: AdherenceSummaryCache = {
          overallRate: typeof adhData.overallRate === "number" ? adhData.overallRate : null,
          weekRate: typeof adhData.weekRate === "number" ? adhData.weekRate : null,
          weekDelta: typeof adhData.weekDelta === "number" ? adhData.weekDelta : null,
          monthRate: typeof adhData.monthRate === "number" ? adhData.monthRate : null,
          activeStreak: typeof adhData.activeStreak === "number" ? adhData.activeStreak : 0,
          bestStreak: typeof adhData.bestStreak === "number" ? adhData.bestStreak : 0,
          onTimeRate: typeof adhData.onTimeRate === "number" ? adhData.onTimeRate : null,
          avgDelayMinutes:
            typeof adhData.avgDelayMinutes === "number" ? adhData.avgDelayMinutes : null,
          windowSummary: adhData.windowSummary || {
            total: adhData.totalLogs ?? 0,
            taken: adhData.takenLogs ?? 0,
            skipped: adhData.skippedLogs ?? 0,
            missed: adhData.missedLogs ?? 0,
            rate: typeof adhData.monthRate === "number" ? adhData.monthRate : null,
          },
          timeOfDayBreakdown: Array.isArray(adhData.timeOfDayBreakdown)
            ? adhData.timeOfDayBreakdown
            : [],
          riskWindow: adhData.riskWindow || null,
          endingSoon: Array.isArray(adhData.endingSoon) ? adhData.endingSoon : [],
          todayDoses: Array.isArray(adhData.todayDoses) ? adhData.todayDoses : [],
          totalLogs: adhData.totalLogs ?? 0,
          takenLogs: adhData.takenLogs ?? 0,
          missedLogs: adhData.missedLogs ?? 0,
          skippedLogs: adhData.skippedLogs ?? 0,
          dailyTrend: Array.isArray(adhData.dailyTrend) ? adhData.dailyTrend : [],
          medicationSummaries: Array.isArray(adhData.medicationSummaries)
            ? adhData.medicationSummaries
            : [],
          logs: Array.isArray(adhData.logs) ? adhData.logs : [],
        };
        setAdherence(summary);
        await saveCachedJson(cacheKey, summary);

        if (Array.isArray(adhData.todayDoses)) {
          for (const d of adhData.todayDoses) {
            if (d.status === "TAKEN" || d.status === "SKIPPED" || d.status === "MISSED") {
              await upsertSyncedServerLog({
                id: d.logId || `log_${d.prescriptionId}_${d.time}`,
                prescription_id: d.prescriptionId,
                scheduled_time: d.time,
                taken_time: d.takenTime,
                status: d.status,
                notes: d.notes,
                created_at: new Date().toISOString(),
              });
            }
          }
        }
        return true;
      }
    } catch {
      // offline fallback
    }
    const cached = await getCachedJson<AdherenceSummaryCache>(cacheKey);
    if (cached) setAdherence(cached);
    return false;
  }, []);

  const handleSelectTimeframe = async (nextTf: TimeframeOption) => {
    setTimeframe(nextTf);
    setTimeframeLoading(true);
    await fetchAdherenceWindow(nextTf);
    setTimeframeLoading(false);
  };

  const loadData = useCallback(async () => {
    const cached = await getCachedUser();
    setUser(cached);

    // Load cached adherence summary & appointments immediately for instant offline render
    const cacheKey = timeframe === "30" ? "adherence_summary" : `adherence_summary_${timeframe}`;
    const [cachedAdh, cachedApts] = await Promise.all([
      getCachedJson<AdherenceSummaryCache>(cacheKey),
      getLocalAppointments(),
    ]);
    if (cachedAdh) setAdherence(cachedAdh);
    setNextAppointment(pickNextAppointment(cachedApts));

    // Pull latest prescriptions from server if online
    try {
      await pullServerPrescriptions();
    } catch {
      // offline fallback
    }

    const rxList = await getLocalPrescriptions();
    setPrescriptions(rxList);

    // Sync adherence analytics & today's logs from backend when online (without re-queueing outbox)
    await fetchAdherenceWindow(timeframe);

    // Refresh upcoming appointment if online
    try {
      const aptRes = await fetchWithAuth("/appointments");
      if (aptRes.ok) {
        const serverApts: LocalAppointment[] = await aptRes.json();
        await saveLocalAppointments(serverApts);
        setNextAppointment(pickNextAppointment(serverApts));
      }
    } catch {
      // offline fallback
    }

    const todayLogs = await getTodayLocalLogs();
    setLogs(todayLogs);
  }, [fetchAdherenceWindow, timeframe]);

  useFocusEffect(
    useCallback(() => {
      void loadData();
    }, [loadData]),
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  }, [loadData]);

  async function recordDose(
    rxId: string,
    scheduledTime: string,
    status: "TAKEN" | "SKIPPED",
    notes: string,
  ) {
    const takenTime = status === "TAKEN" ? new Date().toISOString() : null;
    const localLogId = `log_${rxId}_${scheduledTime.replace(/\s+/g, "")}_${new Date().toISOString().slice(0, 10)}`;

    // Try direct live upload first; only enqueue to sync_outbox if offline or request fails
    let syncedOnline = false;
    try {
      const res = await fetchWithAuth("/adherence", {
        method: "POST",
        body: JSON.stringify({
          prescriptionId: rxId,
          scheduledTime,
          status,
          takenTime,
          notes,
        }),
      });
      syncedOnline = res.ok;
    } catch {
      syncedOnline = false;
    }

    await logDoseLocally(
      {
        id: localLogId,
        prescription_id: rxId,
        scheduled_time: scheduledTime,
        taken_time: takenTime,
        status,
        notes,
        created_at: new Date().toISOString(),
      },
      { enqueueOutbox: !syncedOnline },
    );

    await loadData();
  }

  async function handleTakeDose(rxId: string, scheduledTime: string) {
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    await recordDose(rxId, scheduledTime, "TAKEN", "Logged via Mobile App");
  }

  async function handleConfirmSkip() {
    if (!skipModalTarget) return;
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    const reason =
      selectedSkipReason === "Other reason" && customSkipReason.trim()
        ? customSkipReason.trim()
        : selectedSkipReason;
    const target = skipModalTarget;
    setSkipModalTarget(null);
    setCustomSkipReason("");
    await recordDose(target.rxId, target.time, "SKIPPED", reason);
  }

  const isDoseLogged = (rxId: string, time: string) => {
    return logs.some((l) => l.prescription_id === rxId && l.scheduled_time === time);
  };

  const getDoseStatus = (rxId: string, time: string) => {
    const log = logs.find((l) => l.prescription_id === rxId && l.scheduled_time === time);
    return log?.status;
  };

  const totalSlotsToday = prescriptions.reduce((sum, rx) => sum + rx.schedule_times.length, 0);
  const takenSlotsToday = prescriptions.reduce(
    (sum, rx) =>
      sum + rx.schedule_times.filter((t) => getDoseStatus(rx.id, t) === "TAKEN").length,
    0,
  );
  const todayProgressPct =
    totalSlotsToday > 0 ? Math.round((takenSlotsToday / totalSlotsToday) * 100) : 0;
  const hourNow = new Date().getHours();
  const timeGreeting =
    hourNow < 12 ? "Good morning" : hourNow < 18 ? "Good afternoon" : "Good evening";

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
        {/* Clean Light Branded Hero Card */}
        <View style={styles.heroCard}>
          {/* Brand Row: PillPal Logo + Scan Med */}
          <View style={styles.heroBrandRow}>
            <View style={styles.heroBrandLeft}>
              <View style={styles.heroLogoTile}>
                <Image
                  source={require("../../assets/pillpal-logo.png")}
                  style={styles.heroLogoImg}
                  resizeMode="contain"
                />
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.heroBrandName}>PILLPAL</Text>
                <Text style={styles.heroBrandSub} numberOfLines={2}>
                  CSU University Center for Health and Wellness
                </Text>
              </View>
            </View>

            <TouchableOpacity
              style={styles.heroScanBtn}
              activeOpacity={0.85}
              onPress={() => router.push("/modal/ocr-scanner")}
            >
              <Scan size={15} color="#059669" />
              <Text style={styles.heroScanText}>Scan Med</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.heroDivider} />

          {/* Personalized Greeting */}
          <View>
            <Text style={styles.heroGreeting}>
              {timeGreeting}, {user?.firstName || "there"}!
            </Text>
            <Text style={styles.heroMeta} numberOfLines={1}>
              {[user?.department, user?.idNumber].filter(Boolean).join(" • ") ||
                "CSU University Center for Health and Wellness"}
            </Text>
          </View>

          {/* Daily Dose Progress Bar */}
          <View style={styles.heroProgressBox}>
            <View style={styles.heroProgressHeader}>
              <Text style={styles.heroProgressLabel}>TODAY&apos;S PROGRESS</Text>
              <Text style={styles.heroProgressStat}>
                {totalSlotsToday > 0
                  ? `${takenSlotsToday}/${totalSlotsToday} doses (${todayProgressPct}%)`
                  : "No doses scheduled"}
              </Text>
            </View>
            <View style={styles.heroProgressTrack}>
              <View style={[styles.heroProgressFill, { width: `${todayProgressPct}%` }]} />
            </View>
          </View>

          {/* Embedded Streak & Analytics Trigger Strip */}
          <TouchableOpacity
            style={styles.heroStreakStrip}
            activeOpacity={0.85}
            onPress={() => setAnalyticsVisible(true)}
          >
            <View style={styles.streakLeft}>
              <View style={styles.heroFlameBox}>
                <Flame size={18} color="#fbbf24" fill="#fbbf24" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.heroStreakTitle}>
                  {adherence.activeStreak} {adherence.activeStreak === 1 ? "Day" : "Days"} Streak
                </Text>
                <Text style={styles.heroStreakSub} numberOfLines={1}>
                  {adherence.weekRate !== null
                    ? `7-Day Compliance: ${adherence.weekRate}% • Tap for analytics`
                    : "Tap to view adherence insights"}
                </Text>
              </View>
            </View>
            <View style={styles.heroHistoryPill}>
              <Text style={styles.heroHistoryPillText}>
                {adherence.weekRate !== null ? `${adherence.weekRate}%` : "STATS"}
              </Text>
              <ChevronRight size={13} color="#ffffff" />
            </View>
          </TouchableOpacity>
        </View>

        {/* Dosing Schedule Section */}
        <View style={styles.sectionHeaderRow}>
          <View style={styles.sectionHeader}>
            <Clock size={16} color="#0f172a" />
            <Text style={styles.sectionTitle}>Today&apos;s Dosing Timetable</Text>
          </View>
          {totalSlotsToday > 0 && (
            <Text style={styles.progressPill}>
              {takenSlotsToday}/{totalSlotsToday} taken
            </Text>
          )}
        </View>

        {prescriptions.length === 0 ? (
          <View style={styles.emptyCard}>
            <HeartPulse size={36} color="#94a3b8" />
            <Text style={styles.emptyTitle}>No Active Prescriptions</Text>
            <Text style={styles.emptyDesc}>
              Scan a doctor&apos;s prescription slip or pill bottle, or wait for your CSU Clinic
              physician to issue your regimen.
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
            <View
              key={rx.id}
              style={[
                styles.rxCard,
                { borderLeftWidth: 4, borderLeftColor: rx.doctor_id ? "#059669" : "#94a3b8" },
              ]}
            >
              <View style={styles.rxHeader}>
                <View style={{ flex: 1, paddingRight: 8 }}>
                  <Text style={styles.rxName}>{rx.name}</Text>
                  <Text style={styles.rxDetail}>
                    {rx.dosage} • {rx.form || "Tablet"} • {rx.frequency}
                  </Text>
                </View>
                <View
                  style={[
                    styles.doctorTag,
                    rx.doctor_id && {
                      backgroundColor: "#ecfdf5",
                      borderWidth: 1,
                      borderColor: "#a7f3d0",
                    },
                  ]}
                >
                  <Text style={[styles.doctorTagText, rx.doctor_id && { color: "#047857" }]}>
                    {rx.doctor_id ? rx.doctor_name || "CSU Clinic Rx" : "Self-Scanned"}
                  </Text>
                </View>
              </View>

              {rx.instructions ? (
                <View style={styles.rxInstructionsBox}>
                  <Text style={styles.rxInstructionsText} numberOfLines={1}>
                    {rx.instructions}
                  </Text>
                </View>
              ) : null}

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
                              <Text style={styles.skippedText}>
                                {status === "MISSED" ? "Missed" : "Skipped"}
                              </Text>
                            </>
                          )}
                        </View>
                      ) : (
                        <View style={styles.actionButtonsRow}>
                          <TouchableOpacity
                            style={styles.takeBtn}
                            onPress={() => void handleTakeDose(rx.id, time)}
                          >
                            <Text style={styles.takeBtnText}>Take</Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={styles.skipBtn}
                            onPress={() => {
                              setSelectedSkipReason(SKIP_REASONS[0]);
                              setCustomSkipReason("");
                              setSkipModalTarget({ rxId: rx.id, name: rx.name, time });
                            }}
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

        {/* Next CSU Clinic Appointment Card */}
        {nextAppointment && (
          <TouchableOpacity
            style={styles.nextApptCard}
            activeOpacity={0.85}
            onPress={() => router.push("/(tabs)/appointments")}
          >
            <View style={styles.nextApptIcon}>
              <Calendar size={20} color="#0284c7" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.nextApptLabel}>
                NEXT CLINIC VISIT • {nextAppointment.status.replace("_", " ")}
              </Text>
              <Text style={styles.nextApptTitle} numberOfLines={1}>
                {nextAppointment.reason}
              </Text>
              <Text style={styles.nextApptMeta}>
                {new Date(nextAppointment.scheduledAt).toLocaleString([], {
                  month: "short",
                  day: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })}{" "}
                • {nextAppointment.providerName || "CSU Infirmary"}
              </Text>
            </View>
            <ChevronRight size={18} color="#94a3b8" />
          </TouchableOpacity>
        )}
      </ScrollView>

      {/* Skip Reason Bottom Sheet Modal */}
      <Modal visible={Boolean(skipModalTarget)} animationType="slide" transparent>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle}>Record Skipped Dose</Text>
                <Text style={styles.modalSubtitle}>
                  {skipModalTarget?.name} • {skipModalTarget?.time}
                </Text>
              </View>
              <TouchableOpacity onPress={() => setSkipModalTarget(null)}>
                <X size={20} color="#64748b" />
              </TouchableOpacity>
            </View>

            <View style={{ gap: 8, marginTop: 10 }}>
              {SKIP_REASONS.map((reason) => {
                const active = selectedSkipReason === reason;
                return (
                  <TouchableOpacity
                    key={reason}
                    style={[styles.reasonOption, active && styles.reasonOptionActive]}
                    onPress={() => setSelectedSkipReason(reason)}
                  >
                    <Text
                      style={[styles.reasonOptionText, active && styles.reasonOptionTextActive]}
                    >
                      {reason}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {selectedSkipReason === "Other reason" && (
              <TextInput
                style={styles.customInput}
                placeholder="Briefly describe your reason..."
                placeholderTextColor="#94a3b8"
                value={customSkipReason}
                onChangeText={setCustomSkipReason}
              />
            )}

            <TouchableOpacity style={styles.confirmSkipBtn} onPress={() => void handleConfirmSkip()}>
              <Text style={styles.confirmSkipBtnText}>Confirm Skip</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Adherence Analytics & Dose History Modal */}
      <Modal visible={analyticsVisible} animationType="slide" transparent>
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalSheet, { maxHeight: "88%" }]}>
            <View style={styles.modalHeader}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <Activity size={20} color="#059669" />
                <Text style={styles.modalTitle}>Adherence &amp; Intake History</Text>
              </View>
              <TouchableOpacity onPress={() => setAnalyticsVisible(false)}>
                <X size={22} color="#64748b" />
              </TouchableOpacity>
            </View>

            {/* Timeframe Selector (7D | 30D | 90D | All) matching Patient Web */}
            <View style={styles.timeframeRow}>
              {(
                [
                  { value: "7", label: "7D" },
                  { value: "30", label: "30D" },
                  { value: "90", label: "90D" },
                  { value: "all", label: "All" },
                ] as const
              ).map((opt) => {
                const active = timeframe === opt.value;
                return (
                  <TouchableOpacity
                    key={opt.value}
                    style={[styles.timeframePill, active && styles.timeframePillActive]}
                    onPress={() => void handleSelectTimeframe(opt.value)}
                    disabled={timeframeLoading}
                  >
                    <Text
                      style={[styles.timeframePillText, active && styles.timeframePillTextActive]}
                    >
                      {opt.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <ScrollView
              showsVerticalScrollIndicator={true}
              persistentScrollbar={true}
              indicatorStyle="black"
              contentContainerStyle={{ paddingRight: 6, paddingBottom: 16 }}
            >
              {(() => {
                const serverToday = Array.isArray(adherence.todayDoses) ? adherence.todayDoses : [];
                const todayTotal = serverToday.length > 0 ? serverToday.length : totalSlotsToday;
                const todayTaken =
                  serverToday.length > 0
                    ? serverToday.filter((d) => d.status === "TAKEN").length
                    : takenSlotsToday;
                const nextPending = serverToday.find((d) => d.status === "PENDING");
                const todayPct = todayTotal > 0 ? Math.round((todayTaken / todayTotal) * 100) : 0;

                const windowSummary: WindowSummary = adherence.windowSummary || {
                  total: adherence.totalLogs,
                  taken: adherence.takenLogs,
                  skipped: adherence.skippedLogs,
                  missed: adherence.missedLogs,
                  rate: adherence.monthRate,
                };
                const primaryRate =
                  windowSummary.rate ?? adherence.weekRate ?? adherence.overallRate;
                const clinicalTier = getClinicalTier(primaryRate);
                const timeframeLabel = timeframe === "all" ? "All" : `${timeframe}D`;
                const endingSoon = Array.isArray(adherence.endingSoon) ? adherence.endingSoon : [];

                return (
                  <>
                    {/* 4 KPI Cards — Matching Patient Web 1:1 */}
                    <View style={{ gap: 9 }}>
                      {/* 1. Current Streak + Best */}
                      <View style={[styles.webKpiCard, styles.kpiCardAmber]}>
                        <View style={styles.webKpiTopRow}>
                          <View style={styles.webKpiLeft}>
                            <View style={[styles.webKpiIconBox, { backgroundColor: "#f59e0b" }]}>
                              <Flame size={20} color="#ffffff" fill="#ffffff" />
                            </View>
                            <View>
                              <Text style={[styles.webKpiLabel, { color: "#92400e" }]}>
                                CURRENT STREAK
                              </Text>
                              <Text style={[styles.webKpiValue, { color: "#451a03" }]}>
                                {adherence.activeStreak}{" "}
                                {adherence.activeStreak === 1 ? "Day" : "Days"}
                              </Text>
                            </View>
                          </View>
                          <View style={styles.bestBadge}>
                            <Text style={styles.bestBadgeText}>
                              Best: {adherence.bestStreak ?? 0}d
                            </Text>
                          </View>
                        </View>
                        <Text style={[styles.webKpiSub, { color: "#b45309" }]}>
                          {adherence.activeStreak > 0
                            ? "Keep going for maximum therapeutic effect!"
                            : "Log a dose today to begin your streak."}
                        </Text>
                      </View>

                      {/* 2. Today's Doses */}
                      <View style={styles.webKpiCard}>
                        <View style={styles.webKpiLeft}>
                          <View style={[styles.webKpiIconBox, { backgroundColor: "#ecfdf5" }]}>
                            <CalendarCheck2 size={20} color="#059669" />
                          </View>
                          <View>
                            <Text style={styles.webKpiLabel}>TODAY&apos;S DOSES</Text>
                            <Text style={[styles.webKpiValue, { color: "#059669" }]}>
                              {todayTotal > 0 ? `${todayTaken}/${todayTotal}` : "—"}
                            </Text>
                          </View>
                        </View>
                        <View style={styles.progressTrack}>
                          <View
                            style={[
                              styles.progressFill,
                              { width: `${todayPct}%`, backgroundColor: "#10b981" },
                            ]}
                          />
                        </View>
                        <Text style={styles.webKpiSub} numberOfLines={1}>
                          {todayTotal === 0
                            ? "No active doses scheduled today"
                            : nextPending
                              ? `Next: ${nextPending.name} at ${nextPending.time}`
                              : "All scheduled doses completed today!"}
                        </Text>
                      </View>

                      {/* 3. Adherence Rate + Clinical Tier */}
                      <View style={styles.webKpiCard}>
                        <View style={styles.webKpiTopRow}>
                          <View style={styles.webKpiLeft}>
                            <View style={[styles.webKpiIconBox, { backgroundColor: "#f0f9ff" }]}>
                              <Activity size={20} color="#0284c7" />
                            </View>
                            <View>
                              <Text style={styles.webKpiLabel}>
                                ADHERENCE ({timeframeLabel})
                              </Text>
                              <View style={{ flexDirection: "row", alignItems: "baseline", gap: 6 }}>
                                <Text style={[styles.webKpiValue, { color: "#0284c7" }]}>
                                  {primaryRate !== null ? `${primaryRate}%` : "—"}
                                </Text>
                                {typeof adherence.weekDelta === "number" &&
                                  adherence.weekDelta !== 0 && (
                                    <Text
                                      style={{
                                        fontSize: 10,
                                        fontWeight: "800",
                                        color:
                                          adherence.weekDelta > 0 ? "#059669" : "#dc2626",
                                      }}
                                    >
                                      {adherence.weekDelta > 0
                                        ? `▲ +${adherence.weekDelta}%`
                                        : `▼ ${adherence.weekDelta}%`}
                                    </Text>
                                  )}
                              </View>
                            </View>
                          </View>
                          <View
                            style={[
                              styles.tierBadge,
                              {
                                backgroundColor: clinicalTier.bg,
                                borderColor: clinicalTier.border,
                              },
                            ]}
                          >
                            <Text style={[styles.tierBadgeText, { color: clinicalTier.color }]}>
                              {clinicalTier.label}
                            </Text>
                          </View>
                        </View>
                        <Text style={styles.webKpiSub}>
                          7D: {adherence.weekRate !== null ? `${adherence.weekRate}%` : "—"} • 30D:{" "}
                          {adherence.monthRate !== null ? `${adherence.monthRate}%` : "—"} •
                          Lifetime:{" "}
                          {adherence.overallRate !== null ? `${adherence.overallRate}%` : "—"}
                        </Text>
                      </View>

                      {/* 4. On-Time Rate (±30 min) */}
                      <View style={styles.webKpiCard}>
                        <View style={styles.webKpiLeft}>
                          <View style={[styles.webKpiIconBox, { backgroundColor: "#faf5ff" }]}>
                            <Timer size={20} color="#7c3aed" />
                          </View>
                          <View>
                            <Text style={styles.webKpiLabel}>ON-TIME RATE</Text>
                            <Text style={[styles.webKpiValue, { color: "#7c3aed" }]}>
                              {typeof adherence.onTimeRate === "number"
                                ? `${adherence.onTimeRate}%`
                                : "—"}
                            </Text>
                          </View>
                        </View>
                        <View style={styles.progressTrack}>
                          <View
                            style={[
                              styles.progressFill,
                              {
                                width: `${adherence.onTimeRate ?? 0}%`,
                                backgroundColor: "#8b5cf6",
                              },
                            ]}
                          />
                        </View>
                        <Text style={styles.webKpiSub}>
                          {typeof adherence.onTimeRate === "number"
                            ? `Within ±30 min • Avg offset: ${
                                adherence.avgDelayMinutes === 0
                                  ? "Right on time"
                                  : `±${adherence.avgDelayMinutes ?? 0} min`
                              }`
                            : "Taken within ±30 min of schedule"}
                        </Text>
                      </View>
                    </View>

                    {/* Dose Volume (Taken / Skipped / Missed) */}
                    <View style={{ marginTop: 14 }}>
                      <View style={styles.sectionSubHeader}>
                        <Text style={styles.modalSectionTitle}>
                          DOSE VOLUME ({timeframe === "all" ? "ALL TIME" : `LAST ${timeframe}D`})
                        </Text>
                        <Text style={styles.loggedCountText}>{windowSummary.total} logged</Text>
                      </View>
                      <View style={{ flexDirection: "row", gap: 8 }}>
                        <View
                          style={[
                            styles.volumeTile,
                            { backgroundColor: "#ecfdf5", borderColor: "#d1fae5" },
                          ]}
                        >
                          <Text style={[styles.volumeVal, { color: "#047857" }]}>
                            {windowSummary.taken}
                          </Text>
                          <Text style={[styles.volumeLabel, { color: "#059669" }]}>Taken</Text>
                        </View>
                        <View
                          style={[
                            styles.volumeTile,
                            { backgroundColor: "#f8fafc", borderColor: "#e2e8f0" },
                          ]}
                        >
                          <Text style={[styles.volumeVal, { color: "#334155" }]}>
                            {windowSummary.skipped}
                          </Text>
                          <Text style={[styles.volumeLabel, { color: "#64748b" }]}>Skipped</Text>
                        </View>
                        <View
                          style={[
                            styles.volumeTile,
                            { backgroundColor: "#fff1f2", borderColor: "#ffe4e6" },
                          ]}
                        >
                          <Text style={[styles.volumeVal, { color: "#be123c" }]}>
                            {windowSummary.missed}
                          </Text>
                          <Text style={[styles.volumeLabel, { color: "#e11d48" }]}>Missed</Text>
                        </View>
                      </View>
                    </View>

                    {/* Time-of-Day Pattern Strip (matching Patient Web) */}
                    {Array.isArray(adherence.timeOfDayBreakdown) &&
                      adherence.timeOfDayBreakdown.some((b) => b.total > 0) && (
                        <View style={styles.todCard}>
                          <View style={styles.sectionSubHeader}>
                            <Text style={[styles.modalSectionTitle, { marginBottom: 0 }]}>
                              TIME-OF-DAY CONSISTENCY
                            </Text>
                            {adherence.riskWindow ? (
                              <Text style={styles.riskWindowBadge}>
                                Watch {adherence.riskWindow.period.toLowerCase()}
                              </Text>
                            ) : (
                              <Text style={styles.onTrackBadge}>On track</Text>
                            )}
                          </View>
                          <View style={{ flexDirection: "row", gap: 8 }}>
                            {adherence.timeOfDayBreakdown.map((b) => {
                              const isRisk = adherence.riskWindow?.period === b.period;
                              const SlotIcon =
                                b.period === "MORNING"
                                  ? Sun
                                  : b.period === "AFTERNOON"
                                    ? Sunset
                                    : Moon;
                              const shortLabel =
                                b.period === "MORNING"
                                  ? "Morning"
                                  : b.period === "AFTERNOON"
                                    ? "Afternoon"
                                    : "Evening";
                              return (
                                <View
                                  key={b.period}
                                  style={[
                                    styles.todTile,
                                    isRisk && {
                                      backgroundColor: "#fffbeb",
                                      borderColor: "#fde68a",
                                    },
                                  ]}
                                >
                                  <SlotIcon
                                    size={15}
                                    color={isRisk ? "#d97706" : "#64748b"}
                                  />
                                  <Text style={styles.todLabel}>{shortLabel}</Text>
                                  <Text
                                    style={[
                                      styles.todRate,
                                      isRisk && { color: "#b45309" },
                                    ]}
                                  >
                                    {b.rate !== null ? `${b.rate}%` : "—"}
                                  </Text>
                                </View>
                              );
                            })}
                          </View>
                        </View>
                      )}

                    {/* Course Completion Watch */}
                    <View style={{ marginTop: 14 }}>
                      <Text style={styles.modalSectionTitle}>COURSE COMPLETION WATCH</Text>
                      {endingSoon.length === 0 ? (
                        <View style={styles.courseOkBox}>
                          <Text style={styles.courseOkText}>
                            No short-course medications ending in the next 3 days. Keep taking your
                            active regimens as scheduled.
                          </Text>
                        </View>
                      ) : (
                        <View style={{ gap: 6 }}>
                          {endingSoon.map((item) => (
                            <View key={item.id} style={styles.courseWarnRow}>
                              <Text style={styles.courseWarnName} numberOfLines={1}>
                                {item.name}{" "}
                                <Text style={{ fontWeight: "500", color: "#92400e" }}>
                                  {item.dosage}
                                </Text>
                              </Text>
                              <View style={styles.courseDaysPill}>
                                <Text style={styles.courseDaysText}>
                                  {item.daysLeft === 0 ? "Ends today" : `${item.daysLeft}d left`}
                                </Text>
                              </View>
                            </View>
                          ))}
                        </View>
                      )}
                    </View>
                  </>
                );
              })()}

              {/* 14-Day Visual Strip */}
              {adherence.dailyTrend.length > 0 && (
                <View style={{ marginTop: 14 }}>
                  <Text style={styles.modalSectionTitle}>14-DAY CONSISTENCY</Text>
                  <View style={styles.trendGrid}>
                    {adherence.dailyTrend.map((d) => {
                      const bg =
                        d.total === 0
                          ? "#f1f5f9"
                          : (d.rate ?? 0) >= 85
                            ? "#10b981"
                            : (d.rate ?? 0) >= 50
                              ? "#f59e0b"
                              : "#ef4444";
                      const fg = d.total === 0 ? "#64748b" : "#ffffff";
                      return (
                        <View key={d.date} style={[styles.trendTile, { backgroundColor: bg }]}>
                          <Text style={[styles.trendDay, { color: fg }]}>
                            {d.date.slice(8, 10)}
                          </Text>
                          <Text style={[styles.trendCount, { color: fg }]}>
                            {d.total > 0 ? `${d.taken}/${d.total}` : "—"}
                          </Text>
                        </View>
                      );
                    })}
                  </View>
                </View>
              )}

              {/* Per-Medication Breakdown */}
              {adherence.medicationSummaries.length > 0 && (
                <View style={{ marginTop: 16 }}>
                  <Text style={styles.modalSectionTitle}>
                    BY MEDICATION ({timeframe === "all" ? "ALL TIME" : `${timeframe}D`})
                  </Text>
                  {adherence.medicationSummaries.map((m) => (
                    <View key={m.prescriptionId} style={styles.medSummaryRow}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.medSummaryName}>
                          {m.name} {m.dosage}
                        </Text>
                        <Text style={styles.medSummaryCounts}>
                          {m.takenLogs} taken • {m.skippedLogs} skipped • {m.missedLogs} missed
                        </Text>
                      </View>
                      <Text style={styles.medSummaryRate}>
                        {m.adherenceRate !== null ? `${m.adherenceRate}%` : "—"}
                      </Text>
                    </View>
                  ))}
                </View>
              )}

              {/* Recent Logs */}
              <View style={{ marginTop: 16, paddingBottom: 12 }}>
                <Text style={styles.modalSectionTitle}>RECENT DOSE LOGS</Text>
                {adherence.logs.length === 0 ? (
                  <Text style={styles.emptyLogText}>
                    No dose logs recorded yet. Tap Take or Skip on today&apos;s doses to start.
                  </Text>
                ) : (
                  adherence.logs.slice(0, 15).map((item) => (
                    <View key={item.id} style={styles.historyLogRow}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.historyLogMed}>{item.medication}</Text>
                        <Text style={styles.historyLogTime}>
                          {new Date(item.scheduledTime).toLocaleString([], {
                            month: "short",
                            day: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                          {item.notes ? ` • ${item.notes}` : ""}
                        </Text>
                      </View>
                      <Text
                        style={[
                          styles.historyLogBadge,
                          item.status === "TAKEN"
                            ? { color: "#059669" }
                            : item.status === "MISSED"
                              ? { color: "#d97706" }
                              : { color: "#64748b" },
                        ]}
                      >
                        {item.status}
                      </Text>
                    </View>
                  ))
                )}
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f8fafc" },
  content: { padding: 18, paddingTop: 24, paddingBottom: 112 },
  heroCard: {
    backgroundColor: "#059669",
    borderRadius: 22,
    padding: 16,
    shadowColor: "#059669",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.2,
    shadowRadius: 14,
    elevation: 6,
    marginBottom: 20,
  },
  heroBrandRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  heroBrandLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flex: 1,
  },
  heroLogoTile: {
    width: 42,
    height: 42,
    borderRadius: 13,
    backgroundColor: "#ffffff",
    padding: 4,
    alignItems: "center",
    justifyContent: "center",
  },
  heroLogoImg: { width: "100%", height: "100%" },
  heroBrandName: {
    fontSize: 19,
    fontWeight: "800",
    color: "#ffffff",
    letterSpacing: 0.6,
    lineHeight: 22,
  },
  heroBrandSub: {
    fontSize: 10,
    fontWeight: "500",
    color: "#d1fae5",
    marginTop: 1,
  },
  heroScanBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "#ffffff",
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderRadius: 12,
  },
  heroScanText: { fontSize: 11.5, fontWeight: "700", color: "#059669" },
  heroDivider: {
    height: 1,
    backgroundColor: "rgba(255, 255, 255, 0.18)",
    marginVertical: 11,
  },
  heroGreeting: {
    fontSize: 17,
    fontWeight: "700",
    color: "#ffffff",
    letterSpacing: -0.2,
  },
  heroMeta: {
    fontSize: 11,
    fontWeight: "500",
    color: "#d1fae5",
    marginTop: 2,
  },
  heroProgressBox: {
    marginTop: 11,
    backgroundColor: "rgba(255, 255, 255, 0.14)",
    borderRadius: 14,
    padding: 10,
  },
  heroProgressHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 6,
  },
  heroProgressLabel: {
    fontSize: 10,
    fontWeight: "700",
    color: "#ecfdf5",
    letterSpacing: 0.5,
  },
  heroProgressStat: {
    fontSize: 11,
    fontWeight: "700",
    color: "#ffffff",
  },
  heroProgressTrack: {
    height: 7,
    backgroundColor: "rgba(255, 255, 255, 0.25)",
    borderRadius: 99,
    overflow: "hidden",
  },
  heroProgressFill: {
    height: "100%",
    backgroundColor: "#ffffff",
    borderRadius: 99,
  },
  heroStreakStrip: {
    marginTop: 9,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "rgba(255, 255, 255, 0.14)",
    borderRadius: 14,
    paddingVertical: 9,
    paddingHorizontal: 11,
  },
  heroFlameBox: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: "rgba(255, 255, 255, 0.18)",
    alignItems: "center",
    justifyContent: "center",
  },
  heroStreakTitle: { fontSize: 13, fontWeight: "700", color: "#ffffff" },
  heroStreakSub: { fontSize: 10.5, fontWeight: "500", color: "#d1fae5", marginTop: 1 },
  heroHistoryPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    backgroundColor: "rgba(255, 255, 255, 0.2)",
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 99,
  },
  heroHistoryPillText: { fontSize: 10.5, fontWeight: "700", color: "#ffffff" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 18,
  },
  greeting: { fontSize: 20, fontWeight: "900", color: "#0f172a" },
  subGreeting: { fontSize: 12, fontWeight: "600", color: "#64748b", marginTop: 2 },
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
  quickScanText: { fontSize: 12, fontWeight: "800", color: "#047857" },
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
  streakLeft: { flexDirection: "row", alignItems: "center", gap: 12, flex: 1 },
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
  streakNumber: { fontSize: 16, fontWeight: "900", color: "#0f172a" },
  streakLabel: { fontSize: 11, color: "#64748b", fontWeight: "600", marginTop: 1 },
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
  streakBadgeText: { fontSize: 10, fontWeight: "800", color: "#047857" },
  sectionHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  sectionHeader: { flexDirection: "row", alignItems: "center", gap: 6 },
  sectionTitle: {
    fontSize: 14,
    fontWeight: "800",
    color: "#0f172a",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  progressPill: {
    fontSize: 11,
    fontWeight: "800",
    color: "#047857",
    backgroundColor: "#ecfdf5",
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: 10,
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
  emptyTitle: { fontSize: 16, fontWeight: "800", color: "#0f172a", marginTop: 12 },
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
  emptyScanBtnText: { color: "#ffffff", fontSize: 13, fontWeight: "800" },
  rxCard: {
    backgroundColor: "#ffffff",
    borderRadius: 16,
    padding: 12,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    marginBottom: 9,
    shadowColor: "#0f172a",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 6,
    elevation: 1,
  },
  rxHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  rxName: { fontSize: 14.5, fontWeight: "800", color: "#0f172a" },
  rxDetail: { fontSize: 11, color: "#64748b", fontWeight: "600", marginTop: 1 },
  doctorTag: {
    backgroundColor: "#f1f5f9",
    paddingHorizontal: 7,
    paddingVertical: 2.5,
    borderRadius: 7,
  },
  doctorTagText: { fontSize: 9.5, fontWeight: "700", color: "#475569" },
  rxInstructionsBox: {
    backgroundColor: "#f8fafc",
    paddingVertical: 5,
    paddingHorizontal: 8,
    borderRadius: 7,
    marginTop: 6,
  },
  rxInstructionsText: { fontSize: 10.5, color: "#64748b", fontWeight: "600" },
  slotsRow: { marginTop: 8, flexDirection: "row", flexWrap: "wrap", gap: 7 },
  slotItem: {
    flex: 1,
    minWidth: 90,
    backgroundColor: "#f8fafc",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 11,
    paddingVertical: 6,
    paddingHorizontal: 8,
    alignItems: "center",
  },
  slotTime: { fontSize: 10.5, fontWeight: "800", color: "#0f172a", marginBottom: 5 },
  actionButtonsRow: { flexDirection: "row", gap: 5, width: "100%" },
  takeBtn: {
    flex: 1,
    backgroundColor: "#10b981",
    paddingVertical: 5,
    borderRadius: 7,
    alignItems: "center",
  },
  takeBtnText: { color: "#ffffff", fontSize: 10.5, fontWeight: "800" },
  skipBtn: {
    backgroundColor: "#f1f5f9",
    paddingVertical: 5,
    paddingHorizontal: 7,
    borderRadius: 7,
    alignItems: "center",
  },
  skipBtnText: { color: "#64748b", fontSize: 10.5, fontWeight: "700" },
  loggedBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 7,
    width: "100%",
    justifyContent: "center",
  },
  takenBadge: { backgroundColor: "#ecfdf5" },
  takenText: { fontSize: 10.5, fontWeight: "800", color: "#059669" },
  skippedBadge: { backgroundColor: "#fef2f2" },
  skippedText: { fontSize: 10.5, fontWeight: "800", color: "#dc2626" },
  nextApptCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#bae6fd",
    borderRadius: 18,
    padding: 14,
    marginBottom: 12,
  },
  nextApptIcon: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: "#e0f2fe",
    alignItems: "center",
    justifyContent: "center",
  },
  nextApptLabel: { fontSize: 9, fontWeight: "900", color: "#0284c7", letterSpacing: 0.4 },
  nextApptTitle: { fontSize: 14, fontWeight: "800", color: "#0f172a", marginTop: 1 },
  nextApptMeta: { fontSize: 11, fontWeight: "600", color: "#64748b", marginTop: 2 },
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
    paddingBottom: 30,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },
  modalTitle: { fontSize: 17, fontWeight: "900", color: "#0f172a" },
  modalSubtitle: { fontSize: 12, color: "#64748b", fontWeight: "600", marginTop: 2 },
  reasonOption: {
    paddingVertical: 11,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    backgroundColor: "#f8fafc",
  },
  reasonOptionActive: { borderColor: "#10b981", backgroundColor: "#ecfdf5" },
  reasonOptionText: { fontSize: 13, fontWeight: "600", color: "#334155" },
  reasonOptionTextActive: { color: "#065f46", fontWeight: "800" },
  customInput: {
    marginTop: 10,
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 44,
    fontSize: 13,
    color: "#0f172a",
    backgroundColor: "#f8fafc",
  },
  confirmSkipBtn: {
    marginTop: 16,
    backgroundColor: "#0f172a",
    paddingVertical: 13,
    borderRadius: 14,
    alignItems: "center",
  },
  confirmSkipBtnText: { color: "#ffffff", fontSize: 13, fontWeight: "800" },
  timeframeRow: {
    flexDirection: "row",
    backgroundColor: "#f1f5f9",
    padding: 4,
    borderRadius: 12,
    gap: 4,
    marginBottom: 12,
  },
  timeframePill: {
    flex: 1,
    paddingVertical: 6,
    borderRadius: 8,
    alignItems: "center",
  },
  timeframePillActive: {
    backgroundColor: "#ffffff",
    shadowColor: "#0f172a",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 2,
    elevation: 1,
  },
  timeframePillText: { fontSize: 11, fontWeight: "700", color: "#64748b" },
  timeframePillTextActive: { color: "#0f172a", fontWeight: "800" },
  webKpiCard: {
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 16,
    padding: 13,
  },
  webKpiTopRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 8,
  },
  webKpiLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
  },
  webKpiIconBox: {
    width: 42,
    height: 42,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
  },
  webKpiLabel: {
    fontSize: 10,
    fontWeight: "800",
    color: "#94a3b8",
    letterSpacing: 0.5,
  },
  webKpiValue: {
    fontSize: 21,
    fontWeight: "900",
    marginTop: 1,
  },
  webKpiSub: {
    fontSize: 10.5,
    fontWeight: "600",
    color: "#64748b",
    marginTop: 8,
  },
  kpiRowPair: { flexDirection: "row", gap: 8 },
  kpiCard: {
    flex: 1,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 14,
    padding: 11,
    justifyContent: "space-between",
  },
  kpiCardAmber: {
    backgroundColor: "#fffbeb",
    borderColor: "#fde68a",
  },
  kpiCardTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 4,
  },
  kpiBigVal: { fontSize: 20, fontWeight: "900", marginTop: 4 },
  kpiSub: { fontSize: 9.5, fontWeight: "600", color: "#64748b", marginTop: 4 },
  bestBadge: {
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#fde68a",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 99,
  },
  bestBadgeText: { fontSize: 10, fontWeight: "800", color: "#92400e" },
  tierBadge: {
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 99,
  },
  tierBadgeText: { fontSize: 9.5, fontWeight: "800" },
  progressTrack: {
    height: 5,
    backgroundColor: "#f1f5f9",
    borderRadius: 99,
    overflow: "hidden",
    marginTop: 6,
  },
  progressFill: { height: "100%", borderRadius: 99 },
  sectionSubHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  loggedCountText: { fontSize: 10, fontWeight: "700", color: "#94a3b8" },
  volumeTile: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 8,
    alignItems: "center",
  },
  volumeVal: { fontSize: 16, fontWeight: "900" },
  volumeLabel: { fontSize: 10, fontWeight: "700", marginTop: 1 },
  riskWindowBadge: {
    fontSize: 10,
    fontWeight: "800",
    color: "#b45309",
    backgroundColor: "#fffbeb",
    borderWidth: 1,
    borderColor: "#fde68a",
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 99,
  },
  onTrackBadge: { fontSize: 10, fontWeight: "800", color: "#047857" },
  todCard: {
    marginTop: 14,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 16,
    padding: 12,
  },
  todTile: {
    flex: 1,
    backgroundColor: "#f8fafc",
    borderWidth: 1,
    borderColor: "#f1f5f9",
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 6,
    alignItems: "center",
    gap: 3,
  },
  todLabel: { fontSize: 10.5, fontWeight: "700", color: "#475569", marginTop: 1 },
  todRate: { fontSize: 13, fontWeight: "900", color: "#0f172a" },
  courseOkBox: {
    backgroundColor: "#ecfdf5",
    borderWidth: 1,
    borderColor: "#d1fae5",
    borderRadius: 12,
    padding: 10,
  },
  courseOkText: { fontSize: 11, fontWeight: "600", color: "#065f46", lineHeight: 16 },
  courseWarnRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    backgroundColor: "#fffbeb",
    borderWidth: 1,
    borderColor: "#fde68a",
    borderRadius: 12,
    paddingHorizontal: 11,
    paddingVertical: 8,
  },
  courseWarnName: { flex: 1, fontSize: 12, fontWeight: "800", color: "#78350f" },
  courseDaysPill: {
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#fde68a",
    borderRadius: 99,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  courseDaysText: { fontSize: 10, fontWeight: "800", color: "#b45309" },
  kpiGrid: { flexDirection: "row", gap: 8, marginTop: 6 },
  kpiBox: {
    flex: 1,
    backgroundColor: "#f8fafc",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 14,
    paddingVertical: 10,
    alignItems: "center",
  },
  kpiLabel: { fontSize: 9, fontWeight: "800", color: "#64748b" },
  kpiVal: { fontSize: 17, fontWeight: "900", marginTop: 2 },
  modalSectionTitle: {
    fontSize: 11,
    fontWeight: "800",
    color: "#64748b",
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  trendGrid: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  trendTile: {
    width: "12.8%",
    borderRadius: 10,
    paddingVertical: 7,
    alignItems: "center",
  },
  trendDay: { fontSize: 12, fontWeight: "900" },
  trendCount: { fontSize: 9, fontWeight: "700", marginTop: 1 },
  medSummaryRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#f8fafc",
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    marginBottom: 8,
  },
  medSummaryName: { fontSize: 13, fontWeight: "800", color: "#0f172a" },
  medSummaryCounts: { fontSize: 11, color: "#64748b", marginTop: 2 },
  medSummaryRate: { fontSize: 15, fontWeight: "900", color: "#059669" },
  historyLogRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#f1f5f9",
  },
  historyLogMed: { fontSize: 13, fontWeight: "700", color: "#0f172a" },
  historyLogTime: { fontSize: 11, color: "#64748b", marginTop: 2 },
  historyLogBadge: { fontSize: 10, fontWeight: "900" },
  emptyLogText: { fontSize: 12, color: "#94a3b8", textAlign: "center", paddingVertical: 16 },
});
