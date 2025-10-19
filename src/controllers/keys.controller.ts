import { prisma } from "../lib/prisma.js";
import { z } from "zod";

// POST /api/keys/public  { publicKeyPem: string }
export async function upsertMyPublicKey(req: any, res: any) {
  const sch = z.object({ publicKeyPem: z.string().min(50) });
  const { publicKeyPem } = sch.parse(req.body);
  const userId = req.userId!;
  await prisma.user.update({
    where: { id: userId },
    data: { publicKeyPem },
  });
  return res.json({ ok: true });
}

// GET /api/keys/public/:userId
export async function getPublicKey(req: any, res: any) {
  const userId = req.params.userId as string;
  const u = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, publicKeyPem: true, name: true, email: true },
  });
  if (!u || !u.publicKeyPem) return res.status(404).json({ error: "NO_PUBLIC_KEY" });
  return res.json({ userId: u.id, publicKeyPem: u.publicKeyPem });
}

// POST /api/keys/exchange
// { chatId: string, items: [{ userId: string, encAesKeyB64: string }] }
export async function exchangeChatKeys(req: any, res: any) {
  const sch = z.object({
    chatId: z.string().min(1),
    items: z.array(z.object({
      userId: z.string().min(1),
      encAesKeyB64: z.string().min(16)
    })).min(1),
  });

  const { chatId, items } = sch.parse(req.body);
  const requesterId = req.userId!;

  // só quem é participante pode trocar chaves
  const isMember = await prisma.chatParticipant.findUnique({
    where: { chatId_userId: { chatId, userId: requesterId } },
  });
  if (!isMember) return res.status(403).json({ error: "NOT_IN_CHAT" });

  // upsert por participante
  for (const it of items) {
    await prisma.chatKey.upsert({
      where: { chatId_userId: { chatId, userId: it.userId } },
      create: { chatId, userId: it.userId, encAesKeyB64: it.encAesKeyB64 },
      update: { encAesKeyB64: it.encAesKeyB64 },
    });
  }

  return res.json({ ok: true, count: items.length });
}

// GET /api/keys/chat/:chatId  -> devolve a cópia cifrada da minha AES
export async function getMyEncryptedChatKey(req: any, res: any) {
  const chatId = req.params.chatId as string;
  const userId = req.userId!;

  const isMember = await prisma.chatParticipant.findUnique({
    where: { chatId_userId: { chatId, userId } },
  });
  if (!isMember) return res.status(403).json({ error: "NOT_IN_CHAT" });

  const row = await prisma.chatKey.findUnique({
    where: { chatId_userId: { chatId, userId } },
    select: { encAesKeyB64: true },
  });

  if (!row) return res.status(404).json({ error: "NO_CHAT_KEY" });
  return res.json({ chatId, encAesKeyB64: row.encAesKeyB64 });
}
