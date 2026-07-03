# ADR-0003: Dual runtime — in-memory and Postgres adapters behind one port

**Status:** Accepted

## Context
Tests must be fast; demos must run with zero infrastructure; production needs Postgres.

## Decision
Every store is an interface (X-store.ts) with in-memory and Postgres implementations,
chosen by DI on the presence of PG_POOL.

## Consequences
+ Infra-free tests (132 files in seconds); instant demos (DEMO_SEED=true).
- Two implementations per store (mechanical; template-driven).
