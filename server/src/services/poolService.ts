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

export class PoolNotFoundError extends Error {
  code = 'POOL_NOT_FOUND';
  constructor(message = 'Pool not found') {
    super(message);
    this.name = 'PoolNotFoundError';
  }
}

export class InvalidPoolTransitionError extends Error {
  code = 'INVALID_TRANSITION';
  constructor(message = 'Invalid pool transition') {
    super(message);
    this.name = 'InvalidPoolTransitionError';
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

export async function advancePoolStatus(input: {
  driverId: string;
  poolId: string;
  targetStatus: 'ARRIVED' | 'IN_TRANSIT' | 'COMPLETED';
}): Promise<{
  poolId: string;
  status: 'ARRIVED' | 'IN_TRANSIT' | 'COMPLETED';
  driverArrivedAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
}> {
  let expectedFrom: string;
  let eventType: string;

  if (input.targetStatus === 'ARRIVED') {
    expectedFrom = 'FORMING';
    eventType = 'POOL_ARRIVED';
  } else if (input.targetStatus === 'IN_TRANSIT') {
    expectedFrom = 'ARRIVED';
    eventType = 'POOL_STARTED';
  } else if (input.targetStatus === 'COMPLETED') {
    expectedFrom = 'IN_TRANSIT';
    eventType = 'POOL_COMPLETED';
  } else {
    throw new InvalidPoolTransitionError();
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // LEVEL 1 LOCK: vehicles
    const vehicleResult = await client.query(
      `SELECT id FROM vehicles WHERE driver_id = $1 AND is_active = TRUE FOR UPDATE`,
      [input.driverId]
    );
    if (vehicleResult.rowCount === 0) throw new DriverVehicleMissingError();
    const vehicleId = vehicleResult.rows[0].id;

    // LEVEL 2 LOCK: ride_pools (ownership-scoped)
    const poolResult = await client.query(
      `SELECT id, status FROM ride_pools
       WHERE id = $1 AND vehicle_id = $2
       FOR UPDATE`,
      [input.poolId, vehicleId]
    );
    if (poolResult.rowCount === 0) throw new PoolNotFoundError();
    if (poolResult.rows[0].status !== expectedFrom) throw new InvalidPoolTransitionError();

    // LEVEL 3 LOCK: ride_requests (all active members, UUID ASC)
    await client.query(
      `SELECT id FROM ride_requests
       WHERE id IN (
         SELECT ride_request_id FROM pool_members
         WHERE pool_id = $1 AND status = 'ACTIVE'
       )
       ORDER BY id ASC
       FOR UPDATE`,
      [input.poolId]
    );

    // LEVEL 2 MUTATION: ride_pools
    const updatedResult = await client.query(
      `UPDATE ride_pools
       SET status = $1::vehicle_pool_status,
           driver_arrived_at = CASE WHEN $1::text = 'ARRIVED'    THEN NOW() ELSE driver_arrived_at END,
           started_at        = CASE WHEN $1::text = 'IN_TRANSIT' THEN NOW() ELSE started_at END,
           completed_at      = CASE WHEN $1::text = 'COMPLETED'  THEN NOW() ELSE completed_at END
       WHERE id = $2
       RETURNING status, driver_arrived_at, started_at, completed_at`,
      [input.targetStatus, input.poolId]
    );
    const updated = updatedResult.rows[0];

    // LEVEL 3 MUTATION: ride_requests (passengers)
    await client.query(
      `UPDATE ride_requests
       SET status = CASE $1::text
                      WHEN 'IN_TRANSIT' THEN 'IN_PROGRESS'::passenger_request_status
                      WHEN 'COMPLETED'  THEN 'COMPLETED'::passenger_request_status
                      ELSE status
                    END,
           completed_at = CASE WHEN $1::text = 'COMPLETED' THEN NOW() ELSE completed_at END
       WHERE id IN (
         SELECT ride_request_id FROM pool_members
         WHERE pool_id = $2 AND status = 'ACTIVE'
       )`,
      [input.targetStatus, input.poolId]
    );

    // LEVEL 5 MUTATION: ride_events (one event per active passenger)
    await client.query(
      `INSERT INTO ride_events (actor_user_id, ride_request_id, pool_id, pool_member_id,
                                event_type, from_status, to_status)
       SELECT $1, pm.ride_request_id, $2, pm.id,
              $3, $4, $5
       FROM pool_members pm
       WHERE pm.pool_id = $2 AND pm.status = 'ACTIVE'`,
      [input.driverId, input.poolId, eventType, expectedFrom, input.targetStatus]
    );

    await client.query('COMMIT');

    return {
      poolId: input.poolId,
      status: updated.status,
      driverArrivedAt: updated.driver_arrived_at
        ? (updated.driver_arrived_at instanceof Date ? updated.driver_arrived_at.toISOString() : String(updated.driver_arrived_at))
        : null,
      startedAt: updated.started_at
        ? (updated.started_at instanceof Date ? updated.started_at.toISOString() : String(updated.started_at))
        : null,
      completedAt: updated.completed_at
        ? (updated.completed_at instanceof Date ? updated.completed_at.toISOString() : String(updated.completed_at))
        : null,
    };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function cancelActivePool(input: {
  driverId: string;
  poolId: string;
}): Promise<{
  poolId: string;
  cancelledAt: string;
  affectedRequests: Array<{ requestId: string; passengerName: string; newStatus: 'WAITING' }>;
}> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // LEVEL 1 LOCK: vehicles
    const vehicleResult = await client.query(
      `SELECT id FROM vehicles WHERE driver_id = $1 AND is_active = TRUE FOR UPDATE`,
      [input.driverId]
    );
    if (vehicleResult.rowCount === 0) throw new DriverVehicleMissingError();
    const vehicleId = vehicleResult.rows[0].id;

    // LEVEL 2 LOCK: ride_pools (ownership-scoped)
    const poolResult = await client.query(
      `SELECT id, status FROM ride_pools
       WHERE id = $1 AND vehicle_id = $2
       FOR UPDATE`,
      [input.poolId, vehicleId]
    );
    if (poolResult.rowCount === 0) throw new PoolNotFoundError();
    if (!['FORMING', 'ARRIVED'].includes(poolResult.rows[0].status)) {
      throw new InvalidPoolTransitionError();
    }

    // LEVEL 3 LOCK: ride_requests (all active members, UUID ASC)
    await client.query(
      `SELECT id FROM ride_requests
       WHERE id IN (
         SELECT ride_request_id FROM pool_members
         WHERE pool_id = $1 AND status = 'ACTIVE'
       )
       ORDER BY id ASC
       FOR UPDATE`,
      [input.poolId]
    );

    // LEVEL 2 MUTATION: ride_pools
    const cancelledPoolResult = await client.query(
      `UPDATE ride_pools SET status = 'CANCELLED', cancelled_at = NOW()
       WHERE id = $1
       RETURNING cancelled_at`,
      [input.poolId]
    );
    const cancelledAt = cancelledPoolResult.rows[0].cancelled_at instanceof Date
      ? cancelledPoolResult.rows[0].cancelled_at.toISOString()
      : String(cancelledPoolResult.rows[0].cancelled_at);

    // LEVEL 4 + LEVEL 3 + LEVEL 5 via CTE chain.
    const affectedResult = await client.query(
      `WITH cancelled_members AS (
         UPDATE pool_members
         SET status = 'CANCELLED', cancelled_at = NOW()
         WHERE pool_id = $1 AND status = 'ACTIVE'
         RETURNING id, ride_request_id
       ),
       reverted_requests AS (
         UPDATE ride_requests
         SET status = 'WAITING', cancelled_at = NULL
         WHERE id IN (SELECT ride_request_id FROM cancelled_members)
         RETURNING id
       ),
       audit AS (
         INSERT INTO ride_events (actor_user_id, ride_request_id, pool_id, pool_member_id,
                                  event_type, from_status, to_status)
         SELECT $2, cm.ride_request_id, $1, cm.id,
                'DRIVER_CANCELLED_POOL', 'MATCHED', 'WAITING'
         FROM cancelled_members cm
         RETURNING ride_request_id
       )
       SELECT cm.ride_request_id, u.full_name AS passenger_name
       FROM cancelled_members cm
       JOIN ride_requests r ON r.id = cm.ride_request_id
       JOIN users u ON u.id = r.passenger_id`,
      [input.poolId, input.driverId]
    );

    await client.query('COMMIT');

    const affectedRequests = affectedResult.rows.map((r) => ({
      requestId: r.ride_request_id as string,
      passengerName: r.passenger_name as string,
      newStatus: 'WAITING' as const,
    }));

    return {
      poolId: input.poolId,
      cancelledAt,
      affectedRequests,
    };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}


