-- AURA OS — migration 0270: backfill the immutable baseline estimation projection
--
-- 0268 added the projection columns but deliberately did not invent values for historical
-- baselines. This corrective migration only copies a uniquely-linked, frozen pricing sheet's
-- estimation lines. No quotation-pricing shape is fabricated: the pricing-sheet lines are the
-- authoritative EstimationLineInput[] consumed by the canonical commercial pricing read model.
-- Rows without exactly one eligible frozen source remain NULL/unknown and require data-owner review.

with eligible_source as (
  select
    b.id as baseline_id,
    ps.lines as estimation,
    count(*) over (partition by b.id) as source_count
  from public.aura_crm_commercial_baselines b
  join public.aura_crm_pricing_sheets ps
    on ps.quotation_id = b.quotation_id
   and ps.tenant_id = b.tenant_id
  where b.estimation is null
    and ps.status = 'frozen'
    and ps.superseded_at is null
    and jsonb_typeof(ps.lines) = 'array'
    and jsonb_array_length(ps.lines) > 0
),
unique_source as (
  select baseline_id, estimation
  from eligible_source
  where source_count = 1
)
update public.aura_crm_commercial_baselines b
set estimation = u.estimation
from unique_source u
where b.id = u.baseline_id
  and b.estimation is null;

-- @DOWN
-- Only remove values that still exactly match the authoritative source. This preserves any
-- subsequent governed correction rather than blindly erasing baseline history.
update public.aura_crm_commercial_baselines b
set estimation = null
from public.aura_crm_pricing_sheets ps
where ps.quotation_id = b.quotation_id
  and ps.tenant_id = b.tenant_id
  and ps.status = 'frozen'
  and ps.superseded_at is null
  and b.pricing is null
  and b.estimation = ps.lines;
