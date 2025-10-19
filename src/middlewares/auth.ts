// src/middlewares/auth.ts
import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

declare global {
  namespace Express {
    interface Request {
      userId?: string;
      userRole?: string;
    }
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: "NO_TOKEN" });

  try {
    const payload = jwt.verify(token, process.env.JWT_ACCESS_SECRET as string) as any;
    req.userId = payload.id || payload.sub;
    req.userRole = payload.role;
    if (!req.userId) return res.status(401).json({ error: "INVALID_TOKEN" });
    next();
  } catch (e) {
    return res.status(401).json({ error: "INVALID_TOKEN" });
  }
}
