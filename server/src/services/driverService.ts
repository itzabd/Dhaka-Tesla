import { pool } from '../config/db';
import { shortestDistanceKm, Zone } from '../domain/routes';

export class DriverVehicleMissingError extends Error {
  code = 'VEHICLE_NOT_FOUND';
  constructor(message = 'Vehicle not found for driver') {
    super(message);
    this.name = 'DriverVehicleMissingError';
  }
}

export class ActivePoolBlocksOfflineError extends Error {
  code = 'DRIVER_HAS_ACTIVE_POOL';
  constructor(message = 'Cannot go offline while a pool is active') {
    super(message);
    this.name = 'ActivePoolBlocksOfflineError';
  }
}

async function resolveVehicleId(driverId: string): Promise<string> {
  const result = await pool.query(
    'SELECT id FROM vehicles WHERE driver_id = $1 AND is_active = TRUE',
    [driverId]
  );
  if (result.rowCount === 0) throw new DriverVehicleMissingError();
  return result.rows[0].id;
}

export async function setOnlineStatus(input: {
  driverId: string;
  isOnline: boolean;
}): Promise<{ vehicleId: string; name: string; isOnline: boolean }> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // LEVEL 1 LOCK: driver's vehicle
    const vehicleRes = await client.query(
      'SELECT id, name FROM vehicles WHERE driver_id = $1 AND is_active = TRUE FOR UPDATE',
      [input.driverId]
    );

    if (vehicleRes.rowCount === 0) {
      await client.query('ROLLBACK');
      throw new DriverVehicleMissingError();
    }

    const vehicle = vehicleRes.rows[0];

    // Check for active pool (we hold the vehicle lock)
    const poolRes = await client.query(
      `SELECT id FROM ride_pools
       WHERE vehicle_id = $1
         AND status IN ('FORMING', 'ARRIVED', 'IN_TRANSIT')
       LIMIT 1`,
      [vehicle.id]
    );

    if ((poolRes.rowCount ?? 0) > 0 && !input.isOnline) {
      await client.query('ROLLBACK');
      throw new ActivePoolBlocksOfflineError();
    }

    await client.query(
      'UPDATE vehicles SET is_online = $1 WHERE id = $2',
      [input.isOnline, vehicle.id]
    );

    await client.query('COMMIT');

    return {
      vehicleId: vehicle.id,
      name: vehicle.name,
      isOnline: input.isOnline,
    };
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch {
      // ignore rollback errors if connection died
    }
    throw err;
  } finally {
    client.release();
  }
}

export async function listEligibleRequests(input: {
  driverId: string;
}): Promise<Array<{
  id: string;
  passengerName: string;
  pickupZone: string;
  dropoffZone: string;
  requestedSeats: number;
  provisionalPooledFarePoysha: number;
  createdAt: string;
}>> {
  const vehicleId = await resolveVehicleId(input.driverId);

  const poolRes = await pool.query(
    `SELECT id, status, initial_pickup_zone, pickup_to_farthest_km, occupied_seats, total_capacity
     FROM ride_pools
     WHERE vehicle_id = $1 AND status = 'FORMING'
     LIMIT 1`,
    [vehicleId]
  );

  if (poolRes.rowCount === 0) {
    const reqRes = await pool.query(
      `SELECT r.id, u.full_name AS passenger_name, r.pickup_zone, r.dropoff_zone,
              r.requested_seats, r.provisional_pooled_fare_poysha, r.created_at
       FROM ride_requests r
       JOIN users u ON r.passenger_id = u.id
       WHERE r.status = 'WAITING'
       ORDER BY r.created_at ASC
       LIMIT 50`
    );

    return reqRes.rows.map((row) => ({
      id: row.id,
      passengerName: row.passenger_name,
      pickupZone: row.pickup_zone,
      dropoffZone: row.dropoff_zone,
      requestedSeats: row.requested_seats,
      provisionalPooledFarePoysha: row.provisional_pooled_fare_poysha,
      createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : new Date(row.created_at).toISOString(),
    }));
  }

  const activePool = poolRes.rows[0];

  const candidateRes = await pool.query(
    `SELECT r.id, u.full_name AS passenger_name, r.pickup_zone, r.dropoff_zone,
            r.requested_seats, r.provisional_pooled_fare_poysha, r.created_at
     FROM ride_requests r
     JOIN users u ON r.passenger_id = u.id
     WHERE r.status = 'WAITING'
       AND r.pickup_zone = $1
     ORDER BY r.created_at ASC
     LIMIT 50`,
    [activePool.initial_pickup_zone]
  );

  const filtered = candidateRes.rows.filter((candidate) => {
    const distanceOk =
      shortestDistanceKm(
        activePool.initial_pickup_zone as Zone,
        candidate.dropoff_zone as Zone
      ) <= activePool.pickup_to_farthest_km;
    const capacityOk =
      activePool.occupied_seats + candidate.requested_seats <= activePool.total_capacity;
    return distanceOk && capacityOk;
  });

  return filtered.map((row) => ({
    id: row.id,
    passengerName: row.passenger_name,
    pickupZone: row.pickup_zone,
    dropoffZone: row.dropoff_zone,
    requestedSeats: row.requested_seats,
    provisionalPooledFarePoysha: row.provisional_pooled_fare_poysha,
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : new Date(row.created_at).toISOString(),
  }));
}

export async function getCurrentPool(input: {
  driverId: string;
}): Promise<{
  vehicle: { id: string; name: string; capacity: number; isOnline: boolean };
  pool: null | {
    id: string;
    status: string;
    initialPickupZone: string;
    farthestDropoffZone: string;
    pickupToFarthestKm: number;
    occupiedSeats: number;
    totalCapacity: number;
    driverArrivedAt: string | null;
    startedAt: string | null;
    completedAt: string | null;
    createdAt: string;
    passengers: Array<{
      requestId: string;
      passengerName: string;
      pickupZone: string;
      dropoffZone: string;
      seatCount: number;
      individualFarePoysha: number;
    }>;
  };
}> {
  const vehicleRes = await pool.query(
    'SELECT id, name, capacity, is_online FROM vehicles WHERE driver_id = $1 AND is_active = TRUE',
    [input.driverId]
  );

  if (vehicleRes.rowCount === 0) throw new DriverVehicleMissingError();

  const vehicleRow = vehicleRes.rows[0];
  const vehicle = {
    id: vehicleRow.id,
    name: vehicleRow.name,
    capacity: vehicleRow.capacity,
    isOnline: vehicleRow.is_online,
  };

  const poolRes = await pool.query(
    `SELECT id, status, initial_pickup_zone, farthest_dropoff_zone, pickup_to_farthest_km,
            occupied_seats, total_capacity, driver_arrived_at, started_at, completed_at, created_at
     FROM ride_pools
     WHERE vehicle_id = $1 AND status IN ('FORMING', 'ARRIVED', 'IN_TRANSIT')
     LIMIT 1`,
    [vehicle.id]
  );

  if (poolRes.rowCount === 0) {
    return { vehicle, pool: null };
  }

  const pRow = poolRes.rows[0];

  const passRes = await pool.query(
    `SELECT pm.ride_request_id AS request_id, u.full_name AS passenger_name,
            r.pickup_zone, r.dropoff_zone, pm.seat_count, pm.individual_fare_poysha
     FROM pool_members pm
     JOIN ride_requests r ON pm.ride_request_id = r.id
     JOIN users u ON r.passenger_id = u.id
     WHERE pm.pool_id = $1 AND pm.status = 'ACTIVE'
     ORDER BY pm.joined_at ASC, pm.id ASC`,
    [pRow.id]
  );

  const passengers = passRes.rows.map((p) => ({
    requestId: p.request_id,
    passengerName: p.passenger_name,
    pickupZone: p.pickup_zone,
    dropoffZone: p.dropoff_zone,
    seatCount: p.seat_count,
    individualFarePoysha: p.individual_fare_poysha,
  }));

  return {
    vehicle,
    pool: {
      id: pRow.id,
      status: pRow.status,
      initialPickupZone: pRow.initial_pickup_zone,
      farthestDropoffZone: pRow.farthest_dropoff_zone,
      pickupToFarthestKm: pRow.pickup_to_farthest_km,
      occupiedSeats: pRow.occupied_seats,
      totalCapacity: pRow.total_capacity,
      driverArrivedAt: pRow.driver_arrived_at
        ? (pRow.driver_arrived_at instanceof Date ? pRow.driver_arrived_at.toISOString() : new Date(pRow.driver_arrived_at).toISOString())
        : null,
      startedAt: pRow.started_at
        ? (pRow.started_at instanceof Date ? pRow.started_at.toISOString() : new Date(pRow.started_at).toISOString())
        : null,
      completedAt: pRow.completed_at
        ? (pRow.completed_at instanceof Date ? pRow.completed_at.toISOString() : new Date(pRow.completed_at).toISOString())
        : null,
      createdAt: pRow.created_at instanceof Date ? pRow.created_at.toISOString() : new Date(pRow.created_at).toISOString(),
      passengers,
    },
  };
}

export async function listDriverHistory(input: {
  driverId: string;
  limit: number;
  cursorCreatedAt?: string;
  cursorPoolId?: string;
}): Promise<{
  rows: Array<{
    poolId: string;
    status: string;
    initialPickupZone: string;
    farthestDropoffZone: string;
    occupiedSeats: number;
    totalCapacity: number;
    totalFareCollectedPoysha: number;
    passengerCount: number;
    passengerNames: string[];
    createdAt: string;
    completedAt: string | null;
    cancelledAt: string | null;
  }>;
  nextCursor: { createdAt: string; poolId: string } | null;
}> {
  const vehicleId = await resolveVehicleId(input.driverId);

  let query = `
    SELECT p.id AS pool_id, p.status, p.initial_pickup_zone, p.farthest_dropoff_zone,
           p.occupied_seats, p.total_capacity, p.created_at, p.completed_at, p.cancelled_at,
           sub.total_fare, sub.passenger_count, sub.passenger_names
    FROM ride_pools p
    LEFT JOIN LATERAL (
      SELECT
        COALESCE(
          SUM(CASE WHEN pm.status = 'ACTIVE'
                   THEN pm.individual_fare_poysha * pm.seat_count
                   ELSE 0 END), 0
        )::int AS total_fare,
        COUNT(*)::int AS passenger_count,
        COALESCE(ARRAY_AGG(u.full_name ORDER BY pm.joined_at), '{}') AS passenger_names
      FROM pool_members pm
      JOIN ride_requests r ON pm.ride_request_id = r.id
      JOIN users u ON r.passenger_id = u.id
      WHERE pm.pool_id = p.id
    ) sub ON TRUE
    WHERE p.vehicle_id = $1
      AND p.status IN ('COMPLETED', 'CANCELLED')
  `;

  const params: any[] = [vehicleId];

  if (input.cursorCreatedAt && input.cursorPoolId) {
    params.push(input.cursorCreatedAt, input.cursorPoolId);
    query += ` AND (p.created_at, p.id) < ($2, $3)`;
    params.push(input.limit + 1);
    query += ` ORDER BY p.created_at DESC, p.id DESC LIMIT $4`;
  } else {
    params.push(input.limit + 1);
    query += ` ORDER BY p.created_at DESC, p.id DESC LIMIT $2`;
  }

  const result = await pool.query(query, params);
  let rows = result.rows;

  let nextCursor: { createdAt: string; poolId: string } | null = null;
  if (rows.length > input.limit) {
    rows = rows.slice(0, input.limit);
    const last = rows[rows.length - 1];
    nextCursor = {
      createdAt: last.created_at instanceof Date ? last.created_at.toISOString() : new Date(last.created_at).toISOString(),
      poolId: last.pool_id,
    };
  }

  const mappedRows = rows.map((r) => ({
    poolId: r.pool_id,
    status: r.status,
    initialPickupZone: r.initial_pickup_zone,
    farthestDropoffZone: r.farthest_dropoff_zone,
    occupiedSeats: r.occupied_seats,
    totalCapacity: r.total_capacity,
    totalFareCollectedPoysha: r.total_fare,
    passengerCount: r.passenger_count,
    passengerNames: r.passenger_names || [],
    createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : new Date(r.created_at).toISOString(),
    completedAt: r.completed_at
      ? (r.completed_at instanceof Date ? r.completed_at.toISOString() : new Date(r.completed_at).toISOString())
      : null,
    cancelledAt: r.cancelled_at
      ? (r.cancelled_at instanceof Date ? r.cancelled_at.toISOString() : new Date(r.cancelled_at).toISOString())
      : null,
  }));

  return {
    rows: mappedRows,
    nextCursor,
  };
}
