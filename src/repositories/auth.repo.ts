import { prisma } from "../lib/prisma.js";

export const saveRefreshTokenHash = (userId: string, tokenHash: string, expiresAt: Date) =>
  prisma.refreshToken.create({ data: { userId, tokenHash, expiresAt } });

export const revokeRefreshToken = (id: string) =>
  prisma.refreshToken.update({ where: { id }, data: { revokedAt: new Date() } });

export const revokeAllUserTokens = (userId: string) =>
  prisma.refreshToken.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });

export const findValidRefreshToken = (userId: string, tokenHash: string) =>
  prisma.refreshToken.findFirst({
    where: {
      userId,
      tokenHash,
      revokedAt: null,
      expiresAt: { gt: new Date() },
    },
  });
