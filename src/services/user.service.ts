import * as repo from "../repositories/user.repo.js";
import { createUserSchema, updateUserSchema } from "../schemas/user.schemas.js";

export async function list() {
  return repo.list();
}

export async function getById(id: string) {
  const user = await repo.getById(id);
  if (!user) throw new Error("USER_NOT_FOUND");
  return user;
}

export async function create(payload: unknown) {
  const data = createUserSchema.parse(payload);
  const exists = await repo.getByEmail(data.email);
  if (exists) throw new Error("EMAIL_IN_USE");
  return repo.create(data);
}

export async function update(id: string, payload: unknown) {
  const data = updateUserSchema.parse(payload);
  // impedir duplicação de email
  if (data.email) {
    const other = await repo.getByEmail(data.email);
    if (other && other.id !== id) throw new Error("EMAIL_IN_USE");
  }
  await getById(id); // lança se não existir
  return repo.update(id, data);
}

export async function remove(id: string) {
  await getById(id); // lança se não existir
  return repo.remove(id);
}
