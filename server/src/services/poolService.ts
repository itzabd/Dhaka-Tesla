import { pool } from '../config/db';
import { shortestDistanceKm, Zone } from '../domain/routes';
import { DriverVehicleMissingError } from './driverService';

// Re-export so route handlers can import from one place
export { DriverVehicleMissingError };

export class DriverOfflineError extends Error {
  code = 'DRIVER_OFFLINE';
  constructor(message = 'Driver must be online to accept rides') {
    super(message);
    this.name = 'DriverOfflineError';
  }
}

export class RideRequestNotFoundError extends Error {
  code = 'RIDE_NOT_FOUND';
  constructor(message = 'Ride request not found') {
    super(message);
    this.name = 'RideRequestNotFoundError';
  }
}

export class RequestNotWaitingError extends Error {
  code = 'INVALID_TRANSITION';
  constructor(message = 'Request is no longer available') {
    super(message);
    this.name = 'RequestNotWaitingError';
  }
}

export class PoolCapacityExceededError extends Error {
  code = 'CAPACITY_EXCEEDED';
  constructor(message = 'Bullet has only 1 seat remaining') {
    super(message);
    this.name = 'PoolCapacityExceededError';
  }
}

export class PoolRouteIncompatibleError extends Error {
  code = 'INCOMPATIBLE_ROUTE';
  constructor(message = 'Dropoff extends beyond active trip') {
    super(message);
    this.name = 'PoolRouteIncompatibleError';
  }
}

export async function acceptPassengerIntoPool(input: {
  driverId: string;
  rideRequestId: string;
}): Promise<{
  poolId: string;
  occupiedSeats: number;
  totalCapacity: number;
  individualFarePoysha: number;
}> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // LEVEL 1 LOCK: vehicles
    const vehicleRes = await client.query(
      `SELECT id, capacity, is_online
       FROM vehicles
       WHERE driver_id = $1 AND is_active = TRUE
       FOR UPDATE`,
      [input.driverId]
    );

    if (vehicleRes.rowCount === 0) {
      await client.query('ROLLBACK');
      throw new DriverVehicleMissingError();
    }

    const vehicle = vehicleRes.rows[0];

    if (!vehicle.is_online) {
      await client.query('ROLLBACK');
      throw new DriverOfflineError();
    }

    // LEVEL 2 LOCK: active FORMING pool for this vehicle
    const existingPoolRes = await client.query(
      `SELECT id, total_capacity, occupied_seats, initial_pickup_zone,
              farthest_dropoff_zone, pickup_to_farthest_km, status
       FROM ride_pools
       WHERE vehicle_id = $1 AND status = 'FORMING'
       FOR UPDATE`,
      [vehicle.id]
    );

    const existingPool = (existingPoolRes.rowCount ?? 0) > 0 ? existingPoolRes.rows[0] : null;

    // LEVEL 3 LOCK: ride_requests
    const reqRes = await client.query(
      `SELECT id, status, pickup_zone, dropoff_zone, requested_seats,
              provisional_pooled_fare_poysha, passenger_id
       FROM ride_requests
       WHERE id = $1
       FOR UPDATE`,
      [input.rideRequestId]
    );

    if (reqRes.rowCount === 0) {
      await client.query('ROLLBACK');
      throw new RideRequestNotFoundError();
    }

    const request = reqRes.rows[0];

    if (request.status !== 'WAITING') {
      await client.query('ROLLBACK');
      throw new RequestNotWaitingError();
    }

    // AFTER Level 3 lock, compute in application code (still inside transaction):
    const requestDistanceKm = shortestDistanceKm(
      request.pickup_zone as Zone,
      request.dropoff_zone as Zone
    );

    let poolId: string;
    let poolTotalCapacity: number;
    let poolOccupiedSeats: number;
    let poolInitialPickup: string;
    let poolFarthestDropoff: string;
    let poolPickupToFarthestKm: number;

    if (!existingPool) {
      const newPoolRes = await client.query(
        `INSERT INTO ride_pools (
           vehicle_id, initial_pickup_zone, farthest_dropoff_zone,
           pickup_to_farthest_km, status, total_capacity, occupied_seats
         )
         VALUES ($1, $2, $3, $4, 'FORMING', $5, 0)
         RETURNING id, total_capacity, occupied_seats, initial_pickup_zone,
                   farthest_dropoff_zone, pickup_to_farthest_km`,
        [
          vehicle.id,
          request.pickup_zone,
          request.dropoff_zone,
          requestDistanceKm,
          vehicle.capacity,
        ]
      );
      const newPool = newPoolRes.rows[0];
      poolId = newPool.id;
      poolTotalCapacity = newPool.total_capacity;
      poolOccupiedSeats = newPool.occupied_seats;
      poolInitialPickup = newPool.initial_pickup_zone;
      poolFarthestDropoff = newPool.farthest_dropoff_zone;
      poolPickupToFarthestKm = newPool.pickup_to_farthest_km;
    } else {
      poolId = existingPool.id;
      poolTotalCapacity = existingPool.total_capacity;
      poolOccupiedSeats = existingPool.occupied_seats;
      poolInitialPickup = existingPool.initial_pickup_zone;
      poolFarthestDropoff = existingPool.farthest_dropoff_zone;
      poolPickupToFarthestKm = existingPool.pickup_to_farthest_km;
    }

    // Compatibility checks (application code, in this order):
    // 1. request.pickup_zone === poolInitialPickup
    if (request.pickup_zone !== poolInitialPickup) {
      await client.query('ROLLBACK');
      throw new PoolRouteIncompatibleError();
    }

    // 2. shortestDistanceKm(poolInitialPickup as Zone, request.dropoff_zone as Zone) <= poolPickupToFarthestKm
    const dropoffDistance = shortestDistanceKm(
      poolInitialPickup as Zone,
      request.dropoff_zone as Zone
    );
    if (dropoffDistance > poolPickupToFarthestKm) {
      await client.query('ROLLBACK');
      throw new PoolRouteIncompatibleError();
    }

    // 3. poolOccupiedSeats + request.requested_seats <= poolTotalCapacity
    if (poolOccupiedSeats + request.requested_seats > poolTotalCapacity) {
      await client.query('ROLLBACK');
      throw new PoolCapacityExceededError();
    }

    // LEVEL 4 MUTATION: pool_members
    const memberRes = await client.query(
      `INSERT INTO pool_members (pool_id, ride_request_id, status, seat_count, individual_fare_poysha)
       VALUES ($1, $2, 'ACTIVE', $3, $4)
       RETURNING id`,
      [
        poolId,
        request.id,
        request.requested_seats,
        request.provisional_pooled_fare_poysha,
      ]
    );
    const memberId = memberRes.rows[0].id;

    // LEVEL 4 MUTATION: ride_pools
    const updatePoolRes = await client.query(
      `UPDATE ride_pools
       SET occupied_seats = occupied_seats + $1
       WHERE id = $2
       RETURNING occupied_seats`,
      [request.requested_seats, poolId]
    );
    const newOccupiedSeats = updatePoolRes.rows[0].occupied_seats;

    // LEVEL 3 MUTATION: ride_requests
    await client.query(
      `UPDATE ride_requests
       SET status = 'MATCHED'
       WHERE id = $1`,
      [request.id]
    );

    // LEVEL 5 MUTATION: ride_events
    await client.query(
      `INSERT INTO ride_events (actor_user_id, ride_request_id, pool_id, pool_member_id,
                               event_type, from_status, to_status, metadata)
       VALUES ($1, $2, $3, $4,
               'PASSENGER_ACCEPTED', 'WAITING', 'MATCHED', '{}'::jsonb)`,
      [input.driverId, request.id, poolId, memberId]
    );

    await client.query('COMMIT');

    return {
      poolId,
      occupiedSeats: newOccupiedSeats,
      totalCapacity: poolTotalCapacity,
      individualFarePoysha: request.provisional_pooled_fare_poysha,
    };
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch {}
    throw err;
  } finally {
    client.release();
  }
}
