# Backend Review

**Score: 8.0 / 10** — mature NestJS backend with disciplined patterns and an unusually rigorous event/error/idempotency spine. Held back by auth being off-by-default and uneven CQRS.

## 1. API surface

- **811 endpoints** across **92 controllers** (`apps/api/src/**/*.controller.ts`).
- Consistent REST shape: `@Controller('<module>/<entity>')`, RESTful verbs, `:id/<action>` for state transitions (e.g. `POST finance invoices/:id/approve`).
- **Swagger/OpenAPI** live at `/api/docs-json` (`@nestjs/swagger`); the **`@aura/sdk`** client is generated from it and CI fails on drift (`scripts/generate-sdk.mjs` + `git diff --exit-code`). Excellent contract hygiene.
- API versioned under `/api/v1/*`.

## 2. Business logic & services

- Application logic lives in `*.service.ts` per module; pure rules in `domain/*.ts`. This separation is consistently honored.
- Depth is real where built: CRM has forecast snapshots + slippage diffing, commercial baselines, pursuit scoring; Finance has a **double-entry GL trigger enforced at the DB level** (mig 0050) — business invariants pushed to where they cannot be bypassed. That is senior-grade.
- **Weakness — CQRS is half-applied:** a command bus and projections exist, but many services read and write the same store synchronously. Reads and writes are not consistently separated, so the projection infrastructure is under-leveraged.

## 3. Validation

| Layer | Mechanism | Verdict |
|---|---|---|
| HTTP DTOs | `class-validator` / `class-transformer` | ✅ present |
| Form submissions | shared form engine `assertFormValid` runs `evaluateForm` server-side → 400 (memory: form-enforcement) | ✅ server-authoritative |
| Domain invariants | pure functions in `domain/` + DB triggers (double-entry) | ✅ strong |

**Gap:** validation coverage across all 811 endpoints is not uniform — verify DTO validation is applied to every mutating route, not only the flagship modules. A `ValidationPipe` applied globally with `whitelist: true` would close this class of gap; confirm it is registered in `apps/api/src/main.ts`.

## 4. Error handling & taxonomy

- **Enforced error taxonomy** (memory + `apps/api/src/auth/access-denied.filter.ts`, `common/all-exceptions.filter.ts`): `classifyDomainMessage` maps domain errors to 403/404/409/400, and a **fitness test fails CI on any new 500-escape**. This is exactly right — errors are a contract, not an afterthought.
- Watch item: the taxonomy relies on string-matching domain messages (memory notes "409-phrasing" and "throw-literals scanned statically" gotchas). String-coupled error mapping is brittle; migrating to typed domain error classes would harden it.

## 5. Events, queues, jobs

- **Event spine:** append-only event store + **transactional outbox** (`core/src/events/outbox-relay.ts`) — the correct pattern for reliable cross-module reactions without a message broker. Dead-letter handling exists (mig 0013).
- **No external queue** (no Redis/BullMQ/Kafka). The outbox relay is an in-process poller. Fine for a monolith at pilot scale; a bottleneck and single-runner risk at scale (see Architecture §4).
- **Sagas:** saga execution engine (mig 0043) for long-running processes.
- **Idempotency:** `commands/idempotency.{interceptor,service}.ts` + mig 0033 — mutations are idempotency-key aware. Rare and valuable.
- **Numbering engine:** centralized document numbering (mig 0028) that manages its own transaction (noted in `tenant-scoped-pool.ts` comments).

## 6. Auth & permissions (the big caveat)

- **Well-designed, staged OFF.** `core/src/identity/permissions.guard.ts`:
  - Derives `module.entity.action` permissions from the route tree — ~600 handlers covered without hand-annotation (`derivePermissionFromRoute`).
  - Checks module-enabled (Module Manager), deactivated-user refusal, org-path scoped `AccessService.assert`.
  - **But:** `if (!this.auth.enabled) return true;` — when no verifier is configured (the dev default), the *entire* guard passes through. Auth is opt-in.
- JWT + JWKS with rotation (`core/src/identity/auth.service.ts`), Entra group→role mapping (`mapGroupsToRoles`), service accounts, token revocation store. The machinery is production-grade; it just isn't turned on.
- **Minor code smell:** `permissions.guard.ts` contains the `if (!this.auth.enabled) return true;` block **twice** (before and after permission derivation) — dead/duplicated branch, harmless but should be removed.

## 7. Workflows & approvals

- Approval matrices (mig 0085, `core/src/builder/approval-matrix.service.ts`), workflow orchestrator, feature flags, per-tenant module toggles. A genuine low-code/config spine (the "builder platform").

## Recommendations (ranked)

1. **Register a global `ValidationPipe({ whitelist, forbidNonWhitelisted, transform })`** if not already, and audit mutating routes for DTO coverage.
2. **Turn on auth in a staging environment** and run the permission taxonomy against real traffic to surface derivation gaps.
3. **Migrate error mapping from string-matching to typed domain errors.**
4. **Finish CQRS** on hot read paths — route dashboards/pipeline/finance rollups through projections.
5. **Remove the duplicated `auth.enabled` guard branch** in `permissions.guard.ts`.
6. **Plan the outbox-relay → durable queue** migration path before multi-instance scaling.
