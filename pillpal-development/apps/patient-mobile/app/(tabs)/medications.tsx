import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
  Image,
  Modal,
} from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { Pill, Scan, Calendar, Clock, ShieldCheck, Image as ImageIcon, X } from "lucide-react-native";
import { getLocalPrescriptions, LocalPrescription } from "@/services/db/database";

export default function MedicationsScreen() {
  const router = useRouter();
  const [prescriptions, setPrescriptions] = useState<LocalPrescription[]>([]);
  const [filter, setFilter] = useState<"ACTIVE" | "COMPLETED">("ACTIVE");
  const [refreshing, setRefreshing] = useState(false);
  const [previewPhotoUri, setPreviewPhotoUri] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    const list = await getLocalPrescriptions();
    setPrescriptions(list);
  }, []);

  useFocusEffect(
    useCallback(() => {
      void loadData();
    }, [loadData])
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  }, [loadData]);

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#10b981" />}
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>My Medications</Text>
          <Text style={styles.subtitle}>
            Prescriptions, dosing regimens &amp; locally saved bottle/Rx photos
          </Text>
        </View>

        {/* Filter Tabs */}
        <View style={styles.filterRow}>
          <TouchableOpacity
            style={[styles.filterTab, filter === "ACTIVE" && styles.filterTabActive]}
            onPress={() => setFilter("ACTIVE")}
          >
            <Text style={[styles.filterTabText, filter === "ACTIVE" && styles.filterTabTextActive]}>
              Active Regimens ({prescriptions.length})
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.filterTab, filter === "COMPLETED" && styles.filterTabActive]}
            onPress={() => setFilter("COMPLETED")}
          >
            <Text style={[styles.filterTabText, filter === "COMPLETED" && styles.filterTabTextActive]}>
              Completed (0)
            </Text>
          </TouchableOpacity>
        </View>

        {/* Prescription List */}
        {prescriptions.length === 0 ? (
          <View style={styles.emptyCard}>
            <Pill size={40} color="#94a3b8" />
            <Text style={styles.emptyTitle}>No Medications Listed</Text>
            <Text style={styles.emptyDesc}>
              Tap the camera button below to scan your doctor's prescription slip or pill bottle label.
            </Text>
          </View>
        ) : (
          prescriptions.map((rx) => (
            <View key={rx.id} style={styles.card}>
              <View style={styles.cardHeader}>
                <View style={styles.pillIconBox}>
                  <Pill size={20} color="#059669" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.rxName}>{rx.name}</Text>
                  <Text style={styles.rxDosage}>
                    {rx.dosage} • {rx.form || "Capsule"}
                  </Text>
                </View>
                <View style={styles.statusBadge}>
                  <Text style={styles.statusBadgeText}>ACTIVE</Text>
                </View>
              </View>

              <View style={styles.divider} />

              <View style={styles.detailsGrid}>
                <View style={styles.detailRow}>
                  <Clock size={13} color="#64748b" />
                  <Text style={styles.detailText}>
                    {rx.frequency} ({rx.schedule_times.join(", ")})
                  </Text>
                </View>

                {rx.instructions && (
                  <View style={styles.detailRow}>
                    <ShieldCheck size={13} color="#059669" />
                    <Text style={styles.detailText}>{rx.instructions}</Text>
                  </View>
                )}

                <View style={styles.detailRow}>
                  <Calendar size={13} color="#64748b" />
                  <Text style={styles.detailText}>
                    Prescribed by: {rx.doctor_name || "CSU Health Infirmary"}
                  </Text>
                </View>
              </View>

              {/* Saved Offline Label / Prescription Photo Button */}
              {Boolean(rx.image_uri) && (
                <TouchableOpacity
                  style={styles.savedPhotoRow}
                  onPress={() => setPreviewPhotoUri(rx.image_uri!)}
                >
                  <Image source={{ uri: rx.image_uri! }} style={styles.savedThumb} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.savedPhotoTitle}>Saved Scanned Label</Text>
                    <Text style={styles.savedPhotoSub}>Tap to view original photo offline</Text>
                  </View>
                  <ImageIcon size={16} color="#047857" />
                </TouchableOpacity>
              )}
            </View>
          ))
        )}
      </ScrollView>

      {/* Floating Action Button: OCR Scanner */}
      <TouchableOpacity
        style={styles.fab}
        onPress={() => router.push("/modal/ocr-scanner")}
        activeOpacity={0.85}
      >
        <Scan size={20} color="#ffffff" />
        <Text style={styles.fabText}>Scan Rx / Bottle</Text>
      </TouchableOpacity>

      {/* Fullscreen Saved Photo Viewer Modal */}
      <Modal visible={Boolean(previewPhotoUri)} animationType="fade" transparent>
        <View style={styles.photoModalBackdrop}>
          <TouchableOpacity
            style={styles.photoModalClose}
            onPress={() => setPreviewPhotoUri(null)}
          >
            <X size={24} color="#ffffff" />
          </TouchableOpacity>
          {previewPhotoUri && (
            <Image
              source={{ uri: previewPhotoUri }}
              style={styles.photoModalImage}
              resizeMode="contain"
            />
          )}
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f8fafc",
  },
  content: {
    padding: 20,
    paddingTop: 54,
    paddingBottom: 90,
  },
  header: {
    marginBottom: 16,
  },
  title: {
    fontSize: 22,
    fontWeight: "900",
    color: "#0f172a",
  },
  subtitle: {
    fontSize: 12,
    fontWeight: "600",
    color: "#64748b",
    marginTop: 2,
  },
  filterRow: {
    flexDirection: "row",
    backgroundColor: "#e2e8f0",
    borderRadius: 12,
    padding: 3,
    marginBottom: 16,
  },
  filterTab: {
    flex: 1,
    paddingVertical: 7,
    alignItems: "center",
    borderRadius: 10,
  },
  filterTabActive: {
    backgroundColor: "#ffffff",
    shadowColor: "#0f172a",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  filterTabText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#64748b",
  },
  filterTabTextActive: {
    color: "#0f172a",
  },
  emptyCard: {
    backgroundColor: "#ffffff",
    borderRadius: 20,
    padding: 32,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    marginTop: 20,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: "#0f172a",
    marginTop: 12,
  },
  emptyDesc: {
    fontSize: 12,
    color: "#64748b",
    textAlign: "center",
    marginTop: 4,
    lineHeight: 18,
  },
  card: {
    backgroundColor: "#ffffff",
    borderRadius: 20,
    padding: 18,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    marginBottom: 12,
    shadowColor: "#0f172a",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 8,
    elevation: 2,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  pillIconBox: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: "#ecfdf5",
    alignItems: "center",
    justifyContent: "center",
  },
  rxName: {
    fontSize: 16,
    fontWeight: "800",
    color: "#0f172a",
  },
  rxDosage: {
    fontSize: 12,
    color: "#64748b",
    fontWeight: "600",
    marginTop: 1,
  },
  statusBadge: {
    backgroundColor: "#ecfdf5",
    borderWidth: 1,
    borderColor: "#a7f3d0",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  statusBadgeText: {
    fontSize: 10,
    fontWeight: "800",
    color: "#047857",
  },
  divider: {
    height: 1,
    backgroundColor: "#f1f5f9",
    marginVertical: 12,
  },
  detailsGrid: {
    gap: 6,
  },
  detailRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  detailText: {
    fontSize: 12,
    color: "#475569",
    fontWeight: "600",
  },
  savedPhotoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 12,
    padding: 8,
    borderRadius: 12,
    backgroundColor: "#f0fdf4",
    borderWidth: 1,
    borderColor: "#bbf7d0",
  },
  savedThumb: {
    width: 40,
    height: 40,
    borderRadius: 8,
    backgroundColor: "#cbd5e1",
  },
  savedPhotoTitle: {
    fontSize: 12,
    fontWeight: "800",
    color: "#065f46",
  },
  savedPhotoSub: {
    fontSize: 10,
    fontWeight: "600",
    color: "#047857",
  },
  fab: {
    position: "absolute",
    bottom: 24,
    right: 20,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#10b981",
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderRadius: 30,
    shadowColor: "#10b981",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 6,
  },
  fabText: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "800",
  },
  photoModalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.92)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  photoModalClose: {
    position: "absolute",
    top: 48,
    right: 20,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(255,255,255,0.2)",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 10,
  },
  photoModalImage: {
    width: "100%",
    height: "80%",
    borderRadius: 16,
  },
});
