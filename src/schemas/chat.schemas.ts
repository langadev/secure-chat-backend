import { z } from "zod";

export const createChatSchema = z.object({
  title: z.string().min(1).max(140).optional(),
  isGroup: z.boolean().default(false),
  participantIds: z.array(z.string().min(1)).min(1),
});

export const addParticipantsSchema = z.object({
  chatId: z.string().min(1),
  userIds: z.array(z.string().min(1)).min(1),
});

export const sendMessageSchema = z.object({
  chatId: z.string().min(1),
  type: z.enum(["TEXT","IMAGE"]).default("TEXT"),
  text: z.string().max(10000).optional(),     // <- payload cifrado
  imageUrl: z.string().url().optional(),
  sha256: z.string().length(64).optional(),   // <- hash do compact
  signature: z.string().optional(),           // <- assinatura b64url
});

export const cursorPageSchema = z.object({
  chatId: z.string().min(1),
  cursor: z.string().nullish(),
  limit: z.coerce.number().min(1).max(100).default(30),
});

export const setTypingSchema = z.object({
  chatId: z.string().min(1),
  isTyping: z.boolean(),
});

export const markReadSchema = z.object({
  chatId: z.string().min(1),
  at: z.coerce.date().optional(),
});
