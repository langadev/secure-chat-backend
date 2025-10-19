import { Router } from "express";
import { requireAuth } from "../middlewares/auth.js";
import * as keysCtrl from "../controllers/keys.controller.js";

const r = Router();

// Grava/atualiza a pública do próprio
r.post("/public", requireAuth, keysCtrl.upsertMyPublicKey);

// Obtém a pública de alguém
r.get("/public/:userId", requireAuth, keysCtrl.getPublicKey);

// Envia chaves de sessão cifradas para os membros
r.post("/exchange", requireAuth, keysCtrl.exchangeChatKeys);

// Busca a minha cópia cifrada da AES do chat
r.get("/chat/:chatId", requireAuth, keysCtrl.getMyEncryptedChatKey);

export default r;

