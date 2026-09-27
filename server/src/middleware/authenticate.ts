import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { verifyToken } from '../services/authService';

export function authenticate(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    res.status(401).json({ error: { code: 'UNAUTHENTICATED' } });
    return;
  }
  const token = header.slice(7);
  try {
    req.user = verifyToken(token);
    next();
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) {
      res.status(401).json({ error: { code: 'TOKEN_EXPIRED' } });
    } else {
      res.status(401).json({ error: { code: 'UNAUTHENTICATED' } });
    }
  }
}
