import { Request, Response, NextFunction } from 'express';

declare module 'express-serve-static-core' {
  interface Request {
    vkUserId?: number;
  }
}

export const extractVkUserId = (req: Request, res: Response, next: NextFunction) => {
  const userId = req.headers['x-vk-user-id'];
  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized: no x-vk-user-id header' });
  }
  req.vkUserId = Number(userId);
  next();
};