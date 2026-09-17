-- A supplier quotation carries its company, like every other tenant-scoped record.
--
-- 0343 gave the quotation its supplier and terms, and the domain type and the Postgres store were
-- extended to carry `companyId` alongside them — but the COLUMN was never added. The API e2e suite
-- runs against in-memory stores (`vitest.config.e2e.ts` sets `DATABASE_URL: ''`), so twenty passing
-- HTTP tests never touched `PostgresRfqStore` and the mismatch stayed invisible until the browser
-- suite drove the real API and got `column "company_id" ... does not exist`.
--
-- Worth stating plainly: an API e2e in this repo proves HTTP, auth, permissions and domain rules.
-- It does NOT prove persistence. The Postgres store paths are exercised by the browser suite and by
-- the RLS/provisioning checks, and a claim of "proved against PostgreSQL" that rests on the API
-- suite alone is wrong.
--
-- Nullable, like the company column on every other record here: a tenant-scoped row may legitimately
-- belong to no company, and existing quotations predate the column.

alter table public.aura_procurement_rfq_quotes
  add column if not exists company_id text;

-- @DOWN
ALTER TABLE public.aura_procurement_rfq_quotes DROP COLUMN IF EXISTS company_id;
