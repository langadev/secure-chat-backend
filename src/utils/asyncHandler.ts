import type { Request, Response, NextFunction } from "express";


type Fn = (req: Request, res: Response, next: NextFunction) => Promise<any>;
export const asyncHandler = (fn: Fn) => (req: Request, res: Response, next: NextFunction) => {
Promise.resolve(fn(req, res, next)).catch(next);
};