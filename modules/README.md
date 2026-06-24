# Business modules (Layer 2)

One folder per **bounded context**, each a `@aura/<module>` package that owns its
Postgres schema and publishes events. Added from **T1** in this canonical shape:

```
modules/<module>/
  domain/    pure business logic — entities, value objects, invariants (no I/O)
  services/  use-cases / orchestration; opens a tx, writes the outbox event
  api/       the ONLY public surface: command/query handlers + DTO contracts
  events/    published event contracts + subscribers
  db/        migrations + repositories for THIS module's schema only
```

**Laws:** never import another module's `domain/`, `db/`, or `services/`. Cross-context
data comes via that module's `api/` or its events — **no cross-schema joins.**

Planned (16): crm · estimating · engineering · projects · site · procurement ·
subcontracts · inventory · finance · hr · fleet · assets · service · hse · quality · doccontrol.
