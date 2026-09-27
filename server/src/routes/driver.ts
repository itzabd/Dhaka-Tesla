import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/authenticate';
import { requireRole } from '../middleware/requireRole';
import {
  setOnlineStatus,
  listEligibleRequests,
  DriverVehicleMissingError,
  ActivePoolBlocksOfflineError,
} from '../services/driverService';

export const driverRouter = Router();

const onlineSchema = z.object({
  isOnline: z.boolean(),
});

driverRouter.patch(
  '/online',
  authenticate,
  requireRole('DRIVER'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({ error: { code: 'UNAUTHENTICATED' } });
        return;
      }

      const parseResult = onlineSchema.safeParse(req.body);
      if (!parseResult.success) {
        res.status(400).json({
          error: {
            code: 'VALIDATION_ERROR',
            detail: parseResult.error.issues[0]?.message || 'Validation error',
          },
        });
        return;
      }

      try {
        const result = await setOnlineStatus({
          driverId: req.user.userId,
          isOnline: parseResult.data.isOnline,
        });

        res.status(200).json({
          vehicleId: result.vehicleId,
          name: result.name,
          isOnline: result.isOnline,
        });
      } catch (err) {
        if (err instanceof DriverVehicleMissingError) {
          res.status(404).json({ error: { code: 'VEHICLE_NOT_FOUND' } });
          return;
        }
        if (err instanceof ActivePoolBlocksOfflineError) {
          res.status(409).json({
            error: {
              code: 'DRIVER_HAS_ACTIVE_POOL',
              detail: 'Cannot go offline while a pool is active',
            },
          });
          return;
        }
        throw err;
      }
    } catch (err) {
      next(err);
    }
  }
);

driverRouter.get(
  '/requests',
  authenticate,
  requireRole('DRIVER'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({ error: { code: 'UNAUTHENTICATED' } });
        return;
      }

      try {
        const rows = await listEligibleRequests({
          driverId: req.user.userId,
        });

        res.status(200).json({ data: rows });
      } catch (err) {
        if (err instanceof DriverVehicleMissingError) {
          res.status(404).json({ error: { code: 'VEHICLE_NOT_FOUND' } });
          return;
        }
        throw err;
      }
    } catch (err) {
      next(err);
    }
  }
);

