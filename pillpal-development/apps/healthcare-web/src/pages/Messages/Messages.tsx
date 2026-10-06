import { useState } from "react";
import {
  Search,
  Send,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardHeader,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";

type ChatItem = {
  id: string;
  patientName: string;
  idNumber: string;
  lastMessage: string;
  timestamp: string;
  unread: boolean;
};

const SAMPLE_CHATS: ChatItem[] = [
  {
    id: "c1",
    patientName: "Maria Santos",
    idNumber: "2022-04912",
    lastMessage: "Doctor, is it okay to take Metformin after breakfast instead?",
    timestamp: "10:30 AM",
    unread: true,
  },
  {
    id: "c2",
    patientName: "Juan Dela Cruz",
    idNumber: "2021-08123",
    lastMessage: "Thank you Dr. Cruz. Blood pressure this morning was 120/80.",
    timestamp: "Yesterday",
    unread: false,
  },
  {
    id: "c3",
    patientName: "Angela Reyes",
    idNumber: "2023-01045",
    lastMessage: "I experienced slight dizziness after the new inhaler dosage.",
    timestamp: "Yesterday",
    unread: false,
  },
];

export function Messages() {
  const [selectedChat, setSelectedChat] = useState<string>("c1");
  const [inputMessage, setInputMessage] = useState("");

  const activeChat = SAMPLE_CHATS.find((c) => c.id === selectedChat);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-black tracking-tight text-slate-900">
          Patient Communications
        </h1>
        <p className="text-xs text-slate-500 mt-0.5">
          Secure, direct healthcare messaging between CSU clinicians and patients.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 h-[600px]">
        {/* Left: Chat List */}
        <Card className="rounded-2xl border border-slate-100 shadow-xs flex flex-col overflow-hidden">
          <CardHeader className="p-4 border-b border-slate-100">
            <div className="relative">
              <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400" />
              <Input
                placeholder="Search conversations..."
                className="pl-8 text-xs h-8 rounded-xl"
              />
            </div>
          </CardHeader>

          <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
            {SAMPLE_CHATS.map((chat) => (
              <button
                key={chat.id}
                type="button"
                onClick={() => setSelectedChat(chat.id)}
                className={`w-full text-left p-3.5 transition-colors cursor-pointer flex items-start gap-3 ${
                  selectedChat === chat.id
                    ? "bg-sky-50/70 text-slate-900"
                    : "hover:bg-slate-50 text-slate-700"
                }`}
              >
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#0284c7] text-white font-bold text-xs">
                  {chat.patientName[0]}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-bold text-slate-900 truncate">
                      {chat.patientName}
                    </p>
                    <span className="text-[10px] text-slate-400 font-medium">
                      {chat.timestamp}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500 truncate mt-0.5">
                    {chat.lastMessage}
                  </p>
                </div>
                {chat.unread && (
                  <span className="h-2 w-2 rounded-full bg-[#0284c7] shrink-0 mt-1" />
                )}
              </button>
            ))}
          </div>
        </Card>

        {/* Right: Message Window */}
        <Card className="md:col-span-2 rounded-2xl border border-slate-100 shadow-xs flex flex-col overflow-hidden">
          {activeChat ? (
            <>
              {/* Chat Header */}
              <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-white">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-sky-50 text-[#0284c7] font-bold text-xs">
                    {activeChat.patientName[0]}
                  </div>
                  <div>
                    <h3 className="text-xs font-bold text-slate-900">
                      {activeChat.patientName}
                    </h3>
                    <p className="font-mono text-[10px] text-slate-400">
                      ID: {activeChat.idNumber} • CSU Clinic Patient
                    </p>
                  </div>
                </div>

                <Button variant="outline" size="sm" className="rounded-xl text-xs font-semibold">
                  Patient Record
                </Button>
              </div>

              {/* Chat Messages */}
              <div className="flex-1 p-4 overflow-y-auto space-y-3 bg-slate-50/50">
                <div className="flex justify-start">
                  <div className="max-w-md rounded-2xl rounded-tl-sm bg-white p-3 text-xs text-slate-800 shadow-2xs border border-slate-100">
                    <p>{activeChat.lastMessage}</p>
                    <span className="text-[9px] text-slate-400 mt-1 block">
                      {activeChat.timestamp}
                    </span>
                  </div>
                </div>

                <div className="flex justify-end">
                  <div className="max-w-md rounded-2xl rounded-tr-sm bg-[#0284c7] p-3 text-xs text-white shadow-2xs">
                    <p>
                      Hello Maria! Yes, you may take it right after breakfast to reduce any stomach discomfort. Keep logging your meals in the app!
                    </p>
                    <span className="text-[9px] text-sky-200 mt-1 block text-right">
                      10:35 AM • Sent
                    </span>
                  </div>
                </div>
              </div>

              {/* Chat Input */}
              <div className="p-3 border-t border-slate-100 bg-white flex items-center gap-2">
                <Input
                  placeholder="Type a clinical reply to the patient..."
                  value={inputMessage}
                  onChange={(e) => setInputMessage(e.target.value)}
                  className="rounded-xl text-xs"
                />
                <Button className="rounded-xl h-9.5 px-4 bg-[#0284c7] hover:bg-[#0369a1] text-xs font-bold">
                  <Send className="h-4 w-4 mr-1" />
                  Send
                </Button>
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-xs text-slate-400">
              Select a conversation to begin messaging.
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
