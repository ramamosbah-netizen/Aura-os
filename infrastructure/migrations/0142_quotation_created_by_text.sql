-- ============================================================
-- AURA OS — migration 0142: crm quotations created_by → text
-- ------------------------------------------------------------
-- created_by was uuid while every other spine table stores the actor id as
-- text — real identities are directory ids like "u-admin" (and service
-- accounts "sa:<id>"), so ANY authored quotation insert failed on Postgres
-- with "invalid input syntax for type uuid". Surfaced by the tender→quotation
-- bridge smoke; aligns the column with aura_tendering_tenders.created_by.
-- ============================================================

alter table public.aura_crm_quotations
  alter column created_by type text using created_by::text;

-- @DOWN
alter table public.aura_crm_quotations
  alter column created_by type uuid using (
    case
      when created_by ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then created_by::uuid
      else null
    end
  );
