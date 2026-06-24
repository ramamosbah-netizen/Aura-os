# Infrastructure

Concrete adapters the kernel + modules depend on through interfaces: Supabase/Postgres
clients, the Postgres event store + transactional-outbox relay, storage, config, and
(later) the Kafka transport. Swapping an adapter never touches domain code.

## Migrations

`migrations/*.sql` are applied in filename order by `pnpm db:migrate`, which records
each in `public.aura_migrations` (idempotent, one transaction per file). It reads
`DATABASE_URL` from `apps/api/.env.local`. Without it the API still boots — on the
in-memory event store — but nothing is persisted.
