import { useEffect, useState } from "react";
import { Stack, useRouter, useSegments } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { ActivityIndicator, View, Text, StyleSheet } from "react-native";
import { initDatabase } from "@/services/db/database";
import { initSyncEngine } from "@/services/sync/sync-worker";
import { getAuthToken, getCachedUser } from "@/services/auth/session";
import { requestNotificationPermissions } from "@/services/notifications/alarms";

export default function RootLayout() {
  const [isReady, setIsReady] = useState(false);
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    async function prepare() {
      try {
        // 1. Initialize offline SQLite database
        await initDatabase();

        // 2. Request local notification permissions for dosing alarms
        await requestNotificationPermissions();

        // 3. Start background sync engine
        initSyncEngine(async () => getAuthToken());
      } catch (err) {
        console.error("Initialization error:", err);
      } finally {
        setIsReady(true);
      }
    }

    void prepare();
  }, []);

  // Handle protected route redirection reactively
  useEffect(() => {
    if (!isReady) return;
    let active = true;

    async function checkRouteAuth() {
      const cachedUser = await getCachedUser();
      if (!active) return;

      const loggedIn = Boolean(cachedUser);
      const inAuthGroup = segments[0] === "login";

      if (!loggedIn && !inAuthGroup) {
        router.replace("/login");
      } else if (loggedIn && inAuthGroup) {
        router.replace("/(tabs)");
      }
    }

    void checkRouteAuth();
    return () => {
      active = false;
    };
  }, [isReady, segments, router]);

  return (
    <View style={{ flex: 1 }}>
      <StatusBar style="dark" />
      <Stack
        screenOptions={{
          headerShown: false,
          animation: "slide_from_right",
        }}
      >
        <Stack.Screen name="login" options={{ headerShown: false }} />
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
      {!isReady && (
        <View style={[StyleSheet.absoluteFill, styles.splashContainer]}>
          <ActivityIndicator size="large" color="#10b981" />
          <Text style={styles.splashText}>Connecting to CSU Health Portal...</Text>
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
  },
  splashText: {
    marginTop: 14,
    fontSize: 14,
    fontWeight: "600",
    color: "#475569",
  },
});

