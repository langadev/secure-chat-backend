import jwt from "jsonwebtoken";
import { env } from "../config/env.js";

type JwtPayloadBase = { sub: string; ver: string; role?: string };
export function signAccessToken(user: { id: string; role?: string }) {
  const payload: JwtPayloadBase = { sub: user.id, ver: env.TOKEN_VERSION, role: user.role };
  return jwt.sign(payload, env.ACCESS_SECRET, { expiresIn: env.ACCESS_EXPIRES });
}

export function signRefreshToken(user: { id: string; role?: string }) {
  const payload: JwtPayloadBase = { sub: user.id, ver: env.TOKEN_VERSION, role: user.role };
  return jwt.sign(payload, env.REFRESH_SECRET, { expiresIn: env.REFRESH_EXPIRES });
}

export function verifyAccess(token: string) {
  return jwt.verify(token, env.ACCESS_SECRET) as JwtPayloadBase & jwt.JwtPayload;
}
export function verifyRefresh(token: string) {
  return jwt.verify(token, env.REFRESH_SECRET) as JwtPayloadBase & jwt.JwtPayload;
}
