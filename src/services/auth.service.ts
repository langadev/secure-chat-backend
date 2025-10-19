import { Request, Response } from "express";
import * as authService from "../services/auth.service.js"; // o ficheiro que enviaste
import cookieParser from "cookie-parser";

const isProd = process.env.NODE_ENV === "production";

// opções padrão do cookie de refresh
const cookieOptions = {
  httpOnly: true,
  sameSite: isProd ? "none" as const : "lax" as const,
  secure: isProd, // true apenas em HTTPS
  path: "/",
  maxAge: 1000 * 60 * 60 * 24 * 30, // 30 dias
};

export async function register(req: Request, res: Response) {
  try {
    const { email, name, password } = req.body;
    const user = await authService.register({ email, name, password });
    return res.status(201).json({ user });
  } catch (err: any) {
    console.error("❌ Register error:", err);
    return res.status(400).json({ error: err.message || "Erro no registo" });
  }
}

export async function login(req: Request, res: Response) {
  try {
    const { email, password } = req.body;
    const { accessToken, refreshToken, user } = await authService.login(email, password);

    // salva o refresh token no cookie
    res.cookie("refreshToken", refreshToken, cookieOptions);

    // devolve o accessToken para o frontend guardar
    return res.json({ user, accessToken });
  } catch (err: any) {
    console.error("❌ Login error:", err);
    return res.status(401).json({ error: err.message || "Credenciais inválidas" });
  }
}

export async function refresh(req: Request, res: Response) {
  try {
    const token = req.cookies?.refreshToken;
    if (!token) return res.status(401).json({ error: "NO_REFRESH_TOKEN" });

    const { accessToken, refreshToken, user } = await authService.refresh(token);

    // substitui cookie com novo refresh
    res.cookie("refreshToken", refreshToken, cookieOptions);

    // devolve o novo access token para o Zustand
    return res.json({ user, accessToken });
  } catch (err: any) {
    console.error("❌ Refresh error:", err);
    return res.status(401).json({ error: err.message || "Refresh rejeitado" });
  }
}

export async function logoutAll(req: Request, res: Response) {
  try {
    const userId = req.userId!;
    await authService.logoutAll(userId);
    res.clearCookie("refreshToken", cookieOptions);
    return res.json({ ok: true });
  } catch (err: any) {
    return res.status(400).json({ error: "Erro ao terminar sessões" });
  }
}
