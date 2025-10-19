import {
  createChatSchema, addParticipantsSchema, sendMessageSchema,
  cursorPageSchema, setTypingSchema, markReadSchema
} from "../schemas/chat.schemas.js";
import { prisma } from "../lib/prisma.js";
import { getIO } from "../realtime/instance.js"; // opcional: emitir via HTTP

export async function createChatService(userId: string, payload: unknown) {
  const data = createChatSchema.parse(payload);

  // 1–1 precisa exatamente 1 participante além do criador
  if (!data.isGroup && data.participantIds.length !== 1) {
    throw new Error("ONE_TO_ONE_NEEDS_ONE_PARTICIPANT");
  }

  const all = Array.from(new Set([userId, ...data.participantIds]));
  const chat = await prisma.chat.create({
    data: {
      title: data.isGroup ? (data.title ?? null) : null,
      isGroup: data.isGroup,
      createdById: userId,
      participants: { create: all.map(uid => ({ userId: uid, isAdmin: uid === userId })) }
    },
    include: { participants: { include: { user: true } } }
  });

  return chat;
}

export async function addParticipantsService(userId: string, payload: unknown) {
  const data = addParticipantsSchema.parse(payload);

  // (opcional) validar se userId é admin do chat
  const admin = await prisma.chatParticipant.findUnique({
    where: { chatId_userId: { chatId: data.chatId, userId } },
    select: { isAdmin: true }
  });
  if (!admin?.isAdmin) throw new Error("FORBIDDEN");

  return prisma.$transaction(async (tx) => {
    const existing = await tx.chatParticipant.findMany({ where: { chatId: data.chatId } });
    const toAdd = data.userIds.filter(uid => !existing.some(p => p.userId === uid));
    if (!toAdd.length) return existing;
    await tx.chatParticipant.createMany({ data: toAdd.map(u => ({ chatId: data.chatId, userId: u })) });
    return tx.chatParticipant.findMany({ where: { chatId: data.chatId }, include: { user: true } });
  });
}

export function listMyChatsService(userId: string) {
  return prisma.chat.findMany({
    where: { participants: { some: { userId } } },
    orderBy: { lastMessageAt: "desc" },
    include: {
      participants: { include: { user: true } },
      _count: { select: { messages: true } }
    }
  });
}

export async function sendMessageService(userId: string, payload: unknown) {
  const data = sendMessageSchema.parse(payload);

  // precisa ser membro do chat
  const member = await prisma.chatParticipant.findUnique({
    where: { chatId_userId: { chatId: data.chatId, userId } },
    select: { chatId: true }
  });
  if (!member) throw new Error("NOT_IN_CHAT");

  if (data.type === "TEXT" && (!data.text || !data.text.trim())) throw new Error("EMPTY_TEXT");
  if (data.type === "IMAGE" && (!data.imageUrl || !data.imageUrl.trim())) throw new Error("MISSING_IMAGE_URL");

  const msg = await prisma.message.create({
    data: {
      chatId: data.chatId,
      authorId: userId,
      type: data.type,
      text: data.type === "TEXT" ? data.text ?? "" : null,
      imageUrl: data.type === "IMAGE" ? data.imageUrl ?? "" : null,
      sha256: data.sha256 ?? null,
      signature: data.signature ?? null,
    },
    select: {
      id: true, chatId: true, authorId: true, type: true,
      text: true, imageUrl: true, createdAt: true
    }
  });

  await prisma.chat.update({ where: { id: data.chatId }, data: { lastMessageAt: msg.createdAt } });

  // Emite em tempo real (se Socket.IO estiver inicializado)
  try { getIO().to(`chat:${data.chatId}`).emit("message:new", msg); } catch {}

  return msg;
}

export function pageMessagesService(userId: string, payload: unknown) {
  const data = cursorPageSchema.parse(payload);
  // (opcional) checar se userId é membro do chat
  return prisma.message.findMany({
    where: { chatId: data.chatId },
    orderBy: { createdAt: "desc" },
    take: data.limit,
    ...(data.cursor ? { skip: 1, cursor: { id: data.cursor } } : {}),
    select: {
      id: true, chatId: true, authorId: true, type: true,
      text: true, imageUrl: true, createdAt: true, editedAt: true, deletedAt: true,
    }
  });
}

export async function setTypingService(userId: string, payload: unknown) {
  const data = setTypingSchema.parse(payload);
  const part = await prisma.chatParticipant.findUnique({
    where: { chatId_userId: { chatId: data.chatId, userId } }, select: { chatId: true }
  });
  if (!part) throw new Error("NOT_IN_CHAT");

  const upd = await prisma.chatParticipant.update({
    where: { chatId_userId: { chatId: data.chatId, userId } }, data: { isTyping: data.isTyping }
  });

  try { getIO().to(`chat:${data.chatId}`).emit("typing:update", { chatId: data.chatId, userId, isTyping: data.isTyping }); } catch {}
  return upd;
}

export async function markReadService(userId: string, payload: unknown) {
  const data = markReadSchema.parse(payload);
  const part = await prisma.chatParticipant.findUnique({
    where: { chatId_userId: { chatId: data.chatId, userId } }, select: { chatId: true }
  });
  if (!part) throw new Error("NOT_IN_CHAT");

  const ts = data.at ?? new Date();
  const upd = await prisma.chatParticipant.update({
    where: { chatId_userId: { chatId: data.chatId, userId } }, data: { lastReadAt: ts }
  });

  try { getIO().to(`chat:${data.chatId}`).emit("read:update", { chatId: data.chatId, userId, at: ts.toISOString() }); } catch {}
  return upd;
}

export async function editMessageService(userId: string, messageId: string, text: string) {
  const m = await prisma.message.findUnique({ where: { id: messageId } });
  if (!m || m.authorId !== userId) throw new Error("FORBIDDEN");
  const upd = await prisma.message.update({
    where: { id: messageId },
    data: { text, editedAt: new Date() },
    select: { id: true, chatId: true, text: true, editedAt: true }
  });
  try { getIO().to(`chat:${upd.chatId}`).emit("message:edited", upd); } catch {}
  return upd;
}

export async function deleteMessageService(userId: string, messageId: string) {
  const m = await prisma.message.findUnique({ where: { id: messageId } });
  if (!m || m.authorId !== userId) throw new Error("FORBIDDEN");
  const del = await prisma.message.update({
    where: { id: messageId },
    data: { deletedAt: new Date() },
    select: { id: true, chatId: true, deletedAt: true }
  });
  try { getIO().to(`chat:${del.chatId}`).emit("message:deleted", del); } catch {}
  return del;
}
