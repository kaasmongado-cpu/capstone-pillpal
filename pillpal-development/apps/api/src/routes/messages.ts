import type { IncomingMessage, ServerResponse } from "node:http";
import { prisma } from "@pillpal/database";
import { supabase } from "@pillpal/auth";

async function getAuthenticatedUser(req: IncomingMessage) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    return null;
  }
  const token = authHeader.replace("Bearer ", "").trim();
  const { data: { user }, error } = await supabase.auth.getUser(token);
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

  const url = new URL(req.url || "/", "http://localhost:4000");
  const pathname = url.pathname;

  // 1. GET /messages/conversations - List all conversations for the user
  if (req.method === "GET" && pathname === "/messages/conversations") {
    try {
      const userParticipations = await prisma.conversationParticipant.findMany({
        where: { userId: user.id },
        select: { conversationId: true },
      });

      const conversationIds = userParticipations.map((p) => p.conversationId);

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

      const formatted = conversations.map((c) => {
        const otherParticipant = c.participants.find((p) => p.userId !== user.id)?.user;
        const lastMsg = c.messages[0];
        return {
          id: c.id,
          otherParticipant: otherParticipant
            ? {
                id: otherParticipant.id,
                name: otherParticipant.role === "DOCTOR"
                  ? `Dr. ${otherParticipant.firstName} ${otherParticipant.lastName}`
                  : `${otherParticipant.firstName} ${otherParticipant.lastName}`,
                role: otherParticipant.role,
                specialization: otherParticipant.specialization || "Clinical Staff",
              }
            : { id: "clinic", name: "CSU Health Clinic", role: "HEALTH_STAFF", specialization: "Support" },
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
      });

      sendJson(res, 200, formatted);
      return;
    } catch (err: any) {
      console.error("GET /messages/conversations error:", err);
      sendJson(res, 500, { message: err.message || "Failed to load conversations" });
      return;
    }
  }

  // 2. POST /messages/conversations - Start or retrieve a conversation with a provider
  if (req.method === "POST" && pathname === "/messages/conversations") {
    try {
      const body = await readJsonBody(req);
      const { recipientUserId, initialMessage } = body;

      if (!recipientUserId) {
        sendJson(res, 400, { message: "recipientUserId is required" });
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
        // Create new conversation
        const newConvo = await prisma.conversation.create({
          data: {
            participants: {
              create: [{ userId: user.id }, { userId: recipientUserId }],
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
            content: initialMessage,
          },
        });
        await prisma.conversation.update({
          where: { id: conversationId },
          data: { updatedAt: new Date() },
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

  // 3. GET /messages/conversations/:id - Get all messages in conversation
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
        sendJson(res, 403, { message: "Access denied to this conversation" });
        return;
      }

      const messages = await prisma.message.findMany({
        where: { conversationId: conversationId! },
        orderBy: { createdAt: "asc" },
        include: {
          sender: {
            select: { id: true, firstName: true, lastName: true, role: true },
          },
        },
      });

      // Mark unread messages as read
      await prisma.message.updateMany({
        where: {
          conversationId: conversationId!,
          senderId: { not: user.id },
          isRead: false,
        },
        data: { isRead: true, readAt: new Date() },
      });

      const formatted = messages.map((m) => ({
        id: m.id,
        conversationId: m.conversationId,
        senderId: m.senderId,
        senderName: m.sender.role === "DOCTOR"
          ? `Dr. ${m.sender.firstName} ${m.sender.lastName}`
          : `${m.sender.firstName} ${m.sender.lastName}`,
        senderRole: m.sender.role,
        isOwn: m.senderId === user.id,
        content: m.content,
        isRead: m.isRead,
        createdAt: m.createdAt.toISOString(),
      }));

      sendJson(res, 200, formatted);
      return;
    } catch (err: any) {
      console.error("GET /messages/conversations/:id error:", err);
      sendJson(res, 500, { message: err.message || "Failed to load messages" });
      return;
    }
  }

  // 4. POST /messages/conversations/:id/messages - Send a message
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

      const createdMsg = await prisma.message.create({
        data: {
          conversationId: conversationId!,
          senderId: user.id,
          content: content.trim(),
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

      sendJson(res, 201, {
        id: createdMsg.id,
        conversationId: createdMsg.conversationId,
        senderId: createdMsg.senderId,
        senderName: `${createdMsg.sender.firstName} ${createdMsg.sender.lastName}`,
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
