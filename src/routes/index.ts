import { Router } from "express";
import authRoutes from "./auth.routes.js";
import * as userCtrl from "../controllers/user.controller.js";
import { requireAuth } from "../middlewares/auth.js";
import chats from "./chat.routes.js";
import keysRoutes from "./keys.routes.js";
import uploadRoutes from "./upload.routes.js";
const router = Router();

router.get("/health", (_req, res) => res.json({ ok: true }));

router.use("/auth", authRoutes);
router.use("/chat", chats);
router.use("/keys", keysRoutes);
router.use("/upload", uploadRoutes);


// Exemplo: proteger rotas de users
router.get("/users", requireAuth, userCtrl.list);
router.get("/users/:id", requireAuth, userCtrl.get);
router.post("/users", requireAuth, userCtrl.create);
router.put("/users/:id", requireAuth, userCtrl.update);
router.delete("/users/:id", requireAuth, userCtrl.remove);

export default router;
