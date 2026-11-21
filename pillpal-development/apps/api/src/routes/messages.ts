import type { IncomingMessage, ServerResponse } from "node:http";
import { prisma } from "@pillpal/database";
import { supabase } from "@pillpal/auth";

async function getAuthenticatedUser(req: IncomingMessage) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    return null;
  }
  const token = authHeader.replace("Bearer ", "").trim();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser(token);
  if (error || !user) return null;

  return prisma.user.findUnique({
    where: { supabaseUserId: user.id },
    include: { patientProfile: true },
  });
}

function readJsonBody(req: IncomingMessage): Promise<any> {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk.toString();
    });
    req.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (err) {
        reject(err);
      }
    });
  });
}

function sendJson(res: ServerResponse, status: number, data: any) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(data));
}

export async function messagesRoute(req: IncomingMessage, res: ServerResponse) {
  const user = await getAuthenticatedUser(req);
  if (!user) {
    sendJson(res, 401, { message: "Unauthorized" });
    return;
  }

  // Zero-Admin Access Policy: Admin role is isolated from private clinical conversations
  if (user.role === "ADMIN") {
    sendJson(res, 403, {
      message: "Administrative accounts are restricted from accessing private clinical messaging.",
    });
    return;
  }

  const url = new URL(req.url || "/", "http://localhost:4000");
  const pathname = url.pathname;

  // 1. GET /messages/conversations - List all conversations for the user with dynamic unread counts
  if (req.method === "GET" && pathname === "/messages/conversations") {
    try {
      const userParticipations = await prisma.conversationParticipant.findMany({
        where: { userId: user.id },
        select: { conversationId: true, lastReadAt: true },
      });

      const conversationIds = userParticipations.map((p) => p.conversationId);
      const lastReadMap = new Map(userParticipations.map((p) => [p.conversationId, p.lastReadAt]));

      const conversations = await prisma.conversation.findMany({
        where: { id: { in: conversationIds } },
        include: {
          participants: {
            include: {
              user: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true,
                  role: true,
                  specialization: true,
                  patientProfile: {
                    select: {
                      idNumber: true,
                      department: true,
                      bloodType: true,
                      allergies: true,
                    },
                  },
                },
              },
            },
          },
          messages: {
            orderBy: { createdAt: "desc" },
            take: 1,
          },
        },
        orderBy: { updatedAt: "desc" },
      });

      const formatted = await Promise.all(
        conversations.map(async (c) => {
          const otherParticipant = c.participants.find((p) => p.userId !== user.id)?.user;
          const lastMsg = c.messages[0];
          const myLastRead = lastReadMap.get(c.id);

          // Calculate unread count for current user
          const unreadCount = await prisma.message.count({
            where: {
              conversationId: c.id,
              senderId: { not: user.id },
              ...(myLastRead
                ? { createdAt: { gt: myLastRead } }
                : { isRead: false }),
            },
          });

          return {
            id: c.id,
            unreadCount,
            otherParticipant: otherParticipant
              ? {
                  id: otherParticipant.id,
                  name:
                    otherParticipant.role === "DOCTOR"
                      ? `Dr. ${otherParticipant.firstName} ${otherParticipant.lastName}`
                      : `${otherParticipant.firstName} ${otherParticipant.lastName}`,
                  role: otherParticipant.role,
                  specialization:
                    otherParticipant.specialization ||
                    (otherParticipant.role === "PATIENT" ? "Student / Patient" : "Infirmary Staff"),
                  idNumber: otherParticipant.patientProfile?.idNumber || null,
                  department: otherParticipant.patientProfile?.department || null,
                  bloodType: otherParticipant.patientProfile?.bloodType || null,
                  allergies: otherParticipant.patientProfile?.allergies || null,
                }
              : {
                  id: "clinic",
                  name: "CSU Health Clinic",
                  role: "HEALTH_STAFF",
                  specialization: "Support",
                  idNumber: null,
                  department: null,
                  bloodType: null,
                  allergies: null,
                },
            lastMessage: lastMsg
              ? {
                  content: lastMsg.content,
                  createdAt: lastMsg.createdAt.toISOString(),
                  isRead: lastMsg.isRead,
                  senderId: lastMsg.senderId,
                }
              : null,
            updatedAt: c.updatedAt.toISOString(),
          };
        }),
      );

      sendJson(res, 200, formatted);
      return;
    } catch (err: any) {
      console.error("GET /messages/conversations error:", err);
      sendJson(res, 500, { message: err.message || "Failed to load conversations" });
      return;
    }
  }

  // 2. GET /messages/eligible-contacts - Discover authorized participants to initiate chats
  if (req.method === "GET" && pathname === "/messages/eligible-contacts") {
    try {
      if (user.role === "PATIENT") {
        // Patients can message clinic doctors and health staff
        const clinicians = await prisma.user.findMany({
          where: {
            role: { in: ["DOCTOR", "HEALTH_STAFF"] },
            status: "ACTIVE",
          },
          select: {
            id: true,
            firstName: true,
            lastName: true,
            role: true,
            specialization: true,
            email: true,
          },
          orderBy: [{ role: "asc" }, { lastName: "asc" }],
        });

        const formatted = clinicians.map((c) => ({
          id: c.id,
          name:
            c.role === "DOCTOR"
              ? `Dr. ${c.firstName} ${c.lastName}`
              : `${c.firstName} ${c.lastName}`,
          role: c.role,
          specialization:
            c.specialization || (c.role === "DOCTOR" ? "Attending Physician" : "Infirmary Triage Staff"),
          email: c.email,
        }));

        sendJson(res, 200, formatted);
        return;
      } else {
        // Doctors and Health Staff can message registered CSU patients
        const patients = await prisma.user.findMany({
          where: {
            role: "PATIENT",
            status: "ACTIVE",
          },
          include: {
            patientProfile: true,
          },
          orderBy: { lastName: "asc" },
        });

        const formatted = patients.map((p) => ({
          id: p.id,
          name: `${p.firstName} ${p.lastName}`,
          role: p.role,
          idNumber: p.patientProfile?.idNumber || "N/A",
          department: p.patientProfile?.department || "General",
          bloodType: p.patientProfile?.bloodType || "Unknown",
          allergies: p.patientProfile?.allergies || "None",
          email: p.email,
        }));

        sendJson(res, 200, formatted);
        return;
      }
    } catch (err: any) {
      console.error("GET /messages/eligible-contacts error:", err);
      sendJson(res, 500, { message: err.message || "Failed to load eligible contacts" });
      return;
    }
  }

  // 3. POST /messages/conversations - Start or retrieve a conversation idempotently
  if (req.method === "POST" && pathname === "/messages/conversations") {
    try {
      const body = await readJsonBody(req);
      const { recipientUserId, initialMessage } = body;

      if (!recipientUserId) {
        sendJson(res, 400, { message: "recipientUserId is required" });
        return;
      }

      if (recipientUserId === user.id) {
        sendJson(res, 400, { message: "Cannot initiate a conversation with yourself" });
        return;
      }

      // Check if a conversation already exists between these 2 users
      const existingParticipations = await prisma.conversationParticipant.findMany({
        where: { userId: { in: [user.id, recipientUserId] } },
      });

      const countsByConvo: Record<string, number> = {};
      let matchedConversationId: string | null = null;
      for (const p of existingParticipations) {
        countsByConvo[p.conversationId] = (countsByConvo[p.conversationId] || 0) + 1;
        if (countsByConvo[p.conversationId] === 2) {
          matchedConversationId = p.conversationId;
          break;
        }
      }

      let conversationId = matchedConversationId;

      if (!conversationId) {
        // Create new conversation with both participants
        const newConvo = await prisma.conversation.create({
          data: {
            participants: {
              create: [
                { userId: user.id, lastReadAt: new Date() },
                { userId: recipientUserId },
              ],
            },
          },
        });
        conversationId = newConvo.id;
      }

      if (initialMessage && conversationId) {
        await prisma.message.create({
          data: {
            conversationId,
            senderId: user.id,
            content: initialMessage.trim(),
            messageType: "TEXT",
          },
        });
        await prisma.conversation.update({
          where: { id: conversationId },
          data: { updatedAt: new Date() },
        });
        await prisma.conversationParticipant.update({
          where: {
            conversationId_userId: {
              conversationId,
              userId: user.id,
            },
          },
          data: { lastReadAt: new Date() },
        });
      }

      sendJson(res, 201, { conversationId });
      return;
    } catch (err: any) {
      console.error("POST /messages/conversations error:", err);
      sendJson(res, 500, { message: err.message || "Failed to initiate conversation" });
      return;
    }
  }

  // 4. PATCH /messages/conversations/:id/read - Mark conversation read for current user
  const readMatch = pathname.match(/^\/messages\/conversations\/([a-zA-Z0-9_-]+)\/read$/);
  if (req.method === "PATCH" && readMatch) {
    const conversationId = readMatch[1];
    try {
      await prisma.conversationParticipant.updateMany({
        where: {
          conversationId: conversationId!,
          userId: user.id,
        },
        data: { lastReadAt: new Date() },
      });

      await prisma.message.updateMany({
        where: {
          conversationId: conversationId!,
          senderId: { not: user.id },
          isRead: false,
        },
        data: { isRead: true, readAt: new Date() },
      });

      sendJson(res, 200, { success: true });
      return;
    } catch (err: any) {
      console.error("PATCH /messages/conversations/:id/read error:", err);
      sendJson(res, 500, { message: err.message || "Failed to mark conversation read" });
      return;
    }
  }

  // 5. GET /messages/conversations/:id - Get all messages in conversation & participant clinical metadata
  const getMessagesMatch = pathname.match(/^\/messages\/conversations\/([a-zA-Z0-9_-]+)$/);
  if (req.method === "GET" && getMessagesMatch) {
    const conversationId = getMessagesMatch[1];
    try {
      // Verify user is in conversation
      const participant = await prisma.conversationParticipant.findUnique({
        where: {
          conversationId_userId: {
            conversationId: conversationId!,
            userId: user.id,
          },
        },
      });

      if (!participant) {
        sendJson(res, 403, { message: "Access denied to this clinical conversation" });
        return;
      }

      // Fetch the conversation and participants
      const conversation = await prisma.conversation.findUnique({
        where: { id: conversationId! },
        include: {
          participants: {
            include: {
              user: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true,
                  role: true,
                  specialization: true,
                  patientProfile: {
                    select: {
                      idNumber: true,
                      department: true,
                      bloodType: true,
                      allergies: true,
                      medicalConditions: true,
                    },
                  },
                },
              },
            },
          },
        },
      });

      const otherUser = conversation?.participants.find((p) => p.userId !== user.id)?.user;

      const messages = await prisma.message.findMany({
        where: { conversationId: conversationId! },
        orderBy: { createdAt: "asc" },
        include: {
          sender: {
            select: { id: true, firstName: true, lastName: true, role: true },
          },
        },
      });

      // Update caller's lastReadAt and mark messages read
      await prisma.conversationParticipant.update({
        where: {
          conversationId_userId: {
            conversationId: conversationId!,
            userId: user.id,
          },
        },
        data: { lastReadAt: new Date() },
      });

      await prisma.message.updateMany({
        where: {
          conversationId: conversationId!,
          senderId: { not: user.id },
          isRead: false,
        },
        data: { isRead: true, readAt: new Date() },
      });

      const formattedMessages = messages.map((m) => ({
        id: m.id,
        conversationId: m.conversationId,
        senderId: m.senderId,
        senderName:
          m.sender.role === "DOCTOR"
            ? `Dr. ${m.sender.firstName} ${m.sender.lastName}`
            : `${m.sender.firstName} ${m.sender.lastName}`,
        senderRole: m.sender.role,
        isOwn: m.senderId === user.id,
        content: m.content,
        isRead: m.isRead,
        createdAt: m.createdAt.toISOString(),
      }));

      sendJson(res, 200, {
        conversationId: conversationId!,
        otherParticipant: otherUser
          ? {
              id: otherUser.id,
              name:
                otherUser.role === "DOCTOR"
                  ? `Dr. ${otherUser.firstName} ${otherUser.lastName}`
                  : `${otherUser.firstName} ${otherUser.lastName}`,
              role: otherUser.role,
              specialization:
                otherUser.specialization ||
                (otherUser.role === "PATIENT" ? "Student / Patient" : "Infirmary Staff"),
              idNumber: otherUser.patientProfile?.idNumber || null,
              department: otherUser.patientProfile?.department || null,
              bloodType: otherUser.patientProfile?.bloodType || null,
              allergies: otherUser.patientProfile?.allergies || null,
              medicalConditions: otherUser.patientProfile?.medicalConditions || null,
            }
          : null,
        messages: formattedMessages,
      });
      return;
    } catch (err: any) {
      console.error("GET /messages/conversations/:id error:", err);
      sendJson(res, 500, { message: err.message || "Failed to load messages" });
      return;
    }
  }

  // 6. POST /messages/conversations/:id/messages - Send a message with broadcast trigger
  const sendMessageMatch = pathname.match(/^\/messages\/conversations\/([a-zA-Z0-9_-]+)\/messages$/);
  if (req.method === "POST" && sendMessageMatch) {
    const conversationId = sendMessageMatch[1];
    try {
      const body = await readJsonBody(req);
      const { content } = body;

      if (!content || !content.trim()) {
        sendJson(res, 400, { message: "Message content cannot be empty" });
        return;
      }

      // Verify participant
      const participant = await prisma.conversationParticipant.findUnique({
        where: {
          conversationId_userId: {
            conversationId: conversationId!,
            userId: user.id,
          },
        },
      });

      if (!participant) {
        sendJson(res, 403, { message: "Access denied to post to this conversation" });
        return;
      }

      const createdMsg = await prisma.message.create({
        data: {
          conversationId: conversationId!,
          senderId: user.id,
          content: content.trim(),
          messageType: "TEXT",
          isRead: false,
        },
        include: {
          sender: {
            select: { id: true, firstName: true, lastName: true, role: true },
          },
        },
      });

      await prisma.conversation.update({
        where: { id: conversationId! },
        data: { updatedAt: new Date() },
      });

      await prisma.conversationParticipant.update({
        where: {
          conversationId_userId: {
            conversationId: conversationId!,
            userId: user.id,
          },
        },
        data: { lastReadAt: new Date() },
      });

      // Broadcast event to Supabase Realtime channel
      try {
        const channel = supabase.channel(`conversation:${conversationId}`);
        void channel.send({
          type: "broadcast",
          event: "new_message",
          payload: {
            id: createdMsg.id,
            conversationId: createdMsg.conversationId,
            senderId: createdMsg.senderId,
            content: createdMsg.content,
            createdAt: createdMsg.createdAt.toISOString(),
          },
        });
      } catch {
        // Fallback polling will maintain real-time sync
      }

      sendJson(res, 201, {
        id: createdMsg.id,
        conversationId: createdMsg.conversationId,
        senderId: createdMsg.senderId,
        senderName:
          createdMsg.sender.role === "DOCTOR"
            ? `Dr. ${createdMsg.sender.firstName} ${createdMsg.sender.lastName}`
            : `${createdMsg.sender.firstName} ${createdMsg.sender.lastName}`,
        senderRole: createdMsg.sender.role,
        isOwn: true,
        content: createdMsg.content,
        isRead: false,
        createdAt: createdMsg.createdAt.toISOString(),
      });
      return;
    } catch (err: any) {
      console.error("POST /messages/conversations/:id/messages error:", err);
      sendJson(res, 500, { message: err.message || "Failed to send message" });
      return;
    }
  }

  sendJson(res, 404, { message: "Endpoint not found" });
}
