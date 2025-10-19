import { prisma } from "../lib/prisma.js";
import type { CreateUserInput, UpdateUserInput } from "../schemas/user.schemas.js";

export const list = (activeOnly = true) =>
  prisma.user.findMany({
    where: activeOnly ? { deletedAt: null, isActive: true } : { deletedAt: null },
    orderBy: { createdAt: "desc" },
  });

export const getById = (id: string) =>
  prisma.user.findUnique({ where: { id } });

export const getByEmail = (email: string) =>
  prisma.user.findUnique({ where: { email } });

export const create = (data: CreateUserInput & { password: string }) =>
  prisma.user.create({ data });

export const update = (id: string, data: UpdateUserInput & { password?: string }) =>
  prisma.user.update({ where: { id }, data });

export const remove = (id: string) =>
  prisma.user.delete({ where: { id } }); // usar apenas se quiseres hard delete
