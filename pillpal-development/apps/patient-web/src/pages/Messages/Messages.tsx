import { useEffect, useState } from "react";
import {
  Send,
  Stethoscope,
  Sparkles,
  PhoneCall,
  CheckCheck,
} from "lucide-react";
import { fetchWithAuth } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

type ConversationItem = {
  id: string;
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

export function Messages() {
  const [conversations, setConversations] = useState<ConversationItem[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<MessageItem[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);

  async function loadConversations() {
    setLoading(true);
    try {
      const res = await fetchWithAuth("/messages/conversations");
      if (res.ok) {
        const data = await res.json();
        setConversations(data);
        if (data.length > 0 && !activeConversationId) {
          setActiveConversationId(data[0].id);
        }
      }
    } catch (err) {
      console.error("Failed to load conversations:", err);
    } finally {
      setLoading(false);
    }
  }

  async function loadMessages(convoId: string) {
    try {
      const res = await fetchWithAuth(`/messages/conversations/${convoId}`);
      if (res.ok) {
        const data = await res.json();
        setMessages(data);
      }
    } catch (err) {
      console.error("Failed to load messages:", err);
    }
  }

  useEffect(() => {
    void loadConversations();
  }, []);

  useEffect(() => {
    if (activeConversationId) {
      void loadMessages(activeConversationId);
      const interval = setInterval(() => {
        void loadMessages(activeConversationId);
      }, 5000);
      return () => clearInterval(interval);
    }
  }, [activeConversationId]);

  async function handleSendMessage(e: React.FormEvent) {
    e.preventDefault();
    if (!newMessage.trim() || !activeConversationId) return;
    setSending(true);

    try {
      const res = await fetchWithAuth(`/messages/conversations/${activeConversationId}/messages`, {
        method: "POST",
        body: JSON.stringify({ content: newMessage }),
      });

      if (res.ok) {
        const createdMsg = await res.json();
        setMessages((prev) => [...prev, createdMsg]);
        setNewMessage("");
        void loadConversations();
      }
    } catch (err) {
      console.error("Failed to send message:", err);
    } finally {
      setSending(false);
    }
  }

  function handleQuickPrompt(text: string) {
    setNewMessage(text);
  }

  const activeConvo = conversations.find((c) => c.id === activeConversationId);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-black tracking-tight text-slate-900">
          Clinical Communications
        </h1>
        <p className="text-xs text-slate-500 mt-0.5">
          Direct messaging with your assigned CSU physicians and clinic healthcare staff.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 h-[640px]">
        {/* Left: Conversations List */}
        <Card className="rounded-3xl border border-slate-200/80 bg-white p-3 flex flex-col justify-between overflow-hidden">
          <div className="space-y-2 overflow-y-auto">
            <p className="px-2 text-[10px] font-extrabold uppercase tracking-wider text-slate-400">
              Active Contacts
            </p>

            {loading ? (
              <div className="py-8 text-center text-xs text-slate-400">Loading contacts...</div>
            ) : conversations.length === 0 ? (
              <div className="p-4 text-center text-xs text-slate-400">
                No active conversations yet. Messages from your doctor will appear here.
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
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700 shrink-0 font-bold">
                      <Stethoscope className="h-5 w-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between">
                        <p className="text-xs font-black truncate">{convo.otherParticipant.name}</p>
                        <span className="text-[10px] text-slate-400">
                          {new Date(convo.updatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                        </span>
                      </div>
                      <p className="text-[11px] font-semibold text-emerald-700 truncate">
                        {convo.otherParticipant.specialization}
                      </p>
                      <p className="text-[11px] text-slate-400 truncate mt-0.5">
                        {convo.lastMessage ? convo.lastMessage.content : "Tap to open chat"}
                      </p>
                    </div>
                  </button>
                );
              })
            )}
          </div>

          <div className="p-3 bg-slate-50 rounded-2xl border border-slate-100 text-[11px] text-slate-500 flex items-center gap-2">
            <PhoneCall className="h-4 w-4 text-emerald-600 shrink-0" />
            <span>Clinic hours: Mon-Fri 8am-5pm</span>
          </div>
        </Card>

        {/* Right: Message Feed */}
        <Card className="md:col-span-2 rounded-3xl border border-slate-200/80 bg-white flex flex-col justify-between overflow-hidden shadow-xs">
          {activeConvo ? (
            <>
              {/* Chat Header */}
              <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-600 text-white font-bold shadow-xs">
                    <Stethoscope className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-black text-slate-900">
                      {activeConvo.otherParticipant.name}
                    </h3>
                    <p className="text-[11px] text-emerald-700 font-semibold">
                      {activeConvo.otherParticipant.specialization} • CSU Health Services
                    </p>
                  </div>
                </div>

                <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200">
                  Online
                </span>
              </div>

              {/* Message History */}
              <div className="flex-1 p-4 overflow-y-auto space-y-3 bg-[#fbfcfd]">
                {messages.length === 0 ? (
                  <div className="py-16 text-center space-y-2">
                    <Sparkles className="h-8 w-8 text-emerald-500 mx-auto" />
                    <p className="text-xs font-bold text-slate-700">Start a Consultation Conversation</p>
                    <p className="text-[11px] text-slate-400 max-w-xs mx-auto">
                      Send a message to your doctor regarding dosage instructions, side effects, or follow-ups.
                    </p>
                  </div>
                ) : (
                  messages.map((msg) => (
                    <div
                      key={msg.id}
                      className={`flex flex-col ${msg.isOwn ? "items-end" : "items-start"}`}
                    >
                      <div
                        className={`max-w-sm rounded-2xl p-3 text-xs shadow-2xs ${
                          msg.isOwn
                            ? "bg-emerald-600 text-white rounded-br-xs"
                            : "bg-white border border-slate-200 text-slate-800 rounded-bl-xs"
                        }`}
                      >
                        {!msg.isOwn && (
                          <p className="text-[10px] font-black text-emerald-700 mb-0.5">
                            {msg.senderName}
                          </p>
                        )}
                        <p className="whitespace-pre-line leading-relaxed">{msg.content}</p>
                      </div>
                      <div className="flex items-center gap-1 mt-1 text-[9px] text-slate-400 font-mono px-1">
                        <span>{new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                        {msg.isOwn && <CheckCheck className="h-3 w-3 text-emerald-600" />}
                      </div>
                    </div>
                  ))
                )}
              </div>

              {/* Quick Prompt Chips & Composer */}
              <div className="p-3 border-t border-slate-100 bg-white space-y-2">
                <div className="flex flex-wrap gap-1.5 overflow-x-auto pb-1">
                  <button
                    type="button"
                    onClick={() => handleQuickPrompt("I have a question about my medication dosage instructions.")}
                    className="text-[10px] font-bold bg-slate-100 hover:bg-emerald-50 hover:text-emerald-700 text-slate-600 px-2.5 py-1 rounded-lg transition-colors cursor-pointer"
                  >
                    💊 Dosage Question
                  </button>
                  <button
                    type="button"
                    onClick={() => handleQuickPrompt("I am experiencing slight nausea after taking my prescription.")}
                    className="text-[10px] font-bold bg-slate-100 hover:bg-emerald-50 hover:text-emerald-700 text-slate-600 px-2.5 py-1 rounded-lg transition-colors cursor-pointer"
                  >
                    ⚠️ Report Side Effect
                  </button>
                  <button
                    type="button"
                    onClick={() => handleQuickPrompt("I would like to request an appointment follow-up.")}
                    className="text-[10px] font-bold bg-slate-100 hover:bg-emerald-50 hover:text-emerald-700 text-slate-600 px-2.5 py-1 rounded-lg transition-colors cursor-pointer"
                  >
                    📅 Follow-up Request
                  </button>
                </div>

                <form onSubmit={handleSendMessage} className="flex items-center gap-2">
                  <Input
                    placeholder="Type your message to doctor or health staff..."
                    value={newMessage}
                    onChange={(e) => setNewMessage(e.target.value)}
                    className="rounded-xl text-xs h-10 bg-slate-50"
                  />
                  <Button
                    type="submit"
                    disabled={sending || !newMessage.trim()}
                    className="h-10 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs gap-1.5 cursor-pointer"
                  >
                    <Send className="h-4 w-4" />
                    Send
                  </Button>
                </form>
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center p-8 text-center text-xs text-slate-400">
              Select a conversation contact to begin chat.
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
