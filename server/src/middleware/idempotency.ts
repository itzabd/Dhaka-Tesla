// Middleware chain order for any route using this middleware:
//   authenticate → requireRole(...) → idempotency
// Handlers guarded by `idempotency` MUST use res.json(...), not res.send(...).
// res.send bypasses the completion hook and leaves the key in PROCESSING forever.

import { Request, Response, NextFunction } from 'express';
import {
  claimIdempotencyKey,
  completeIdempotencyKey,
  releaseIdempotencyKey,
} from '../services/idempotencyService';

export async function idempotency(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const key = req.header('Idempotency-Key');
    if (!key) {
      res.status(400).json({
        error: { code: 'VALIDATION_ERROR', detail: 'Idempotency-Key header required' },
      });
      return;
    }
    if (!req.user) {
      res.status(401).json({ error: { code: 'UNAUTHENTICATED' } });
      return;
    }
    const userId = req.user.userId;
    // baseUrl + path is unique per endpoint; req.path alone loses the mount prefix
    const requestPath = req.baseUrl + req.path;

    const claim = await claimIdempotencyKey({ key, userId, requestPath });

    if (claim.status === 'IN_PROGRESS') {
      res.status(409).json({ error: { code: 'REQUEST_IN_PROGRESS' } });
      return;
    }
    if (claim.status === 'COMPLETED') {
      res.status(claim.statusCode).json(claim.responsePayload);
      return;
    }

    // CLAIMED
    const originalJson = res.json.bind(res);
    res.json = (body: unknown): Response => {
      const statusCode = res.statusCode;
      if (statusCode >= 400) {
        releaseIdempotencyKey({ key, userId, requestPath }).catch(() => undefined);
      } else {
        completeIdempotencyKey({ key, userId, requestPath, statusCode, responsePayload: body }).catch(
          () => undefined
        );
      }
      return originalJson(body);
    };
    next();
  } catch (err) {
    next(err);
  }
}
