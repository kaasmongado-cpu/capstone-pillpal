import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import { LocalPrescription } from "../db/database";

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

/**
 * Request notification permissions on mobile OS
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

  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("pillpal_dosing_reminders", {
      name: "Medication Dosing Reminders",
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: "#10b981",
      sound: "default",
    });
  }

  return finalStatus === "granted";
}

/**
 * Parse a schedule time string like "08:00 AM" into hours and minutes
 */
function parseScheduleTime(timeStr: string): { hour: number; minute: number } {
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
 * Schedule recurring offline daily alarms for a prescription
 */
export async function schedulePrescriptionAlarms(prescription: LocalPrescription): Promise<string[]> {
  if (Platform.OS === "web") return [];

  const scheduledNotificationIds: string[] = [];

  for (const timeStr of prescription.schedule_times) {
    const { hour, minute } = parseScheduleTime(timeStr);

    try {
      const notificationId = await Notifications.scheduleNotificationAsync({
        content: {
          title: `💊 Time for ${prescription.name}`,
          body: `${prescription.dosage} ${prescription.form || ""} - ${prescription.instructions || "Take with water."}`,
          sound: "default",
          priority: Notifications.AndroidNotificationPriority.MAX,
          categoryIdentifier: "DOSE_REMINDER",
          data: {
            prescriptionId: prescription.id,
            name: prescription.name,
            dosage: prescription.dosage,
            scheduledTime: timeStr,
          },
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DAILY,
          hour,
          minute,
          channelId: "pillpal_dosing_reminders",
        },
      });

      scheduledNotificationIds.push(notificationId);
    } catch (err) {
      console.warn(`Failed to schedule alarm for ${prescription.name} at ${timeStr}:`, err);
    }
  }

  return scheduledNotificationIds;
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
