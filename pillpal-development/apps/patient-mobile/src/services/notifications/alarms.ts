import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import { getCachedJson, LocalPrescription } from "../db/database";

export const ALARM_TOGGLES_CACHE_KEY = "alarm_toggles";

// Lightweight event bus so 5-second Test Alarm also opens DoseAlarmModal on Expo Web
type WebAlarmListener = (payload: {
  prescriptionId: string;
  name: string;
  dosage: string;
  form?: string;
  instructions?: string;
  scheduledTime?: string;
}) => void;
const webAlarmListeners = new Set<WebAlarmListener>();

export function subscribeToWebAlarmTrigger(listener: WebAlarmListener): () => void {
  webAlarmListeners.add(listener);
  return () => {
    webAlarmListeners.delete(listener);
  };
}

// Configure local notification display behavior (native only)
if (Platform.OS !== "web") {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
    }),
  });
}

export interface ActiveAlarmInfo {
  notificationId: string;
  prescriptionId: string;
  name: string;
  dosage: string;
  form?: string;
  instructions?: string;
  scheduledTime: string;
  hour: number;
  minute: number;
  enabled: boolean;
}

export interface AlarmSystemDiagnostics {
  permissionGranted: boolean;
  permissionStatus: string;
  scheduledCount: number;
  scheduledSlotKeys: string[];
  nextTriggerLabel: string | null;
}

/**
 * Request notification permissions on mobile OS and configure notification categories
 */
export async function requestNotificationPermissions(): Promise<boolean> {
  if (Platform.OS === "web") return false;

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== "granted") {
    const { status } = await Notifications.requestPermissionsAsync({
      ios: {
        allowAlert: true,
        allowBadge: true,
        allowSound: true,
      },
    });
    finalStatus = status;
  }

  // Configure high-priority Android channel with sound and vibration
  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("pillpal_dosing_reminders", {
      name: "Medication Dosing Reminders",
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 400, 200, 400],
      lightColor: "#10b981",
      sound: "default",
      enableVibrate: true,
      showBadge: true,
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
      bypassDnd: true,
    });
  }

  // Register interactive lock-screen actions
  try {
    await Notifications.setNotificationCategoryAsync("MEDICATION_DOSE", [
      {
        identifier: "TAKE_NOW",
        buttonTitle: "✅ Take Dose Now",
        options: {
          opensAppToForeground: false,
        },
      },
      {
        identifier: "SNOOZE_10M",
        buttonTitle: "⏰ Snooze 10m",
        options: {
          opensAppToForeground: false,
        },
      },
    ]);
  } catch (err) {
    console.warn("Could not set notification category:", err);
  }

  return finalStatus === "granted";
}

/**
 * Parse a schedule time string like "08:00 AM" into hours and minutes
 */
export function parseScheduleTime(timeStr: string): { hour: number; minute: number } {
  const match = timeStr.trim().match(/(\d{1,2}):(\d{2})\s*(AM|PM)?/i);
  if (!match) return { hour: 8, minute: 0 };

  let hour = parseInt(match[1], 10);
  const minute = parseInt(match[2], 10);
  const meridiem = match[3]?.toUpperCase();

  if (meridiem === "PM" && hour < 12) hour += 12;
  if (meridiem === "AM" && hour === 12) hour = 0;

  return { hour, minute };
}

/**
 * Schedule a single recurring daily alarm for one specific time slot of a prescription
 * Deduplicates by cancelling any existing recurring alarm for the same (prescriptionId, timeStr).
 */
export async function schedulePrescriptionSlotAlarm(
  prescription: LocalPrescription,
  timeStr: string,
): Promise<string | null> {
  if (Platform.OS === "web") return null;

  const granted = await requestNotificationPermissions();
  if (!granted) return null;

  // Deduplicate existing alarm for this exact prescription slot first
  await cancelPrescriptionSlotAlarm(prescription.id, timeStr);

  const { hour, minute } = parseScheduleTime(timeStr);

  try {
    return await Notifications.scheduleNotificationAsync({
      content: {
        title: `💊 Time for ${prescription.name}`,
        body: `${prescription.dosage} ${prescription.form || ""} - ${prescription.instructions || "Take with water."}`,
        sound: "default",
        priority: Notifications.AndroidNotificationPriority.MAX,
        categoryIdentifier: "MEDICATION_DOSE",
        data: {
          prescriptionId: prescription.id,
          name: prescription.name,
          dosage: prescription.dosage,
          form: prescription.form || "Tablet",
          instructions: prescription.instructions || "Take as directed with water.",
          scheduledTime: timeStr,
          isRecurring: true,
          type: "DOSE_ALARM",
        },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DAILY,
        hour,
        minute,
        channelId: "pillpal_dosing_reminders",
      },
    });
  } catch (err) {
    console.warn(`Failed to schedule slot alarm for ${prescription.name} at ${timeStr}:`, err);
    return null;
  }
}

/**
 * Cancel a single scheduled alarm slot for a prescription without disturbing its other slots
 */
export async function cancelPrescriptionSlotAlarm(
  prescriptionId: string,
  timeStr: string,
): Promise<void> {
  if (Platform.OS === "web") return;

  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  for (const n of scheduled) {
    if (
      n.content.data?.prescriptionId === prescriptionId &&
      n.content.data?.scheduledTime === timeStr &&
      !n.content.data?.isSnooze
    ) {
      await Notifications.cancelScheduledNotificationAsync(n.identifier);
    }
  }
}

/**
 * Schedule recurring offline daily alarms for a prescription
 */
export async function schedulePrescriptionAlarms(prescription: LocalPrescription): Promise<string[]> {
  if (Platform.OS === "web") return [];

  const granted = await requestNotificationPermissions();
  if (!granted) return [];

  const scheduledNotificationIds: string[] = [];

  for (const timeStr of prescription.schedule_times) {
    const id = await schedulePrescriptionSlotAlarm(prescription, timeStr);
    if (id) scheduledNotificationIds.push(id);
  }

  return scheduledNotificationIds;
}

/**
 * Reconcile OS-scheduled alarms against all local prescriptions (both Doctor-issued and Self-Scanned).
 * - Automatically arms missing alarms for ACTIVE prescriptions whose toggle is enabled
 * - Automatically cancels stale alarms for PAUSED / COMPLETED / DISCONTINUED / removed prescriptions
 * - Removes duplicate OS alarms for the same slot
 */
export async function syncPrescriptionAlarms(
  allPrescriptions: LocalPrescription[],
  options: { savedToggles?: Record<string, boolean>; requestPermission?: boolean } = {},
): Promise<{ granted: boolean; scheduled: number; cancelled: number }> {
  if (Platform.OS === "web") {
    return { granted: false, scheduled: 0, cancelled: 0 };
  }

  const perm = await Notifications.getPermissionsAsync();
  let granted = perm.status === "granted";
  if (!granted && options.requestPermission) {
    granted = await requestNotificationPermissions();
  }
  if (!granted) {
    return { granted: false, scheduled: 0, cancelled: 0 };
  }

  // Ensure Android channel & interactive categories exist
  await requestNotificationPermissions();

  const toggles =
    options.savedToggles ??
    (await getCachedJson<Record<string, boolean>>(ALARM_TOGGLES_CACHE_KEY)) ??
    {};

  // Build desired recurring slot map
  const desiredSlots = new Map<string, { rx: LocalPrescription; time: string }>();
  for (const rx of allPrescriptions) {
    if (rx.status !== "ACTIVE") continue;
    for (const time of rx.schedule_times) {
      const key = `${rx.id}_${time}`;
      if (toggles[key] !== false) {
        desiredSlots.set(key, { rx, time });
      }
    }
  }

  const existing = await Notifications.getAllScheduledNotificationsAsync();
  const armedKeys = new Set<string>();
  let cancelled = 0;

  for (const n of existing) {
    const data = n.content.data as Record<string, any> | undefined;
    if (!data || data.type !== "DOSE_ALARM") continue;
    // Never disturb one-off snoozes or 5-sec test demos
    if (data.isSnooze || data.prescriptionId === "rx_demo_test") continue;

    const key = `${data.prescriptionId}_${data.scheduledTime}`;
    if (!desiredSlots.has(key) || armedKeys.has(key)) {
      await Notifications.cancelScheduledNotificationAsync(n.identifier);
      cancelled++;
    } else {
      armedKeys.add(key);
    }
  }

  let scheduled = 0;
  for (const [key, { rx, time }] of desiredSlots.entries()) {
    if (!armedKeys.has(key)) {
      const id = await schedulePrescriptionSlotAlarm(rx, time);
      if (id) scheduled++;
    }
  }

  return { granted: true, scheduled, cancelled };
}

/**
 * Trigger an immediate test alarm after N seconds (Default: 5 seconds)
 * Designed for capstone defense presentations & user audio/vibration verification.
 */
export async function triggerTestAlarm(seconds: number = 5): Promise<string> {
  const delaySec = Math.max(1, seconds);
  const demoPayload = {
    prescriptionId: "rx_demo_test",
    name: "Amoxicillin",
    dosage: "500 mg",
    form: "Capsule",
    instructions: "Take with food. Complete full 7-day course.",
    scheduledTime: "08:00 AM",
  };

  if (Platform.OS === "web") {
    setTimeout(() => {
      for (const listener of webAlarmListeners) {
        listener(demoPayload);
      }
    }, delaySec * 1000);
    return "test_alarm_web";
  }

  const granted = await requestNotificationPermissions();
  if (!granted) {
    throw new Error(
      "Notification permission is denied. Please enable notifications for PILLPAL in your phone Settings.",
    );
  }

  const id = await Notifications.scheduleNotificationAsync({
    content: {
      title: "💊 Time for Amoxicillin (Alarm Demo)",
      body: "500 mg Capsule - Take after meals. (Tap to confirm or snooze)",
      sound: "default",
      priority: Notifications.AndroidNotificationPriority.MAX,
      categoryIdentifier: "MEDICATION_DOSE",
      data: {
        ...demoPayload,
        type: "DOSE_ALARM",
      },
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
      seconds: delaySec,
      channelId: "pillpal_dosing_reminders",
    },
  });

  return id;
}

/**
 * Snooze a medication alarm for a specified number of minutes (Default: 10 minutes)
 */
export async function snoozePrescriptionAlarm(
  prescriptionName: string,
  dosage: string,
  minutes: number = 10,
  extraData: Record<string, any> = {}
): Promise<string> {
  if (Platform.OS === "web") return "web_snooze";

  const granted = await requestNotificationPermissions();
  if (!granted) return "";

  const id = await Notifications.scheduleNotificationAsync({
    content: {
      title: `⏰ Snoozed Dose: ${prescriptionName}`,
      body: `${dosage} - ${minutes}-minute snooze completed. Tap to confirm dose now.`,
      sound: "default",
      priority: Notifications.AndroidNotificationPriority.MAX,
      categoryIdentifier: "MEDICATION_DOSE",
      data: {
        ...extraData,
        name: prescriptionName,
        dosage,
        isSnooze: true,
        type: "DOSE_ALARM",
      },
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
      seconds: minutes * 60,
      channelId: "pillpal_dosing_reminders",
    },
  });

  return id;
}

/**
 * Cancel all scheduled alarms for a discontinued or completed prescription
 */
export async function cancelPrescriptionAlarms(prescriptionId: string): Promise<void> {
  if (Platform.OS === "web") return;

  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  for (const n of scheduled) {
    if (n.content.data?.prescriptionId === prescriptionId) {
      await Notifications.cancelScheduledNotificationAsync(n.identifier);
    }
  }
}

/**
 * Retrieve all currently active scheduled notifications from Android NotificationManager
 */
export async function getScheduledAlarmsList(): Promise<ActiveAlarmInfo[]> {
  if (Platform.OS === "web") return [];

  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  const alarms: ActiveAlarmInfo[] = [];

  for (const n of scheduled) {
    const data = n.content.data;
    if (data?.type === "DOSE_ALARM") {
      const trigger = n.trigger as any;
      alarms.push({
        notificationId: n.identifier,
        prescriptionId: data.prescriptionId || "rx_unknown",
        name: data.name || n.content.title?.replace("💊 Time for ", "") || "Medication",
        dosage: data.dosage || "500 mg",
        form: data.form || "Tablet",
        instructions: data.instructions || n.content.body,
        scheduledTime: data.scheduledTime || `${trigger.hour || 8}:00`,
        hour: trigger.hour ?? 8,
        minute: trigger.minute ?? 0,
        enabled: true,
      });
    }
  }

  return alarms;
}

/**
 * Inspect real OS notification permission + actual scheduled daily alarms registered in Android/iOS.
 */
export async function getAlarmSystemDiagnostics(): Promise<AlarmSystemDiagnostics> {
  if (Platform.OS === "web") {
    return {
      permissionGranted: false,
      permissionStatus: "web-preview",
      scheduledCount: 0,
      scheduledSlotKeys: [],
      nextTriggerLabel: null,
    };
  }

  const perm = await Notifications.getPermissionsAsync();
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  const slotKeys = new Set<string>();
  const now = new Date();
  const nowMinutes = now.getHours() * 60 + now.getMinutes();

  let bestDelta = Infinity;
  let nextTriggerLabel: string | null = null;

  for (const n of scheduled) {
    const data = n.content.data as Record<string, any> | undefined;
    if (!data || data.type !== "DOSE_ALARM") continue;
    if (data.isSnooze || data.prescriptionId === "rx_demo_test") continue;

    const scheduledTime = typeof data.scheduledTime === "string" ? data.scheduledTime : "";
    if (data.prescriptionId && scheduledTime) {
      slotKeys.add(`${data.prescriptionId}_${scheduledTime}`);
    }

    const trigger = n.trigger as any;
    const hour = typeof trigger?.hour === "number" ? trigger.hour : parseScheduleTime(scheduledTime).hour;
    const minute = typeof trigger?.minute === "number" ? trigger.minute : parseScheduleTime(scheduledTime).minute;
    const triggerMin = hour * 60 + minute;
    const delta = triggerMin > nowMinutes ? triggerMin - nowMinutes : 24 * 60 - nowMinutes + triggerMin;

    if (delta < bestDelta) {
      bestDelta = delta;
      const dayTag = triggerMin > nowMinutes ? "Today" : "Tomorrow";
      const displayTime =
        scheduledTime ||
        `${String(hour % 12 || 12).padStart(2, "0")}:${String(minute).padStart(2, "0")} ${hour >= 12 ? "PM" : "AM"}`;
      nextTriggerLabel = `${dayTag} at ${displayTime} (${data.name || "Medication"})`;
    }
  }

  return {
    permissionGranted: perm.status === "granted",
    permissionStatus: perm.status,
    scheduledCount: slotKeys.size,
    scheduledSlotKeys: Array.from(slotKeys),
    nextTriggerLabel,
  };
}
