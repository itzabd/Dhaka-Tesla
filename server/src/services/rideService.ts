import { pool } from '../config/db';
import { ALL_ZONES, Zone, shortestDistanceKm } from '../domain/routes';
import { calculateFare, MAX_VEHICLE_CAPACITY } from '../domain/fare';

export class InvalidZoneError extends Error {
  code = 'VALIDATION_ERROR';
  constructor(message: string = 'Invalid zone pair') {
    super(message);
  }
}

export class InvalidSeatsError extends Error {
  code = 'VALIDATION_ERROR';
  constructor(message: string = 'requestedSeats must be 1-3') {
    super(message);
  }
}

export interface RideRequestRow {
  id: string;
  passengerId: string;
  pickupZone: string;
  dropoffZone: string;
  requestedSeats: number;
  estimatedSoloFarePoysha: number;
  provisionalPooledFarePoysha: number;
  status: 'WAITING' | 'MATCHED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
  createdAt: string;
  completedAt: string | null;
  cancelledAt: string | null;
}

export type CancelReason =
  | 'NOT_FOUND'
  | 'FORBIDDEN'
  | 'INVALID_TRANSITION'
  | 'ALREADY_CANCELLED'
  | 'DATA_INTEGRITY';

export interface PoolInfo {
  id: string;
  status: 'FORMING' | 'ARRIVED' | 'IN_TRANSIT' | 'COMPLETED' | 'CANCELLED';
  occupiedSeats: number;
  totalCapacity: number;
  driverArrivedAt: string | null;
  driver: { fullName: string; vehicleName: string };
}

function mapRow(row: any): RideRequestRow {
  return {
    id: row.id,
    passengerId: row.passenger_id,
    pickupZone: row.pickup_zone,
    dropoffZone: row.dropoff_zone,
    requestedSeats: row.requested_seats,
    estimatedSoloFarePoysha: row.estimated_solo_fare_poysha,
    provisionalPooledFarePoysha: row.provisional_pooled_fare_poysha,
    status: row.status,
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
    completedAt: row.completed_at ? (row.completed_at instanceof Date ? row.completed_at.toISOString() : String(row.completed_at)) : null,
    cancelledAt: row.cancelled_at ? (row.cancelled_at instanceof Date ? row.cancelled_at.toISOString() : String(row.cancelled_at)) : null,
  };
}

export async function createRideRequest(input: {
  passengerId: string;
  pickupZone: string;
  dropoffZone: string;
  requestedSeats: number;
}): Promise<{
  ride: RideRequestRow;
  pricing: {
    distanceKm: number;
    perSeatSoloFarePoysha: number;
    perSeatPooledFarePoysha: number;
    totalPooledFarePoysha: number;
  };
}> {
  if (!ALL_ZONES.includes(input.pickupZone as Zone) || !ALL_ZONES.includes(input.dropoffZone as Zone)) {
    throw new InvalidZoneError();
  }

  if (!Number.isInteger(input.requestedSeats) || input.requestedSeats < 1 || input.requestedSeats > MAX_VEHICLE_CAPACITY) {
    throw new InvalidSeatsError();
  }

  try {
    shortestDistanceKm(input.pickupZone as Zone, input.dropoffZone as Zone);
  } catch {
    throw new InvalidZoneError();
  }

  const fare = calculateFare(input.pickupZone as Zone, input.dropoffZone as Zone, input.requestedSeats);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const result = await client.query(
      `INSERT INTO ride_requests (
        passenger_id, pickup_zone, dropoff_zone, requested_seats,
        estimated_solo_fare_poysha, provisional_pooled_fare_poysha, status
      ) VALUES ($1, $2, $3, $4, $5, $6, 'WAITING')
      RETURNING *`,
      [
        input.passengerId,
        input.pickupZone,
        input.dropoffZone,
        input.requestedSeats,
        fare.soloFarePoysha,
        fare.perSeatFarePoysha,
      ]
    );

    const ride = mapRow(result.rows[0]);

    await client.query(
      `INSERT INTO ride_events (actor_user_id, ride_request_id, event_type, from_status, to_status)
       VALUES ($1, $2, 'RIDE_REQUESTED', NULL, 'WAITING')`,
      [input.passengerId, ride.id]
    );

    await client.query('COMMIT');

    return {
      ride,
      pricing: {
        distanceKm: fare.distanceKm,
        perSeatSoloFarePoysha: fare.soloFarePoysha,
        perSeatPooledFarePoysha: fare.perSeatFarePoysha,
        totalPooledFarePoysha: fare.totalFarePoysha,
      },
    };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function getRideById(input: {
  rideId: string;
  passengerId: string;
}): Promise<
  | { status: 'FOUND'; ride: RideRequestRow & { pool: PoolInfo | null } }
  | { status: 'NOT_FOUND' }
  | { status: 'FORBIDDEN' }
> {
  const checkResult = await pool.query(
    `SELECT passenger_id FROM ride_requests WHERE id = $1`,
    [input.rideId]
  );

  if (checkResult.rowCount === 0) {
    return { status: 'NOT_FOUND' };
  }

  if (checkResult.rows[0].passenger_id !== input.passengerId) {
    return { status: 'FORBIDDEN' };
  }

  const rideResult = await pool.query(
    `SELECT * FROM ride_requests WHERE id = $1`,
    [input.rideId]
  );

  const poolResult = await pool.query(
    `SELECT p.id, p.status, p.occupied_seats, p.total_capacity, p.driver_arrived_at,
            u.full_name AS driver_full_name, v.name AS vehicle_name
     FROM pool_members pm
     JOIN ride_pools p ON pm.pool_id = p.id
     JOIN vehicles v ON p.vehicle_id = v.id
     JOIN users u ON v.driver_id = u.id
     WHERE pm.ride_request_id = $1 AND pm.status = 'ACTIVE'`,
    [input.rideId]
  );

  let poolInfo: PoolInfo | null = null;
  if (poolResult.rowCount && poolResult.rowCount > 0) {
    const pRow = poolResult.rows[0];
    poolInfo = {
      id: pRow.id,
      status: pRow.status,
      occupiedSeats: pRow.occupied_seats,
      totalCapacity: pRow.total_capacity,
      driverArrivedAt: pRow.driver_arrived_at ? (pRow.driver_arrived_at instanceof Date ? pRow.driver_arrived_at.toISOString() : String(pRow.driver_arrived_at)) : null,
      driver: {
        fullName: pRow.driver_full_name,
        vehicleName: pRow.vehicle_name,
      },
    };
  }

  return {
    status: 'FOUND',
    ride: {
      ...mapRow(rideResult.rows[0]),
      pool: poolInfo,
    },
  };
}

export async function cancelRide(input: {
  rideId: string;
  passengerId: string;
}): Promise<
  | { ok: true; cancelledAt: string }
  | { ok: false; reason: CancelReason }
> {
  const checkResult = await pool.query(
    `SELECT passenger_id, status FROM ride_requests WHERE id = $1`,
    [input.rideId]
  );

  if (checkResult.rowCount === 0) {
    return { ok: false, reason: 'NOT_FOUND' };
  }

  const current = checkResult.rows[0];
  if (current.passenger_id !== input.passengerId) {
    return { ok: false, reason: 'FORBIDDEN' };
  }

  if (current.status === 'CANCELLED') {
    return { ok: false, reason: 'ALREADY_CANCELLED' };
  }

  if (current.status === 'IN_PROGRESS' || current.status === 'COMPLETED') {
    return { ok: false, reason: 'INVALID_TRANSITION' };
  }

  if (current.status === 'WAITING') {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const updateRes = await client.query(
        `UPDATE ride_requests
         SET status = 'CANCELLED', cancelled_at = NOW()
         WHERE id = $1 AND passenger_id = $2 AND status = 'WAITING'
         RETURNING cancelled_at`,
        [input.rideId, input.passengerId]
      );

      if ((updateRes.rowCount ?? 0) === 0) {
        await client.query('ROLLBACK');
        return { ok: false, reason: 'ALREADY_CANCELLED' };
      }

      await client.query(
        `INSERT INTO ride_events (actor_user_id, ride_request_id, event_type, from_status, to_status)
         VALUES ($1, $2, 'PASSENGER_CANCELLED', 'WAITING', 'CANCELLED')`,
        [input.passengerId, input.rideId]
      );

      await client.query('COMMIT');
      const cancelledAt = updateRes.rows[0].cancelled_at instanceof Date
        ? updateRes.rows[0].cancelled_at.toISOString()
        : String(updateRes.rows[0].cancelled_at);

      return { ok: true, cancelledAt };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  if (current.status === 'MATCHED') {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const memberRes = await client.query(
        `SELECT pm.id AS member_id, pm.seat_count, p.id AS pool_id,
                p.status AS pool_status, p.vehicle_id
         FROM pool_members pm
         JOIN ride_pools p ON pm.pool_id = p.id
         WHERE pm.ride_request_id = $1 AND pm.status = 'ACTIVE'`,
        [input.rideId]
      );

      if ((memberRes.rowCount ?? 0) === 0) {
        await client.query('ROLLBACK');
        return { ok: false, reason: 'DATA_INTEGRITY' };
      }

      const { member_id, seat_count, pool_id, vehicle_id } = memberRes.rows[0];

      // LEVEL 1 LOCK: vehicles
      await client.query(`SELECT id FROM vehicles WHERE id = $1 FOR UPDATE`, [vehicle_id]);

      // LEVEL 2 LOCK: ride_pools
      const poolLockRes = await client.query(
        `SELECT id, status, occupied_seats FROM ride_pools WHERE id = $1 FOR UPDATE`,
        [pool_id]
      );
      const lockedPoolStatus = poolLockRes.rows[0].status;
      if (['ARRIVED', 'IN_TRANSIT', 'COMPLETED'].includes(lockedPoolStatus)) {
        await client.query('ROLLBACK');
        return { ok: false, reason: 'INVALID_TRANSITION' };
      }

      // LEVEL 3 LOCK: ride_requests
      const reqLockRes = await client.query(
        `SELECT id, status FROM ride_requests WHERE id = $1 FOR UPDATE`,
        [input.rideId]
      );
      const lockedReqStatus = reqLockRes.rows[0].status;
      if (lockedReqStatus === 'CANCELLED') {
        await client.query('ROLLBACK');
        return { ok: false, reason: 'ALREADY_CANCELLED' };
      }
      if (['IN_PROGRESS', 'COMPLETED'].includes(lockedReqStatus)) {
        await client.query('ROLLBACK');
        return { ok: false, reason: 'INVALID_TRANSITION' };
      }
      if (lockedReqStatus === 'WAITING') {
        await client.query('ROLLBACK');
        return { ok: false, reason: 'INVALID_TRANSITION' };
      }

      // LEVEL 4 MUTATION: pool_members
      const pmUpdate = await client.query(
        `UPDATE pool_members
         SET status = 'CANCELLED', cancelled_at = NOW()
         WHERE id = $1 AND status = 'ACTIVE'
         RETURNING id, seat_count`,
        [member_id]
      );
      if ((pmUpdate.rowCount ?? 0) === 0) {
        await client.query('ROLLBACK');
        return { ok: false, reason: 'ALREADY_CANCELLED' };
      }

      // LEVEL 2 MUTATION: ride_pools
      const poolUpdate = await client.query(
        `UPDATE ride_pools
         SET occupied_seats = occupied_seats - $1
         WHERE id = $2
         RETURNING occupied_seats`,
        [seat_count, pool_id]
      );

      if (poolUpdate.rows[0].occupied_seats <= 0) {
        await client.query(
          `UPDATE ride_pools SET status = 'CANCELLED', cancelled_at = NOW() WHERE id = $1`,
          [pool_id]
        );
      }

      // LEVEL 3 MUTATION: ride_requests
      const reqUpdate = await client.query(
        `UPDATE ride_requests
         SET status = 'CANCELLED', cancelled_at = NOW()
         WHERE id = $1
         RETURNING cancelled_at`,
        [input.rideId]
      );

      // LEVEL 5 MUTATION: ride_events
      await client.query(
        `INSERT INTO ride_events (actor_user_id, ride_request_id, pool_id, pool_member_id, event_type, from_status, to_status)
         VALUES ($1, $2, $3, $4, 'PASSENGER_CANCELLED', 'MATCHED', 'CANCELLED')`,
        [input.passengerId, input.rideId, pool_id, member_id]
      );

      await client.query('COMMIT');

      const cancelledAt = reqUpdate.rows[0].cancelled_at instanceof Date
        ? reqUpdate.rows[0].cancelled_at.toISOString()
        : String(reqUpdate.rows[0].cancelled_at);

      return { ok: true, cancelledAt };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  return { ok: false, reason: 'INVALID_TRANSITION' };
}

export async function listRideHistory(input: {
  passengerId: string;
  limit: number;
  cursorCreatedAt?: string;
  cursorId?: string;
}): Promise<{
  rows: RideRequestRow[];
  nextCursor: { createdAt: string; id: string } | null;
}> {
  let result;
  if (input.cursorCreatedAt && input.cursorId) {
    result = await pool.query(
      `SELECT * FROM ride_requests
       WHERE passenger_id = $1 AND (created_at, id) < ($2, $3)
       ORDER BY created_at DESC, id DESC
       LIMIT $4`,
      [input.passengerId, input.cursorCreatedAt, input.cursorId, input.limit + 1]
    );
  } else {
    result = await pool.query(
      `SELECT * FROM ride_requests
       WHERE passenger_id = $1
       ORDER BY created_at DESC, id DESC
       LIMIT $2`,
      [input.passengerId, input.limit + 1]
    );
  }

  let nextCursor: { createdAt: string; id: string } | null = null;
  const rawRows = result.rows;

  if (rawRows.length > input.limit) {
    const items = rawRows.slice(0, input.limit);
    const last = items[items.length - 1];
    nextCursor = {
      createdAt: last.created_at instanceof Date ? last.created_at.toISOString() : String(last.created_at),
      id: last.id,
    };
    return {
      rows: items.map(mapRow),
      nextCursor,
    };
  }

  return {
    rows: rawRows.map(mapRow),
    nextCursor: null,
  };
}
