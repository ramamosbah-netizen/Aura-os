# Bid-time sourcing into the estimate (Roadmap R5 / G-P1-4)

**Status:** shipped. A tender rate-build-up component can be priced from a procurement pre-award
RFQ quote, and stays consistent with that quote through award.

## Why

Estimators build up a BOQ item's rate from cost components (material, labour, plant, subcontract).
Before R5 those unit costs were typed in by hand — disconnected from what suppliers actually quote.
R5 lets an estimator **source** a component from a real RFQ quote, so bid margins reflect market
prices and move with them.

## Model

- A **rate-build-up component** now carries a stable `id` (`aura_tendering_rate_buildups.components`
  jsonb — additive, no column change).
- **`aura_tendering_estimate_sources`** (migration `0167`) links one component to one RFQ quote:
  `buildup_id + component_id` (unique) → `rfq_id, quote_id, supplier_name, sourced_unit_cost,
  previous_unit_cost`. Indexed by `quote_id` / `rfq_id` (award reactor) and `tender_id` (sheet view).
  RLS + FORCE + policy (R1 fitness).

## Flow

1. **Source** — `POST /api/v1/tendering/tenders/:id/pricing/buildups/:buildUpId/components/:componentId/source`
   `{ rfqId, quoteId }`. The API resolves the quote from procurement (`RfqService`), stamps its
   amount onto the component's unit cost, re-derives the build-up (direct cost → indirect/overhead/
   profit → selling rate), and records the link with the pre-source rate. Emits
   `tendering.estimate.component_sourced`.
2. **Award restamp** — when the RFQ is awarded (`procurement.rfq.awarded`, now carrying `quoteId`),
   the cross-module reactor calls `EstimateSourcingService.restampFromAward`: every component sourced
   from that RFQ is repriced to the **awarded** amount and the build-up re-priced. Emits
   `tendering.estimate.source_restamped`. Orphaned links (build-up rebuilt since sourcing) are dropped.
3. **Stale view** — `GET /api/v1/tendering/tenders/:id/pricing/sources` lists sourced components,
   each flagged `stale` when the live quote's amount no longer matches `sourced_unit_cost`.
4. **Un-source** — `DELETE …/source` reverts the component to its `previous_unit_cost` and drops the link.

## Consistency guarantees

- Re-estimating a BOQ item **replaces** the build-up (new id + fresh component ids); its sources are
  cleared (`EstimateService.buildRate` → `removeByBuildUp`), so no dangling links survive a rebuild.
- Sourcing/restamp/un-source all recompute the selling rate through the existing pure engine
  (`withComponentUnitCost` → `computeBuildUp`) — one code path, no divergence.
- Tendering never imports procurement: the quote amount is passed in by the API/reactor (ADR-0011).

## Tests

- Domain (`estimate-source.test.ts`): `withComponentUnitCost` recompute + component ids + staleness.
- Service (`estimate-sourcing.service.test.ts`): sourcing updates the rate; award restamps; un-source
  reverts; orphaned-link cleanup; no-op award. (These are the DoD: "sourcing a component updates the
  rate; changing the quote restamps".)
