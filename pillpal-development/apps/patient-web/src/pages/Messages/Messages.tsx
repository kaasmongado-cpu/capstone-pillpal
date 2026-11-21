import { useEffect, useState, useRef } from "react";
import {
  Send,
  Stethoscope,
  Sparkles,
  CheckCheck,
  Plus,
  AlertCircle,
  X,
  MessageSquare,
  Search,
} from "lucide-react";
import { fetchWithAuth } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

type ConversationItem = {
  id: string;
  unreadCount: number;
  otherParticipant: {
    id: string;
    name: string;
    role: string;
    specialization: string;
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

type EligibleClinician = {
  id: string;
  name: string;
  role: string;
  specialization: string;
  email: string;
};

export function Messages() {
  const [conversations, setConversations] = useState<ConversationItem[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<MessageItem[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [sending, setSending] = useState(false);

  // New Chat Modal state
  const [isNewChatModalOpen, setIsNewChatModalOpen] = useState(false);
  const [eligibleClinicians, setEligibleClinicians] = useState<EligibleClinician[]>([]);
  const [clinicianSearch, setClinicianSearch] = useState("");
  const [loadingClinicians, setLoadingClinicians] = useState(false);

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
      console.error("Failed to load patient conversations:", err);
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

  async function loadEligibleClinicians() {
    setLoadingClinicians(true);
    try {
      const res = await fetchWithAuth("/messages/eligible-contacts");
      if (res.ok) {
        const data = await res.json();
        setEligibleClinicians(data);
      }
    } catch (err) {
      console.error("Failed to load eligible clinicians:", err);
    } finally {
      setLoadingClinicians(false);
    }
  }

  useEffect(() => {
    void loadConversations(false);
  }, []);

  // Poll conversation messages every 4 seconds for live sync
  useEffect(() => {
    if (activeConversationId) {
      void loadMessages(activeConversationId, true);
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
    if (!newMessage.trim() || !activeConversationId || sending) return;

    setSending(true);
    const content = newMessage.trim();
    setNewMessage("");

    try {
      const res = await fetchWithAuth(`/messages/conversations/${activeConversationId}/messages`, {
        method: "POST",
        body: JSON.stringify({ content }),
      });

      if (res.ok) {
        const createdMsg: MessageItem = await res.json();
        setMessages((prev) => [...prev, createdMsg]);
        void loadConversations(true);
      }
    } catch (err) {
      console.error("Failed to send message:", err);
    } finally {
      setSending(false);
    }
  }

  async function handleStartNewChat(clinicianId: string) {
    try {
      const res = await fetchWithAuth("/messages/conversations", {
        method: "POST",
        body: JSON.stringify({ recipientUserId: clinicianId }),
      });

      if (res.ok) {
        const { conversationId } = await res.json();
        setIsNewChatModalOpen(false);
        await loadConversations(true);
        setActiveConversationId(conversationId);
      }
    } catch (err) {
      console.error("Failed to start chat with clinician:", err);
    }
  }

  function handleQuickPrompt(text: string) {
    setNewMessage(text);
  }

  const activeConvo = conversations.find((c) => c.id === activeConversationId);

  const filteredClinicians = eligibleClinicians.filter((c) => {
    const q = clinicianSearch.toLowerCase();
    return (
      c.name.toLowerCase().includes(q) ||
      c.specialization.toLowerCase().includes(q) ||
      c.role.toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-black tracking-tight text-slate-900">
              Clinical Communications
            </h1>
            <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-[10px] font-black text-emerald-800">
              CSU Health Desk
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Direct, confidential communication with your assigned CSU physicians and clinic healthcare staff.
          </p>
        </div>

        <Button
          onClick={() => {
            setIsNewChatModalOpen(true);
            void loadEligibleClinicians();
          }}
          className="rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5 shadow-xs cursor-pointer"
        >
          <Plus className="h-4 w-4" />
          Message Doctor or Staff
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 h-[640px]">
        {/* Left: Conversations List */}
        <Card className="rounded-3xl border border-slate-200/80 bg-white p-3 flex flex-col justify-between overflow-hidden shadow-xs">
          <div className="space-y-2 overflow-y-auto">
            <div className="flex items-center justify-between px-2">
              <p className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">
                Active Contacts
              </p>
              <span className="font-mono text-[10px] text-slate-400">{conversations.length}</span>
            </div>

            {loading ? (
              <div className="py-8 text-center text-xs text-slate-400">Loading contacts...</div>
            ) : conversations.length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-400 space-y-2">
                <MessageSquare className="h-8 w-8 text-slate-300 mx-auto" />
                <p className="font-semibold text-slate-600">No conversations yet</p>
                <p className="text-[11px]">Click "Message Doctor or Staff" above to start a consultation.</p>
              </div>
            ) : (
              conversations.map((convo) => {
                const isSelected = convo.id === activeConversationId;
                return (
                  <button
                    key={convo.id}
                    type="button"
                    onClick={() => setActiveConversationId(convo.id)}
                    className={`w-full text-left p-3 rounded-2xl transition-all cursor-pointer flex items-start gap-3 ${
                      isSelected
                        ? "bg-emerald-50/80 border border-emerald-200 text-emerald-950 shadow-2xs"
                        : "hover:bg-slate-50 text-slate-700"
                    }`}
                  >
                    <div
                      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl font-bold text-xs shadow-xs ${
                        isSelected
                          ? "bg-emerald-600 text-white"
                          : "bg-slate-100 text-slate-600"
                      }`}
                    >
                      {convo.otherParticipant.role === "DOCTOR" ? (
                        <Stethoscope className="h-4 w-4" />
                      ) : (
                        convo.otherParticipant.name[0]
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-1">
                        <p className="text-xs font-bold truncate">
                          {convo.otherParticipant.name}
                        </p>
                        {convo.lastMessage && (
                          <span className="text-[9px] text-slate-400 shrink-0">
                            {new Date(convo.lastMessage.createdAt).toLocaleTimeString([], {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </span>
                        )}
                      </div>
                      <p className="text-[10px] text-slate-400 font-semibold truncate">
                        {convo.otherParticipant.specialization}
                      </p>
                      <p className="text-[11px] text-slate-500 truncate mt-1">
                        {convo.lastMessage ? convo.lastMessage.content : "No messages yet"}
                      </p>
                    </div>

                    {convo.unreadCount > 0 && (
                      <span className="ml-1 flex h-4.5 min-w-4.5 items-center justify-center rounded-full bg-emerald-600 px-1 text-[10px] font-black text-white shrink-0">
                        {convo.unreadCount}
                      </span>
                    )}
                  </button>
                );
              })
            )}
          </div>

          <div className="pt-2 border-t border-slate-100">
            <div className="flex items-center justify-between text-[10px] text-slate-400 px-2 py-1">
              <span>CSU Infirmary Hours:</span>
              <span className="font-bold text-emerald-700">Mon-Fri 8AM-5PM</span>
            </div>
          </div>
        </Card>

        {/* Right: Active Chat Window */}
        <Card className="md:col-span-2 rounded-3xl border border-slate-200/80 bg-white shadow-xs flex flex-col justify-between overflow-hidden">
          {activeConvo ? (
            <>
              {/* Chat Header */}
              <div className="p-3.5 border-b border-slate-100 flex items-center justify-between bg-white">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-100 text-emerald-800 font-bold text-sm shadow-xs">
                    <Stethoscope className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="text-xs font-black text-slate-900">
                      {activeConvo.otherParticipant.name}
                    </h3>
                    <p className="text-[10px] text-slate-400">
                      {activeConvo.otherParticipant.specialization} • CSU Health Services
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700 border border-emerald-200">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    Duty Clinician
                  </span>
                </div>
              </div>

              {/* Emergency Safety Notice Banner */}
              <div className="bg-amber-50/80 border-b border-amber-200 px-4 py-2 text-[11px] text-amber-900 flex items-center gap-2">
                <AlertCircle className="h-4 w-4 shrink-0 text-amber-600" />
                <span>
                  <strong>Non-Emergency Desk:</strong> For severe symptoms or acute emergencies, call 911 or CSU Emergency Hotline (+63 917 123 4567) immediately.
                </span>
              </div>

              {/* Messages Feed */}
              <div className="flex-1 p-4 overflow-y-auto space-y-3 bg-slate-50/50">
                {messagesLoading ? (
                  <div className="py-12 text-center text-xs text-slate-400">Loading messages...</div>
                ) : messages.length === 0 ? (
                  <div className="py-16 text-center text-xs text-slate-400 space-y-2">
                    <Sparkles className="h-8 w-8 text-emerald-400 mx-auto" />
                    <p className="font-bold text-slate-700">Start your consultation with {activeConvo.otherParticipant.name}</p>
                    <p className="text-[11px]">Choose a quick prompt below or type your medical question.</p>
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
                            ? "bg-emerald-600 text-white rounded-tr-xs"
                            : "bg-white text-slate-800 rounded-tl-xs border border-slate-100"
                        }`}
                      >
                        {!m.isOwn && (
                          <p className="font-bold text-[10px] text-emerald-700 mb-0.5">
                            {m.senderName}
                          </p>
                        )}
                        <p className="leading-relaxed whitespace-pre-wrap">{m.content}</p>
                        <div
                          className={`flex items-center justify-end gap-1 mt-1 text-[9px] ${
                            m.isOwn ? "text-emerald-200" : "text-slate-400"
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

              {/* Consultation Presets & Input Bar */}
              <div className="p-3 border-t border-slate-100 bg-white space-y-2">
                <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-[11px]">
                  <span className="text-[10px] font-bold text-slate-400 shrink-0">Inquiry Presets:</span>
                  <button
                    type="button"
                    onClick={() => handleQuickPrompt("Doctor, is it okay to take this dose after breakfast?")}
                    className="shrink-0 px-2 py-0.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-[10px] font-medium transition-colors cursor-pointer"
                  >
                    Take with meals?
                  </button>
                  <button
                    type="button"
                    onClick={() => handleQuickPrompt("Doctor, I'm feeling mild dizziness after taking my medicine.")}
                    className="shrink-0 px-2 py-0.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-[10px] font-medium transition-colors cursor-pointer"
                  >
                    Report side effect
                  </button>
                  <button
                    type="button"
                    onClick={() => handleQuickPrompt("Hello, I would like to request a prescription refill checkup.")}
                    className="shrink-0 px-2 py-0.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-[10px] font-medium transition-colors cursor-pointer"
                  >
                    Refill inquiry
                  </button>
                </div>

                <form onSubmit={handleSendMessage} className="flex items-center gap-2">
                  <Input
                    placeholder="Type a message to your doctor..."
                    value={newMessage}
                    onChange={(e) => setNewMessage(e.target.value)}
                    className="rounded-xl text-xs h-10"
                  />
                  <Button
                    type="submit"
                    disabled={sending || !newMessage.trim()}
                    className="rounded-xl h-10 px-5 bg-emerald-600 hover:bg-emerald-700 text-xs font-bold gap-1.5 cursor-pointer text-white"
                  >
                    <Send className="h-4 w-4" />
                    {sending ? "Sending..." : "Send"}
                  </Button>
                </form>
              </div>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-xs text-slate-400 space-y-3">
              <Stethoscope className="h-12 w-12 text-slate-300" />
              <h3 className="text-sm font-black text-slate-700">No Conversation Selected</h3>
              <p className="max-w-xs text-slate-500">
                Select an attending clinician on the left or click "Message Doctor or Staff" to begin.
              </p>
            </div>
          )}
        </Card>
      </div>

      {/* MODAL: START CHAT WITH CSU CLINICIAN */}
      {isNewChatModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
          <div className="w-full max-w-md rounded-3xl bg-white p-5 shadow-2xl border border-slate-100 space-y-4 animate-in fade-in zoom-in-95 max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-sm font-black text-slate-900">Contact CSU Health Staff</h3>
                <p className="text-[11px] text-slate-500">Select an active university physician or infirmary staff member.</p>
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
                placeholder="Search clinician name or specialization..."
                value={clinicianSearch}
                onChange={(e) => setClinicianSearch(e.target.value)}
                className="pl-8 text-xs rounded-xl h-9"
              />
            </div>

            <div className="flex-1 overflow-y-auto divide-y divide-slate-100 pr-1 space-y-1">
              {loadingClinicians ? (
                <div className="p-8 text-center text-xs text-slate-400">Loading clinic directory...</div>
              ) : filteredClinicians.length === 0 ? (
                <div className="p-8 text-center text-xs text-slate-400">No clinicians matching search.</div>
              ) : (
                filteredClinicians.map((clinician) => (
                  <div
                    key={clinician.id}
                    className="p-3 flex items-center justify-between hover:bg-slate-50 rounded-xl transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-100 text-emerald-800 font-bold text-xs">
                        {clinician.role === "DOCTOR" ? <Stethoscope className="h-4 w-4" /> : clinician.name[0]}
                      </div>
                      <div>
                        <p className="text-xs font-bold text-slate-900">{clinician.name}</p>
                        <p className="text-[10px] text-slate-400 font-semibold">
                          {clinician.specialization} • {clinician.role === "DOCTOR" ? "Physician" : "Staff"}
                        </p>
                      </div>
                    </div>

                    <Button
                      size="sm"
                      onClick={() => handleStartNewChat(clinician.id)}
                      className="rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer"
                    >
                      Message
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
