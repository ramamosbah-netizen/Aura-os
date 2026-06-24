# Infrastructure

Concrete adapters the kernel + modules depend on through interfaces: Supabase/Postgres
clients, the Postgres event store + transactional-outbox relay, storage, config, and
(later) the Kafka transport. Swapping an adapter never touches domain code.
