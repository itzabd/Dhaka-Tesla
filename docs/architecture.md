# System Architecture — Dhaka Tesla Pool

For the comprehensive system architecture documentation, technical stack rationales, and lock hierarchy details, please refer to the primary repository document:

- **[System Architecture Diagram & 3-Tier Overview](../README.md#5-architecture-diagram)**
- **[Lock Hierarchy & Concurrency Specification](../README.md#5-architecture-diagram)**
- **[Tech Stack & Justifications](../README.md#7-tech-stack--justifications)**
- **[Key Architectural Decisions & Trade-offs](../README.md#18-key-decisions--trade-offs)**

## Core Principles

1. **Strict 5-Level Lock Hierarchy**: Deadlock-free concurrency enforcement across vehicles, pools, requests, members, and audit events.
2. **ACID Capacity Invariants**: Vehicle seating capacity (max 3 seats for Bullet electric three-wheelers) is strictly guaranteed at the database level using `SELECT ... FOR UPDATE` and transactional verification.
3. **Stateless Scalability**: Token-based authentication using HMAC-SHA256 signed JWTs with zero session storage overhead.
