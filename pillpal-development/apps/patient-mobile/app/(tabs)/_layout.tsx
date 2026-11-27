import React, { useEffect, useState } from "react";
import { Tabs } from "expo-router";
import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import * as Haptics from "expo-haptics";
import {
  Clock,
  Pill,
  CalendarDays,
  MessageSquare,
  User,
  WifiOff,
  CheckCircle2,
  type LucideIcon,
} from "lucide-react-native";
import { View, Text, TouchableOpacity, StyleSheet, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  subscribeToSyncStatus,
  subscribeToUnreadMessages,
  publishUnreadMessages,
} from "@/services/sync/sync-worker";
import { fetchWithAuth } from "@/services/api/client";
import { getAuthToken } from "@/services/auth/session";

const TAB_META: Record<
  string,
  {
    label: string;
    Icon: LucideIcon;
  }
> = {
  index: { label: "Today", Icon: Clock },
  medications: { label: "Medications", Icon: Pill },
  appointments: { label: "Appointments", Icon: CalendarDays },
  messages: { label: "Messages", Icon: MessageSquare },
  profile: { label: "Profile", Icon: User },
};

function FloatingPillTabBar({
  state,
  descriptors,
  navigation,
  unreadCount,
}: BottomTabBarProps & { unreadCount: number }) {
  const insets = useSafeAreaInsets();
  const bottomOffset = Math.max(insets.bottom, 12);

  return (
    <View
      pointerEvents="box-none"
      style={[styles.floatingWrapper, { bottom: bottomOffset }]}
    >
      <View style={styles.floatingPill}>
        {state.routes.map((route, index) => {
          const isFocused = state.index === index;
          const meta = TAB_META[route.name] || {
            label: descriptors[route.key]?.options?.title || route.name,
            Icon: Clock,
          };
          const { Icon, label } = meta;
          const showBadge = route.name === "messages" && unreadCount > 0;

          const onPress = () => {
            if (Platform.OS !== "web") {
              void Haptics.selectionAsync().catch(() => {});
            }
            const event = navigation.emit({
              type: "tabPress",
              target: route.key,
              canPreventDefault: true,
            });
            if (!isFocused && !event.defaultPrevented) {
              navigation.navigate(route.name, route.params);
            }
          };

          const onLongPress = () => {
            navigation.emit({
              type: "tabLongPress",
              target: route.key,
            });
          };

          return (
            <TouchableOpacity
              key={route.key}
              accessibilityRole="button"
              accessibilityState={isFocused ? { selected: true } : {}}
              accessibilityLabel={descriptors[route.key]?.options?.title || label}
              onPress={onPress}
              onLongPress={onLongPress}
              activeOpacity={0.85}
              style={[styles.pillItem, isFocused && styles.pillItemActive]}
            >
              <View style={styles.iconWrap}>
                <Icon
                  color={isFocused ? "#ffffff" : "#64748b"}
                  size={19}
                  strokeWidth={isFocused ? 2.4 : 2}
                />
                {showBadge && (
                  <View
                    style={[
                      styles.badgeDot,
                      isFocused && styles.badgeDotOnActive,
                    ]}
                  >
                    <Text
                      style={[
                        styles.badgeText,
                        isFocused && styles.badgeTextOnActive,
                      ]}
                    >
                      {unreadCount > 99 ? "99+" : unreadCount}
                    </Text>
                  </View>
                )}
              </View>
              <Text
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.82}
                style={[styles.pillLabel, isFocused && styles.pillLabelActive]}
              >
                {label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

export default function TabLayout() {
  const [isOnline, setIsOnline] = useState(true);
  const [pendingSyncCount, setPendingSyncCount] = useState(0);
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    const unsubSync = subscribeToSyncStatus((online, pendingCount) => {
      setIsOnline(online);
      setPendingSyncCount(pendingCount);
    });
    const unsubUnread = subscribeToUnreadMessages((count) => {
      setUnreadCount(count);
    });

    async function refreshUnread() {
      try {
        const token = await getAuthToken();
        if (!token) return;
        const res = await fetchWithAuth("/messages/conversations");
        if (res.ok) {
          const data: { unreadCount?: number }[] = await res.json();
          const total = data.reduce((sum, c) => sum + (c.unreadCount || 0), 0);
          publishUnreadMessages(total);
        }
      } catch {
        // offline
      }
    }

    void refreshUnread();
    const timer = setInterval(() => {
      void refreshUnread();
    }, 30000);

    return () => {
      unsubSync();
      unsubUnread();
      clearInterval(timer);
    };
  }, []);

  return (
    <>
      {/* Offline Status Ribbon */}
      {!isOnline && (
        <View style={styles.offlineRibbon}>
          <WifiOff size={14} color="#ffffff" />
          <Text style={styles.offlineRibbonText}>
            Offline Mode • {pendingSyncCount} action{pendingSyncCount === 1 ? "" : "s"} saved
            locally
          </Text>
        </View>
      )}

      {isOnline && pendingSyncCount > 0 && (
        <View style={styles.syncingRibbon}>
          <CheckCircle2 size={14} color="#ffffff" />
          <Text style={styles.offlineRibbonText}>
            Syncing {pendingSyncCount} offline action{pendingSyncCount === 1 ? "" : "s"} to CSU
            Clinic...
          </Text>
        </View>
      )}

      <Tabs
        tabBar={(props) => <FloatingPillTabBar {...props} unreadCount={unreadCount} />}
        screenOptions={{
          headerShown: false,
        }}
      >
        <Tabs.Screen name="index" options={{ title: "Today" }} />
        <Tabs.Screen name="medications" options={{ title: "Medications" }} />
        <Tabs.Screen name="appointments" options={{ title: "Appointments" }} />
        <Tabs.Screen name="messages" options={{ title: "Messages" }} />
        <Tabs.Screen name="profile" options={{ title: "Profile" }} />
      </Tabs>
    </>
  );
}

const styles = StyleSheet.create({
  floatingWrapper: {
    position: "absolute",
    left: 10,
    right: 10,
    alignItems: "center",
    zIndex: 40,
  },
  floatingPill: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    width: "100%",
    maxWidth: 460,
    backgroundColor: "rgba(255, 255, 255, 0.96)",
    borderRadius: 999,
    paddingHorizontal: 5,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    shadowColor: "#0f172a",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 20,
    elevation: 12,
    gap: 2,
  },
  pillItem: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 8,
    paddingHorizontal: 2,
    borderRadius: 999,
    gap: 2,
  },
  pillItemActive: {
    backgroundColor: "#059669",
    shadowColor: "#059669",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.28,
    shadowRadius: 8,
    elevation: 4,
  },
  iconWrap: {
    position: "relative",
    alignItems: "center",
    justifyContent: "center",
  },
  pillLabel: {
    fontSize: 9.5,
    fontWeight: "700",
    color: "#64748b",
    lineHeight: 12,
  },
  pillLabelActive: {
    color: "#ffffff",
    fontWeight: "800",
  },
  badgeDot: {
    position: "absolute",
    top: -5,
    right: -11,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: "#059669",
    paddingHorizontal: 4,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    borderColor: "#ffffff",
  },
  badgeDotOnActive: {
    backgroundColor: "#ffffff",
    borderColor: "#059669",
  },
  badgeText: {
    color: "#ffffff",
    fontSize: 9,
    fontWeight: "900",
  },
  badgeTextOnActive: {
    color: "#059669",
  },
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
