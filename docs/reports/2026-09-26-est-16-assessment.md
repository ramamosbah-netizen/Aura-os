# EST-16 — one logical offer per tender: eight-layer assessment

Date: 2026-09-26. Scope: the programme owner's decision of 2026-09-25 — "EST-16 decisions: select (a), (a), (a)":

> One logical offer per tender with immutable, linked revisions after first submission. An unsubmitted draft may refresh in place. Revising a submitted tender offer requires a permanent reason and regenerates the new revision from the current governed estimate. Preserve previous revision figures and decisions. Award must pin the exact approved revision. Preserve the existing governed return-for-revision authority and pricing locks; do not create another writer or a quotation fork.

## What was wrong

- Every press of "Generate quotation" on a tender minted a new QUO number, so a re-priced tender carried several unrelated offers.
- Award and submission readiness ranked every quote the tender had produced (accepted > approved > sent), rather than naming one revision.
- A tender offer could be revised by COPY in CRM, and re-priced in the CRM pricing workspace. That made a second writer of figures the tender's estimate owns, including on a returned revision somebody had already been asked to decide on.
- The review history labelled every decision "Returned".

## What it does now

| Situation | Act | Result |
|---|---|---|
| Tender has no offer | Generate | Rev 0, a draft |
| Live revision is a draft never submitted | Generate again | Refreshed in place: same number, same revision, the estimate's current figures |
| Live revision was returned, or is approved, sent, under negotiation, rejected, expired or cancelled | Revise with a reason | Rev n+1 regenerated from the estimate as it stands. Rev n is superseded with its figures, baseline and decisions intact. The reason is recorded against Rev n, append-only, in the same transaction |
| Live revision is with a reviewer | Generate / revise | Refused (409): the reviewer's return comes first |
| Live revision accepted, or the tender awarded on it | Generate / revise | Refused (409): contract variation |
| A tender offer in CRM | Copy-revise, or a CRM pricing sheet | Refused (409): "can only be revised from its tender" / "can only be priced from its tender's estimate" |
| Award, submission, readiness | — | All resolve the tender's ONE live revision, pinned by its row id when it is committed with a locked baseline |

Direct and opportunity offers keep their existing rules (copy-revise from sent, under negotiation, rejected or expired; no reason required).

## Eight layers

| Layer | Status | Evidence |
|---|---|---|
| domain | COMPLETE | `reviseQuotation` (regenerated; from a returned draft; approved and cancelled for tender offers), `refreshQuotationDraft`, `compareQuotationRevisions`, review outcome `revised` with its own reason rule. `tender-offer-revision.test.ts`: 11 tests. |
| persistence | COMPLETE | Migration 0392: one quote number per tender, serialised by an advisory lock; a `revised` row is immutable; figures move only in draft, and for a tender offer only while never submitted; review decisions are append-only, with outcomes `returned`/`revised` and a non-blank reason. The upsert-safe INSERT branch is covered. `tender-offer-revision.pg-int.test.ts` (4 tests) runs through the real stores and raw SQL. Down/up round trip verified. |
| api | COMPLETE | `POST tendering/tenders/:id/quotation` (create / refresh / refuse with guidance); `POST …/quotation/revise {reason}`; `GET crm/quotations/:id/compare?with=`. The pricing payload carries `offer.next`. Award, submit and readiness share `currentApprovedOffer`. |
| permissions | COMPLETE | Revise needs `tendering.estimate.read` + `tendering.internal-pricing.access` + `crm.quotation.update`; a viewer gets 403. Compare shows cost, so it needs `crm.internal-pricing.access`; a viewer gets 403. The return authority is unchanged (the preparer cannot return, proven in `tender-offer-review-award.spec.ts`). The pricing lock is unchanged: 409 while under review and while a sent revision stands. Approval SoD is unchanged. |
| ui | COMPLETE | The tender pricing page shows the one offer, its revisions, and exactly the act the server will accept (generate, refresh, revise with a reason, or the reason nothing is possible). Quotation 360 sends a tender offer's revise to the tender, and its Revisions tab compares any two revisions with every decision. The review history labels a revision "Revised". |
| actualOutput | COMPLETE | The comparison is server-computed from the immutable records, rendered on screen and read back against the API. A tender offer's Rev 1, raised by the new path, prints its customer PDF (`rev-1.pdf`) and internal workbook (`wave2-offer-output.spec.ts`). |
| browser | COMPLETE | `tender-offer-revisions.spec.ts`, Auth-ON against migrated PostgreSQL with shipped roles (below). Regressions green: `wave2-offer-output` (2), `tender-offer-review-award`, `tender-real-supply-path`, `journey-signal-to-close` (4), `wave2-quotation-role-workflow` (2/2 on rerun). |
| handoff | COMPLETE | The award pins Rev 2 exactly (`commercialBasis.quotationId` = Rev 2, `baselineId` = Rev 2's baseline). The contract is built from the pinned revision: `acceptedQuotationRevisionId` = the tender's Rev 1 in `wave2-offer-output.spec.ts`. After the award, revising is refused. |

### The browser proof — `tender-offer-revisions.spec.ts`

1. u-e2e-estimator generates Rev 0 on screen, re-prices, and refreshes it in place. There is still one row, Rev 0, with the same number.
2. The Estimator submits. Generating again is refused ("is with a commercial reviewer"), and re-pricing is refused (409). The screen offers neither action and shows the guidance.
3. u-e2e-qs2 returns the offer with a reason.
4. The Estimator re-prices. Generate is refused ("was returned for revision"); a blank reason is refused (400); a viewer revising is refused (403). The Estimator then revises on screen with a reason. Rev 1 is regenerated from the estimate and carries a lower total; Rev 0 is superseded with its total intact.
5. CRM copy-revise of the tender offer is refused (409), and so is a CRM pricing sheet on it (409).
6. Rev 1 is approved by qs2 and sent by qs. Re-pricing is refused (409).
7. The Estimator revises the sent Rev 1 with a reason. Rev 2 starts at Rev 1's figures; after re-pricing, Rev 2 refreshes in place.
8. qs2 compares Rev 2 with Rev 1 on screen, and the unit prices, delta and totals match the API. The decisions show "Approved by u-e2e-qs2" and "Revised by u-e2e-estimator" with its reason. Switching to Rev 0 shows the return and its reason. A viewer is refused the comparison (403).
9. Rev 2 is approved. Readiness names Rev 2. The Sales Manager submits and awards, and the award pins Rev 2. A revise after the award is refused, and the screen says why.
10. Rev 0 and Rev 1 keep their status, totals and Rev 1's baseline. The decisions persist exactly: Rev 0 has the return and the revision reason; Rev 1 has its revision reason. The chain reads Rev 0, 1, 2 on one number.

## Stated

- **Cancelled offers:** a cancelled tender offer is revisable with a reason rather than replaced by a second number. That keeps one logical offer for the life of the tender.
- **Tenders that forked before 0392:** they keep their rows. The live offer is the most recent unsuperseded one, and the database refuses any further number.
- **Award basis:** the award now includes a live revision under negotiation with a locked baseline, which the old ranking skipped. A superseded revision is never chosen.
- **Returned revision resubmitted unchanged:** it stays at the same revision. Only a change of figures needs the next revision.
- **Found, not in scope (flagged as separate tasks):** the legacy `POST /tendering/estimates` route honours the committed lock but not the under-review lock. This does not reopen EST-16, because an offer cannot change while it is reviewed. Separately, `apps/api/test/chains.e2e-spec.ts` › "deal chain: tender" fails at offer generation because its fixture never approves a technical study; it fails the same way before this change.
- **Pre-existing flake:** `wave2-quotation-role-workflow.spec.ts` can click Approve before hydration; its trace showed no request sent. It passed 2/2 on rerun.
