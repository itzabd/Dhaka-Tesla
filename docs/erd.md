# Entity Relationship Diagram (ERD) — Dhaka Tesla Pool

For the comprehensive Entity Relationship Diagram (ERD), table structures, constraint rules, and schema definitions, please refer to the primary repository document:

- **[Entity Relationship Diagram & Field Definitions](../README.md#6-erd)**
- **[ACID Invariants & Table Schemas](../README.md#1-summary)**

## Schema Design Principles

1. **Foreign Key Integrity**: All relationships enforce cascade constraints or strict references to guarantee zero orphaned records.
2. **Partial Unique Indexes**: Single active pool per vehicle and single active ride per passenger enforced at the PostgreSQL engine level (`WHERE status NOT IN ('COMPLETED', 'CANCELLED')`).
3. **Integer Currency Storage**: All financial and fare computations are strictly modeled as integer poysha (`1 BDT = 100 poysha`) to eliminate floating-point arithmetic errors.
4. **Append-Only Audit Log**: Every state change publishes an immutable record to `ride_events` with actor context and timestamps.
