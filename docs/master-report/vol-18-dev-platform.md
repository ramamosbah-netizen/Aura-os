# Volume 18 — Dev Platform

[← Master index](README.md)

How the platform is built, extended, and shipped by engineers — the developer experience is
itself a product surface (plugin authors, implementation partners, future marketplace).

---

## 1. Monorepo

pnpm workspaces + turbo. Packages: `shared` (contracts) · `core` (kernel) · `modules/*` (17) ·
`intelligence` · `apps/api` · `apps/web` · `infrastructure` (migrations). Dependency direction
enforced by package boundaries (Volume 2 §1.2). TypeScript strict; ESLint flat config
(`eslint.config.mjs`).

## 2. Build

`turbo build` with dependency-ordered caching (`turbo.json` pipeline); `tsc` project builds
per package (`dist/` outputs consumed via workspace `exports`). Known footgun documented:
web prod build into `.next` breaks a running dev server (delete `.next` before `next dev`).

## 3. CI/CD

`.github/workflows/ci.yml` — two jobs, verified:

```
job 1: lint → typecheck → test:coverage → API HTTP e2e (Supertest) → pnpm audit (prod)
job 2: build workspace deps → Playwright Chromium → web smoke e2e
```

Node 22 / pnpm 11.8. Missing [Gap → Volume 19]: migration-gate step, image build/publish,
deploy stages, coverage threshold enforcement.

## 4. Testing

132 vitest files colocated with sources (`*.test.ts`), in-memory adapters make module tests
infrastructure-free; 1 live-Postgres integration test (journal trigger); API supertest e2e;
Playwright smoke. Full QA treatment: Volume 21.

## 5. Events (developer contract)

Adding an event = one entry in `shared/src/events/catalog.ts` (typed) + `eventStore.append`
inside the service transaction. Consuming = subscribe in `cross-module-subscriber` (reactor)
or register a webhook. Rule: reactors must be idempotent (natural-key guards).

## 6. The module recipe (the platform's force multiplier)

New business capability follows the documented template (Volume 2 §3): domain functions →
store port + two adapters → service (access + domain + store + event in one tx) → Nest module
DI → controller under `/api/v1` → migration (`aura_<module>_*` + RLS enablement) → BFF route →
page + registered `FormSchema`. Every one of the 17 modules is proof the recipe scales.

## 7. Plugin SDK (forms today, platform tomorrow)

Today (Volume 5 §6): `registerFieldRenderer` · `registerFormToolbarAction` ·
`registerFormValidator` · `registerFormulaFunction` · `registerFormSchema`. All typed, all
consumable from app land. [Planned]: package these as a published `@aura/plugin-sdk` with the
generated API client (SDK generator exists) — the marketplace prerequisite (Volume 20 V3).

## 8. CLI

[Gap]. Designed scope: `aura migrate` (runner exists as script), `aura seed` (demo seeder
exists behind env), `aura module scaffold <name>` (the recipe is mechanical — codegen it),
`aura sdk generate`. Low effort, high leverage; sequenced with the plugin SDK.

## 9. Developer APIs

- Generated TS client (SDK generator service).
- MCP server — agents/tools integration surface.
- Webhooks + event catalog as async contracts.
- OpenAPI [Gap] — the missing piece for third-party DX (Volume 9 §5).

## 10. Conventions (enforced by review; ADR-backed)

- Ports & adapters for every external concern (storage, AI, DMS) — no vendor SDK outside core.
- Snapshot-not-join across contexts (ADR-0001 FK policy).
- No module→module imports; events only.
- Controllers thin; domain pure; services own transactions.
- Reports of substance are exported to `docs/reports/` dated (working convention).

---

*Next: [Volume 19 — Deployment](vol-19-deployment.md)*
