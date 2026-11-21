import React, { useEffect, useState } from "react";
import { Tabs } from "expo-router";
import { Clock, Pill, CalendarDays, MessageSquare, User, WifiOff, CheckCircle2 } from "lucide-react-native";
import { View, Text, StyleSheet } from "react-native";
import { subscribeToSyncStatus } from "@/services/sync/sync-worker";

export default function TabLayout() {
  const [isOnline, setIsOnline] = useState(true);
  const [pendingSyncCount, setPendingSyncCount] = useState(0);

  useEffect(() => {
    return subscribeToSyncStatus((online, pendingCount) => {
      setIsOnline(online);
      setPendingSyncCount(pendingCount);
    });
  }, []);

  return (
    <>
      {/* Offline Status Ribbon */}
      {!isOnline && (
        <View style={styles.offlineRibbon}>
          <WifiOff size={14} color="#ffffff" />
          <Text style={styles.offlineRibbonText}>
            Offline Mode • {pendingSyncCount} action{pendingSyncCount === 1 ? "" : "s"} saved locally
          </Text>
        </View>
      )}

      {isOnline && pendingSyncCount > 0 && (
        <View style={styles.syncingRibbon}>
          <CheckCircle2 size={14} color="#ffffff" />
          <Text style={styles.offlineRibbonText}>
            Syncing {pendingSyncCount} offline dose{pendingSyncCount === 1 ? "" : "s"} to CSU Clinic...
          </Text>
        </View>
      )}

      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: "#10b981",
          tabBarInactiveTintColor: "#94a3b8",
          tabBarStyle: {
            backgroundColor: "#ffffff",
            borderTopColor: "#e2e8f0",
            borderTopWidth: 1,
            height: 62,
            paddingBottom: 8,
            paddingTop: 6,
          },
          tabBarLabelStyle: {
            fontSize: 11,
            fontWeight: "700",
          },
        }}
      >
        <Tabs.Screen
          name="index"
          options={{
            title: "Today",
            tabBarIcon: ({ color, size }) => <Clock color={color} size={size} />,
          }}
        />
        <Tabs.Screen
          name="medications"
          options={{
            title: "Medications",
            tabBarIcon: ({ color, size }) => <Pill color={color} size={size} />,
          }}
        />
        <Tabs.Screen
          name="appointments"
          options={{
            title: "Appointments",
            tabBarIcon: ({ color, size }) => <CalendarDays color={color} size={size} />,
          }}
        />
        <Tabs.Screen
          name="messages"
          options={{
            title: "Messages",
            tabBarIcon: ({ color, size }) => <MessageSquare color={color} size={size} />,
          }}
        />
        <Tabs.Screen
          name="profile"
          options={{
            title: "Health Pass",
            tabBarIcon: ({ color, size }) => <User color={color} size={size} />,
          }}
        />
      </Tabs>
    </>
  );
}

const styles = StyleSheet.create({
  offlineRibbon: {
    backgroundColor: "#d97706",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 5,
    paddingHorizontal: 12,
  },
  syncingRibbon: {
    backgroundColor: "#059669",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 5,
    paddingHorizontal: 12,
  },
  offlineRibbonText: {
    color: "#ffffff",
    fontSize: 11,
    fontWeight: "700",
  },
});

