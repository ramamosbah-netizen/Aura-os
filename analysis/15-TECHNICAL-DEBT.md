# Technical Debt Register

Debt is low for a codebase this size — a credit to the disciplined patterns. What exists clusters in five themes.

## Theme 1 — Enforcement staged off (highest-risk debt)
| Item | Location | Risk | Effort |
|---|---|---|---|
| Auth off by default | `permissions.guard.ts`, `main.ts` (`AUTH_REQUIRED`) | Access control inert in prod | S (config) |
| RLS inert on prod runtime | Supabase owner/bypass role vs `aura_app` | No tenant isolation where data lives | M |
| Permission derivation unverified under load | `derivePermissionFromRoute` | Wrong/missing permissions when enabled | M |
| CORS wide open | `main.ts` `enableCors()` | CSRF/cross-origin exposure | S |
| No helmet / rate limiting | `main.ts` | DoS, header attacks | S |

## Theme 2 — Frontend debt
| Item | Location | Risk | Effort |
|---|---|---|---|
| Mega client components | `project-detail.tsx` (1,899), `tender-detail.tsx` (1,447), etc. | Bundle size, untestable, re-render cost | L |
| No loading/error boundaries | 0 `loading.tsx`/`error.tsx` | Poor states, blocked pages | M |
| No client data layer | no SWR/query | Full-page refresh mutations | M |
| `force-dynamic` everywhere | every page | No caching, TTFB bound to API | M |
| Frontend not on `@aura/sdk` | `lib/api.ts` hand-typed | Contract drift risk | M |
| Depth-cliff stub pages | Engineering/DocControl/Site/HSE (1–2 pages) | ERP incompleteness | L |

## Theme 3 — Intelligence-layer drift
| Item | Location | Risk | Effort |
|---|---|---|---|
| Violates read-only law (owns persistence) | mig 0193–0195, `intelligence/src/*` | Architectural erosion | M |
| 40+ services, 4 tests | `intelligence/src` | Untested critical-path code | L |
| Large uncommitted surface | `git status` (59 files) | Unreviewed code, loss risk | S |

## Theme 4 — Integrity & data
| Item | Location | Risk | Effort |
|---|---|---|---|
| Sparse FKs (54 / 192 tables) | migrations | Orphans possible; app-enforced integrity | M |
| Error taxonomy string-matched | `all-exceptions.filter`, `classifyDomainMessage` | Brittle to message edits | M |
| Event/audit tables unpartitioned | event store | Growth/perf at scale | M |
| Under-used projections | mig 0034/0035 | Roll-up N+1 at scale | M |
| Path-asymmetry (tender-won bypasses baseline) | CRM/tendering | Governance hole | S |
| Two quotation pricing engines | CRM | Commercial ambiguity | M |

## Theme 5 — Housekeeping
| Item | Location | Risk | Effort |
|---|---|---|---|
| Duplicated `auth.enabled` branch | `permissions.guard.ts` | Dead code | XS |
| 97 `any` usages | mappers/boundaries | Type-safety gaps | M |
| Root scratch files | `ir.txt`, `permid.txt`, `reqids.txt` | Repo hygiene / possible leak | XS |
| Report-doc sprawl (spaces, dupes) | `docs/reports/` | Findability | S |
| Non-blocking dep audit | CI `pnpm audit \|\| true` | Unpatched advisories (xlsx/multer) | S |
| Outbox relay single-runner assumption undocumented | `outbox-relay.ts` | Scaling hazard | M |

## Debt trajectory
- **Improving:** kernel, CRM, Finance, CI/migrations — disciplined, tested, low debt.
- **Worsening:** intelligence layer (scope ≫ tests ≫ governance), uncommitted WIP accumulation.
- **Stagnant:** delivery-vertical UIs (backend built, UI never followed).

## Payoff priority
1. Enforcement (Theme 1) — small effort, largest risk reduction.
2. Intelligence governance (Theme 3) — stop the bleed before it grows.
3. Frontend depth + states (Theme 2) — largest product-value unlock.
4. Integrity hardening (Theme 4) — before scale.
5. Housekeeping (Theme 5) — continuous.
