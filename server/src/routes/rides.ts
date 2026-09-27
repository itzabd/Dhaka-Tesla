import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/authenticate';
import { requireRole } from '../middleware/requireRole';
import { idempotency } from '../middleware/idempotency';
import {
  createRideRequest,
  getRideById,
  InvalidZoneError,
  InvalidSeatsError,
} from '../services/rideService';

export const ridesRouter = Router();

// Mirrors MAX_VEHICLE_CAPACITY (3) from domain/fare.ts. Update both if capacity changes.
const createSchema = z.object({
  pickupZone: z.string(),
  dropoffZone: z.string(),
  requestedSeats: z.number().int().min(1).max(3),
});

ridesRouter.post(
  '/',
  authenticate,
  requireRole('PASSENGER'),
  idempotency,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({ error: { code: 'UNAUTHENTICATED' } });
        return;
      }

      const parseResult = createSchema.safeParse(req.body);
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
        const { ride, pricing } = await createRideRequest({
          passengerId: req.user.userId,
          pickupZone: parseResult.data.pickupZone,
          dropoffZone: parseResult.data.dropoffZone,
          requestedSeats: parseResult.data.requestedSeats,
        });

        res.status(201).json({
          id: ride.id,
          passengerId: ride.passengerId,
          pickupZone: ride.pickupZone,
          dropoffZone: ride.dropoffZone,
          requestedSeats: ride.requestedSeats,
          status: ride.status,
          createdAt: ride.createdAt,
          pricing: {
            distanceKm: pricing.distanceKm,
            perSeatSoloFarePoysha: pricing.perSeatSoloFarePoysha,
            perSeatPooledFarePoysha: pricing.perSeatPooledFarePoysha,
            totalPooledFarePoysha: pricing.totalPooledFarePoysha,
            currency: 'POYSHA',
          },
        });
      } catch (err) {
        if (err instanceof InvalidZoneError) {
          res.status(400).json({
            error: { code: 'VALIDATION_ERROR', detail: 'Invalid zone pair' },
          });
          return;
        }
        if (err instanceof InvalidSeatsError) {
          res.status(400).json({
            error: { code: 'VALIDATION_ERROR', detail: 'requestedSeats must be 1-3' },
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

ridesRouter.get(
  '/:id',
  authenticate,
  requireRole('PASSENGER'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({ error: { code: 'UNAUTHENTICATED' } });
        return;
      }

      const result = await getRideById({
        rideId: req.params.id,
        passengerId: req.user.userId,
      });

      if (result.status === 'NOT_FOUND') {
        res.status(404).json({ error: { code: 'RIDE_NOT_FOUND' } });
        return;
      }

      if (result.status === 'FORBIDDEN') {
        res.status(403).json({ error: { code: 'FORBIDDEN' } });
        return;
      }

      const ride = result.ride;
      res.status(200).json({
        id: ride.id,
        pickupZone: ride.pickupZone,
        dropoffZone: ride.dropoffZone,
        requestedSeats: ride.requestedSeats,
        status: ride.status,
        createdAt: ride.createdAt,
        completedAt: ride.completedAt,
        cancelledAt: ride.cancelledAt,
        pricing: {
          perSeatPooledFarePoysha: ride.provisionalPooledFarePoysha,
          totalPooledFarePoysha: ride.provisionalPooledFarePoysha * ride.requestedSeats,
          currency: 'POYSHA',
        },
        pool: ride.pool,
      });
    } catch (err) {
      next(err);
    }
  }
);

export default ridesRouter;
