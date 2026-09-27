CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

DO $$ BEGIN
  CREATE TYPE user_role AS ENUM ('PASSENGER','DRIVER');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE passenger_request_status AS ENUM ('WAITING','MATCHED','IN_PROGRESS','COMPLETED','CANCELLED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE vehicle_pool_status AS ENUM ('FORMING','ARRIVED','IN_TRANSIT','COMPLETED','CANCELLED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE pool_member_status AS ENUM ('ACTIVE','CANCELLED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE idempotency_status AS ENUM ('PROCESSING','COMPLETED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  full_name VARCHAR(100) NOT NULL,
  phone VARCHAR(20) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role user_role NOT NULL,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS vehicles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  driver_id UUID UNIQUE NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  name VARCHAR(50) NOT NULL,
  model VARCHAR(50) NOT NULL DEFAULT 'Custom Electric 3-Wheeler',
  capacity INT NOT NULL DEFAULT 3 CHECK (capacity > 0),
  is_online BOOLEAN NOT NULL DEFAULT FALSE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS ride_requests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  passenger_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  pickup_zone VARCHAR(50) NOT NULL,
  dropoff_zone VARCHAR(50) NOT NULL,
  requested_seats INT NOT NULL DEFAULT 1 CHECK (requested_seats > 0),
  estimated_solo_fare_poysha INT NOT NULL CHECK (estimated_solo_fare_poysha >= 0),
  provisional_pooled_fare_poysha INT NOT NULL CHECK (provisional_pooled_fare_poysha >= 0),
  status passenger_request_status NOT NULL DEFAULT 'WAITING',
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  completed_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS ride_pools (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  vehicle_id UUID NOT NULL REFERENCES vehicles(id) ON DELETE RESTRICT,
  initial_pickup_zone VARCHAR(50) NOT NULL,
  farthest_dropoff_zone VARCHAR(50) NOT NULL,
  pickup_to_farthest_km INT NOT NULL CHECK (pickup_to_farthest_km >= 0),
  status vehicle_pool_status NOT NULL DEFAULT 'FORMING',
  total_capacity INT NOT NULL CHECK (total_capacity > 0),
  occupied_seats INT NOT NULL DEFAULT 0 CHECK (occupied_seats >= 0),
  driver_arrived_at TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT chk_pool_capacity CHECK (occupied_seats <= total_capacity)
);

CREATE TABLE IF NOT EXISTS pool_members (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  pool_id UUID NOT NULL REFERENCES ride_pools(id) ON DELETE RESTRICT,
  ride_request_id UUID NOT NULL REFERENCES ride_requests(id) ON DELETE RESTRICT,
  status pool_member_status NOT NULL DEFAULT 'ACTIVE',
  seat_count INT NOT NULL CHECK (seat_count > 0),
  individual_fare_poysha INT NOT NULL CHECK (individual_fare_poysha >= 0),
  joined_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  cancelled_at TIMESTAMPTZ,
  CONSTRAINT uq_pool_request_composite UNIQUE (pool_id, ride_request_id)
);

CREATE TABLE IF NOT EXISTS ride_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  actor_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  ride_request_id UUID REFERENCES ride_requests(id) ON DELETE RESTRICT,
  pool_id UUID REFERENCES ride_pools(id) ON DELETE RESTRICT,
  pool_member_id UUID REFERENCES pool_members(id) ON DELETE RESTRICT,
  event_type VARCHAR(50) NOT NULL,
  from_status VARCHAR(50),
  to_status VARCHAR(50) NOT NULL,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT chk_audit_status_validity CHECK (to_status IN ('WAITING','MATCHED','IN_PROGRESS','COMPLETED','CANCELLED','FORMING','ARRIVED','IN_TRANSIT'))
);

CREATE TABLE IF NOT EXISTS idempotency_keys (
  key VARCHAR(255) NOT NULL,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  request_path VARCHAR(255) NOT NULL,
  status idempotency_status NOT NULL DEFAULT 'PROCESSING',
  response_payload JSONB,
  status_code INT,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (key, user_id, request_path)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_one_active_pool_per_vehicle ON ride_pools(vehicle_id) WHERE status IN ('FORMING','ARRIVED','IN_TRANSIT');
CREATE UNIQUE INDEX IF NOT EXISTS idx_one_active_pool_per_request ON pool_members(ride_request_id) WHERE status = 'ACTIVE';
CREATE INDEX IF NOT EXISTS idx_ride_requests_status ON ride_requests(status);
CREATE INDEX IF NOT EXISTS idx_ride_requests_pickup ON ride_requests(pickup_zone);
CREATE INDEX IF NOT EXISTS idx_ride_requests_waiting ON ride_requests(pickup_zone, created_at) WHERE status = 'WAITING';
CREATE INDEX IF NOT EXISTS idx_pool_members_active ON pool_members(pool_id) WHERE status = 'ACTIVE';
CREATE INDEX IF NOT EXISTS idx_ride_events_request_id ON ride_events(ride_request_id);
CREATE INDEX IF NOT EXISTS idx_ride_events_pool_id ON ride_events(pool_id);
CREATE INDEX IF NOT EXISTS idx_idempotency_expires_at ON idempotency_keys(expires_at);
CREATE INDEX IF NOT EXISTS idx_idempotency_status_created ON idempotency_keys(status, created_at);
