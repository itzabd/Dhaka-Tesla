# Test Suite Taxonomy

This directory contains integration and unit tests that verify the Dhaka Tesla Pool MVP against PRD requirements.

## Test Execution

    npm test

Runs all tests with `--runInBand`. The flag is required: tests share a single PostgreSQL database, and parallel Jest workers would race on the `TRUNCATE` steps in each file's `beforeEach`.

## PRD Section 12 Requirement Coverage

| PRD Requirement | File | Coverage |
|-----------------|------|----------|
| Bullet's capacity can never be exceeded | `pool.test.ts` | Test 5 (capacity rejection), Test 7 (last-seat race) |
| Invalid state transitions rejected | `lifecycle.test.ts` | Tests 4, 5, 6 |
| Nusrat and Rafiq fares calculate correctly | `fare.test.ts`, `pool.test.ts` | Unit fare math + integration fares |
| Users can't modify another user's ride | `authorization.test.ts` | Tests 1, 2 |
| Cancellation rules hold | `cancellation.test.ts` | Tests 1–10 |
| Concurrent requests can't corrupt capacity | `pool.test.ts` | Tests 6, 7 |
| Audit trail integrity | `auditIntegrity.test.ts` | Tests 1–6 |
| Defensive cancellation guards | `defensiveCancellation.test.ts` | Tests 1–4 |

## Test Files

| File | Purpose |
|------|---------|
| `seed.test.ts` | Seed data integrity and idempotency |
| `routes.test.ts` | Zone graph and distance function |
| `fare.test.ts` | Integer poysha fare math |
| `matching.test.ts` | Route compatibility and capacity rules |
| `auth.test.ts` | JWT issuance, verification, role guards |
| `idempotency.test.ts` | Two-phase idempotency middleware |
| `rides.test.ts` | Passenger booking, GET, cancel, history |
| `driver.test.ts` | Driver online toggle, filtered inbox, history |
| `pool.test.ts` | Atomic pool accept, first-pool race, last-seat race |
| `lifecycle.test.ts` | Pool status transitions and audit events |
| `cancellation.test.ts` | Passenger and driver cancellation paths |
| `auditIntegrity.test.ts` | Audit ledger immutability and event correctness |
| `defensiveCancellation.test.ts` | Row-count guards against double-decrement |
| `authorization.test.ts` | Cross-actor access boundaries |

## Test Conventions

- Every test file runs a `beforeAll` that truncates the full schema and re-seeds via `runSeed()`.
- Every test file runs a `beforeEach` that truncates transactional tables and resets `vehicles.is_online`.
- Every test file runs an `afterAll` that calls `pool.end()`.
- `Idempotency-Key` headers are injected via `randomUUID()` for endpoints wrapped in the idempotency middleware.
- Concurrency races are exercised with `Promise.all` on the same driver token.

## Adding New Tests

1. Pick an existing file if the concern matches its scope.
2. Otherwise create a new file with the same setup pattern.
3. Update the tables above.
4. Update the PRD coverage table if a new requirement is covered.
