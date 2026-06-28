<!-- AURA OS — Step A5 Report: Subcontracts Module -->
# Step A5 — Subcontracts Module

**Date:** 2026-06-25  
**Status:** ✅ Complete  
**Build:** 13/13 tasks successful, 0 errors  
**Tests:** 2/2 tests passed in Subcontracts module (all 22 workspace tests passing)

---

## What was done

### 1. Created `@aura/subcontracts` Domain Package

Defined core subcontractor structures for trade contracts:

- **Subcontract Model (`modules/subcontracts/src/domain/subcontract.ts`)**
  - Carries subcontractor information, project linkage, contract value, and retention rate (defaults to `10.0%`).
- **Claim Model (`modules/subcontracts/src/domain/claim.ts`)**
  - Defines the Interim Payment Certificate (IPC) structure for progressive valuations.
  - Computes gross, previous certified gross, period gross, retention withheld, and net certified period payout.

### 2. progressive Valuation Calculations

Designed the progressive claim validation system within `SubcontractsService`:
- Validates that claims can only be submitted against active subcontracts.
- Reads prior certified claims to compute `previouslyCertifiedValue`.
- Subtracts previous certified value from current gross completed to determine `thisPeriodGrossValue`.
- Withholds retention percentage (e.g. 10%) on current period gross and sets the net certified amount.

### 3. API Controller & NestJS Integration

Exposed subcontractor claims functionality:

- Registered `@aura/subcontracts` in NestJS `AppModule` and configured API endpoints.
- **Endpoints (`/api/subcontracts`)**
  - `POST /api/subcontracts` — Create a Subcontract (draft).
  - `GET /api/subcontracts` — List Subcontracts (filterable by project / status).
  - `PATCH /api/subcontracts/:id/status` — Activate/close subcontract.
  - `POST /api/subcontracts/claims` — Create subcontractor progress claim.
  - `GET /api/subcontracts/claims` — List claims.
  - `PATCH /api/subcontracts/claims/:id/certify` — Certify progress claim (requires `finance.invoice.approve` permission context).
  - `PATCH /api/subcontracts/claims/:id/pay` — Mark certified claim as paid.

### 4. DB Migration

Added `infrastructure/migrations/0017_subcontracts.sql` to initialize `public.aura_subcontracts` and `public.aura_subcontracts_claims` tables.

---

## Verification Results

Tests run against `@aura/subcontracts`:
- `Subcontract Creation`:
  - ✓ Default 10% retention rate and status
- `Progressive Valuations (IPC)`:
  - ✓ Cannot claim against inactive subcontracts
  - ✓ Claim #1 calculates retention and net payout correctly
  - ✓ Claim #2 reads previously certified gross and computes period-only retention and net payouts correctly
