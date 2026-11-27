import React, { useEffect, useState } from "react";
import { Redirect } from "expo-router";
import { View, ActivityIndicator, StyleSheet, Text } from "react-native";
import { getCachedUser } from "@/services/auth/session";

export default function RootIndex() {
  const [loading, setLoading] = useState(true);
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  useEffect(() => {
    let active = true;

    async function checkAuth() {
      try {
        const user = await getCachedUser();
        if (active) {
          setIsLoggedIn(Boolean(user));
        }
      } catch {
        if (active) {
          setIsLoggedIn(false);
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    void checkAuth();
    return () => {
      active = false;
    };
  }, []);

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#10b981" />
        <Text style={styles.loadingText}>Connecting to CSU Health Portal...</Text>
      </View>
    );
  }

  return isLoggedIn ? <Redirect href="/(tabs)" /> : <Redirect href="/login" />;
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    backgroundColor: "#f8fafc",
    alignItems: "center",
    justifyContent: "center",
  },
  loadingText: {
    marginTop: 14,
    fontSize: 14,
    fontWeight: "600",
    color: "#475569",
  },
});
