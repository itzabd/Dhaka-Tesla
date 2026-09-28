# API Reference — Dhaka Tesla Pool

Complete technical specification of REST endpoints for the Dhaka Tesla Pool platform.

---

## Authentication & Headers

Protected endpoints require a Bearer token in the `Authorization` header:

```http
Authorization: Bearer <jwt_token>
```

Mutating state endpoints accept an optional or required `Idempotency-Key` header (UUID v4) to ensure safe retries:

```http
Idempotency-Key: 123e4567-e89b-12d3-a456-426614174000
```

---

## Endpoints

### 1. System Health

#### `GET /health`
Returns service availability, uptime, and database connectivity.
- **Auth**: None
- **Response** (`200 OK`):
  ```json
  {
    "status": "ok",
    "timestamp": "2026-09-28T14:50:00.000Z",
    "uptime": 1245.6
  }
  ```

---

### 2. Authentication

#### `POST /api/auth/register`
Creates a new passenger or driver account.
- **Auth**: None
- **Request Body**:
  ```json
  {
    "fullName": "Nusrat Jahan",
    "phone": "+8801711111111",
    "password": "password123",
    "role": "PASSENGER"
  }
  ```
- **Response** (`201 Created`):
  ```json
  {
    "id": "00000000-0000-0000-0000-000000000002",
    "fullName": "Nusrat Jahan",
    "phone": "+8801711111111",
    "role": "PASSENGER"
  }
  ```

#### `POST /api/auth/login`
Authenticates user and returns an HMAC-SHA256 JWT.
- **Auth**: None
- **Request Body**:
  ```json
  {
    "phone": "+8801711111111",
    "password": "password123"
  }
  ```
- **Response** (`200 OK`):
  ```json
  {
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "user": {
      "id": "00000000-0000-0000-0000-000000000002",
      "fullName": "Nusrat Jahan",
      "role": "PASSENGER"
    }
  }
  ```

---

### 3. Passenger Operations

#### `POST /api/rides`
Submits a ride request with zone corridor and seat count.
- **Auth**: Passenger
- **Header**: `Idempotency-Key: <uuid>`
- **Request Body**:
  ```json
  {
    "pickupZone": "BANANI",
    "dropoffZone": "MOHAKHALI",
    "requestedSeats": 1
  }
  ```
- **Response** (`201 Created`):
  ```json
  {
    "id": "e4f8b2d1-0000-0000-0000-000000000001",
    "passengerId": "00000000-0000-0000-0000-000000000002",
    "pickupZone": "BANANI",
    "dropoffZone": "MOHAKHALI",
    "requestedSeats": 1,
    "status": "REQUESTED",
    "pricing": {
      "distanceKm": 2.5,
      "perSeatSoloFarePoysha": 5000,
      "perSeatPooledFarePoysha": 4000,
      "totalPooledFarePoysha": 4000,
      "currency": "POYSHA"
    }
  }
  ```

#### `GET /api/rides/:id`
Retrieves live status of a specific ride request.
- **Auth**: Passenger (must own the ride)
- **Response** (`200 OK`):
  ```json
  {
    "id": "e4f8b2d1-0000-0000-0000-000000000001",
    "pickupZone": "BANANI",
    "dropoffZone": "MOHAKHALI",
    "requestedSeats": 1,
    "status": "ACCEPTED",
    "pricing": {
      "perSeatPooledFarePoysha": 4000,
      "totalPooledFarePoysha": 4000,
      "currency": "POYSHA"
    },
    "pool": {
      "id": "p001-0000-0000-0000-000000000001",
      "status": "ACCEPTED",
      "vehicleName": "Bullet",
      "driverName": "Jashim Uddin"
    }
  }
  ```

#### `POST /api/rides/:id/cancel`
Cancels an active ride request. Allowed only before driver arrival (`REQUESTED` or `ACCEPTED`).
- **Auth**: Passenger (must own the ride)
- **Header**: `Idempotency-Key: <uuid>`
- **Response** (`200 OK`):
  ```json
  {
    "id": "e4f8b2d1-0000-0000-0000-000000000001",
    "status": "CANCELLED",
    "cancelledAt": "2026-09-28T14:52:00.000Z",
    "refund": {
      "amountPoysha": 0,
      "method": "NONE",
      "reason": "Cash payment — no refund required"
    }
  }
  ```

#### `GET /api/rides/history`
Returns paginated past ride requests for the authenticated passenger.
- **Auth**: Passenger
- **Query Params**: `limit=20`, `cursor=<base64>`
- **Response** (`200 OK`):
  ```json
  {
    "data": [
      {
        "id": "e4f8b2d1-0000-0000-0000-000000000001",
        "pickupZone": "BANANI",
        "dropoffZone": "MOHAKHALI",
        "status": "COMPLETED",
        "createdAt": "2026-09-28T14:00:00.000Z",
        "provisionalPooledFarePoysha": 4000
      }
    ],
    "pagination": {
      "nextCursor": null,
      "hasMore": false
    }
  }
  ```

---

### 4. Driver Operations

#### `PATCH /api/driver/online`
Toggles vehicle online availability status. Blocked if driver is currently in an active pool.
- **Auth**: Driver
- **Request Body**:
  ```json
  {
    "isOnline": true
  }
  ```
- **Response** (`200 OK`):
  ```json
  {
    "id": "v001-0000-0000-0000-000000000001",
    "driverId": "00000000-0000-0000-0000-000000000001",
    "name": "Bullet",
    "capacity": 3,
    "isOnline": true
  }
  ```

#### `GET /api/driver/requests`
Returns available ride requests compatible with the driver's current position and pool corridor.
- **Auth**: Driver
- **Response** (`200 OK`):
  ```json
  {
    "requests": [
      {
        "id": "e4f8b2d1-0000-0000-0000-000000000001",
        "passengerName": "Nusrat Jahan",
        "pickupZone": "BANANI",
        "dropoffZone": "MOHAKHALI",
        "requestedSeats": 1,
        "farePoysha": 4000
      }
    ]
  }
  ```

#### `POST /api/driver/requests/:id/accept`
Atomically accepts a passenger ride request into a new or existing pool.
- **Auth**: Driver
- **Header**: `Idempotency-Key: <uuid>`
- **Response** (`200 OK`):
  ```json
  {
    "poolId": "p001-0000-0000-0000-000000000001",
    "status": "ACCEPTED",
    "occupiedSeats": 1,
    "totalCapacity": 3,
    "members": [
      {
        "rideRequestId": "e4f8b2d1-0000-0000-0000-000000000001",
        "passengerName": "Nusrat Jahan",
        "seatCount": 1,
        "farePoysha": 4000
      }
    ]
  }
  ```

#### `GET /api/driver/pools/current`
Returns the manifest of the driver's current active pool.
- **Auth**: Driver
- **Response** (`200 OK`):
  ```json
  {
    "pool": {
      "id": "p001-0000-0000-0000-000000000001",
      "status": "ACCEPTED",
      "occupiedSeats": 1,
      "totalCapacity": 3,
      "members": [
        {
          "rideRequestId": "e4f8b2d1-0000-0000-0000-000000000001",
          "passengerName": "Nusrat Jahan",
          "seatCount": 1,
          "pickupZone": "BANANI",
          "dropoffZone": "MOHAKHALI",
          "farePoysha": 4000
        }
      ]
    }
  }
  ```

#### `PATCH /api/driver/pools/:id/status`
Advances trip lifecycle state: `ACCEPTED` → `ARRIVED` → `IN_TRANSIT` → `COMPLETED`.
- **Auth**: Driver (must own the pool)
- **Request Body**:
  ```json
  {
    "status": "ARRIVED"
  }
  ```
- **Response** (`200 OK`):
  ```json
  {
    "id": "p001-0000-0000-0000-000000000001",
    "status": "ARRIVED",
    "updatedAt": "2026-09-28T14:55:00.000Z"
  }
  ```

#### `POST /api/driver/pools/:id/cancel`
Cancels the entire pool before departure. Reverts member requests back to `REQUESTED` so other drivers can pick them up.
- **Auth**: Driver (must own the pool)
- **Header**: `Idempotency-Key: <uuid>`
- **Response** (`200 OK`):
  ```json
  {
    "id": "p001-0000-0000-0000-000000000001",
    "status": "CANCELLED",
    "cancelledAt": "2026-09-28T14:56:00.000Z"
  }
  ```

#### `GET /api/driver/history`
Returns trip history for the authenticated driver.
- **Auth**: Driver
- **Query Params**: `limit=20`, `cursor=<base64>`
- **Response** (`200 OK`):
  ```json
  {
    "data": [
      {
        "id": "p001-0000-0000-0000-000000000001",
        "status": "COMPLETED",
        "totalPassengers": 1,
        "totalEarningsPoysha": 4000,
        "completedAt": "2026-09-28T14:30:00.000Z"
      }
    ],
    "pagination": {
      "nextCursor": null,
      "hasMore": false
    }
  }
  ```
