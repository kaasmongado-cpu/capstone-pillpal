import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  TextInput,
  RefreshControl,
  Modal,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Image,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect } from "expo-router";
import {
  Send,
  User,
  CheckCheck,
  Clock,
  ArrowLeft,
  Plus,
  Search,
  X,
  Stethoscope,
  MessageSquare,
} from "lucide-react-native";
import * as Haptics from "expo-haptics";
import { fetchWithAuth } from "@/services/api/client";
import { getAuthToken } from "@/services/auth/session";
import {
  getCachedJson,
  saveCachedJson,
  enqueueOutboxAction,
} from "@/services/db/database";
import { publishUnreadMessages } from "@/services/sync/sync-worker";

interface ChatMessage {
  id: string;
  senderId?: string;
  senderName?: string;
  isOwn: boolean;
  content: string;
  createdAt: string;
  pendingSync?: boolean;
}

interface ConversationSummary {
  id: string;
  unreadCount: number;
  otherParticipant: {
    id: string;
    name: string;
    role: string;
    specialization: string;
  } | null;
  lastMessage?: {
    content: string;
    createdAt: string;
  } | null;
}

interface EligibleClinician {
  id: string;
  name: string;
  role: string;
  specialization: string;
  email: string;
}

export default function MessagesScreen() {
  const insets = useSafeAreaInsets();
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [activeConvo, setActiveConvo] = useState<ConversationSummary | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  // New Chat Modal & Clinicians list
  const [isNewChatModalOpen, setIsNewChatModalOpen] = useState(false);
  const [eligibleClinicians, setEligibleClinicians] = useState<EligibleClinician[]>([]);
  const [clinicianSearch, setClinicianSearch] = useState("");
  const [loadingClinicians, setLoadingClinicians] = useState(false);

  const scrollViewRef = useRef<ScrollView>(null);

  const scrollToBottom = () => {
    scrollViewRef.current?.scrollToEnd({ animated: true });
  };

  const loadConversations = useCallback(async () => {
    const cached = await getCachedJson<ConversationSummary[]>("conversations");
    const cleanCached = (cached || []).filter((c) => !c.id.startsWith("convo_demo_"));
    if (cleanCached.length > 0) {
      setConversations(cleanCached);
    } else if (cached && cached.length > 0) {
      await saveCachedJson("conversations", []);
    }

    const token = await getAuthToken();
    if (token) {
      try {
        const res = await fetchWithAuth("/messages/conversations");
        if (res.ok) {
          const data: ConversationSummary[] = await res.json();
          setConversations(data);
          await saveCachedJson("conversations", data);
          const totalUnread = data.reduce((sum, c) => sum + (c.unreadCount || 0), 0);
          publishUnreadMessages(totalUnread);

          setActiveConvo((current) => {
            if (!current) return null;
            return data.find((c) => c.id === current.id) || null;
          });
        }
      } catch {
        // Offline — keep cached real conversations
      }
    }
  }, []);

  const loadMessages = useCallback(async (convoId: string, isSilent = false) => {
    if (!isSilent) {
      const cached = await getCachedJson<ChatMessage[]>(`messages_${convoId}`);
      if (cached) {
        setMessages(cached);
      } else {
        setMessages([]);
      }
    }

    const token = await getAuthToken();
    if (token) {
      try {
        const res = await fetchWithAuth(`/messages/conversations/${convoId}`);
        if (res.ok) {
          const data = await res.json();
          const incoming: ChatMessage[] = data.messages || [];
          setMessages(incoming);
          await saveCachedJson(`messages_${convoId}`, incoming);
          if (!isSilent) {
            setConversations((prev) => {
              const next = prev.map((c) =>
                c.id === convoId ? { ...c, unreadCount: 0 } : c,
              );
              const total = next.reduce((sum, c) => sum + (c.unreadCount || 0), 0);
              publishUnreadMessages(total);
              return next;
            });
          }
        }
      } catch {
        // Offline — keep cached messages
      }
    }
  }, []);

  const loadEligibleClinicians = useCallback(async () => {
    setLoadingClinicians(true);
    try {
      const res = await fetchWithAuth("/messages/eligible-contacts");
      if (res.ok) {
        const data: EligibleClinician[] = await res.json();
        setEligibleClinicians(data);
      } else {
        setEligibleClinicians([]);
      }
    } catch {
      setEligibleClinicians([]);
    } finally {
      setLoadingClinicians(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void loadConversations();
    }, [loadConversations]),
  );

  useEffect(() => {
    if (activeConvo) {
      void loadMessages(activeConvo.id, false);
    }
  }, [activeConvo?.id, loadMessages]);

  // Poll active conversation every 4 seconds
  useEffect(() => {
    if (activeConvo) {
      const interval = setInterval(() => {
        void loadMessages(activeConvo.id, true);
      }, 4000);
      return () => clearInterval(interval);
    }
  }, [activeConvo?.id, loadMessages]);

  useEffect(() => {
    scrollToBottom();
  }, [messages.length]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadConversations();
    if (activeConvo) {
      await loadMessages(activeConvo.id, false);
    }
    setRefreshing(false);
  }, [activeConvo, loadConversations, loadMessages]);

  async function handleStartNewChat(clinicianId: string) {
    try {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
      const res = await fetchWithAuth("/messages/conversations", {
        method: "POST",
        body: JSON.stringify({ recipientUserId: clinicianId }),
      });

      if (res.ok) {
        const { conversationId } = await res.json();
        setIsNewChatModalOpen(false);
        await loadConversations();

        const selectedClinician = eligibleClinicians.find((c) => c.id === clinicianId);
        const newConvo: ConversationSummary = {
          id: conversationId,
          unreadCount: 0,
          otherParticipant: selectedClinician
            ? {
                id: selectedClinician.id,
                name: selectedClinician.name,
                role: selectedClinician.role,
                specialization: selectedClinician.specialization,
              }
            : null,
          lastMessage: null,
        };
        setActiveConvo(newConvo);
      }
    } catch {
      setIsNewChatModalOpen(false);
    }
  }

  async function handleSend(textToSend?: string) {
    const content = (textToSend || inputText).trim();
    if (!content || !activeConvo) return;

    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setInputText("");

    const localMsgId = `msg_${Date.now()}`;
    const optimisticMsg: ChatMessage = {
      id: localMsgId,
      isOwn: true,
      content,
      createdAt: new Date().toISOString(),
      pendingSync: true,
    };

    const nextMessages = [...messages, optimisticMsg];
    setMessages(nextMessages);
    scrollToBottom();

    const token = await getAuthToken();
    if (token) {
      try {
        const res = await fetchWithAuth(
          `/messages/conversations/${activeConvo.id}/messages`,
          {
            method: "POST",
            body: JSON.stringify({ content }),
          },
        );
        if (res.ok) {
          const savedMsg = await res.json();
          const syncedList = nextMessages.map((m) =>
            m.id === localMsgId ? { ...savedMsg, pendingSync: false } : m,
          );
          setMessages(syncedList);
          await saveCachedJson(`messages_${activeConvo.id}`, syncedList);
          void loadConversations();
          return;
        }
      } catch {
        // Offline — enqueue below
      }

      await enqueueOutboxAction({
        id: localMsgId,
        endpoint: `/messages/conversations/${activeConvo.id}/messages`,
        http_method: "POST",
        payload: { content },
        idempotency_key: `msg_${localMsgId}`,
      });
    }

    await saveCachedJson(`messages_${activeConvo.id}`, nextMessages);
  }

  const filteredClinicians = eligibleClinicians.filter((c) => {
    const q = clinicianSearch.toLowerCase();
    return (
      c.name.toLowerCase().includes(q) ||
      c.specialization.toLowerCase().includes(q) ||
      c.role.toLowerCase().includes(q)
    );
  });

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={Platform.OS === "ios" ? 90 : 0}
    >
      {/* Top Header */}
      <View style={[styles.header, { paddingTop: Math.max(insets.top + 12, 20) }]}>
        {activeConvo && (
          <TouchableOpacity style={styles.backIconBtn} onPress={() => setActiveConvo(null)}>
            <ArrowLeft size={20} color="#0f172a" />
          </TouchableOpacity>
        )}
        {activeConvo ? (
          <View style={styles.doctorAvatar}>
            <Stethoscope size={20} color="#059669" />
          </View>
        ) : (
          <View style={[styles.doctorAvatar, { backgroundColor: "#ffffff", padding: 4 }]}>
            <Image
              source={require("../../assets/pillpal-logo.png")}
              style={{ width: "100%", height: "100%" }}
              resizeMode="contain"
            />
          </View>
        )}
        <View style={{ flex: 1 }}>
          <Text style={styles.doctorName} numberOfLines={1}>
            {activeConvo?.otherParticipant?.name || "CSU Clinic Messages"}
          </Text>
          <Text style={styles.doctorStatus} numberOfLines={1}>
            {activeConvo?.otherParticipant?.specialization ||
              "PILLPAL • CSU Health & Wellness"}
          </Text>
        </View>
      </View>

      {/* Conversation List or Active Chat */}
      {!activeConvo ? (
        <ScrollView
          contentContainerStyle={{ padding: 16, paddingBottom: 168, flexGrow: 1 }}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#10b981" />
          }
        >
          {conversations.length === 0 ? (
            <View style={styles.emptyState}>
              <MessageSquare size={40} color="#94a3b8" />
              <Text style={styles.emptyTitle}>No Conversations Yet</Text>
              <Text style={styles.emptyDesc}>
                Start a confidential conversation with an active CSU physician or infirmary nurse.
              </Text>
              <TouchableOpacity
                style={styles.emptyCtaBtn}
                onPress={() => {
                  setIsNewChatModalOpen(true);
                  void loadEligibleClinicians();
                }}
              >
                <Plus size={16} color="#ffffff" />
                <Text style={styles.emptyCtaText}>Message CSU Doctor or Staff</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <>
              <View style={styles.threadHeaderRow}>
                <Text style={styles.threadHeaderTitle}>ACTIVE CONVERSATIONS</Text>
                <Text style={styles.threadCountBadge}>{conversations.length}</Text>
              </View>
              {conversations.map((c) => (
                <TouchableOpacity
                  key={c.id}
                  style={styles.threadCard}
                  onPress={() => setActiveConvo(c)}
                >
                  <View style={styles.doctorAvatar}>
                    <User size={20} color="#059669" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                      <Text style={styles.doctorName}>
                        {c.otherParticipant?.name || "CSU Clinician"}
                      </Text>
                      {c.unreadCount > 0 && (
                        <View style={styles.unreadBadge}>
                          <Text style={styles.unreadBadgeText}>{c.unreadCount}</Text>
                        </View>
                      )}
                    </View>
                    <Text style={styles.threadPreview} numberOfLines={1}>
                      {c.lastMessage?.content || "Tap to open clinical consultation"}
                    </Text>
                  </View>
                </TouchableOpacity>
              ))}
            </>
          )}
        </ScrollView>
      ) : (
        <>
          <ScrollView
            ref={scrollViewRef}
            contentContainerStyle={styles.messageFeed}
            keyboardShouldPersistTaps="handled"
            onContentSizeChange={scrollToBottom}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#10b981" />
            }
          >
            {messages.length === 0 ? (
              <View style={{ paddingVertical: 40, alignItems: "center" }}>
                <Text style={{ fontSize: 13, fontWeight: "700", color: "#475569", marginTop: 8 }}>
                  Start your message to {activeConvo.otherParticipant?.name || "CSU Clinic"}
                </Text>
              </View>
            ) : (
              messages.map((m) => (
                <View
                  key={m.id}
                  style={[
                    styles.bubbleWrapper,
                    m.isOwn ? styles.patientWrapper : styles.doctorWrapper,
                  ]}
                >
                  <View
                    style={[
                      styles.bubble,
                      m.isOwn ? styles.patientBubble : styles.doctorBubble,
                    ]}
                  >
                    <Text
                      style={[
                        styles.bubbleText,
                        m.isOwn ? styles.patientText : styles.doctorText,
                      ]}
                    >
                      {m.content}
                    </Text>
                    <View style={styles.bubbleFooter}>
                      <Text style={[styles.timeText, m.isOwn && { color: "#d1fae5" }]}>
                        {new Date(m.createdAt).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </Text>
                      {m.isOwn &&
                        (m.pendingSync ? (
                          <Clock size={11} color="#d1fae5" />
                        ) : (
                          <CheckCheck size={12} color="#ffffff" />
                        ))}
                    </View>
                  </View>
                </View>
              ))
            )}
          </ScrollView>

          {/* Quick Consultation Chips */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={{ maxHeight: 46 }}
            contentContainerStyle={styles.quickChipsScroll}
          >
            <TouchableOpacity
              style={styles.chip}
              onPress={() => void handleSend("I have a question regarding my medication dosage.")}
            >
              <Text style={styles.chipText}>Dosage Question</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.chip}
              onPress={() =>
                void handleSend("I am experiencing mild side effects after taking my medicine.")
              }
            >
              <Text style={styles.chipText}>Report Side Effect</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.chip}
              onPress={() => void handleSend("May I request a refill for my active prescription?")}
            >
              <Text style={styles.chipText}>Refill Request</Text>
            </TouchableOpacity>
          </ScrollView>

          {/* Input Bar */}
          <View style={styles.inputBar}>
            <TextInput
              style={styles.input}
              placeholder="Message CSU clinic physician..."
              placeholderTextColor="#94a3b8"
              value={inputText}
              onChangeText={setInputText}
              onSubmitEditing={() => void handleSend()}
            />
            <TouchableOpacity style={styles.sendBtn} onPress={() => void handleSend()}>
              <Send size={18} color="#ffffff" />
            </TouchableOpacity>
          </View>
        </>
      )}

      {/* Floating New Chat Button (Conversation List only) */}
      {!activeConvo && (
        <TouchableOpacity
          style={styles.newChatFab}
          activeOpacity={0.85}
          onPress={() => {
            setIsNewChatModalOpen(true);
            void loadEligibleClinicians();
          }}
        >
          <Plus size={18} color="#ffffff" />
          <Text style={styles.newChatFabText}>New Chat</Text>
        </TouchableOpacity>
      )}

      {/* New Chat Modal: Select Clinician */}
      <Modal visible={isNewChatModalOpen} animationType="slide" transparent>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle}>Message Doctor or Staff</Text>
                <Text style={styles.modalSubtitle}>
                  Select an active physician or nurse at CSU Infirmary
                </Text>
              </View>
              <TouchableOpacity
                style={styles.closeBtn}
                onPress={() => setIsNewChatModalOpen(false)}
              >
                <X size={20} color="#64748b" />
              </TouchableOpacity>
            </View>

            <View style={styles.searchBar}>
              <Search size={16} color="#94a3b8" />
              <TextInput
                style={styles.searchInput}
                placeholder="Search clinician by name or department..."
                placeholderTextColor="#94a3b8"
                value={clinicianSearch}
                onChangeText={setClinicianSearch}
              />
            </View>

            {loadingClinicians ? (
              <View style={{ padding: 40, alignItems: "center" }}>
                <ActivityIndicator size="small" color="#10b981" />
                <Text style={{ fontSize: 12, color: "#64748b", marginTop: 8 }}>
                  Loading clinic directory...
                </Text>
              </View>
            ) : filteredClinicians.length === 0 ? (
              <View style={{ padding: 32, alignItems: "center" }}>
                <MessageSquare size={32} color="#cbd5e1" />
                <Text style={{ fontSize: 13, fontWeight: "600", color: "#64748b", marginTop: 8 }}>
                  No clinicians available right now
                </Text>
              </View>
            ) : (
              <ScrollView style={{ maxHeight: 360 }}>
                {filteredClinicians.map((c) => (
                  <TouchableOpacity
                    key={c.id}
                    style={styles.clinicianCard}
                    onPress={() => void handleStartNewChat(c.id)}
                  >
                    <View style={styles.clinicianAvatar}>
                      <Stethoscope size={18} color="#059669" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                        <Text style={styles.clinicianName}>{c.name}</Text>
                        <View
                          style={[
                            styles.roleBadge,
                            c.role === "DOCTOR"
                              ? { backgroundColor: "#ecfdf5" }
                              : { backgroundColor: "#eff6ff" },
                          ]}
                        >
                          <Text
                            style={[
                              styles.roleBadgeText,
                              c.role === "DOCTOR"
                                ? { color: "#065f46" }
                                : { color: "#1e40af" },
                            ]}
                          >
                            {c.role === "DOCTOR" ? "PHYSICIAN" : "STAFF"}
                          </Text>
                        </View>
                      </View>
                      <Text style={styles.clinicianSpec}>{c.specialization}</Text>
                    </View>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f8fafc" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingTop: 54,
    paddingHorizontal: 20,
    paddingBottom: 14,
    backgroundColor: "#ffffff",
    borderBottomWidth: 1,
    borderBottomColor: "#e2e8f0",
  },
  backIconBtn: { padding: 4 },
  doctorAvatar: {
    width: 40,
    height: 40,
    borderRadius: 14,
    backgroundColor: "#ecfdf5",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#a7f3d0",
  },
  doctorName: { fontSize: 15, fontWeight: "800", color: "#0f172a" },
  doctorStatus: { fontSize: 11, fontWeight: "600", color: "#059669", marginTop: 1 },
  newChatFab: {
    position: "absolute",
    right: 20,
    bottom: 94,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#059669",
    paddingHorizontal: 18,
    paddingVertical: 13,
    borderRadius: 28,
    shadowColor: "#059669",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 6,
  },
  newChatFabText: { color: "#ffffff", fontSize: 13, fontWeight: "800" },
  safetyBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#fffbeb",
    borderBottomWidth: 1,
    borderBottomColor: "#fde68a",
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  safetyBannerText: { flex: 1, fontSize: 11, fontWeight: "600", color: "#92400e" },
  emptyState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 60,
    paddingHorizontal: 20,
  },
  emptyTitle: { fontSize: 16, fontWeight: "900", color: "#0f172a", marginTop: 12 },
  emptyDesc: {
    fontSize: 12,
    color: "#64748b",
    textAlign: "center",
    marginTop: 4,
    lineHeight: 18,
  },
  emptyCtaBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 18,
    backgroundColor: "#059669",
    paddingHorizontal: 18,
    paddingVertical: 11,
    borderRadius: 14,
  },
  emptyCtaText: { color: "#ffffff", fontSize: 13, fontWeight: "800" },
  threadHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
    paddingHorizontal: 4,
  },
  threadHeaderTitle: { fontSize: 11, fontWeight: "800", color: "#94a3b8", letterSpacing: 0.5 },
  threadCountBadge: { fontSize: 11, fontWeight: "700", color: "#64748b" },
  threadCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: "#ffffff",
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    marginBottom: 10,
  },
  unreadBadge: {
    backgroundColor: "#10b981",
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  unreadBadgeText: { color: "#ffffff", fontSize: 10, fontWeight: "800" },
  threadPreview: { fontSize: 12, color: "#64748b", marginTop: 2 },
  messageFeed: { padding: 16, flexGrow: 1 },
  bubbleWrapper: { marginBottom: 12, maxWidth: "82%" },
  patientWrapper: { alignSelf: "flex-end" },
  doctorWrapper: { alignSelf: "flex-start" },
  bubble: { borderRadius: 18, padding: 12 },
  patientBubble: { backgroundColor: "#10b981", borderBottomRightRadius: 4 },
  doctorBubble: {
    backgroundColor: "#ffffff",
    borderBottomLeftRadius: 4,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  bubbleText: { fontSize: 13, lineHeight: 19 },
  patientText: { color: "#ffffff", fontWeight: "600" },
  doctorText: { color: "#1e293b", fontWeight: "500" },
  bubbleFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 4,
    marginTop: 4,
  },
  timeText: { fontSize: 10, color: "#94a3b8" },
  quickChipsScroll: { paddingHorizontal: 14, paddingVertical: 6, gap: 8, alignItems: "center" },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "#ecfdf5",
    borderWidth: 1,
    borderColor: "#a7f3d0",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 14,
  },
  chipText: { fontSize: 11, fontWeight: "700", color: "#047857" },
  inputBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 86,
    backgroundColor: "#ffffff",
    borderTopWidth: 1,
    borderTopColor: "#e2e8f0",
  },
  input: {
    flex: 1,
    backgroundColor: "#f8fafc",
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 20,
    paddingHorizontal: 16,
    height: 42,
    fontSize: 13,
    color: "#0f172a",
  },
  sendBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: "#10b981",
    alignItems: "center",
    justifyContent: "center",
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.55)",
    justifyContent: "flex-end",
  },
  modalSheet: {
    backgroundColor: "#ffffff",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    paddingBottom: 32,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 14,
  },
  modalTitle: { fontSize: 17, fontWeight: "900", color: "#0f172a" },
  modalSubtitle: { fontSize: 11, color: "#64748b", marginTop: 2 },
  closeBtn: { padding: 4 },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#f8fafc",
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 42,
    marginBottom: 12,
  },
  searchInput: { flex: 1, fontSize: 13, color: "#0f172a" },
  clinicianCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#f1f5f9",
  },
  clinicianAvatar: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: "#ecfdf5",
    alignItems: "center",
    justifyContent: "center",
  },
  clinicianName: { fontSize: 14, fontWeight: "800", color: "#0f172a" },
  clinicianSpec: { fontSize: 11, color: "#64748b", marginTop: 2 },
  roleBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  roleBadgeText: { fontSize: 9, fontWeight: "900" },
});
