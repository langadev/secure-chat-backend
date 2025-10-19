// src/controllers/auth.controller.ts
import { prisma } from "../lib/prisma.js";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { z } from "zod";
import {
  initUserKeys,
  getUserPublicKey,
  getUserPrivateKey,
} from "../crypto/keyManager.js"; // 🔐 integração com módulo de chaves

const cookieOpts = () => {
  const isProd = process.env.NODE_ENV === "production";
  return {
    httpOnly: true,
    sameSite: isProd ? ("none" as const) : ("lax" as const),
    secure: isProd,
    path: "/",
    maxAge: 60 * 60 * 24 * 30, // 30 dias
  };
};

function signAccess(user: { id: string; role?: string | null }) {
  return jwt.sign(
    { id: user.id, role: user.role || "USER" },
    process.env.JWT_ACCESS_SECRET as string,
    { expiresIn: "15m" }
  );
}

function signRefresh(user: { id: string }) {
  return jwt.sign({ id: user.id }, process.env.JWT_REFRESH_SECRET as string, {
    expiresIn: "30d",
  });
}

// ==========================================================
// 🔹 REGISTAR UTILIZADOR
// ==========================================================
export async function register(req: any, res: any) {
  try {
    const schema = z.object({
      name: z.string().min(1),
      email: z.string().email(),
      password: z.string().min(8),
    });

    const { name, email, password } = schema.parse(req.body);

    const exists = await prisma.user.findUnique({ where: { email } });
    if (exists) return res.status(409).json({ error: "EMAIL_IN_USE" });

    // 🔐 Hash da password
    const hash = await bcrypt.hash(password, 10);

    // 🔐 Cria o utilizador
    const user = await prisma.user.create({
      data: { name, email, password: hash },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        isActive: true,
      },
    });

    // 🔑 Gera e guarda chaves RSA (pública + privada cifrada)
    await initUserKeys(user.id, password);

    // 🔁 Auto-login
    const accessToken = signAccess(user);
    const refreshToken = signRefresh(user);

    await prisma.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash: await bcrypt.hash(refreshToken, 10),
        expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 30),
      },
    });

    res.cookie("refreshToken", refreshToken, cookieOpts());
    return res.json({
      user,
      accessToken,
      message: "Conta criada com sucesso e chaves RSA geradas",
    });
  } catch (error: any) {
    console.error("❌ Erro no registo:", error);
    return res.status(500).json({ error: "Erro interno no registo" });
  }
}

// ==========================================================
// 🔹 LOGIN
// ==========================================================
export async function login(req: any, res: any) {
  try {
    const schema = z.object({
      email: z.string().email(),
      password: z.string().min(8),
    });

    const { email, password } = schema.parse(req.body);

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || !user.password)
      return res.status(401).json({ error: "INVALID_CREDENTIALS" });

    const ok = await bcrypt.compare(password, user.password);
    if (!ok) return res.status(401).json({ error: "INVALID_CREDENTIALS" });

    const publicUser = {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      isActive: user.isActive,
    };

    // 🔐 Tokens JWT
    const accessToken = signAccess(publicUser);
    const refreshToken = signRefresh(publicUser);

    await prisma.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash: await bcrypt.hash(refreshToken, 10),
        expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 30),
      },
    });

    res.cookie("refreshToken", refreshToken, cookieOpts());

    // 🔑 opcional: envia chave pública (para E2E)
    const publicKey = await getUserPublicKey(user.id);

    return res.json({
      user: publicUser,
      accessToken,
      publicKey,
      message: "Login efetuado com sucesso",
    });
  } catch (error: any) {
    console.error("❌ Erro no login:", error);
    return res.status(500).json({ error: "Erro interno no login" });
  }
}

// ==========================================================
// 🔹 REFRESH TOKEN
// ==========================================================
export async function refresh(req: any, res: any) {
  try {
    const token = req.cookies?.refreshToken;
    if (!token) return res.status(401).json({ error: "NO_REFRESH_TOKEN" });

    const payload = jwt.verify(
      token,
      process.env.JWT_REFRESH_SECRET as string
    ) as any;
    const user = await prisma.user.findUnique({ where: { id: payload.id } });
    if (!user) return res.status(404).json({ error: "USER_NOT_FOUND" });

    // opcional: validar refresh na tabela (hash + validade)
    const tokens = await prisma.refreshToken.findMany({
      where: { userId: user.id },
    });
    const match = await Promise.all(
  tokens.map(async (t) => {
    if (!t.tokenHash || typeof t.tokenHash !== "string") return false;
    return bcrypt.compare(token, t.tokenHash);
  })
);

    if (!match.some(Boolean))
      return res.status(401).json({ error: "INVALID_REFRESH" });

    const publicUser = {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      isActive: user.isActive,
    };
    const accessToken = signAccess(publicUser);

    return res.json({ user: publicUser, accessToken });
  } catch (e) {
    console.error("Erro em /auth/refresh:", e);
    return res.status(500).json({ error: "Erro interno em refresh" });
  }
}

// ==========================================================
// 🔹 TOKEN PARA WEBSOCKET
// ==========================================================
export async function wsToken(req: any, res: any) {
  const user = await prisma.user.findUnique({ where: { id: req.userId! } });
  if (!user) return res.status(404).json({ error: "USER_NOT_FOUND" });
  const publicUser = { id: user.id, role: user.role };
  const accessToken = signAccess(publicUser);
  return res.json({ accessToken });
}

// ==========================================================
// 🔹 LOGOUT
// ==========================================================
export async function logout(req: any, res: any) {
  try {
    const token = req.cookies?.refreshToken;
    if (token) {
      const tokens = await prisma.refreshToken.findMany({});
      for (const t of tokens) {
        if (await bcrypt.compare(token, t.tokenHash)) {
          await prisma.refreshToken.delete({ where: { id: t.id } });
        }
      }
    }
  } catch (err) {
    console.error("Erro ao sair:", err);
  }
  res.clearCookie("refreshToken", cookieOpts());
  return res.json({ ok: true });
}

// ==========================================================
// 🔹 LOGOUT DE TODAS AS SESSÕES
// ==========================================================
export async function logoutAll(req: any, res: any) {
  if (!req.userId) return res.status(401).json({ error: "UNAUTHORIZED" });
  await prisma.refreshToken.deleteMany({ where: { userId: req.userId } });
  res.clearCookie("refreshToken", cookieOpts());
  return res.json({ ok: true });
}
