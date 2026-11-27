import React from "react";
import { View, Text, Image, StyleSheet } from "react-native";

interface BrandHeaderProps {
  title: string;
  subtitle?: string;
  badge?: string;
  rightSlot?: React.ReactNode;
}

export function BrandHeader({ title, subtitle, badge, rightSlot }: BrandHeaderProps) {
  return (
    <View style={styles.row}>
      <View style={styles.left}>
        <View style={styles.logoTile}>
          <Image
            source={require("../../assets/pillpal-logo.png")}
            style={styles.logoImg}
            resizeMode="contain"
          />
        </View>
        <View style={styles.textWrap}>
          <View style={styles.titleRow}>
            <Text style={styles.title} numberOfLines={1}>
              {title}
            </Text>
            {badge ? (
              <View style={styles.badgePill}>
                <Text style={styles.badgeText}>{badge}</Text>
              </View>
            ) : null}
          </View>
          {subtitle ? (
            <Text style={styles.subtitle} numberOfLines={1}>
              {subtitle}
            </Text>
          ) : null}
        </View>
      </View>

      {rightSlot ? <View style={styles.right}>{rightSlot}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    marginBottom: 16,
  },
  left: {
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    flex: 1,
    minWidth: 0,
  },
  logoTile: {
    width: 40,
    height: 40,
    borderRadius: 13,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#d1fae5",
    padding: 4,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#065f46",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 2,
  },
  logoImg: {
    width: "100%",
    height: "100%",
  },
  textWrap: {
    flex: 1,
    minWidth: 0,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  title: {
    fontSize: 20,
    fontWeight: "900",
    color: "#0f172a",
    letterSpacing: -0.3,
    flexShrink: 1,
  },
  badgePill: {
    backgroundColor: "#ecfdf5",
    borderWidth: 1,
    borderColor: "#a7f3d0",
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    borderRadius: 6,
  },
  badgeText: {
    fontSize: 9,
    fontWeight: "900",
    color: "#047857",
    letterSpacing: 0.4,
  },
  subtitle: {
    fontSize: 11.5,
    fontWeight: "600",
    color: "#64748b",
    marginTop: 1,
  },
  right: {
    flexShrink: 0,
  },
});
