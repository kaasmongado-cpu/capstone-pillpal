import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  TextInput,
  RefreshControl,
} from "react-native";
import { Send, User, Sparkles, CheckCheck, Clock, ArrowLeft } from "lucide-react-native";
import * as Haptics from "expo-haptics";
import { fetchWithAuth } from "@/services/api/client";
import { getAuthToken } from "@/services/auth/session";
import {
  getCachedJson,
  saveCachedJson,
  enqueueOutboxAction,
} from "@/services/db/database";

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

const DEMO_CONVERSATIONS: ConversationSummary[] = [
  {
    id: "convo_demo_1",
    unreadCount: 0,
    otherParticipant: {
      id: "doc_1",
      name: "Dr. Evelyn Ramirez, MD",
      role: "DOCTOR",
      specialization: "CSU Clinic Physician",
    },
    lastMessage: {
      content: "Be sure to finish the full 7-day course even if you feel fine.",
      createdAt: new Date().toISOString(),
    },
  },
];

const DEMO_MESSAGES: ChatMessage[] = [
  {
    id: "m1",
    isOwn: false,
    content:
      "Hello Maria, this is Dr. Ramirez from CSU Clinic. Please remember to take your Amoxicillin after meals to avoid any stomach discomfort.",
    createdAt: new Date(Date.now() - 45 * 60 * 1000).toISOString(),
  },
  {
    id: "m2",
    isOwn: true,
    content:
      "Thank you Dr. Ramirez, I just logged my morning dose. The fever has completely subsided.",
    createdAt: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
  },
  {
    id: "m3",
    isOwn: false,
    content:
      "That is great news! Be sure to finish the full 7-day course even if you feel completely fine. See you at your follow-up.",
    createdAt: new Date(Date.now() - 15 * 60 * 1000).toISOString(),
  },
];

export default function MessagesScreen() {
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [activeConvo, setActiveConvo] = useState<ConversationSummary | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  const loadConversations = useCallback(async () => {
    const cached = await getCachedJson<ConversationSummary[]>("conversations");
    if (cached && cached.length > 0) {
      setConversations(cached);
      if (!activeConvo) setActiveConvo(cached[0]);
    }

    const token = await getAuthToken();
    if (token) {
      try {
        const res = await fetchWithAuth("/messages/conversations");
        if (res.ok) {
          const data: ConversationSummary[] = await res.json();
          if (data.length > 0) {
            setConversations(data);
            await saveCachedJson("conversations", data);
            if (!activeConvo) setActiveConvo(data[0]);
            return;
          }
        }
      } catch {
        // Keep cached conversations when offline
      }
    }

    if (!cached || cached.length === 0) {
      setConversations(DEMO_CONVERSATIONS);
      await saveCachedJson("conversations", DEMO_CONVERSATIONS);
      if (!activeConvo) setActiveConvo(DEMO_CONVERSATIONS[0]);
    }
  }, [activeConvo]);

  const loadMessages = useCallback(async (convoId: string) => {
    const cached = await getCachedJson<ChatMessage[]>(`messages_${convoId}`);
    if (cached) {
      setMessages(cached);
    }

    const token = await getAuthToken();
    if (token && !convoId.startsWith("convo_demo_")) {
      try {
        const res = await fetchWithAuth(`/messages/conversations/${convoId}`);
        if (res.ok) {
          const data = await res.json();
          setMessages(data.messages || []);
          await saveCachedJson(`messages_${convoId}`, data.messages || []);
          return;
        }
      } catch {
        // Offline — keep cached messages
      }
    }

    if (!cached) {
      setMessages(DEMO_MESSAGES);
      await saveCachedJson(`messages_${convoId}`, DEMO_MESSAGES);
    }
  }, []);

  useEffect(() => {
    void loadConversations();
  }, [loadConversations]);

  useEffect(() => {
    if (activeConvo) {
      void loadMessages(activeConvo.id);
    }
  }, [activeConvo, loadMessages]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadConversations();
    if (activeConvo) {
      await loadMessages(activeConvo.id);
    }
    setRefreshing(false);
  }, [activeConvo, loadConversations, loadMessages]);

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
    await saveCachedJson(`messages_${activeConvo.id}`, nextMessages);

    const token = await getAuthToken();
    if (token && !activeConvo.id.startsWith("convo_demo_")) {
      try {
        const res = await fetchWithAuth(
          `/messages/conversations/${activeConvo.id}/messages`,
          {
            method: "POST",
            body: JSON.stringify({ content }),
          }
        );
        if (res.ok) {
          const savedMsg = await res.json();
          const syncedList = nextMessages.map((m) =>
            m.id === localMsgId ? { ...savedMsg, pendingSync: false } : m
          );
          setMessages(syncedList);
          await saveCachedJson(`messages_${activeConvo.id}`, syncedList);
          return;
        }
      } catch {
        // Offline — enqueue message in outbox
      }

      await enqueueOutboxAction({
        id: localMsgId,
        endpoint: `/messages/conversations/${activeConvo.id}/messages`,
        http_method: "POST",
        payload: { content },
        idempotency_key: `msg_${localMsgId}`,
      });
    }
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        {conversations.length > 1 && activeConvo && (
          <TouchableOpacity
            style={styles.backIconBtn}
            onPress={() => setActiveConvo(null)}
          >
            <ArrowLeft size={20} color="#0f172a" />
          </TouchableOpacity>
        )}
        <View style={styles.doctorAvatar}>
          <User size={20} color="#059669" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.doctorName}>
            {activeConvo?.otherParticipant?.name || "CSU Clinic Conversations"}
          </Text>
          <Text style={styles.doctorStatus}>
            {activeConvo?.otherParticipant?.specialization || "Caraga State University Health Services"}
          </Text>
        </View>
      </View>

      {/* Conversation Picker if multiple threads exist and none selected */}
      {!activeConvo ? (
        <ScrollView contentContainerStyle={{ padding: 16 }}>
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
                <Text style={styles.doctorName}>
                  {c.otherParticipant?.name || "CSU Clinician"}
                </Text>
                <Text style={styles.threadPreview} numberOfLines={1}>
                  {c.lastMessage?.content || "Tap to open clinical conversation"}
                </Text>
              </View>
            </TouchableOpacity>
          ))}
        </ScrollView>
      ) : (
        <>
          {/* Message Feed */}
          <ScrollView
            contentContainerStyle={styles.messageFeed}
            keyboardShouldPersistTaps="handled"
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#10b981" />
            }
          >
            {messages.map((m) => (
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
            ))}
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
              onPress={() => handleSend("I have a question regarding my medication dosage.")}
            >
              <Sparkles size={12} color="#059669" />
              <Text style={styles.chipText}>Dosage Question</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.chip}
              onPress={() =>
                handleSend("I am experiencing mild dizziness after taking my medicine.")
              }
            >
              <Sparkles size={12} color="#059669" />
              <Text style={styles.chipText}>Report Side Effect</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.chip}
              onPress={() => handleSend("May I request a refill for my active prescription?")}
            >
              <Sparkles size={12} color="#059669" />
              <Text style={styles.chipText}>Refill Request</Text>
            </TouchableOpacity>
          </ScrollView>

          {/* Input Bar */}
          <View style={styles.inputBar}>
            <TextInput
              style={styles.input}
              placeholder="Message clinic physician..."
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
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f8fafc",
  },
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
  backIconBtn: {
    padding: 4,
  },
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
  doctorName: {
    fontSize: 15,
    fontWeight: "800",
    color: "#0f172a",
  },
  doctorStatus: {
    fontSize: 11,
    fontWeight: "600",
    color: "#059669",
    marginTop: 1,
  },
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
  threadPreview: {
    fontSize: 12,
    color: "#64748b",
    marginTop: 2,
  },
  messageFeed: {
    padding: 16,
    flexGrow: 1,
  },
  bubbleWrapper: {
    marginBottom: 12,
    maxWidth: "82%",
  },
  patientWrapper: {
    alignSelf: "flex-end",
  },
  doctorWrapper: {
    alignSelf: "flex-start",
  },
  bubble: {
    borderRadius: 18,
    padding: 12,
  },
  patientBubble: {
    backgroundColor: "#10b981",
    borderBottomRightRadius: 4,
  },
  doctorBubble: {
    backgroundColor: "#ffffff",
    borderBottomLeftRadius: 4,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  bubbleText: {
    fontSize: 13,
    lineHeight: 19,
  },
  patientText: {
    color: "#ffffff",
  },
  doctorText: {
    color: "#0f172a",
  },
  bubbleFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 4,
    marginTop: 4,
  },
  timeText: {
    fontSize: 9,
    color: "#94a3b8",
  },
  quickChipsScroll: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 8,
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#ecfdf5",
    borderWidth: 1,
    borderColor: "#a7f3d0",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  chipText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#065f46",
  },
  inputBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "#ffffff",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: "#e2e8f0",
  },
  input: {
    flex: 1,
    height: 42,
    backgroundColor: "#f8fafc",
    borderRadius: 20,
    paddingHorizontal: 16,
    fontSize: 13,
    color: "#0f172a",
    borderWidth: 1,
    borderColor: "#cbd5e1",
  },
  sendBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: "#10b981",
    alignItems: "center",
    justifyContent: "center",
  },
});
