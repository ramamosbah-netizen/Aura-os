# Quotations Depth — Lifecycle, Revisions, Provenance, Convert-to-Contract

**Date:** 2026-07-11 · **Branch:** `feat/quotations-depth`
**Why:** the quotation was a proto-invoice (draft→sent→accepted, Net+VAT) with no
commercial context. In the AURA OS deal chain it must carry its source, its account,
its revisions and its continuation into a contract. (User assessment: ~55% complete.)

---

## 1. What shipped

### Lifecycle (migration **0146** rebuilds the status CHECK)
`Draft → Internal Review → Approved → Sent → Under Negotiation → Accepted / Rejected /
Expired / Cancelled` (+ **Revised** when superseded). One transition table in the domain
(`applyQuotationAction`, 8 actions) replaces the four ad-hoc functions — `send` still
allowed straight from draft so small quotes skip review; the legacy four remain as
wrappers. Invalid moves throw taxonomy-mapped messages ("cannot approve from status sent").

### Revision chain (MEP/ELV negotiation reality)
`revision` (Rev 0 default) + `parentQuotationId`. **Revise** (from sent / under
negotiation / rejected / expired) supersedes the current record (status `revised`,
terminal, dimmed in the table) and drafts **Rev n+1** carrying the same quote number,
account, source refs, lines and terms — edit and re-send. `QT-2026-001 · Rev 0 → 1 → 2`.

### Deal-chain provenance
- `sourceOpportunityId` set by opportunity → convert-to-quotation (direct-sale path);
  `sourceTenderId` already set by the tender pricing bridge — the Source column chips
  each quote: **◎ Opportunity · ◳ Tender (→ pricing sheet) · ▤ Contract**, or `direct`.
- `ownerId` + `terms` (commercial terms, § popover in the table).
- **Convert to Contract** (accepted only): the existing endpoint now also writes
  `convertedContractId` back onto the quotation, so the chain
  `Quotation Accepted → Contract Created` is visible from the register.

### KPIs + table
Draft Value · Open/Sent Value · Accepted Value · Rejected/Lost Value ·
**Expiring ≤ 7 days** · **Acceptance Rate** (accepted ÷ decided).
Table: Date · Quote # (Rev badge + terms) · **Account (links to the Account 360)** ·
Source · Net · VAT · Total · **Valid until** (⚠ soon / ✗ past) · Status · Owner ·
contextual Actions (Review→ / Approve ✓ / Send / Negotiate / Accept / Reject /
Revise ↺ / → Contract / Cancel / 🖨 print).

### Latent bug fixed
`POST /crm/quotations` form enforcement never passed the line rows into
`evaluateForm` (`opts.lines`) — every direct API create carrying line items was
rejected with "Add at least one line item". Now maps `body.lines` through.

## 2. Verification (live, dev DB)
Full lifecycle walked end-to-end: create (with account) → submit_review →
approve → send → negotiate → **guard** (re-review from negotiation correctly
refused) → **revise** (Rev 0 → status `revised`; Rev 1 draft, parent id set, same
number/lines/total) → send → accept → **convert-to-contract** ("Contract from
QT-SMK-200 — Acme", draft) → `convertedContractId` set on the quotation.
Browser: KPI strip (Acceptance 60%, lost value red), Rev 1 badge, ▤ Contract chip,
dimmed revised row, account link. crm **19** tests (+6 lifecycle/revision) ·
builds green · migration gate green (146, @DOWN) · SDK **673** ops.

## 3. Notes
- Sequential per-quote approval only — value-band approval routing can plug into the
  existing kernel approval-matrix later (Vol 15 §2.3).
- `expire` is manual/action-driven; an auto-expiry sweep on `validUntil` is a small
  scheduler follow-on.
- Quotation print page (`/crm/quotations/[id]/print`) already existed and is linked
  from the actions column.
