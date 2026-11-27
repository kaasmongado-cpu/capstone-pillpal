import { useEffect, useState, useRef } from "react";
import { useLocation } from "react-router-dom";
import {
  Search,
  Send,
  Plus,
  Stethoscope,
  X,
  MessageSquare,
  CheckCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { fetchWithAuth } from "@/lib/api";
import { hasDocumentedDrugAllergy } from "@/lib/clinical";

const QUICK_CLINICAL_REPLIES = [
  {
    label: "Dose Check-In",
    text: "Hi! Checking in from CSU Health Services — please make sure you are taking your scheduled medication doses on time and let us know if you experience any side effects.",
  },
  {
    label: "Visit Infirmary",
    text: "Please drop by the CSU Health Services Infirmary at your earliest convenience for a quick clinical follow-up.",
  },
  {
    label: "Refill Ready",
    text: "Your prescribed medication refill is ready for pickup at the CSU Health Services Pharmacy. Please bring your CSU ID.",
  },
];

type ConversationItem = {
  id: string;
  unreadCount: number;
  otherParticipant: {
    id: string;
    name: string;
    role: string;
    specialization: string;
    idNumber: string | null;
    department: string | null;
    bloodType: string | null;
    allergies: string | null;
  };
  lastMessage: {
    content: string;
    createdAt: string;
    isRead: boolean;
    senderId: string;
  } | null;
  updatedAt: string;
};

type MessageItem = {
  id: string;
  conversationId: string;
  senderId: string;
  senderName: string;
  senderRole: string;
  isOwn: boolean;
  content: string;
  isRead: boolean;
  createdAt: string;
};

type EligiblePatient = {
  id: string;
  name: string;
  role: string;
  idNumber: string;
  department: string;
  bloodType: string;
  allergies: string;
  email: string;
};

export function Messages() {
  const location = useLocation();
  const [conversations, setConversations] = useState<ConversationItem[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<MessageItem[]>([]);
  const [inputMessage, setInputMessage] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [sending, setSending] = useState(false);

  // New Chat Modal state
  const [isNewChatModalOpen, setIsNewChatModalOpen] = useState(false);
  const [eligiblePatients, setEligiblePatients] = useState<EligiblePatient[]>([]);
  const [patientSearch, setPatientSearch] = useState("");
  const [loadingPatients, setLoadingPatients] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  async function loadConversations(maintainActive = true) {
    try {
      const res = await fetchWithAuth("/messages/conversations");
      if (res.ok) {
        const data: ConversationItem[] = await res.json();
        setConversations(data);
        if (data.length > 0 && (!activeConversationId || !maintainActive)) {
          setActiveConversationId(data[0]!.id);
        }
      }
    } catch (err) {
      console.error("Failed to load healthcare conversations:", err);
    } finally {
      setLoading(false);
    }
  }

  async function loadMessages(convoId: string, isInitial = false) {
    if (isInitial) setMessagesLoading(true);
    try {
      const res = await fetchWithAuth(`/messages/conversations/${convoId}`);
      if (res.ok) {
        const data = await res.json();
        setMessages(data.messages || []);
      }
    } catch (err) {
      console.error("Failed to load messages:", err);
    } finally {
      if (isInitial) setMessagesLoading(false);
    }
  }

  async function loadEligiblePatients() {
    setLoadingPatients(true);
    try {
      const res = await fetchWithAuth("/messages/eligible-contacts");
      if (res.ok) {
        const data = await res.json();
        setEligiblePatients(data);
      }
    } catch (err) {
      console.error("Failed to load eligible patients:", err);
    } finally {
      setLoadingPatients(false);
    }
  }

  useEffect(() => {
    void loadConversations(false);
  }, []);

  // Deep-link handoff from Dashboard, Patient Directory, or Adherence ("Message" buttons)
  useEffect(() => {
    const targetUserId = (location.state as { recipientUserId?: string } | null)
      ?.recipientUserId;
    if (!targetUserId) return;

    async function openTargetConversation(userId: string) {
      const existing = conversations.find((c) => c.otherParticipant.id === userId);
      if (existing) {
        setActiveConversationId(existing.id);
        window.history.replaceState({}, document.title);
        return;
      }
      try {
        const res = await fetchWithAuth("/messages/conversations", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ recipientUserId: userId }),
        });
        if (res.ok) {
          const { conversationId } = await res.json();
          await loadConversations(true);
          setActiveConversationId(conversationId);
        }
      } catch (err) {
        console.error("Failed to open deep-linked chat:", err);
      } finally {
        window.history.replaceState({}, document.title);
      }
    }

    if (!loading) {
      void openTargetConversation(targetUserId);
    }
  }, [location.state, loading, conversations]);

  // Poll conversation messages every 4 seconds for live sync
  useEffect(() => {
    if (activeConversationId) {
      void loadMessages(activeConversationId, true).then(() => {
        window.dispatchEvent(new Event("pillpal:messages-updated"));
      });
      const interval = setInterval(() => {
        void loadMessages(activeConversationId, false);
      }, 4000);
      return () => clearInterval(interval);
    }
  }, [activeConversationId]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  async function handleSendMessage(e: React.FormEvent) {
    e.preventDefault();
    if (!inputMessage.trim() || !activeConversationId || sending) return;

    setSending(true);
    const content = inputMessage.trim();
    setInputMessage("");

    try {
      const res = await fetchWithAuth(`/messages/conversations/${activeConversationId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });

      if (res.ok) {
        const newMsg: MessageItem = await res.json();
        setMessages((prev) => [...prev, newMsg]);
        void loadConversations(true);
        window.dispatchEvent(new Event("pillpal:messages-updated"));
      }
    } catch (err) {
      console.error("Send message error:", err);
    } finally {
      setSending(false);
    }
  }

  async function handleStartNewChat(patientId: string) {
    try {
      const res = await fetchWithAuth("/messages/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recipientUserId: patientId }),
      });

      if (res.ok) {
        const { conversationId } = await res.json();
        setIsNewChatModalOpen(false);
        await loadConversations(true);
        setActiveConversationId(conversationId);
      }
    } catch (err) {
      console.error("Failed to start new chat:", err);
    }
  }

  const activeConvo = conversations.find((c) => c.id === activeConversationId);

  const filteredConversations = conversations.filter((c) => {
    const q = searchQuery.toLowerCase();
    return (
      c.otherParticipant.name.toLowerCase().includes(q) ||
      (c.otherParticipant.idNumber && c.otherParticipant.idNumber.toLowerCase().includes(q)) ||
      (c.lastMessage?.content && c.lastMessage.content.toLowerCase().includes(q))
    );
  });

  const filteredPatients = eligiblePatients.filter((p) => {
    const q = patientSearch.toLowerCase();
    return (
      p.name.toLowerCase().includes(q) ||
      p.idNumber.toLowerCase().includes(q) ||
      p.department.toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-black tracking-tight text-slate-900">
              Clinical Messaging & Consultations
            </h1>
            <span className="rounded-full bg-sky-100 px-2.5 py-0.5 text-[10px] font-black text-[#0284c7]">
              Live Portal
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Real-time direct communication with registered CSU students and employees regarding prescriptions and follow-ups.
          </p>
        </div>

        <Button
          onClick={() => {
            setIsNewChatModalOpen(true);
            void loadEligiblePatients();
          }}
          className="rounded-xl text-xs font-bold bg-[#0284c7] hover:bg-[#0369a1] text-white gap-1.5 shadow-xs cursor-pointer"
        >
          <Plus className="h-4 w-4" />
          Start Chat with Patient
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 h-[640px]">
        {/* Left: Conversations List */}
        <Card className="rounded-2xl border border-slate-200/80 shadow-xs flex flex-col overflow-hidden bg-white">
          <CardHeader className="p-3 border-b border-slate-100 space-y-2">
            <div className="relative">
              <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400" />
              <Input
                placeholder="Search by student name, ID..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8 text-xs h-9 rounded-xl"
              />
            </div>
            <div className="flex items-center justify-between text-[11px] font-bold text-slate-400 px-1">
              <span>Patient Conversations</span>
              <span className="font-mono text-[10px]">{conversations.length} total</span>
            </div>
          </CardHeader>

          <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
            {loading ? (
              <div className="p-12 text-center text-xs text-slate-400">Loading conversations...</div>
            ) : filteredConversations.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-400 space-y-2">
                <MessageSquare className="h-8 w-8 text-slate-300 mx-auto" />
                <p className="font-semibold text-slate-600">No conversations found</p>
                <p className="text-[11px]">Click "Start Chat with Patient" to initiate a clinical inquiry.</p>
              </div>
            ) : (
              filteredConversations.map((chat) => {
                const isSelected = chat.id === activeConversationId;
                return (
                  <button
                    key={chat.id}
                    type="button"
                    onClick={() => setActiveConversationId(chat.id)}
                    className={`w-full text-left p-3.5 transition-colors cursor-pointer flex items-start gap-3 ${
                      isSelected
                        ? "bg-sky-50/80 text-slate-900 border-l-4 border-[#0284c7]"
                        : "hover:bg-slate-50 text-slate-700"
                    }`}
                  >
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#0284c7] text-white font-bold text-xs shadow-xs">
                      {chat.otherParticipant.name[0]}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-1">
                        <p className="text-xs font-bold text-slate-900 truncate">
                          {chat.otherParticipant.name}
                        </p>
                        {chat.lastMessage && (
                          <span className="text-[10px] text-slate-400 font-medium shrink-0">
                            {new Date(chat.lastMessage.createdAt).toLocaleTimeString([], {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </span>
                        )}
                      </div>

                      {chat.otherParticipant.idNumber && (
                        <p className="font-mono text-[10px] text-slate-400">
                          {chat.otherParticipant.idNumber} • {chat.otherParticipant.department || "CSU"}
                        </p>
                      )}

                      <p className="text-[11px] text-slate-500 truncate mt-1">
                        {chat.lastMessage ? chat.lastMessage.content : "No messages yet"}
                      </p>
                    </div>

                    {chat.unreadCount > 0 && (
                      <span className="ml-1 flex h-4.5 min-w-4.5 items-center justify-center rounded-full bg-[#0284c7] px-1 text-[10px] font-black text-white shrink-0">
                        {chat.unreadCount}
                      </span>
                    )}
                  </button>
                );
              })
            )}
          </div>
        </Card>

        {/* Right: Message Window */}
        <Card className="md:col-span-2 rounded-2xl border border-slate-200/80 shadow-xs flex flex-col overflow-hidden bg-white">
          {activeConvo ? (
            <>
              {/* Chat Header with Patient Clinical Strip */}
              <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-100 text-[#0284c7] font-bold text-sm shadow-xs">
                    {activeConvo.otherParticipant.name[0]}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-xs font-black text-slate-900">
                        {activeConvo.otherParticipant.name}
                      </h3>
                      <span className="rounded-md bg-emerald-100 px-1.5 py-0.2 text-[9px] font-bold text-emerald-800">
                        Student Patient
                      </span>
                    </div>
                    <p className="font-mono text-[10px] text-slate-400">
                      ID: {activeConvo.otherParticipant.idNumber || "N/A"} •{" "}
                      {activeConvo.otherParticipant.department || "Caraga State University"}
                    </p>
                  </div>
                </div>

                {/* Clinical Safety Context Strip */}
                <div className="flex items-center gap-2 bg-slate-50 p-2 rounded-xl border border-slate-100 text-[11px]">
                  <div>
                    <span className="text-slate-400 font-semibold text-[10px]">Blood: </span>
                    <span className="font-bold text-slate-800">
                      {activeConvo.otherParticipant.bloodType || "Not set"}
                    </span>
                  </div>
                  <span className="text-slate-300">•</span>
                  <div>
                    <span className="text-slate-400 font-semibold text-[10px]">Allergies: </span>
                    <span
                      className={`font-bold ${
                        hasDocumentedDrugAllergy(activeConvo.otherParticipant.allergies)
                          ? "text-rose-700"
                          : "text-slate-700"
                      }`}
                    >
                      {activeConvo.otherParticipant.allergies || "Not screened"}
                    </span>
                  </div>
                </div>
              </div>

              {/* Chat Messages */}
              <div className="flex-1 p-4 overflow-y-auto space-y-3 bg-slate-50/60">
                {messagesLoading ? (
                  <div className="py-12 text-center text-xs text-slate-400">Loading conversation history...</div>
                ) : messages.length === 0 ? (
                  <div className="py-16 text-center text-xs text-slate-400 space-y-2">
                    <p className="font-bold text-slate-700">No messages in this conversation yet</p>
                    <p className="text-[11px]">Send a clinical inquiry or greeting to start the consultation.</p>
                  </div>
                ) : (
                  messages.map((m) => (
                    <div
                      key={m.id}
                      className={`flex ${m.isOwn ? "justify-end" : "justify-start"}`}
                    >
                      <div
                        className={`max-w-md rounded-2xl p-3 text-xs shadow-2xs ${
                          m.isOwn
                            ? "bg-[#0284c7] text-white rounded-tr-xs"
                            : "bg-white text-slate-800 rounded-tl-xs border border-slate-100"
                        }`}
                      >
                        {!m.isOwn && (
                          <p className="font-bold text-[10px] text-[#0284c7] mb-0.5">
                            {m.senderName}
                          </p>
                        )}
                        <p className="leading-relaxed whitespace-pre-wrap">{m.content}</p>
                        <div
                          className={`flex items-center justify-end gap-1 mt-1 text-[9px] ${
                            m.isOwn ? "text-sky-200" : "text-slate-400"
                          }`}
                        >
                          <span>
                            {new Date(m.createdAt).toLocaleTimeString([], {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </span>
                          {m.isOwn && <CheckCheck className="h-3 w-3" />}
                        </div>
                      </div>
                    </div>
                  ))
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Quick Clinical Reply Templates */}
              <div className="px-3 pt-2.5 pb-1 border-t border-slate-100 bg-white flex flex-wrap items-center gap-1.5">
                <span className="text-[10px] font-bold uppercase text-slate-400 mr-1">
                  Quick Reply:
                </span>
                {QUICK_CLINICAL_REPLIES.map((tpl) => (
                  <button
                    key={tpl.label}
                    type="button"
                    onClick={() => setInputMessage(tpl.text)}
                    className="rounded-lg bg-slate-100 hover:bg-sky-50 hover:text-[#0284c7] px-2.5 py-1 text-[10px] font-bold text-slate-600 transition-colors cursor-pointer"
                  >
                    {tpl.label}
                  </button>
                ))}
              </div>

              {/* Chat Composer */}
              <form
                onSubmit={handleSendMessage}
                className="p-3 pt-1.5 bg-white flex items-center gap-2"
              >
                <Input
                  placeholder="Type a clinical reply or prescription instructions to the patient..."
                  value={inputMessage}
                  onChange={(e) => setInputMessage(e.target.value)}
                  className="rounded-xl text-xs h-10"
                />
                <Button
                  type="submit"
                  disabled={sending || !inputMessage.trim()}
                  className="rounded-xl h-10 px-5 bg-[#0284c7] hover:bg-[#0369a1] text-xs font-bold gap-1.5 cursor-pointer text-white"
                >
                  <Send className="h-4 w-4" />
                  {sending ? "Sending..." : "Send"}
                </Button>
              </form>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-xs text-slate-400 space-y-3">
              <Stethoscope className="h-12 w-12 text-slate-300" />
              <h3 className="text-sm font-black text-slate-700">No Conversation Selected</h3>
              <p className="max-w-xs text-slate-500">
                Select an existing patient message on the left or click "Start Chat with Patient" to begin.
              </p>
            </div>
          )}
        </Card>
      </div>

      {/* MODAL: START CHAT WITH REGISTERED CSU PATIENT */}
      {isNewChatModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
          <div className="w-full max-w-md rounded-3xl bg-white p-5 shadow-2xl border border-slate-100 space-y-4 animate-in fade-in zoom-in-95 max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-sm font-black text-slate-900">Initiate Patient Consultation</h3>
                <p className="text-[11px] text-slate-500">Search and message any enrolled CSU student or employee.</p>
              </div>
              <button
                type="button"
                onClick={() => setIsNewChatModalOpen(false)}
                className="rounded-full p-1 text-slate-400 hover:bg-slate-100 cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="relative">
              <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400" />
              <Input
                placeholder="Search patient name, ID (e.g. 2022-04912)..."
                value={patientSearch}
                onChange={(e) => setPatientSearch(e.target.value)}
                className="pl-8 text-xs rounded-xl h-9"
              />
            </div>

            <div className="flex-1 overflow-y-auto divide-y divide-slate-100 pr-1 space-y-1">
              {loadingPatients ? (
                <div className="p-8 text-center text-xs text-slate-400">Loading student directory...</div>
              ) : filteredPatients.length === 0 ? (
                <div className="p-8 text-center text-xs text-slate-400">No patients matching search.</div>
              ) : (
                filteredPatients.map((pat) => (
                  <div
                    key={pat.id}
                    className="p-3 flex items-center justify-between hover:bg-slate-50 rounded-xl transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-sky-100 text-[#0284c7] font-bold text-xs">
                        {pat.name[0]}
                      </div>
                      <div>
                        <p className="text-xs font-bold text-slate-900">{pat.name}</p>
                        <p className="font-mono text-[10px] text-slate-400">
                          {pat.idNumber} • {pat.department}
                        </p>
                      </div>
                    </div>

                    <Button
                      size="sm"
                      onClick={() => handleStartNewChat(pat.id)}
                      className="rounded-xl text-xs font-bold bg-[#0284c7] hover:bg-[#0369a1] text-white cursor-pointer"
                    >
                      Chat
                    </Button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
