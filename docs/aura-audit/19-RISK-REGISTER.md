# 19 — Risk Register (Top 20)

Format: Risk → Evidence → Probability → Impact → Severity → Mitigation.

| # | Risk | Evidence | Prob | Impact | Severity | Mitigation |
|---|---|---|---|---|---|---|
| R1 | **RLS inert in prod** (superuser/BYPASSRLS role) → cross-tenant leak | `main.ts` gate depends on prod role; dev-only enforcement historically | Med | Catastrophic | **Critical** | Verify `aura_app` role live in every env; boot-log posture; block deploy otherwise |
| R2 | **Auth misconfigured** (no verifier) → open API | `permissions.guard.ts:100` no-op when auth off | Low (gate is fatal in prod) | Catastrophic | **Critical** | Keep fail-closed gate; add deploy checklist + smoke test hitting a protected route unauthenticated |
| R3 | **UI regression ships undetected** | 1 browser E2E | High | High | **High** | Spine smoke suite in CI |
| R4 | **Search collapses at scale** | in-memory fan-out | High (at growth) | High | **High** | FTS/projection index |
| R5 | **Silent data-integrity drift** (orphans) | 54 FKs/198 tables | Med | High | **High** | Orphan-scan CI gate; selective FKs |
| R6 | **Financial rounding errors** | float money | Med | High (audited $) | **High** | Decimal money type + balancing tests |
| R7 | **Reactor failure unnoticed** | dead-letter exists, no operator UI | Med | High | **High** | Outbox/dead-letter admin + alerts |
| R8 | **Brute-force / API abuse** | no rate limiting | Med | Med | **Med** | Throttler + WAF |
| R9 | **Error masking erodes trust** | `getJson`→null | High | Med | **High** | Distinct error/empty states |
| R10 | **Single-process contention** | in-proc bus + monolith | Med | Med | **Med** | Worker process / broker for reactors |
| R11 | **Unbounded list endpoints** | pagination partial | Med | Med | **Med** | Enforce pagination |
| R12 | **DB link MITM** | `rejectUnauthorized:false` | Low | High | **Med** | Pin CA cert |
| R13 | **Upload abuse** (malware/oversize) | validation unverified | Med | Med | **Med** | Verify MIME/size/AV + signed URLs |
| R14 | **No CD safety** (rollback/canary) | compose-only | Med | Med | **Med** | Promotion pipeline + rollback runbook |
| R15 | **Secret leakage in repo** (public) | no gitleaks gate | Low | High | **Med** | gitleaks CI + rotate on incident |
| R16 | **Notification non-delivery** | channels unverified | Med | Med | **Med** | Verify providers + retry/audit |
| R17 | **Back-half journeys non-completable in UI** | `02`,`11` | High | Med | **Med** | Build workflow UIs |
| R18 | **Coverage regression** | no gate | Med | Low | **Low** | Coverage floor |
| R19 | **Inventory valuation disputes** | method unverified | Med | Med | **Med** | Define/verify FIFO/WA + reconciliation job |
| R20 | **Scaling ceiling of modular monolith** | single deployable | Low (near-term) | High (later) | **Med** | Plan module extraction / broker at scale |

## Top-5 to fix first
R1 (prod RLS) · R2 (auth config) · R3 (UI E2E) · R9 (error masking) · R4/R5 (search + integrity). R1–R3 are the ship-gate; R9 is cheap and high-trust; R4/R5 are the near-term scale/integrity pair.
