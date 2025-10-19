import { Server, Socket } from "socket.io";
import jwt from "jsonwebtoken";
import { prisma } from "../lib/prisma.js";

function room(chatId: string) {
  return `chat:${chatId}`;
}
async function isMember(chatId: string, userId: string) {
  const p = await prisma.chatParticipant.findUnique({
    where: { chatId_userId: { chatId, userId } },
    select: { userId: true },
  });
  return !!p;
}
function readAuth(socket: Socket) {
  const hdr =
    (socket.handshake.auth?.token as string | undefined) ||
    (socket.handshake.headers["authorization"] as string | undefined);
  if (!hdr) throw new Error("NO_AUTH");
  const token = hdr.startsWith("Bearer ") ? hdr.slice(7) : hdr;
  const payload = jwt.verify(token, process.env.JWT_ACCESS_SECRET!) as any;
  const userId = payload.id || payload.sub;
  if (!userId) throw new Error("INVALID_TOKEN");
  return { userId };
}

export function initRealtime(server: any) {
  const io = new Server(server, {
    cors: { origin: true, credentials: true },
    path: "/ws",
    transports: ["websocket", "polling"],
  });

  io.use((socket, next) => {
    try { (socket.data as any).auth = readAuth(socket); next(); }
    catch { next(new Error("UNAUTHORIZED")); }
  });

  io.on("connection", async (socket) => {
    const { userId } = (socket.data as any).auth as { userId: string };

    // join explícito
    socket.on("chat:join", async ({ chatId }, ack?: Function) => {
      const ok = await isMember(chatId, userId);
      if (!ok) return ack?.({ error: "NOT_IN_CHAT" });
      socket.join(room(chatId));
      ack?.({ ok: true });
    });

    // enviar mensagem (cifrada)
    socket.on("message:send", async (payload: {
      chatId: string; type?: "TEXT"|"IMAGE";
      text?: string; iv?: string; sha256?: string; signature?: string; imageUrl?: string;
    }, ack?: Function) => {
      try {
        const { chatId } = payload;
        const ok = await isMember(chatId, userId);
        if (!ok) return ack?.({ error: "NOT_IN_CHAT" });
        const type = payload.type ?? "TEXT";

        if (type === "TEXT") {
          if (!payload.text) return ack?.({ error: "EMPTY_TEXT" });
        } else if (type === "IMAGE") {
          if (!payload.imageUrl) return ack?.({ error: "MISSING_IMAGE_URL" });
        }

        const msg = await prisma.message.create({
          data: {
            chatId,
            authorId: userId,
            type,
            text: type === "TEXT" ? payload.text ?? "" : null, // <- ciphertext
            iv: payload.iv ?? null,
            sha256: payload.sha256 ?? null,
            signature: payload.signature ?? null,
            imageUrl: type === "IMAGE" ? payload.imageUrl ?? "" : null,
          },
          select: {
            id: true, chatId: true, authorId: true, type: true,
            text: true, iv: true, sha256: true, signature: true, imageUrl: true,
            createdAt: true,
          },
        });

        await prisma.chat.update({ where: { id: chatId }, data: { lastMessageAt: msg.createdAt } });
        io.to(room(chatId)).emit("message:new", msg);
        ack?.({ ok: true, message: msg });
      } catch (err: any) {
        console.error("❌ message:send error:", err);
        ack?.({ error: "ERROR" });
      }
    });

    // editar/apagar (se precisares)
    socket.on("message:edit", async ({ messageId, text }, ack?: Function) => {
      const existing = await prisma.message.findUnique({ where: { id: messageId } });
      if (!existing || existing.authorId !== userId) return ack?.({ error: "FORBIDDEN" });
      const upd = await prisma.message.update({
        where: { id: messageId },
        data: { text, editedAt: new Date() },
        select: { id: true, chatId: true, text: true, editedAt: true },
      });
      io.to(room(upd.chatId)).emit("message:edited", upd);
      ack?.({ ok: true });
    });

    socket.on("message:delete", async ({ messageId }, ack?: Function) => {
      const existing = await prisma.message.findUnique({ where: { id: messageId } });
      if (!existing || existing.authorId !== userId) return ack?.({ error: "FORBIDDEN" });
      const del = await prisma.message.update({
        where: { id: messageId },
        data: { deletedAt: new Date() },
        select: { id: true, chatId: true, deletedAt: true },
      });
      io.to(room(del.chatId)).emit("message:deleted", { id: del.id, chatId: del.chatId });
      ack?.({ ok: true });
    });
  });

  console.log("[socket.io] realtime ready on /ws");
}
