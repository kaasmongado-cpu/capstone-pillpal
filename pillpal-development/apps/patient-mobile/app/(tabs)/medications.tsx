import React, { useState, useCallback, useEffect } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
  Image,
  Modal,
  Switch,
  Alert,
  Platform,
} from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { BrandHeader } from "@/components/BrandHeader";
import {
  Pill,
  Scan,
  Calendar,
  Clock,
  ShieldCheck,
  Image as ImageIcon,
  X,
  Bell,
  BellRing,
  Volume2,
  CheckCircle2,
  Trash2,
  Lock,
  Info,
  Store,
  LayoutGrid,
  List,
  ChevronRight,
} from "lucide-react-native";
import { lookupMedicationPurpose } from "@/services/ocr/parser";
import {
  getAllLocalPrescriptions,
  deleteLocalPrescription,
  getCachedJson,
  saveCachedJson,
  LocalPrescription,
} from "@/services/db/database";
import {
  ALARM_TOGGLES_CACHE_KEY,
  AlarmSystemDiagnostics,
  getAlarmSystemDiagnostics,
  requestNotificationPermissions,
  syncPrescriptionAlarms,
  triggerTestAlarm,
  cancelPrescriptionAlarms,
  schedulePrescriptionSlotAlarm,
  cancelPrescriptionSlotAlarm,
} from "@/services/notifications/alarms";
import { fetchWithAuth } from "@/services/api/client";
import { pullServerPrescriptions } from "@/services/sync/sync-worker";

const MOBILE_EXTERNAL_RX_REGEX = /\[External Pharmacy(?::\s*([^\]]+))?\]/i;
const MOBILE_PARTIAL_RX_REGEX = /\[Partial Clinic Dispense(?::\s*([^\]]+))?\]/i;
const DISPLAY_LAYOUT_CACHE_KEY = "medications_display_layout";

function parseMobileFulfillment(instructions: string | null | undefined): {
  mode: "EXTERNAL" | "PARTIAL" | null;
  note: string | null;
  cleanInstructions: string | null;
} {
  if (!instructions) return { mode: null, note: null, cleanInstructions: null };
  const partialMatch = instructions.match(MOBILE_PARTIAL_RX_REGEX);
  if (partialMatch) {
    const clean = instructions.replace(MOBILE_PARTIAL_RX_REGEX, "").replace(/\s*\|\s*$/, "").trim();
    return {
      mode: "PARTIAL",
      note:
        partialMatch[1]?.trim() ||
        "Starter units provided by CSU Clinic; purchase remaining balance at an outside pharmacy.",
      cleanInstructions: clean || null,
    };
  }
  const externalMatch = instructions.match(MOBILE_EXTERNAL_RX_REGEX);
  if (externalMatch) {
    const clean = instructions.replace(MOBILE_EXTERNAL_RX_REGEX, "").replace(/\s*\|\s*$/, "").trim();
    return {
      mode: "EXTERNAL",
      note:
        externalMatch[1]?.trim() ||
        "Not currently available in CSU Clinic stock; purchase at an external pharmacy.",
      cleanInstructions: clean || null,
    };
  }
  return { mode: null, note: null, cleanInstructions: instructions };
}

export default function MedicationsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [allPrescriptions, setAllPrescriptions] = useState<LocalPrescription[]>([]);
  const [filter, setFilter] = useState<"ACTIVE" | "ALARMS" | "HISTORY">("ACTIVE");
  const [displayLayout, setDisplayLayout] = useState<"cards" | "list">("cards");
  const [detailRx, setDetailRx] = useState<LocalPrescription | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [previewPhotoUri, setPreviewPhotoUri] = useState<string | null>(null);

  // Alarm management state
  const [testCountdown, setTestCountdown] = useState<number | null>(null);
  const [alarmToggles, setAlarmToggles] = useState<Record<string, boolean>>({});
  const [rearming, setRearming] = useState(false);
  const [alarmDiag, setAlarmDiag] = useState<AlarmSystemDiagnostics | null>(null);

  const refreshDiagnostics = useCallback(async () => {
    try {
      const diag = await getAlarmSystemDiagnostics();
      setAlarmDiag(diag);
    } catch {
      // ignore
    }
  }, []);

  const loadData = useCallback(async () => {
    try {
      await pullServerPrescriptions();
    } catch {
      // offline fallback
    }

    const [list, savedToggles, savedLayout] = await Promise.all([
      getAllLocalPrescriptions(),
      getCachedJson<Record<string, boolean>>(ALARM_TOGGLES_CACHE_KEY),
      getCachedJson<"cards" | "list">(DISPLAY_LAYOUT_CACHE_KEY),
    ]);
    setAllPrescriptions(list);
    if (savedLayout === "list" || savedLayout === "cards") {
      setDisplayLayout(savedLayout);
    }

    const activeOnly = list.filter((rx) => rx.status === "ACTIVE");
    const defaults: Record<string, boolean> = {};
    for (const rx of activeOnly) {
      for (const time of rx.schedule_times) {
        defaults[`${rx.id}_${time}`] = true;
      }
    }
    const mergedToggles = { ...defaults, ...(savedToggles || {}) };
    setAlarmToggles(mergedToggles);

    // Ensure OS alarms match active prescriptions & saved toggles, then inspect real OS state
    try {
      await syncPrescriptionAlarms(list, { savedToggles: mergedToggles });
    } catch {
      // ignore
    }
    await refreshDiagnostics();
  }, [refreshDiagnostics]);

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

  // Test Alarm Countdown timer
  useEffect(() => {
    if (testCountdown === null) return;
    if (testCountdown <= 0) {
      setTestCountdown(null);
      return;
    }
    const timer = setTimeout(() => {
      setTestCountdown((c) => (c ? c - 1 : null));
    }, 1000);
    return () => clearTimeout(timer);
  }, [testCountdown]);

  const activePrescriptions = allPrescriptions.filter((rx) => rx.status === "ACTIVE");
  const pastPrescriptions = allPrescriptions.filter((rx) => rx.status !== "ACTIVE");
  const scannedActivePrescriptions = activePrescriptions.filter((rx) => !rx.doctor_id);

  async function handleSelectDisplayLayout(nextLayout: "cards" | "list") {
    void Haptics.selectionAsync().catch(() => {});
    setDisplayLayout(nextLayout);
    await saveCachedJson(DISPLAY_LAYOUT_CACHE_KEY, nextLayout);
  }

  async function handleTestAlarm() {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {});
    try {
      await triggerTestAlarm(5);
      setTestCountdown(5);
    } catch (err: any) {
      setTestCountdown(null);
      const msg = err?.message || "Failed to schedule test alarm.";
      if (Platform.OS !== "web") {
        Alert.alert("Notification Permission Needed", msg);
      }
    }
  }

  async function handleToggleAlarm(rxId: string, time: string, enabled: boolean) {
    const key = `${rxId}_${time}`;
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    const nextToggles = { ...alarmToggles, [key]: enabled };
    setAlarmToggles(nextToggles);
    await saveCachedJson(ALARM_TOGGLES_CACHE_KEY, nextToggles);

    if (!enabled) {
      await cancelPrescriptionSlotAlarm(rxId, time);
    } else {
      const rx = activePrescriptions.find((p) => p.id === rxId);
      if (rx) {
        const scheduledId = await schedulePrescriptionSlotAlarm(rx, time);
        if (!scheduledId && Platform.OS !== "web") {
          Alert.alert(
            "Notifications Disabled",
            "Enable notification permission for PILLPAL in your phone Settings to arm this alarm.",
          );
        }
      }
    }
    await refreshDiagnostics();
  }

  async function handleRearmAll() {
    setRearming(true);
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    try {
      const result = await syncPrescriptionAlarms(allPrescriptions, {
        savedToggles: alarmToggles,
        requestPermission: true,
      });
      const diag = await getAlarmSystemDiagnostics();
      setAlarmDiag(diag);

      if (Platform.OS !== "web") {
        if (!result.granted) {
          Alert.alert(
            "Notifications Blocked",
            "Notification permission is denied by Android/iOS. Please allow notifications for PILLPAL in your phone Settings.",
          );
        } else {
          Alert.alert(
            "Alarms Verified & Armed",
            `${diag.scheduledCount} daily medication alarm${diag.scheduledCount === 1 ? "" : "s"} confirmed active in your device notification scheduler.${
              diag.nextTriggerLabel ? `\n\nNext alarm: ${diag.nextTriggerLabel}` : ""
            }`,
          );
        }
      }
    } finally {
      setRearming(false);
    }
  }

  async function handleRequestPermission() {
    const granted = await requestNotificationPermissions();
    if (granted) {
      await syncPrescriptionAlarms(allPrescriptions, { savedToggles: alarmToggles });
    } else if (Platform.OS !== "web") {
      Alert.alert(
        "Permission Required",
        "Please open your device Settings → Apps → PILLPAL Patient → Notifications and turn on Allow Notifications.",
      );
    }
    await refreshDiagnostics();
  }

  async function performDeleteScannedRx(rx: LocalPrescription) {
    await cancelPrescriptionAlarms(rx.id);
    try {
      const res = await fetchWithAuth(`/medications/${rx.id}`, { method: "DELETE" });
      if (!res.ok && res.status === 403) {
        if (Platform.OS !== "web") {
          Alert.alert(
            "Protected Prescription",
            "Clinic-issued prescriptions cannot be deleted by patients.",
          );
        }
        return;
      }
    } catch {
      // offline delete for local scanned med
    }
    await deleteLocalPrescription(rx.id);
    await loadData();
  }

  async function handleDeletePrescription(rx: LocalPrescription) {
    if (rx.doctor_id) return;
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    if (Platform.OS === "web") {
      if (globalThis.confirm?.(`Remove self-scanned "${rx.name}" from your schedule?`)) {
        await performDeleteScannedRx(rx);
      }
      return;
    }
    Alert.alert(
      "Remove Self-Scanned Medication",
      `Remove "${rx.name}" from your personal schedule?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: () => void performDeleteScannedRx(rx),
        },
      ],
    );
  }

  async function handleClearScannedOnly() {
    if (scannedActivePrescriptions.length === 0) return;
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
    const runClear = async () => {
      for (const rx of scannedActivePrescriptions) {
        await performDeleteScannedRx(rx);
      }
    };
    if (Platform.OS === "web") {
      if (
        globalThis.confirm?.(
          "Remove all self-scanned medications? Doctor-issued CSU Clinic prescriptions will remain protected.",
        )
      ) {
        await runClear();
      }
      return;
    }
    Alert.alert(
      "Clear Scanned Medications",
      "Remove all self-scanned medications? Doctor-issued CSU Clinic prescriptions will remain protected.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Clear Scanned", style: "destructive", onPress: () => void runClear() },
      ],
    );
  }

  // Extract all active daily doses into a chronological timeline
  const dailyAlarmsTimeline = activePrescriptions
    .flatMap((rx) =>
      rx.schedule_times.map((time) => ({
        rxId: rx.id,
        name: rx.name,
        dosage: rx.dosage,
        form: rx.form || "Tablet",
        instructions: rx.instructions,
        time,
        toggleKey: `${rx.id}_${time}`,
      })),
    )
    .sort((a, b) => {
      const toMinutes = (t: string) => {
        const match = t.match(/(\d{1,2}):(\d{2})\s*(AM|PM)?/i);
        if (!match) return 0;
        let h = parseInt(match[1], 10);
        const m = parseInt(match[2], 10);
        if (match[3]?.toUpperCase() === "PM" && h < 12) h += 12;
        if (match[3]?.toUpperCase() === "AM" && h === 12) h = 0;
        return h * 60 + m;
      };
      return toMinutes(a.time) - toMinutes(b.time);
    });

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
          title="My Medications"
          subtitle="Prescriptions, OS dosing alarms & saved bottle photos"
        />

        {/* Filter / Mode Tabs */}
        <View style={styles.filterRow}>
          <TouchableOpacity
            style={[styles.filterTab, filter === "ACTIVE" && styles.filterTabActive]}
            onPress={() => setFilter("ACTIVE")}
          >
            <Text style={[styles.filterTabText, filter === "ACTIVE" && styles.filterTabTextActive]}>
              Active ({activePrescriptions.length})
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.filterTab, filter === "ALARMS" && styles.filterTabActive]}
            onPress={() => setFilter("ALARMS")}
          >
            <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
              <Bell size={12} color={filter === "ALARMS" ? "#059669" : "#64748b"} />
              <Text
                style={[styles.filterTabText, filter === "ALARMS" && styles.filterTabTextActive]}
              >
                Alarms ({dailyAlarmsTimeline.length})
              </Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.filterTab, filter === "HISTORY" && styles.filterTabActive]}
            onPress={() => setFilter("HISTORY")}
          >
            <Text
              style={[styles.filterTabText, filter === "HISTORY" && styles.filterTabTextActive]}
            >
              History ({pastPrescriptions.length})
            </Text>
          </TouchableOpacity>
        </View>

        {/* VIEW 1: DAILY ALARMS TIMELINE */}
        {filter === "ALARMS" ? (
          <View style={{ gap: 14 }}>
            {(() => {
              const enabledSlotCount = dailyAlarmsTimeline.filter(
                (item) => alarmToggles[item.toggleKey] ?? true,
              ).length;
              const isWeb = Platform.OS === "web";
              const permOk = Boolean(alarmDiag?.permissionGranted);
              const armedCount = alarmDiag?.scheduledCount ?? 0;

              return (
                <View
                  style={[
                    styles.alarmStatusCard,
                    !isWeb &&
                      alarmDiag &&
                      !permOk && {
                        backgroundColor: "#fffbeb",
                        borderColor: "#fcd34d",
                      },
                  ]}
                >
                  <View
                    style={[
                      styles.statusIconCircle,
                      !isWeb && alarmDiag && !permOk && { backgroundColor: "#fef3c7" },
                    ]}
                  >
                    <BellRing
                      size={20}
                      color={!isWeb && alarmDiag && !permOk ? "#b45309" : "#059669"}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text
                      style={[
                        styles.alarmStatusTitle,
                        !isWeb && alarmDiag && !permOk && { color: "#92400e" },
                      ]}
                    >
                      {isWeb
                        ? "Web Preview Mode"
                        : !alarmDiag
                          ? "Checking Device Alarms..."
                          : !permOk
                            ? "Notification Permission Needed"
                            : `Verified: ${armedCount} of ${enabledSlotCount} OS Alarms Armed`}
                    </Text>
                    <Text
                      style={[
                        styles.alarmStatusDesc,
                        !isWeb && alarmDiag && !permOk && { color: "#b45309" },
                      ]}
                    >
                      {isWeb
                        ? "Test Alarm previews the in-app ringing modal here. Daily background OS alarms run on the Android/iOS mobile app."
                        : !alarmDiag
                          ? "Inspecting scheduled notifications..."
                          : !permOk
                            ? "Allow notifications so PILLPAL can ring even when the app is closed."
                            : alarmDiag.nextTriggerLabel
                              ? `Next ring: ${alarmDiag.nextTriggerLabel}`
                              : "Active prescriptions auto-arm daily reminders even when offline."}
                    </Text>
                    {!isWeb && alarmDiag && !permOk && (
                      <TouchableOpacity
                        onPress={() => void handleRequestPermission()}
                        style={{
                          marginTop: 8,
                          alignSelf: "flex-start",
                          backgroundColor: "#d97706",
                          paddingHorizontal: 10,
                          paddingVertical: 5,
                          borderRadius: 8,
                        }}
                      >
                        <Text style={{ color: "#ffffff", fontSize: 11, fontWeight: "800" }}>
                          Enable Notifications
                        </Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
              );
            })()}

            <View style={styles.testAlarmCard}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                <Volume2 size={24} color="#047857" />
                <View style={{ flex: 1 }}>
                  <Text style={styles.testCardTitle}>Test Alarm (5-Sec Demo)</Text>
                  <Text style={styles.testCardDesc}>
                    Trigger a test reminder in 5 seconds to verify audio, vibration, and
                    lock-screen actions.
                  </Text>
                </View>
              </View>

              <TouchableOpacity
                style={[styles.testBtn, testCountdown !== null && { backgroundColor: "#f59e0b" }]}
                onPress={handleTestAlarm}
                disabled={testCountdown !== null}
              >
                <Bell size={16} color="#ffffff" />
                <Text style={styles.testBtnText}>
                  {testCountdown !== null
                    ? `Ringing in ${testCountdown}s...`
                    : "Test Ringing Alarm (5s)"}
                </Text>
              </TouchableOpacity>
            </View>

            <View style={{ marginTop: 8 }}>
              <View style={styles.sectionHeaderRow}>
                <Text style={styles.sectionTitle}>DAILY SCHEDULED ALARMS</Text>
                <TouchableOpacity onPress={handleRearmAll} disabled={rearming}>
                  <Text style={styles.rearmLinkText}>
                    {rearming ? "Arming..." : "Re-arm Enabled"}
                  </Text>
                </TouchableOpacity>
              </View>

              {dailyAlarmsTimeline.length === 0 ? (
                <View style={styles.emptyCard}>
                  <Bell size={36} color="#94a3b8" />
                  <Text style={styles.emptyTitle}>No Alarms Scheduled</Text>
                  <Text style={styles.emptyDesc}>
                    Active prescriptions or scanned bottles will schedule daily reminders here.
                  </Text>
                </View>
              ) : (
                dailyAlarmsTimeline.map((item, idx) => {
                  const isEnabled = alarmToggles[item.toggleKey] ?? true;
                  const isArmedInOs = Boolean(
                    alarmDiag?.scheduledSlotKeys.includes(item.toggleKey),
                  );
                  return (
                    <View key={`${item.rxId}_${item.time}_${idx}`} style={styles.alarmItemCard}>
                      <View style={styles.timeBadge}>
                        <Clock size={12} color="#065f46" />
                        <Text style={styles.timeBadgeText}>{item.time}</Text>
                      </View>

                      <View style={{ flex: 1 }}>
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                          <Text style={styles.alarmMedName}>{item.name}</Text>
                          {Platform.OS !== "web" && isEnabled && (
                            <Text
                              style={{
                                fontSize: 9,
                                fontWeight: "800",
                                color: isArmedInOs ? "#047857" : "#b45309",
                                backgroundColor: isArmedInOs ? "#ecfdf5" : "#fffbeb",
                                paddingHorizontal: 5,
                                paddingVertical: 1,
                                borderRadius: 6,
                              }}
                            >
                              {isArmedInOs ? "Armed" : "Not Armed"}
                            </Text>
                          )}
                        </View>
                        <Text style={styles.alarmMedDosage}>
                          {item.dosage} • {item.form}
                        </Text>
                        {item.instructions ? (
                          <Text style={styles.alarmInstructions} numberOfLines={1}>
                            {item.instructions}
                          </Text>
                        ) : null}
                      </View>

                      <Switch
                        value={isEnabled}
                        onValueChange={(val) => void handleToggleAlarm(item.rxId, item.time, val)}
                        trackColor={{ false: "#cbd5e1", true: "#a7f3d0" }}
                        thumbColor={isEnabled ? "#10b981" : "#f1f5f9"}
                      />
                    </View>
                  );
                })
              )}
            </View>
          </View>
        ) : null}

        {/* VIEW 2: ACTIVE PRESCRIPTION REGIMENS */}
        {filter === "ACTIVE" ? (
          activePrescriptions.length === 0 ? (
            <View style={styles.emptyCard}>
              <Pill size={40} color="#94a3b8" />
              <Text style={styles.emptyTitle}>No Active Medications</Text>
              <Text style={styles.emptyDesc}>
                Tap the scanner below to add an OTC bottle label, or check back after your CSU
                Clinic consultation.
              </Text>
            </View>
          ) : (
            <>
              <View style={styles.regimenHeaderRow}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flexShrink: 1 }}>
                  <Text style={styles.regimenCountText}>
                    {activePrescriptions.length} Active
                  </Text>
                  {scannedActivePrescriptions.length > 0 && (
                    <TouchableOpacity onPress={handleClearScannedOnly} style={styles.clearAllBtn}>
                      <Trash2 size={12} color="#ef4444" />
                      <Text style={styles.clearAllBtnText}>Clear Scanned</Text>
                    </TouchableOpacity>
                  )}
                </View>

                {/* Cards | List Display Switcher */}
                <View style={styles.layoutTogglePill}>
                  <TouchableOpacity
                    style={[
                      styles.layoutToggleBtn,
                      displayLayout === "cards" && styles.layoutToggleBtnActive,
                    ]}
                    activeOpacity={0.85}
                    onPress={() => void handleSelectDisplayLayout("cards")}
                  >
                    <LayoutGrid
                      size={13}
                      color={displayLayout === "cards" ? "#059669" : "#64748b"}
                    />
                    <Text
                      style={[
                        styles.layoutToggleText,
                        displayLayout === "cards" && styles.layoutToggleTextActive,
                      ]}
                    >
                      Cards
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[
                      styles.layoutToggleBtn,
                      displayLayout === "list" && styles.layoutToggleBtnActive,
                    ]}
                    activeOpacity={0.85}
                    onPress={() => void handleSelectDisplayLayout("list")}
                  >
                    <List size={13} color={displayLayout === "list" ? "#059669" : "#64748b"} />
                    <Text
                      style={[
                        styles.layoutToggleText,
                        displayLayout === "list" && styles.layoutToggleTextActive,
                      ]}
                    >
                      List
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>

              {displayLayout === "list" ? (
                <View style={styles.listContainer}>
                  {activePrescriptions.map((rx, idx) => {
                    const isClinicRx = Boolean(rx.doctor_id);
                    const fulfillment = parseMobileFulfillment(rx.instructions);
                    return (
                      <TouchableOpacity
                        key={rx.id}
                        activeOpacity={0.75}
                        onPress={() => setDetailRx(rx)}
                        style={[
                          styles.listRow,
                          idx > 0 && styles.listRowBorder,
                        ]}
                      >
                        <View
                          style={[
                            styles.listDot,
                            { backgroundColor: isClinicRx ? "#059669" : "#94a3b8" },
                          ]}
                        />
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                            <Text style={styles.listMedName} numberOfLines={1}>
                              {rx.name}
                            </Text>
                            {isClinicRx && fulfillment.mode && (
                              <View style={styles.listExternalPill}>
                                <Store size={9} color="#b45309" />
                                <Text style={styles.listExternalText}>
                                  {fulfillment.mode === "PARTIAL" ? "Partial" : "External"}
                                </Text>
                              </View>
                            )}
                          </View>
                          <Text style={styles.listMedSub} numberOfLines={1}>
                            {rx.dosage} • {rx.form || "Tablet"} • {rx.schedule_times.join(", ")}
                          </Text>
                        </View>

                        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                          <View
                            style={[
                              styles.statusBadge,
                              !isClinicRx && { backgroundColor: "#e0f2fe" },
                            ]}
                          >
                            <Text
                              style={[
                                styles.statusBadgeText,
                                !isClinicRx && { color: "#0369a1" },
                              ]}
                            >
                              {isClinicRx ? "CSU RX" : "SCANNED"}
                            </Text>
                          </View>
                          <ChevronRight size={15} color="#94a3b8" />
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              ) : (
                activePrescriptions.map((rx) => {
                const isClinicRx = Boolean(rx.doctor_id);
                const medPurpose = lookupMedicationPurpose(rx.name);
                const fulfillment = parseMobileFulfillment(rx.instructions);
                return (
                  <View
                    key={rx.id}
                    style={[
                      styles.card,
                      { borderLeftWidth: 4, borderLeftColor: isClinicRx ? "#059669" : "#94a3b8" },
                    ]}
                  >
                    <View style={styles.cardHeader}>
                      <View style={styles.pillIconBox}>
                        <Pill size={20} color="#059669" />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.rxName}>{rx.name}</Text>
                        <Text style={styles.rxDosage}>
                          {rx.dosage} • {rx.form || "Tablet"}
                        </Text>
                      </View>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                        <View
                          style={[
                            styles.statusBadge,
                            !isClinicRx && { backgroundColor: "#e0f2fe" },
                          ]}
                        >
                          <Text
                            style={[
                              styles.statusBadgeText,
                              !isClinicRx && { color: "#0369a1" },
                            ]}
                          >
                            {isClinicRx ? "CSU RX" : "SCANNED"}
                          </Text>
                        </View>
                        {isClinicRx ? (
                          <View style={styles.lockIconBox}>
                            <Lock size={13} color="#64748b" />
                          </View>
                        ) : (
                          <TouchableOpacity
                            onPress={() => void handleDeletePrescription(rx)}
                            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                            style={styles.deleteBtn}
                          >
                            <Trash2 size={15} color="#ef4444" />
                          </TouchableOpacity>
                        )}
                      </View>
                    </View>

                    {medPurpose && (
                      <View
                        style={{
                          marginTop: 10,
                          backgroundColor: "#f0f9ff",
                          borderWidth: 1,
                          borderColor: "#bae6fd",
                          borderRadius: 12,
                          padding: 10,
                          gap: 3,
                        }}
                      >
                        <View
                          style={{
                            flexDirection: "row",
                            alignItems: "center",
                            justifyContent: "space-between",
                            gap: 6,
                          }}
                        >
                          <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                            <Info size={12} color="#0284c7" />
                            <Text
                              style={{
                                fontSize: 10,
                                fontWeight: "900",
                                color: "#0369a1",
                                letterSpacing: 0.3,
                              }}
                            >
                              WHAT IT&apos;S FOR
                            </Text>
                          </View>
                          <Text
                            style={{
                              fontSize: 10,
                              fontWeight: "800",
                              color: "#0369a1",
                              backgroundColor: "#ffffff",
                              paddingHorizontal: 7,
                              paddingVertical: 2,
                              borderRadius: 99,
                            }}
                          >
                            {medPurpose.drugClass}
                          </Text>
                        </View>
                        <Text style={{ fontSize: 11, fontWeight: "600", color: "#0c4a6e", lineHeight: 16 }}>
                          {medPurpose.usedFor}
                        </Text>
                      </View>
                    )}

                    {isClinicRx && fulfillment.mode && (
                      <View
                        style={{
                          marginTop: 10,
                          backgroundColor: "#fffbeb",
                          borderWidth: 1,
                          borderColor: "#fde68a",
                          borderRadius: 12,
                          padding: 10,
                          gap: 3,
                        }}
                      >
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
                          <Store size={13} color="#d97706" />
                          <Text
                            style={{
                              fontSize: 10,
                              fontWeight: "900",
                              color: "#92400e",
                              letterSpacing: 0.3,
                            }}
                          >
                            {fulfillment.mode === "PARTIAL"
                              ? "PARTIAL CLINIC SUPPLY • BUY BALANCE OUTSIDE"
                              : "EXTERNAL PHARMACY RX • BUY OUTSIDE"}
                          </Text>
                        </View>
                        <Text
                          style={{
                            fontSize: 11,
                            fontWeight: "600",
                            color: "#78350f",
                            lineHeight: 16,
                          }}
                        >
                          {fulfillment.note}
                        </Text>
                      </View>
                    )}

                    <View style={styles.divider} />

                    <View style={styles.detailsGrid}>
                      <View style={styles.detailRow}>
                        <Clock size={13} color="#64748b" />
                        <Text style={styles.detailText}>
                          {rx.frequency} ({rx.schedule_times.join(", ")})
                        </Text>
                      </View>

                      {fulfillment.cleanInstructions ? (
                        <View style={styles.detailRow}>
                          <ShieldCheck size={13} color="#059669" />
                          <Text style={styles.detailText}>{fulfillment.cleanInstructions}</Text>
                        </View>
                      ) : null}

                      <View style={styles.detailRow}>
                        <Calendar size={13} color="#64748b" />
                        <Text style={styles.detailText}>
                          {isClinicRx
                            ? `Prescribed by ${rx.doctor_name || "CSU Physician"}`
                            : "Self-Scanned Personal Regimen"}
                          {rx.end_date
                            ? ` • Ends ${new Date(rx.end_date).toLocaleDateString()}`
                            : ""}
                        </Text>
                      </View>
                    </View>

                    {Boolean(rx.image_uri) && (
                      <TouchableOpacity
                        style={styles.savedPhotoRow}
                        onPress={() => setPreviewPhotoUri(rx.image_uri!)}
                      >
                        <Image source={{ uri: rx.image_uri! }} style={styles.savedThumb} />
                        <View style={{ flex: 1 }}>
                          <Text style={styles.savedPhotoTitle}>Saved Scanned Label</Text>
                          <Text style={styles.savedPhotoSub}>
                            Tap to view original photo offline
                          </Text>
                        </View>
                        <ImageIcon size={16} color="#047857" />
                      </TouchableOpacity>
                    )}
                  </View>
                );
              })
              )}
            </>
          )
        ) : null}

        {/* VIEW 3: PAST / COMPLETED / PAUSED / DISCONTINUED REGIMENS */}
        {filter === "HISTORY" ? (
          pastPrescriptions.length === 0 ? (
            <View style={styles.emptyCard}>
              <CheckCircle2 size={40} color="#94a3b8" />
              <Text style={styles.emptyTitle}>No Past Courses</Text>
              <Text style={styles.emptyDesc}>
                Completed, paused, or discontinued prescriptions from CSU Clinic will appear here.
              </Text>
            </View>
          ) : (
            <>
              <View style={styles.regimenHeaderRow}>
                <Text style={styles.regimenCountText}>
                  {pastPrescriptions.length} Past Course{pastPrescriptions.length > 1 ? "s" : ""}
                </Text>
                <View style={styles.layoutTogglePill}>
                  <TouchableOpacity
                    style={[
                      styles.layoutToggleBtn,
                      displayLayout === "cards" && styles.layoutToggleBtnActive,
                    ]}
                    activeOpacity={0.85}
                    onPress={() => void handleSelectDisplayLayout("cards")}
                  >
                    <LayoutGrid
                      size={13}
                      color={displayLayout === "cards" ? "#059669" : "#64748b"}
                    />
                    <Text
                      style={[
                        styles.layoutToggleText,
                        displayLayout === "cards" && styles.layoutToggleTextActive,
                      ]}
                    >
                      Cards
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[
                      styles.layoutToggleBtn,
                      displayLayout === "list" && styles.layoutToggleBtnActive,
                    ]}
                    activeOpacity={0.85}
                    onPress={() => void handleSelectDisplayLayout("list")}
                  >
                    <List size={13} color={displayLayout === "list" ? "#059669" : "#64748b"} />
                    <Text
                      style={[
                        styles.layoutToggleText,
                        displayLayout === "list" && styles.layoutToggleTextActive,
                      ]}
                    >
                      List
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>

              {displayLayout === "list" ? (
                <View style={styles.listContainer}>
                  {pastPrescriptions.map((rx, idx) => (
                    <TouchableOpacity
                      key={rx.id}
                      activeOpacity={0.75}
                      onPress={() => setDetailRx(rx)}
                      style={[styles.listRow, idx > 0 && styles.listRowBorder]}
                    >
                      <View style={[styles.listDot, { backgroundColor: "#94a3b8" }]} />
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={styles.listMedName} numberOfLines={1}>
                          {rx.name}
                        </Text>
                        <Text style={styles.listMedSub} numberOfLines={1}>
                          {rx.dosage} • {rx.form || "Tablet"} •{" "}
                          {new Date(rx.start_date).toLocaleDateString()}
                        </Text>
                      </View>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                        <View
                          style={[
                            styles.statusBadge,
                            rx.status === "PAUSED"
                              ? { backgroundColor: "#fef3c7" }
                              : rx.status === "DISCONTINUED"
                                ? { backgroundColor: "#fee2e2" }
                                : { backgroundColor: "#f1f5f9" },
                          ]}
                        >
                          <Text
                            style={[
                              styles.statusBadgeText,
                              rx.status === "PAUSED"
                                ? { color: "#92400e" }
                                : rx.status === "DISCONTINUED"
                                  ? { color: "#b91c1c" }
                                  : { color: "#475569" },
                            ]}
                          >
                            {rx.status}
                          </Text>
                        </View>
                        <ChevronRight size={15} color="#94a3b8" />
                      </View>
                    </TouchableOpacity>
                  ))}
                </View>
              ) : (
                pastPrescriptions.map((rx) => (
              <View key={rx.id} style={[styles.card, { opacity: 0.92 }]}>
                <View style={styles.cardHeader}>
                  <View style={[styles.pillIconBox, { backgroundColor: "#f1f5f9" }]}>
                    <Pill size={20} color="#64748b" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.rxName}>{rx.name}</Text>
                    <Text style={styles.rxDosage}>
                      {rx.dosage} • {rx.form || "Tablet"}
                    </Text>
                  </View>
                  <View
                    style={[
                      styles.statusBadge,
                      rx.status === "PAUSED"
                        ? { backgroundColor: "#fef3c7" }
                        : rx.status === "DISCONTINUED"
                          ? { backgroundColor: "#fee2e2" }
                          : { backgroundColor: "#f1f5f9" },
                    ]}
                  >
                    <Text
                      style={[
                        styles.statusBadgeText,
                        rx.status === "PAUSED"
                          ? { color: "#92400e" }
                          : rx.status === "DISCONTINUED"
                            ? { color: "#b91c1c" }
                            : { color: "#475569" },
                      ]}
                    >
                      {rx.status}
                    </Text>
                  </View>
                </View>

                <View style={styles.divider} />

                <View style={styles.detailsGrid}>
                  <View style={styles.detailRow}>
                    <Calendar size={13} color="#64748b" />
                    <Text style={styles.detailText}>
                      {new Date(rx.start_date).toLocaleDateString()}
                      {rx.end_date ? ` → ${new Date(rx.end_date).toLocaleDateString()}` : ""}
                    </Text>
                  </View>
                  <View style={styles.detailRow}>
                    <ShieldCheck size={13} color="#64748b" />
                    <Text style={styles.detailText}>
                      {rx.doctor_name || "CSU Health Services"}
                    </Text>
                  </View>
                </View>
              </View>
            ))
              )}
            </>
          )
        ) : null}
      </ScrollView>

      {/* Medication Detail Bottom Sheet (opened when tapping a compact List row) */}
      <Modal
        visible={Boolean(detailRx)}
        animationType="slide"
        transparent
        onRequestClose={() => setDetailRx(null)}
      >
        <View style={styles.detailModalBackdrop}>
          <View style={styles.detailModalSheet}>
            {detailRx &&
              (() => {
                const isClinicRx = Boolean(detailRx.doctor_id);
                const medPurpose = lookupMedicationPurpose(detailRx.name);
                const fulfillment = parseMobileFulfillment(detailRx.instructions);
                return (
                  <ScrollView showsVerticalScrollIndicator={false}>
                    <View style={styles.detailModalHeader}>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 10, flex: 1 }}>
                        <View style={styles.pillIconBox}>
                          <Pill size={20} color="#059669" />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.rxName}>{detailRx.name}</Text>
                          <Text style={styles.rxDosage}>
                            {detailRx.dosage} • {detailRx.form || "Tablet"}
                          </Text>
                        </View>
                      </View>
                      <TouchableOpacity
                        onPress={() => setDetailRx(null)}
                        style={{ padding: 4 }}
                      >
                        <X size={22} color="#64748b" />
                      </TouchableOpacity>
                    </View>

                    <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 8 }}>
                      <View
                        style={[
                          styles.statusBadge,
                          !isClinicRx && { backgroundColor: "#e0f2fe" },
                        ]}
                      >
                        <Text
                          style={[
                            styles.statusBadgeText,
                            !isClinicRx && { color: "#0369a1" },
                          ]}
                        >
                          {isClinicRx ? "CSU CLINIC RX" : "SELF-SCANNED / OTC"}
                        </Text>
                      </View>
                      <View style={[styles.statusBadge, { backgroundColor: "#f1f5f9" }]}>
                        <Text style={[styles.statusBadgeText, { color: "#475569" }]}>
                          {detailRx.status}
                        </Text>
                      </View>
                    </View>

                    {medPurpose && (
                      <View
                        style={{
                          marginTop: 12,
                          backgroundColor: "#f0f9ff",
                          borderWidth: 1,
                          borderColor: "#bae6fd",
                          borderRadius: 12,
                          padding: 11,
                          gap: 4,
                        }}
                      >
                        <View
                          style={{
                            flexDirection: "row",
                            alignItems: "center",
                            justifyContent: "space-between",
                            gap: 6,
                          }}
                        >
                          <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                            <Info size={12} color="#0284c7" />
                            <Text style={{ fontSize: 10, fontWeight: "900", color: "#0369a1" }}>
                              WHAT IT&apos;S FOR
                            </Text>
                          </View>
                          <Text
                            style={{
                              fontSize: 10,
                              fontWeight: "800",
                              color: "#0369a1",
                              backgroundColor: "#ffffff",
                              paddingHorizontal: 7,
                              paddingVertical: 2,
                              borderRadius: 99,
                            }}
                          >
                            {medPurpose.drugClass}
                          </Text>
                        </View>
                        <Text style={{ fontSize: 11.5, fontWeight: "600", color: "#0c4a6e", lineHeight: 17 }}>
                          {medPurpose.usedFor}
                        </Text>
                      </View>
                    )}

                    {isClinicRx && fulfillment.mode && (
                      <View
                        style={{
                          marginTop: 10,
                          backgroundColor: "#fffbeb",
                          borderWidth: 1,
                          borderColor: "#fde68a",
                          borderRadius: 12,
                          padding: 11,
                          gap: 3,
                        }}
                      >
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
                          <Store size={13} color="#d97706" />
                          <Text style={{ fontSize: 10, fontWeight: "900", color: "#92400e" }}>
                            {fulfillment.mode === "PARTIAL"
                              ? "PARTIAL CLINIC SUPPLY • BUY BALANCE OUTSIDE"
                              : "EXTERNAL PHARMACY RX • BUY OUTSIDE"}
                          </Text>
                        </View>
                        <Text style={{ fontSize: 11, fontWeight: "600", color: "#78350f", lineHeight: 16 }}>
                          {fulfillment.note}
                        </Text>
                      </View>
                    )}

                    <View style={styles.divider} />

                    <View style={styles.detailsGrid}>
                      <View style={styles.detailRow}>
                        <Clock size={14} color="#64748b" />
                        <Text style={styles.detailText}>
                          {detailRx.frequency} ({detailRx.schedule_times.join(", ")})
                        </Text>
                      </View>
                      {fulfillment.cleanInstructions ? (
                        <View style={styles.detailRow}>
                          <ShieldCheck size={14} color="#059669" />
                          <Text style={styles.detailText}>{fulfillment.cleanInstructions}</Text>
                        </View>
                      ) : null}
                      <View style={styles.detailRow}>
                        <Calendar size={14} color="#64748b" />
                        <Text style={styles.detailText}>
                          {isClinicRx
                            ? `Prescribed by ${detailRx.doctor_name || "CSU Physician"}`
                            : "Self-Scanned Personal Regimen"}
                          {detailRx.end_date
                            ? ` • Ends ${new Date(detailRx.end_date).toLocaleDateString()}`
                            : ""}
                        </Text>
                      </View>
                    </View>

                    {Boolean(detailRx.image_uri) && (
                      <TouchableOpacity
                        style={styles.savedPhotoRow}
                        onPress={() => {
                          const uri = detailRx.image_uri!;
                          setDetailRx(null);
                          setPreviewPhotoUri(uri);
                        }}
                      >
                        <Image source={{ uri: detailRx.image_uri! }} style={styles.savedThumb} />
                        <View style={{ flex: 1 }}>
                          <Text style={styles.savedPhotoTitle}>Saved Scanned Label</Text>
                          <Text style={styles.savedPhotoSub}>Tap to view original photo</Text>
                        </View>
                        <ImageIcon size={16} color="#047857" />
                      </TouchableOpacity>
                    )}

                    {!isClinicRx && detailRx.status === "ACTIVE" && (
                      <TouchableOpacity
                        style={styles.detailDeleteBtn}
                        onPress={() => {
                          const target = detailRx;
                          setDetailRx(null);
                          void handleDeletePrescription(target);
                        }}
                      >
                        <Trash2 size={15} color="#dc2626" />
                        <Text style={styles.detailDeleteBtnText}>Remove Self-Scanned Medication</Text>
                      </TouchableOpacity>
                    )}
                  </ScrollView>
                );
              })()}
          </View>
        </View>
      </Modal>

      {/* Floating Action Button: OCR Scanner */}
      <TouchableOpacity
        style={styles.fab}
        onPress={() => router.push("/modal/ocr-scanner")}
        activeOpacity={0.85}
      >
        <Scan size={20} color="#ffffff" />
        <Text style={styles.fabText}>Scan Rx / Bottle</Text>
      </TouchableOpacity>

      {/* Fullscreen Saved Photo Viewer Modal */}
      <Modal visible={Boolean(previewPhotoUri)} animationType="fade" transparent>
        <View style={styles.photoModalBackdrop}>
          <TouchableOpacity
            style={styles.photoModalClose}
            onPress={() => setPreviewPhotoUri(null)}
          >
            <X size={24} color="#ffffff" />
          </TouchableOpacity>
          {previewPhotoUri && (
            <Image
              source={{ uri: previewPhotoUri }}
              style={styles.photoModalImage}
              resizeMode="contain"
            />
          )}
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f8fafc" },
  content: { padding: 20, paddingTop: 54, paddingBottom: 168 },
  header: { marginBottom: 16 },
  title: { fontSize: 22, fontWeight: "900", color: "#0f172a" },
  subtitle: { fontSize: 12, fontWeight: "600", color: "#64748b", marginTop: 2 },
  filterRow: {
    flexDirection: "row",
    backgroundColor: "#e2e8f0",
    borderRadius: 12,
    padding: 3,
    marginBottom: 16,
  },
  filterTab: { flex: 1, paddingVertical: 7, alignItems: "center", borderRadius: 10 },
  filterTabActive: {
    backgroundColor: "#ffffff",
    shadowColor: "#0f172a",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  filterTabText: { fontSize: 11, fontWeight: "700", color: "#64748b" },
  filterTabTextActive: { color: "#0f172a" },
  alarmStatusCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: "#ecfdf5",
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: "#a7f3d0",
  },
  statusIconCircle: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: "#ffffff",
    alignItems: "center",
    justifyContent: "center",
  },
  alarmStatusTitle: { fontSize: 13, fontWeight: "800", color: "#065f46" },
  alarmStatusDesc: { fontSize: 11, color: "#047857", marginTop: 1 },
  testAlarmCard: {
    backgroundColor: "#ffffff",
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    gap: 12,
  },
  testCardTitle: { fontSize: 14, fontWeight: "800", color: "#0f172a" },
  testCardDesc: { fontSize: 11, color: "#64748b", lineHeight: 16, marginTop: 2 },
  testBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#059669",
    paddingVertical: 12,
    borderRadius: 14,
  },
  testBtnText: { color: "#ffffff", fontSize: 13, fontWeight: "700" },
  sectionHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
    paddingHorizontal: 4,
  },
  sectionTitle: { fontSize: 11, fontWeight: "800", color: "#94a3b8", letterSpacing: 0.5 },
  rearmLinkText: { fontSize: 11, fontWeight: "700", color: "#059669" },
  alarmItemCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: "#ffffff",
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    marginBottom: 8,
  },
  timeBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#ecfdf5",
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#a7f3d0",
  },
  timeBadgeText: { fontSize: 11, fontWeight: "800", color: "#065f46" },
  alarmMedName: { fontSize: 14, fontWeight: "800", color: "#0f172a" },
  alarmMedDosage: { fontSize: 11, color: "#059669", fontWeight: "600", marginTop: 1 },
  alarmInstructions: { fontSize: 10, color: "#64748b", marginTop: 2 },
  emptyCard: {
    backgroundColor: "#ffffff",
    borderRadius: 20,
    padding: 32,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    marginTop: 20,
  },
  emptyTitle: { fontSize: 16, fontWeight: "800", color: "#0f172a", marginTop: 12 },
  emptyDesc: { fontSize: 12, color: "#64748b", textAlign: "center", marginTop: 4, lineHeight: 18 },
  card: {
    backgroundColor: "#ffffff",
    borderRadius: 20,
    padding: 18,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    marginBottom: 12,
    shadowColor: "#0f172a",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 8,
    elevation: 2,
  },
  cardHeader: { flexDirection: "row", alignItems: "center", gap: 12 },
  pillIconBox: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: "#ecfdf5",
    alignItems: "center",
    justifyContent: "center",
  },
  rxName: { fontSize: 16, fontWeight: "800", color: "#0f172a" },
  rxDosage: { fontSize: 12, color: "#64748b", fontWeight: "600", marginTop: 1 },
  regimenHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    marginBottom: 12,
    paddingHorizontal: 2,
  },
  regimenCountText: { fontSize: 12, fontWeight: "700", color: "#64748b" },
  layoutTogglePill: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#e2e8f0",
    borderRadius: 999,
    padding: 3,
    gap: 2,
  },
  layoutToggleBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
  },
  layoutToggleBtnActive: {
    backgroundColor: "#ffffff",
    shadowColor: "#0f172a",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
    elevation: 2,
  },
  layoutToggleText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#64748b",
  },
  layoutToggleTextActive: {
    color: "#059669",
    fontWeight: "800",
  },
  listContainer: {
    backgroundColor: "#ffffff",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    overflow: "hidden",
    shadowColor: "#0f172a",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 8,
    elevation: 2,
  },
  listRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 13,
    backgroundColor: "#ffffff",
  },
  listRowBorder: {
    borderTopWidth: 1,
    borderTopColor: "#f1f5f9",
  },
  listDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    flexShrink: 0,
  },
  listMedName: {
    fontSize: 14,
    fontWeight: "800",
    color: "#0f172a",
    flexShrink: 1,
  },
  listMedSub: {
    fontSize: 11,
    fontWeight: "600",
    color: "#64748b",
    marginTop: 2,
  },
  listExternalPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: "#fffbeb",
    borderWidth: 1,
    borderColor: "#fde68a",
    paddingHorizontal: 5,
    paddingVertical: 1.5,
    borderRadius: 6,
  },
  listExternalText: {
    fontSize: 9,
    fontWeight: "800",
    color: "#b45309",
  },
  detailModalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.5)",
    justifyContent: "flex-end",
  },
  detailModalSheet: {
    backgroundColor: "#ffffff",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    paddingBottom: 32,
    maxHeight: "82%",
  },
  detailModalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  detailDeleteBtn: {
    marginTop: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    backgroundColor: "#fef2f2",
    borderWidth: 1,
    borderColor: "#fecaca",
    borderRadius: 14,
    paddingVertical: 11,
  },
  detailDeleteBtnText: {
    fontSize: 12,
    fontWeight: "800",
    color: "#dc2626",
  },
  clearAllBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#fef2f2",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#fecaca",
  },
  clearAllBtnText: { fontSize: 11, fontWeight: "700", color: "#dc2626" },
  statusBadge: {
    backgroundColor: "#ecfdf5",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  statusBadgeText: { fontSize: 9, fontWeight: "900", color: "#059669" },
  lockIconBox: {
    padding: 6,
    borderRadius: 8,
    backgroundColor: "#f8fafc",
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  deleteBtn: {
    padding: 6,
    borderRadius: 8,
    backgroundColor: "#fef2f2",
  },
  divider: { height: 1, backgroundColor: "#f1f5f9", marginVertical: 12 },
  detailsGrid: { gap: 8 },
  detailRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  detailText: { fontSize: 12, color: "#475569", fontWeight: "600", flex: 1 },
  savedPhotoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 12,
    backgroundColor: "#f8fafc",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 12,
    padding: 8,
  },
  savedThumb: { width: 40, height: 40, borderRadius: 8, backgroundColor: "#cbd5e1" },
  savedPhotoTitle: { fontSize: 12, fontWeight: "800", color: "#0f172a" },
  savedPhotoSub: { fontSize: 10, color: "#64748b" },
  fab: {
    position: "absolute",
    right: 20,
    bottom: 94,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#059669",
    paddingHorizontal: 18,
    paddingVertical: 13,
    borderRadius: 28,
    shadowColor: "#059669",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 6,
  },
  fabText: { color: "#ffffff", fontSize: 13, fontWeight: "800" },
  photoModalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.92)",
    justifyContent: "center",
    alignItems: "center",
  },
  photoModalClose: {
    position: "absolute",
    top: 48,
    right: 20,
    zIndex: 10,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(255,255,255,0.2)",
    alignItems: "center",
    justifyContent: "center",
  },
  photoModalImage: { width: "92%", height: "75%" },
});
