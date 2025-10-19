import type { Request, Response, NextFunction } from "express";
import { prisma } from "../lib/prisma.js";
import { z } from "zod";
import crypto from "crypto";
import { getIO } from "../realtime/instance.js";

// ====================================================
// 🔐 Helpers para cifragem das chaves AES
// ====================================================



function rsaEncryptForUser(publicKeyPem: string, plaintext: string): string {
  const encrypted = crypto.publicEncrypt(
    {
      key: publicKeyPem,
      padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
      oaepHash: "sha256",
    },
    Buffer.from(plaintext, "utf8"),
  );
  return encrypted.toString("base64");
}

// ====================================================
// 🧩 Schemas Zod
// ====================================================

const createChatSchema = z.object({
  title: z.string().min(1).max(140).optional(),
  isGroup: z.boolean().default(false),
  participantIds: z.array(z.string().min(1)).min(1),
});

const addParticipantsSchema = z.object({
  chatId: z.string().min(1),
  userIds: z.array(z.string().min(1)).min(1),
});

const listMessagesParams = z.object({
  chatId: z.string().min(1),
});

const sendMessageSchema = z.object({
  chatId: z.string().min(1),
  type: z.enum(["TEXT", "IMAGE"]).default("TEXT"),
  text: z.string().max(10000).optional(),
  imageUrl: z.string().url().optional(),
  sha256: z.string().length(64).optional(),
  signature: z.string().optional(),
});

const typingSchema = z.object({
  chatId: z.string().min(1),
  isTyping: z.boolean(),
});

const markReadSchema = z.object({
  chatId: z.string().min(1),
  at: z.coerce.date().optional(),
});

const editMessageSchema = z.object({
  messageId: z.string().min(1),
  text: z.string().min(1).max(5000),
});

function room(chatId: string) {
  return `chat:${chatId}`;
}

// ====================================================
// 🟩 Criar chat (gera AES, partilha chaves, etc.)
// ====================================================

// src/controllers/chat.controller.ts (somente o trecho de gerar e "partilhar" a AES)

function generateAesKeyB64(): string {
  return crypto.randomBytes(32).toString("base64"); // 32 bytes => AES-256
}

export async function createChat(req: Request & { userId?: string }, res: Response, next: NextFunction) {
  try {
    const { title, isGroup, participantIds } = createChatSchema.parse(req.body);
    const createdById = req.userId!;
    const all = Array.from(new Set([createdById, ...participantIds]));

    const chat = await prisma.chat.create({
      data: {
        title: title ?? null,
        isGroup,
        createdById,
        participants: { create: all.map((userId) => ({ userId })) },
      },
      include: {
        participants: { include: { user: { select: { id: true, name: true, email: true, publicKeyPem: true } } } },
      },
    });

    // 🔑 1) Gera a AES-256
    const aesKeyB64 = generateAesKeyB64();

    // 🚧 2) **DEV MODE**: em vez de cifrar com RSA, guarda a própria AES em encAesKeyB64
    //    Assim o front consegue importar a chave e cifrar/decifrar já.
    const chatKeys = chat.participants.map((p) => ({
      chatId: chat.id,
      userId: p.user.id,
      encAesKeyB64: aesKeyB64, // <- direto (DEV) — depois voltas a cifrar com RSA
    }));
    await prisma.chatKey.createMany({ data: chatKeys });

    return res.status(201).json({
      id: chat.id,
      title: chat.title,
      isGroup: chat.isGroup,
      participants: chat.participants,
      chatKeys, // opcional
    });
  } catch (err) {
    next(err);
  }
}


// ====================================================
// 🔹 Obter detalhes de um chat (com chaves E2E)
// ====================================================

export async function getChatById(req: Request & { userId?: string }, res: Response, next: NextFunction) {
  try {
    const chatId = String(req.params.chatId);
    const userId = req.userId!;

    const participant = await prisma.chatParticipant.findUnique({
      where: { chatId_userId: { chatId, userId } },
      select: { userId: true },
    });
    if (!participant) return res.status(403).json({ error: "NOT_IN_CHAT" });

    const chat = await prisma.chat.findUnique({
      where: { id: chatId },
      include: {
        participants: { include: { user: { select: { id: true, name: true, email: true } } } },
        chatKeys: true,
      },
    });
    if (!chat) return res.status(404).json({ error: "CHAT_NOT_FOUND" });

    const myKey = chat.chatKeys.find(k => k.userId === userId);

    return res.json({
      id: chat.id,
      title: chat.title,
      isGroup: chat.isGroup,
      participants: chat.participants,
      myEncryptedAes: myKey?.encAesKeyB64 ?? null, // <- agora é o AES base64 direto
    });
  } catch (err) {
    next(err);
  }
}


// ====================================================
// 🔸 Restante lógica (sem alterações críticas)
// ====================================================

export async function addParticipants(req: Request & { userId?: string }, res: Response, next: NextFunction) {
  try {
    const { chatId, userIds } = addParticipantsSchema.parse(req.body);
    const requesterId = req.userId!;

    const isMember = await prisma.chatParticipant.findUnique({
      where: { chatId_userId: { chatId, userId: requesterId } },
      select: { userId: true },
    });
    if (!isMember) return res.status(403).json({ error: "NOT_IN_CHAT" });

    await prisma.chatParticipant.createMany({
      data: Array.from(new Set(userIds)).map((userId) => ({ chatId, userId })),
      skipDuplicates: true,
    });

    return res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}

export async function myChats(req: Request & { userId?: string }, res: Response, next: NextFunction) {
  try {
    const userId = req.userId!;
    const chats = await prisma.chat.findMany({
      where: { participants: { some: { userId } } },
      select: {
        id: true,
        title: true,
        isGroup: true,
        lastMessageAt: true,
        participants: {
          select: { userId: true, user: { select: { name: true, email: true } } },
        },
      },
      orderBy: [{ lastMessageAt: "desc" }, { updatedAt: "desc" }],
    });

    return res.json(chats);
  } catch (err) {
    next(err);
  }
}

export async function listMessages(req: Request & { userId?: string }, res: Response, next: NextFunction) {
  try {
    const { chatId } = listMessagesParams.parse(req.params);
    const userId = req.userId!;

    const participant = await prisma.chatParticipant.findUnique({
      where: { chatId_userId: { chatId, userId } },
      select: { userId: true },
    });
    if (!participant) return res.status(403).json({ error: "NOT_IN_CHAT" });

    const messages = await prisma.message.findMany({
      where: { chatId },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        chatId: true,
        authorId: true,
        type: true,
        text: true,
        imageUrl: true,
        sha256: true,
        signature: true,
        createdAt: true,
        editedAt: true,
        deletedAt: true,
        author: { select: { id: true, name: true, email: true } },
      },
    });

    return res.json(messages);
  } catch (err) {
    next(err);
  }
}
export async function sendMessage(req: Request & { userId?: string }, res: Response, next: NextFunction) {
  try {
    const { chatId, type, text, imageUrl, sha256, signature } = sendMessageSchema.parse(req.body);
    const userId = req.userId!;

    const isMember = await prisma.chatParticipant.findUnique({
      where: { chatId_userId: { chatId, userId } },
      select: { userId: true },
    });
    if (!isMember) return res.status(403).json({ error: "NOT_IN_CHAT" });

    if (type === "TEXT" && !String(text ?? "").trim()) {
      return res.status(400).json({ error: "EMPTY_TEXT" });
    }
    if (type === "IMAGE" && !imageUrl) {
      return res.status(400).json({ error: "MISSING_IMAGE_URL" });
    }

    const msg = await prisma.message.create({
      data: {
        chatId,
        authorId: userId,
        type,
        text: type === "TEXT" ? (text ?? "") : null, // texto cifrado (E2E)
        imageUrl: type === "IMAGE" ? imageUrl ?? "" : null,
        sha256: sha256 ?? null,
        signature: signature ?? null,
      },
    });

    await prisma.chat.update({
      where: { id: chatId },
      data: { lastMessageAt: msg.createdAt },
    });

    // opcionalmente emite pelo socket
    try {
      const io = getIO();
      io.to(room(chatId)).emit("message:new", msg);
    } catch {}

    return res.json(msg);
  } catch (err) {
    next(err);
  }
}
