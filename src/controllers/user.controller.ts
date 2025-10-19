import type { Request, Response } from "express";
import { asyncHandler } from "../utils/asyncHandler.js";
import * as service from "../services/user.service.js";

export const list = asyncHandler(async (_req: Request, res: Response) => {
  const users = await service.list();
  res.json(users);
});

export const get = asyncHandler(async (req: Request, res: Response) => {
  const user = await service.getById(req.params.id);
  res.json(user);
});

export const create = asyncHandler(async (req: Request, res: Response) => {
  const user = await service.create(req.body);
  res.status(201).json(user);
});

export const update = asyncHandler(async (req: Request, res: Response) => {
  const user = await service.update(req.params.id, req.body);
  res.json(user);
});

export const remove = asyncHandler(async (req: Request, res: Response) => {
  await service.remove(req.params.id);
  res.status(204).send();
});
