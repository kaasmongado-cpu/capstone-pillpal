import React, { useEffect, useState } from "react";
import { View, Text, ActivityIndicator, TouchableOpacity, StyleSheet, Image } from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { HeartPulse, ShieldAlert } from "lucide-react-native";
import { exchangeOAuthCode } from "@pillpal/auth";
import { saveAuthToken, saveCachedUser } from "@/services/auth/session";
import { clearLocalDatabase } from "@/services/db/database";

const inFlightCodeExchanges = new Map<string, ReturnType<typeof exchangeOAuthCode>>();

function exchangeCodeOnce(code: string) {
  let promise = inFlightCodeExchanges.get(code);
  if (!promise) {
    promise = exchangeOAuthCode(code);
    inFlightCodeExchanges.set(code, promise);
  }
  return promise;
}

export default function AuthCallbackScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ code?: string; error?: string }>();
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function finalize() {
      const errParam = typeof params.error === "string" ? params.error : null;
      if (errParam) {
        if (active) setErrorMsg(errParam);
        return;
      }

      const code = typeof params.code === "string" ? params.code.trim() : "";
      if (!code) {
        if (active) {
          setErrorMsg("No Google sign-in code received. Please try again.");
        }
        return;
      }

      const { data, error } = await exchangeCodeOnce(code);
      if (!active) return;

      if (error || !data.session || !data.user) {
        inFlightCodeExchanges.delete(code);
        setErrorMsg(error?.message || "Unable to complete Google sign-in.");
        return;
      }

      await saveAuthToken(data.session.access_token);
      await clearLocalDatabase();

      if (data.needsProfileOnboarding) {
        router.replace("/complete-profile");
        return;
      }

      await saveCachedUser({
        id: data.user.id,
        email: data.user.email,
        firstName: data.user.firstName || "",
        lastName: data.user.lastName || "",
        idNumber: data.user.patientProfile?.idNumber || "",
        department: data.user.patientProfile?.department || "",
        bloodType: data.user.patientProfile?.bloodType || "",
        allergies: data.user.patientProfile?.allergies || "",
        role: data.user.role || "PATIENT",
      });

      router.replace("/(tabs)");
    }

    void finalize();
    return () => {
      active = false;
    };
  }, [params.code, params.error, router]);

  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <View
          style={[
            styles.iconCircle,
            { backgroundColor: "#ffffff", borderWidth: 1, borderColor: "#e2e8f0", padding: 6 },
          ]}
        >
          <Image
            source={require("../assets/pillpal-logo.png")}
            style={{ width: 46, height: 46 }}
            resizeMode="contain"
          />
        </View>

        {errorMsg ? (
          <>
            <View style={styles.errorBox}>
              <ShieldAlert size={18} color="#dc2626" />
              <Text style={styles.errorText}>{errorMsg}</Text>
            </View>
            <TouchableOpacity
              style={styles.retryBtn}
              onPress={() => router.replace("/login")}
            >
              <Text style={styles.retryBtnText}>Back to Sign In</Text>
            </TouchableOpacity>
          </>
        ) : (
          <>
            <ActivityIndicator size="large" color="#10b981" style={{ marginVertical: 12 }} />
            <Text style={styles.title}>Completing Google Sign-In...</Text>
            <Text style={styles.subtitle}>
              Linking your verified Google account to CSU Health Services.
            </Text>
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f8fafc",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  card: {
    width: "100%",
    maxWidth: 380,
    backgroundColor: "#ffffff",
    borderRadius: 24,
    padding: 28,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  iconCircle: {
    width: 60,
    height: 60,
    borderRadius: 18,
    backgroundColor: "#10b981",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 14,
  },
  title: {
    fontSize: 17,
    fontWeight: "900",
    color: "#0f172a",
    textAlign: "center",
  },
  subtitle: {
    fontSize: 12,
    color: "#64748b",
    textAlign: "center",
    marginTop: 6,
  },
  errorBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#fef2f2",
    borderWidth: 1,
    borderColor: "#fecaca",
    borderRadius: 12,
    padding: 12,
    marginVertical: 12,
    width: "100%",
  },
  errorText: {
    flex: 1,
    fontSize: 12,
    fontWeight: "600",
    color: "#b91c1c",
  },
  retryBtn: {
    width: "100%",
    backgroundColor: "#10b981",
    paddingVertical: 13,
    borderRadius: 14,
    alignItems: "center",
  },
  retryBtnText: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "800",
  },
});
