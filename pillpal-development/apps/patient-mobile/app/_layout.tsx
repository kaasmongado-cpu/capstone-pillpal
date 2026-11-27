import { useEffect, useState, useRef } from "react";
import { Stack, useRouter, useSegments } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { ActivityIndicator, View, Text, StyleSheet, Platform, Image } from "react-native";
import * as Notifications from "expo-notifications";
import {
  getAllLocalPrescriptions,
  initDatabase,
  logDoseLocally,
} from "@/services/db/database";
import { flushOutbox, initSyncEngine } from "@/services/sync/sync-worker";
import { getAuthToken, getCachedUser } from "@/services/auth/session";
import {
  requestNotificationPermissions,
  snoozePrescriptionAlarm,
  subscribeToWebAlarmTrigger,
  syncPrescriptionAlarms,
} from "@/services/notifications/alarms";
import { DoseAlarmModal, DoseAlarmPayload } from "@/components/DoseAlarmModal";

export default function RootLayout() {
  const [isReady, setIsReady] = useState(false);
  const [activeAlarm, setActiveAlarm] = useState<DoseAlarmPayload | null>(null);
  const segments = useSegments();
  const router = useRouter();

  const notificationListener = useRef<any>(null);
  const responseListener = useRef<any>(null);

  useEffect(() => {
    async function prepare() {
      try {
        // 1. Initialize offline SQLite database
        await initDatabase();

        // 2. Request local notification permissions for dosing alarms & configure categories
        await requestNotificationPermissions();

        // 2b. Reconcile OS alarms for already-cached local prescriptions (works offline too)
        try {
          const cachedRxs = await getAllLocalPrescriptions();
          await syncPrescriptionAlarms(cachedRxs);
        } catch (alarmErr) {
          console.warn("Initial alarm sync failed:", alarmErr);
        }

        // 3. Start background sync engine
        initSyncEngine(async () => getAuthToken());
      } catch (err) {
        console.error("Initialization error:", err);
      } finally {
        setIsReady(true);
      }
    }

    void prepare();

    // 4. Set up Foreground Notification & Lock-Screen Action Listeners
    const unsubWebAlarm = subscribeToWebAlarmTrigger((payload) => {
      setActiveAlarm(payload);
    });

    if (Platform.OS !== "web") {
      // Foreground notification triggered -> pop up in-app alarm modal
      notificationListener.current = Notifications.addNotificationReceivedListener((notification) => {
        const data = notification.request.content.data;
        if (data && (data.type === "DOSE_ALARM" || data.prescriptionId)) {
          setActiveAlarm({
            prescriptionId: data.prescriptionId,
            name: data.name || notification.request.content.title?.replace("💊 Time for ", "") || "Prescription",
            dosage: data.dosage || "500 mg",
            form: data.form || "Tablet/Capsule",
            instructions: data.instructions || notification.request.content.body,
            scheduledTime: data.scheduledTime || "Now",
          });
        }
      });

      // User interacted with notification (tapped banner or lock-screen action button)
      responseListener.current = Notifications.addNotificationResponseReceivedListener(async (response) => {
        const actionId = response.actionIdentifier;
        const data = response.notification.request.content.data;

        if (!data || !data.prescriptionId) return;

        if (actionId === "TAKE_NOW") {
          // Direct lock-screen 1-tap confirmation without opening app (skip fake demo rx)
          if (data.prescriptionId !== "rx_demo_test") {
            const newLog = {
              id: `log_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
              prescription_id: data.prescriptionId,
              scheduled_time: data.scheduledTime || "08:00 AM",
              taken_time: new Date().toISOString(),
              status: "TAKEN" as const,
              notes: "Logged via Lock Screen Notification Action",
              created_at: new Date().toISOString(),
            };
            await logDoseLocally(newLog);
            const token = await getAuthToken();
            if (token) void flushOutbox(token).catch(() => {});
          }
          setActiveAlarm(null);
        } else if (actionId === "SNOOZE_10M") {
          // Direct lock-screen snooze preserving full schedule metadata
          await snoozePrescriptionAlarm(
            data.name || "Medication",
            data.dosage || "Standard Dose",
            10,
            {
              prescriptionId: data.prescriptionId,
              form: data.form || "Tablet/Capsule",
              instructions: data.instructions || response.notification.request.content.body,
              scheduledTime: data.scheduledTime || "08:00 AM",
            },
          );
          setActiveAlarm(null);
        } else {
          // Tapped notification body -> show full-screen alarm modal
          setActiveAlarm({
            prescriptionId: data.prescriptionId,
            name: data.name || response.notification.request.content.title?.replace("💊 Time for ", "") || "Prescription",
            dosage: data.dosage || "500 mg",
            form: data.form || "Tablet/Capsule",
            instructions: data.instructions || response.notification.request.content.body,
            scheduledTime: data.scheduledTime || "Now",
          });
        }
      });
    }

    return () => {
      unsubWebAlarm();
      if (notificationListener.current) {
        Notifications.removeNotificationSubscription(notificationListener.current);
      }
      if (responseListener.current) {
        Notifications.removeNotificationSubscription(responseListener.current);
      }
    };
  }, []);

  // Handle protected route redirection reactively when session changes
  useEffect(() => {
    if (!isReady) return;
    let active = true;

    async function checkRouteAuth() {
      try {
        const cachedUser = await getCachedUser();
        if (!active) return;

        const loggedIn = Boolean(cachedUser);
        const currentSegment = segments[0] as string | undefined;
        const publicSegments = new Set(["login", "auth-callback", "complete-profile"]);

        // Only redirect away from protected screens if explicitly logged out
        if (!loggedIn && currentSegment && !publicSegments.has(currentSegment)) {
          router.replace("/login");
        }
      } catch (err) {
        console.warn("Auth check failed:", err);
      }
    }

    void checkRouteAuth();
    return () => {
      active = false;
    };
  }, [isReady, segments, router]);

  async function handleConfirmDoseFromModal(prescriptionId: string, scheduledTime: string) {
    if (prescriptionId === "rx_demo_test") return;
    const newLog = {
      id: `log_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      prescription_id: prescriptionId,
      scheduled_time: scheduledTime,
      taken_time: new Date().toISOString(),
      status: "TAKEN" as const,
      notes: "Logged via PillPal In-App Alarm Alert",
      created_at: new Date().toISOString(),
    };
    await logDoseLocally(newLog);
    const token = await getAuthToken();
    if (token) void flushOutbox(token).catch(() => {});
  }

  async function handleSnoozeFromModal(alarm: DoseAlarmPayload) {
    await snoozePrescriptionAlarm(alarm.name, alarm.dosage, 10, {
      prescriptionId: alarm.prescriptionId,
      form: alarm.form || "Tablet/Capsule",
      instructions: alarm.instructions,
      scheduledTime: alarm.scheduledTime || "08:00 AM",
    });
  }

  async function handleSkipFromModal(prescriptionId: string, scheduledTime: string) {
    if (prescriptionId === "rx_demo_test") return;
    const newLog = {
      id: `log_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      prescription_id: prescriptionId,
      scheduled_time: scheduledTime,
      taken_time: null,
      status: "SKIPPED" as const,
      notes: "Skipped via PillPal Alarm Modal",
      created_at: new Date().toISOString(),
    };
    await logDoseLocally(newLog);
    const token = await getAuthToken();
    if (token) void flushOutbox(token).catch(() => {});
  }

  return (
    <View style={{ flex: 1 }}>
      <StatusBar style="dark" />
      <Stack
        screenOptions={{
          headerShown: false,
          animation: "slide_from_right",
        }}
      >
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="login" options={{ headerShown: false }} />
        <Stack.Screen name="auth-callback" options={{ headerShown: false }} />
        <Stack.Screen name="complete-profile" options={{ headerShown: false }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen
          name="modal/ocr-scanner"
          options={{
            presentation: "fullScreenModal",
            animation: "fade_from_bottom",
          }}
        />
        <Stack.Screen
          name="modal/ocr-review"
          options={{
            presentation: "modal",
            animation: "slide_from_bottom",
          }}
        />
      </Stack>

      {/* Global In-App Alarm Alert (pops over any screen when scheduled dose triggers) */}
      <DoseAlarmModal
        visible={Boolean(activeAlarm)}
        alarm={activeAlarm}
        onConfirmDose={handleConfirmDoseFromModal}
        onSnooze={handleSnoozeFromModal}
        onSkip={handleSkipFromModal}
        onClose={() => setActiveAlarm(null)}
      />

      {!isReady && (
        <View style={[StyleSheet.absoluteFill, styles.splashContainer]}>
          <View style={styles.splashLogoWrap}>
            <Image
              source={require("../assets/pillpal-logo.png")}
              style={styles.splashLogo}
              resizeMode="contain"
            />
          </View>
          <Text style={styles.splashBrand}>PILLPAL</Text>
          <Text style={styles.splashSub}>CSU University Center for Health and Wellness</Text>
          <ActivityIndicator size="small" color="#059669" style={{ marginTop: 22 }} />
          <Text style={styles.splashText}>Loading your health records...</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  splashContainer: {
    flex: 1,
    backgroundColor: "#f8fafc",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 28,
  },
  splashLogoWrap: {
    width: 82,
    height: 82,
    borderRadius: 24,
    backgroundColor: "#ffffff",
    borderWidth: 1.5,
    borderColor: "#d1fae5",
    padding: 12,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#065f46",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 18,
    elevation: 8,
    marginBottom: 14,
  },
  splashLogo: {
    width: "100%",
    height: "100%",
  },
  splashBrand: {
    fontSize: 22,
    fontWeight: "900",
    color: "#065f46",
    letterSpacing: 1.2,
  },
  splashSub: {
    fontSize: 12,
    fontWeight: "600",
    color: "#64748b",
    marginTop: 4,
    textAlign: "center",
  },
  splashText: {
    marginTop: 10,
    fontSize: 12,
    fontWeight: "600",
    color: "#94a3b8",
  },
});
