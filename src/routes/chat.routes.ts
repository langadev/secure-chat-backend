// src/routes/chat.routes.ts
import { Router } from "express";
import { requireAuth } from "../middlewares/auth.js";
import * as ctrl from "../controllers/chat.controller.js";

const r = Router();

r.post("/", requireAuth, ctrl.createChat);
r.post("/participants", requireAuth, ctrl.addParticipants);
r.get("/mine", requireAuth, ctrl.myChats);

r.post("/message", requireAuth, ctrl.sendMessage);
r.get("/:chatId/messages", requireAuth, ctrl.listMessages);
r.get("/:chatId", requireAuth, ctrl.getChatById);

// r.post("/typing", requireAuth, ctrl.setTyping);
// r.post("/read", requireAuth, ctrl.markRead);

// r.patch("/message/:messageId", requireAuth, ctrl.editMessage);
// r.delete("/message/:messageId", requireAuth, ctrl.deleteMessage);

export default r;
