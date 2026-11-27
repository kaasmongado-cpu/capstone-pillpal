import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  StyleSheet,
  Animated,
  Easing,
  Platform,
} from "react-native";
import {
  BellRing,
  Pill,
  CheckCircle2,
  Clock,
  XCircle,
  Volume2,
} from "lucide-react-native";
import * as Haptics from "expo-haptics";

export interface DoseAlarmPayload {
  prescriptionId: string;
  name: string;
  dosage: string;
  form?: string;
  instructions?: string;
  scheduledTime?: string;
}

interface DoseAlarmModalProps {
  visible: boolean;
  alarm: DoseAlarmPayload | null;
  onConfirmDose: (prescriptionId: string, scheduledTime: string) => Promise<void>;
  onSnooze: (alarm: DoseAlarmPayload) => Promise<void>;
  onSkip?: (prescriptionId: string, scheduledTime: string) => Promise<void>;
  onClose: () => void;
}

export function DoseAlarmModal({
  visible,
  alarm,
  onConfirmDose,
  onSnooze,
  onSkip,
  onClose,
}: DoseAlarmModalProps) {
  const [pulseAnim] = useState(new Animated.Value(1));
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (visible) {
      // Trigger repeated haptic pulses while ringing
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});

      const pulse = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.15,
            duration: 600,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 600,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
        ])
      );
      pulse.start();

      return () => {
        pulse.stop();
      };
    }
  }, [visible, pulseAnim]);

  if (!alarm || !visible) return null;

  async function handleTake() {
    if (!alarm) return;
    setLoading(true);
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    try {
      await onConfirmDose(alarm.prescriptionId, alarm.scheduledTime || "08:00 AM");
    } finally {
      setLoading(false);
      onClose();
    }
  }

  async function handleSnooze() {
    if (!alarm) return;
    setLoading(true);
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    try {
      await onSnooze(alarm);
    } finally {
      setLoading(false);
      onClose();
    }
  }

  async function handleSkip() {
    if (!alarm) return;
    setLoading(true);
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    try {
      if (onSkip) {
        await onSkip(alarm.prescriptionId, alarm.scheduledTime || "08:00 AM");
      }
    } finally {
      setLoading(false);
      onClose();
    }
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          {/* Top Pill / Alarm Icon with pulsating glow */}
          <View style={styles.iconContainer}>
            <Animated.View
              style={[
                styles.iconGlow,
                {
                  transform: [{ scale: pulseAnim }],
                },
              ]}
            />
            <View style={styles.iconCircle}>
              <BellRing size={32} color="#ffffff" />
            </View>
          </View>

          {/* Alarm Badge */}
          <View style={styles.badgeRow}>
            <View style={styles.badge}>
              <Volume2 size={12} color="#059669" />
              <Text style={styles.badgeText}>DOSE ALARM RINGING</Text>
            </View>
          </View>

          {/* Title & Medicine Information */}
          <Text style={styles.title}>Time to Take Your Medicine</Text>
          <View style={styles.medBox}>
            <View style={styles.medBoxHeader}>
              <Pill size={22} color="#059669" />
              <View style={{ flex: 1 }}>
                <Text style={styles.medName}>{alarm.name}</Text>
                <Text style={styles.medDosage}>
                  {alarm.dosage} • {alarm.form || "Tablet/Capsule"}
                </Text>
              </View>
            </View>

            {alarm.instructions ? (
              <View style={styles.instructionsBox}>
                <Text style={styles.instructionsText}>{alarm.instructions}</Text>
              </View>
            ) : null}

            {alarm.scheduledTime ? (
              <View style={styles.timeRow}>
                <Clock size={12} color="#64748b" />
                <Text style={styles.timeText}>Scheduled for {alarm.scheduledTime}</Text>
              </View>
            ) : null}
          </View>

          {/* Action Buttons */}
          <View style={styles.buttonCol}>
            {/* 1-Tap Confirm Taken */}
            <TouchableOpacity
              style={[styles.primaryBtn, loading && { opacity: 0.7 }]}
              onPress={handleTake}
              disabled={loading}
            >
              <CheckCircle2 size={20} color="#ffffff" />
              <Text style={styles.primaryBtnText}>
                {loading ? "Logging Dose..." : "I Took My Dose Now"}
              </Text>
            </TouchableOpacity>

            {/* Snooze Button */}
            <TouchableOpacity
              style={styles.secondaryBtn}
              onPress={handleSnooze}
              disabled={loading}
            >
              <Clock size={16} color="#0f172a" />
              <Text style={styles.secondaryBtnText}>Snooze 10 Minutes</Text>
            </TouchableOpacity>

            {/* Skip Option */}
            <TouchableOpacity
              style={styles.ghostBtn}
              onPress={handleSkip}
              disabled={loading}
            >
              <XCircle size={15} color="#94a3b8" />
              <Text style={styles.ghostBtnText}>Skip this dose</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.75)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  card: {
    width: "100%",
    maxWidth: 380,
    backgroundColor: "#ffffff",
    borderRadius: 28,
    padding: 24,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.25,
    shadowRadius: 24,
    elevation: 16,
  },
  iconContainer: {
    width: 80,
    height: 80,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  iconGlow: {
    position: "absolute",
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: "rgba(16, 185, 129, 0.25)",
  },
  iconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: "#10b981",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 3,
    borderColor: "#ffffff",
  },
  badgeRow: {
    marginBottom: 8,
  },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "#ecfdf5",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#a7f3d0",
  },
  badgeText: {
    fontSize: 10,
    fontWeight: "900",
    color: "#065f46",
    letterSpacing: 0.5,
  },
  title: {
    fontSize: 19,
    fontWeight: "900",
    color: "#0f172a",
    textAlign: "center",
    marginBottom: 14,
  },
  medBox: {
    width: "100%",
    backgroundColor: "#f8fafc",
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    marginBottom: 20,
  },
  medBoxHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  medName: {
    fontSize: 16,
    fontWeight: "800",
    color: "#0f172a",
  },
  medDosage: {
    fontSize: 13,
    color: "#059669",
    fontWeight: "600",
    marginTop: 2,
  },
  instructionsBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#f0fdf4",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    marginTop: 10,
  },
  instructionsText: {
    fontSize: 11,
    fontWeight: "600",
    color: "#065f46",
    flex: 1,
  },
  timeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginTop: 8,
  },
  timeText: {
    fontSize: 11,
    color: "#64748b",
  },
  buttonCol: {
    width: "100%",
    gap: 10,
  },
  primaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#10b981",
    paddingVertical: 14,
    borderRadius: 18,
    shadowColor: "#10b981",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  primaryBtnText: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "800",
  },
  secondaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#f1f5f9",
    paddingVertical: 12,
    borderRadius: 16,
  },
  secondaryBtnText: {
    color: "#0f172a",
    fontSize: 13,
    fontWeight: "700",
  },
  ghostBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 8,
  },
  ghostBtnText: {
    color: "#94a3b8",
    fontSize: 12,
    fontWeight: "600",
  },
});
