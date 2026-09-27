import { Request, Response, NextFunction } from 'express';

export function requireRole(role: 'PASSENGER' | 'DRIVER') {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user || req.user.role !== role) {
      res.status(403).json({ error: { code: 'FORBIDDEN' } });
      return;
    }
    next();
  };
}
