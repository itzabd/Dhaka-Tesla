# Dhaka Tesla Pool — Urban Electric Rideshare Pooling Platform

Autonomous corridor-based electric rickshaw ride pooling engine for Dhaka, Bangladesh. Built with Node.js, Express, PostgreSQL, and Next.js 14.

---

## 1. Summary

Dhaka Tesla Pool is a ride-pooling MVP for battery-powered three-wheelers ("Teslas") in Dhaka. Passengers request seats, compatible requests are pooled into a shared ride, each passenger pays their own fare, and drivers manage the trip lifecycle — all enforced through ACID database transactions that never overbook the vehicle. In our pilot scenario, driver Jashim operates "Bullet", a 3-seat electric three-wheeler running along the busy Banani–Mohakhali–Farmgate corridor, picking up passengers Nusrat, Rafiq, and Shirin while ensuring safe, atomic state transitions and verifiable split-fare accounting.

---

## 2. Problem Statement

Dhaka’s transport grid suffers from severe congestion, arbitrary spot pricing, and inefficient single-occupancy trips. Battery-powered three-wheelers (locally nicknamed "Teslas") are nimble, green, and ubiquitous, yet operate without structured coordination or transparent pricing:

- **Passengers** need predictable corridor pricing, instant seat booking, and real-time status updates without bargaining.
- **Drivers** want optimal passenger density along high-demand corridors to maximize trip earnings without wandering or running empty.
- **The Coordination Engine** must solve the three-actor concurrency challenge: allowing multiple passengers to book seats along compatible routes while strictly preventing physical overbooking, race conditions, or inconsistent driver assignments amidst spotty mobile connections.

---

## 3. Features Implemented

### Passenger
- Sign up / sign in with stateless JWT authentication.
- Book a ride with real-time client fare preview and fixed corridor presets.
- Live ride tracking with 3-second adaptive polling and tab-visibility power throttling.
- Cancel ride requests while `WAITING` or `MATCHED` with automated cash settlement handling.
- View complete ride history with cursor-based pagination and status filtering.

### Driver
- Sign in with dedicated driver credentials; toggle vehicle availability (`is_online`) with active-pool locks.
- Real-time request inbox showing corridor-compatible passenger requests.
- Atomic accept into a pool: concurrency-enforced capacity tracking (max 3 seats for Bullet).
- Full trip lifecycle management: `ACCEPTED` → `ARRIVED` → `IN_TRANSIT` → `COMPLETED`.
- Emergency pool cancellation before departure reverting passengers cleanly to `WAITING`.
- Driver shift history displaying completed pools and cumulative earnings in poysha.

### System
- Atomic pool creation and join with zero risk of overbooking under concurrent loads.
- Strict 5-level lock hierarchy preventing database deadlocks.
- Distributed idempotency on all mutating endpoints (`Idempotency-Key` header).
- Immutable audit log (`ride_events`) capturing all state transitions and actors.
- Role-partitioned browser storage and CORS-scoped REST API.
- Fully containerized local environment via Docker Compose.
- 107 automated tests covering concurrency, fare engines, state transitions, and auth.

---

## 4. Screenshots / GIFs

### Passenger Book a Ride
![Passenger book](./docs/screenshots/passenger-book.png)

### Passenger Ride Status
![Ride status](./docs/screenshots/passenger-ride.png)

### Driver Dashboard
![Driver dashboard](./docs/screenshots/driver-dashboard.png)


---

## 5. Architecture Diagram

The Dhaka Tesla Pool platform utilizes a three-tier architecture with strict transactional boundaries and an enforced 5-level database locking hierarchy:

```mermaid
graph TB
  subgraph Client["Client Tier (Next.js 14)"]
    P[Passenger Portal]
    D[Driver Cockpit]
    Poll[3s Polling]
  end

  subgraph API["Application Tier (Node.js / Express)"]
    Auth[JWT Auth]
    Idem[Idempotency Middleware]
    Fare[Fare Engine]
    Lock[Lock Manager]
  end

  subgraph Data["Data Tier (PostgreSQL 16)"]
    Req[(ride_requests)]
    Pool[(ride_pools)]
    Mem[(pool_members)]
    Evt[(ride_events)]
    Idk[(idempotency_keys)]
  end

  Client -- REST --> API
  API -- pg driver + FOR UPDATE --> Data

  Lock -.->|L1| V[(vehicles)]
  Lock -.->|L2| Pool
  Lock -.->|L3| Req
  Lock -.->|L4| Mem
  Lock -.->|L5| Evt
```

### Concurrency & Lock Hierarchy Specification

To eliminate deadlock potential under concurrent passenger requests and driver pool joins, the system mandates that row-level locks (`SELECT ... FOR UPDATE`) are acquired strictly in increasing order of precedence:

1. **L1 — `vehicles`**: Locked first by `id` to serialize pool operations per vehicle.
2. **L2 — `ride_pools`**: Locked next by `id` to stabilize pool capacity calculations.
3. **L3 — `ride_requests`**: Locked by `id` (sorted deterministically if locking multiple) to verify state and requested seats.
4. **L4 — `pool_members`**: Locked or inserted to associate requests with pools.
5. **L5 — `ride_events`**: Appended without lock contention to record the immutable transition audit trail.

---

## 6. ERD

The complete schema consists of 7 normalized relational tables modeled in PostgreSQL 16:

```mermaid
erDiagram
  USERS ||--o{ VEHICLES : owns
  USERS ||--o{ RIDE_REQUESTS : places
  USERS ||--o{ RIDE_EVENTS : triggers
  USERS ||--o{ IDEMPOTENCY_KEYS : scopes
  VEHICLES ||--o{ RIDE_POOLS : operates
  RIDE_POOLS ||--o{ POOL_MEMBERS : contains
  RIDE_REQUESTS ||--o| POOL_MEMBERS : allocated
  RIDE_REQUESTS ||--o{ RIDE_EVENTS : audited

  USERS {
    uuid id PK
    string full_name
    string phone UK
    string password_hash
    string role
  }
  VEHICLES {
    uuid id PK
    uuid driver_id FK
    string name
    int capacity
    boolean is_online
  }
  RIDE_REQUESTS {
    uuid id PK
    uuid passenger_id FK
    string pickup_zone
    string dropoff_zone
    int requested_seats
    int provisional_pooled_fare_poysha
    string status
  }
  RIDE_POOLS {
    uuid id PK
    uuid vehicle_id FK
    string initial_pickup_zone
    int total_capacity
    int occupied_seats
    string status
  }
  POOL_MEMBERS {
    uuid id PK
    uuid pool_id FK
    uuid ride_request_id FK
    string status
    int seat_count
    int individual_fare_poysha
  }
  RIDE_EVENTS {
    uuid id PK
    uuid actor_user_id FK
    uuid ride_request_id FK
    uuid pool_id FK
    string event_type
    string to_status
  }
  IDEMPOTENCY_KEYS {
    string key PK
    uuid user_id FK
    string request_path
    string status
  }
```

---

## 7. Tech Stack & Justifications

| Layer | Choice | Realistic Alternative | Why This Choice | Would Switch When |
|---|---|---|---|---|
| **Backend** | Node.js + Express | NestJS, Fastify | Minimal, battle-tested, direct control over SQL transactions | Team grows to 20+ requiring opinionated module abstractions |
| **Frontend** | Next.js 14 App Router | Create React App | React Server Components + file-based routing and SSR | Never |
| **Database** | PostgreSQL 16 | MongoDB, MySQL | ACID for seat capacity invariants, partial unique indexes | Never |
| **DB Access** | `node-postgres` (raw SQL) | Prisma, Drizzle, TypeORM | Explicit row-locking (`FOR UPDATE`) and deadlock auditability | Never (interviews probe locking logic directly) |
| **Auth** | JWT + bcrypt | Session cookies, OAuth | Stateless, zero session-store dependencies, horizontal scaling | If social login or mandatory instant revocation is needed |
| **Validation** | Zod | Joi, Yup | TypeScript-first schema inference and shared validation | Never |
| **Testing** | Jest + Supertest | Vitest, Mocha | Mature ecosystem, comprehensive integration mocking | Never |
| **Logging** | Pino | Winston | High-performance JSON logging with minimal CPU overhead | Never |
| **Container** | Docker Compose | Kubernetes | Single-command local reproducibility without cluster overhead | Multi-node production scaling at 1M+ active users |
| **Hosting (FE)** | Vercel | Netlify, Cloudflare | Seamless Next.js deployment and global Edge CDN | Never |
| **Hosting (BE)** | Render | Fly.io, Railway | Simple Docker deploys, environment isolation | If free-tier cold-starts impact customer demos |
| **Hosting (DB)** | Neon | Supabase, Railway | Serverless Postgres with instant branching and Singapore region | If native Realtime websockets become mandatory |

---

## 8. Project Structure

```
dhaka-tesla-pool/
├── .github/workflows/ci.yml
├── docker-compose.yml
├── .env.example
├── README.md
├── docs/
│   ├── architecture.md
│   ├── erd.md
│   ├── api.md
│   └── screenshots/
│       └── .gitkeep
├── server/
│   ├── Dockerfile
│   ├── src/
│   │   ├── config/
│   │   ├── db/
│   │   ├── domain/
│   │   ├── middleware/
│   │   ├── routes/
│   │   ├── scripts/
│   │   ├── services/
│   │   └── types/
│   └── tests/
└── client/
    ├── Dockerfile
    ├── app/
    │   ├── driver/
    │   ├── passenger/
    │   └── login/
    ├── components/
    └── lib/
```

---

## 9. Prerequisites

Before running the application locally, ensure you have installed:

- **Node.js**: v20.0.0 or higher
- **npm**: v10.0.0 or higher
- **Docker Desktop**: v4.25+ with Docker Compose v2
- Available local ports:
  - `3000` (Next.js Frontend)
  - `4000` (Express Backend API)
  - `5432` (PostgreSQL Database)

---

## 10. Environment Variables

Create `.env` in the root directory (or copy from `.env.example`):

| Variable | Purpose | Required | Example |
|---|---|---|---|
| `DATABASE_URL` | PostgreSQL connection URI | Yes | `postgresql://postgres:postgres@localhost:5432/dhaka_tesla` |
| `JWT_SECRET` | HMAC-SHA256 signature secret (32+ chars) | Yes | `your-super-secret-jwt-key-min-32-chars-long` |
| `JWT_EXPIRES_IN` | Token validity duration | No | `24h` |
| `PORT` | API server listen port | No | `4000` |
| `NODE_ENV` | Runtime environment mode | No | `development` |
| `LOG_LEVEL` | Pino log filter level | No | `info` |
| `CORS_ORIGIN` | Allowed client origin for CORS | Yes (Prod) | `http://localhost:3000` |
| `NEXT_PUBLIC_API_URL` | API endpoint consumed by Next.js | Yes | `http://localhost:4000` |

---

## 11. Local Setup

### Quick Start with Docker Compose

```bash
git clone https://github.com/itzabd/Dhaka-Tesla.git
cd Dhaka-Tesla
cp .env.example .env
docker compose up --build
```

Once initialized, open:
- **Frontend Portal**: [http://localhost:3000](http://localhost:3000)
- **API Health Check**: [http://localhost:4000/health](http://localhost:4000/health)

---

## 12. Docker Instructions

The local stack runs three orchestrated containers defined in `docker-compose.yml`:
1. `db`: Official `postgres:16-alpine` database with automated health probes.
2. `api`: Node.js Express server running automatic migrations and idempotent seed scripts on container start.
3. `client`: Next.js production build serving the responsive interface.

### Common Docker Commands

```bash
# Start all containers in the background
docker compose up -d

# View consolidated live logs
docker compose logs -f

# Shut down and wipe the local database volume clean
docker compose down -v
```

---

## 13. Migration & Seed

Database migrations and initial seed execution are automatically applied when starting up via Docker Compose.

To run migrations and seed data manually outside Docker:

```bash
cd server
npm install

# Run database migrations
npm run db:migrate

# Seed demo users and vehicles (idempotent ON CONFLICT DO NOTHING)
npm run db:seed
```

---

## 14. Running Tests

The test suite consists of 107 automated unit and integration tests executing against an isolated PostgreSQL test instance.

```bash
cd server
npm test
```

> **Why `--runInBand`?** Integration tests execute SQL transactions against live database tables. Tests run sequentially with `--runInBand` to prevent cross-test transaction interference and lock collisions.

Expected output:
```text
Test Suites: 14 passed, 14 total
Tests:       107 passed, 107 total
Snapshots:   0 total
Time:        ~34s
```

---

## 15. Demo Credentials

The seed script creates the following pre-configured demo users (all share password: `password123`):

| Role | Name | Phone Number | Password | Notes |
|---|---|---|---|---|
| **Passenger** | Nusrat Jahan | `+8801711111111` | `password123` | Corridor commuter |
| **Passenger** | Rafiq Islam | `+8801722222222` | `password123` | Corridor commuter |
| **Passenger** | Shirin Akter | `+8801733333333` | `password123` | Corridor commuter |
| **Driver** | Jashim Uddin | `+8801744444444` | `password123` | Driver of "Bullet" (Capacity: 3) |

---

## 16. Deployment

The application is deployed across production cloud infrastructure:

| Component | Platform | URL | Region |
|---|---|---|---|
| **Frontend** | Vercel | [https://dhaka-tesla-phi.vercel.app](https://dhaka-tesla-phi.vercel.app) | Global Edge |
| **Backend API** | Render | [https://dhaka-tesla-ixn2.onrender.com](https://dhaka-tesla-ixn2.onrender.com) | Oregon (Free Tier) |
| **Database** | Neon Serverless Postgres | `ep-lucky-bonus-azwin9ok` | Singapore (`ap-southeast-1`) |

### Free-Tier Operating Characteristics
- **Render Cold Starts**: Spun down after 15 minutes of inactivity; initial API requests may take ~30–45s to wake.
- **Automated Keep-Alive**: A scheduled GitHub Actions workflow periodically pings `/health` to maintain container warm state during demonstration intervals.
- **Local Fallback**: Run `docker compose up --build` if public cloud networks encounter regional latency.

---

## 17. API Overview

Comprehensive API specifications are maintained in [docs/api.md](./docs/api.md). Summary of available routes:

| Method | Endpoint | Authorization | Description |
|---|---|---|---|
| `GET` | `/health` | Public | System status and database connectivity check |
| `POST` | `/api/auth/register` | Public | Account registration for passenger or driver |
| `POST` | `/api/auth/login` | Public | User authentication and JWT generation |
| `POST` | `/api/rides` | Passenger | Create pooled ride request with idempotency key |
| `GET` | `/api/rides/:id` | Passenger | Retrieve live status and assigned pool info |
| `POST` | `/api/rides/:id/cancel` | Passenger | Cancel active ride prior to vehicle arrival |
| `GET` | `/api/rides/history` | Passenger | Paginated passenger ride history |
| `PATCH` | `/api/driver/online` | Driver | Toggle vehicle online availability |
| `GET` | `/api/driver/requests` | Driver | Inbox of compatible passenger requests |
| `POST` | `/api/driver/requests/:id/accept`| Driver | Atomically accept passenger request into pool |
| `GET` | `/api/driver/pools/current` | Driver | Active pool manifest and passenger roster |
| `PATCH` | `/api/driver/pools/:id/status` | Driver | Progress lifecycle (`ARRIVED` → `IN_TRANSIT` → `COMPLETED`) |
| `POST` | `/api/driver/pools/:id/cancel` | Driver | Cancel active pool before departure |
| `GET` | `/api/driver/history` | Driver | Completed trip history and shift earnings |

---

## 18. Key Decisions & Trade-offs

- **Integer Poysha Storage**: All monetary values are handled in integer poysha (`1 BDT = 100 poysha`) to completely eradicate IEEE 754 floating-point inaccuracies during fare splitting.
- **Explicit Raw SQL over ORM**: Direct `node-postgres` queries ensure absolute transparency over `SELECT ... FOR UPDATE` locking clauses, preventing hidden N+1 queries and obscured transaction boundaries.
- **Row-Level Postgres Locks over Distributed Redis**: Contention exists only on individual vehicles and pools; PostgreSQL row-level locks natively provide ACID isolation without introducing Redis infrastructure complexity.
- **Single Active Pool Invariant**: Enforced strictly at the database schema level via a partial unique index on `ride_pools(vehicle_id) WHERE status NOT IN ('COMPLETED', 'CANCELLED')`.
- **Adaptive 3-Second Polling**: Replaced heavy persistent WebSocket connections with lightweight REST polling throttled by `document.hidden`, keeping background battery and mobile network consumption minimal.
- **Discrete Corridor Graph**: Fixed zone corridors eliminate reliance on expensive third-party mapping APIs while guaranteeing deterministic pricing for commuters.
- **Role-Partitioned Client Storage**: Isolated `token_driver` and `token_passenger` local storage keys permit multi-role concurrent testing in separate browser tabs without cross-tab session clobbering.
- **Auth Guard Shielding**: `useRequireAuth` exposes an explicit `isAuthorized` flag, preventing flash of unauthenticated layout during route transitions.

---

## 19. Known Limitations

- **No Request Expiration TTL**: Waiting passenger requests remain active until accepted or manually cancelled; Automated data cleanup will be introduced in a later release cycle.
- **Flat Multi-Seat Multiplier**: Multiple seats booked under a single request pay `seatCount × individualPooledFare` without sub-tiered bulk discounting.
- **Simplified Cash Settlement**: Financial processing assumes physical cash handover at destination; digital escrow wallets are out of MVP scope.
- **Manual Request Refresh**: The driver request inbox updates on page view or user action rather than auto-polling to minimize server load.
- **Free-Tier Host Latency**: Render backend containers experience cold start spin-up delays on unprimed requests.

---

## 20. Next Improvements

- **Automated Request Expiration**: Background worker to expire stale `REQUESTED` rides after a 10-minute window.
- **WebSocket Push Protocol**: Transition high-frequency polling to server-sent events or WebSocket broadcasts for real-time dispatch.
- **TeslaPay Mobile Wallet**: Integration of bKash and Nagad mobile financial service APIs for in-app fares.
- **PostGIS Geospatial Engine**: Replace discrete corridor zones with GPS coordinates and dynamic corridor polygons.
- **Bidirectional Ratings**: Peer reviews and safety scoring between drivers and passengers.
- **Driver Earnings Analytics**: Weekly shift summaries, fuel/charging cost tracking, and payout reporting.

---

## 21. AI Usage & Demo Video

### AI Tools Used

* **Antigravity Agentic IDE:** Used for full-stack implementation, code generation, debugging, test execution, and diagnostic tracing during development.
* **ChatGPT:** Used for PRD analysis, architecture and database design discussions, concurrency and transaction reasoning, implementation planning, and reviewing technical decisions.
* **DeepSeek:** Used for architecture and design discussions, reviewing proposed solutions, identifying potential issues, and comparing implementation approaches.

All AI-generated suggestions and code were reviewed, tested, and adapted during development. The final architecture and implementation decisions were made and validated by the developer.

### AI-Assisted Development

AI tools were used as development assistants rather than as autonomous decision-makers. Architecture, database constraints, transaction handling, concurrency control, API behavior, and implementation changes were reviewed against the PRD and tested during development.

### Demo Video

The demo covers:

* Passenger ride request and booking
* Driver acceptance and pool formation
* Multi-passenger pooling
* Capacity and concurrency handling
* Ride lifecycle management
* Fare and status tracking
* Passenger and driver history
* Key validation and edge cases
Walkthrough of passenger booking, atomic driver pool acceptance, and multi-tab lifecycle:  
▶️ **[Dhaka Tesla Pool Demo Video (YouTube)](https://youtu.be/GIrVWaIG70U)**
