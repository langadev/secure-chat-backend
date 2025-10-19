import { z } from "zod";

export const createUserSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1).max(120).optional(),
  password: z.string().min(8),               // valida tamanho; o hash é no service
  role: z.enum(["ADMIN", "MANAGER", "USER"]).optional(),
  phone: z.string().min(7).max(20).optional(),
  isActive: z.boolean().optional(),
});

export const updateUserSchema = z.object({
  email: z.string().email().optional(),
  name: z.string().min(1).max(120).nullable().optional(),
  password: z.string().min(8).optional(),    // se vier, será re-hashada
  role: z.enum(["ADMIN", "MANAGER", "USER"]).optional(),
  phone: z.string().min(7).max(20).nullable().optional(),
  isActive: z.boolean().optional(),
  deletedAt: z.coerce.date().nullable().optional(),
  lastLoginAt: z.coerce.date().nullable().optional(),
});

export type CreateUserInput = z.infer<typeof createUserSchema>;
export type UpdateUserInput = z.infer<typeof updateUserSchema>;
