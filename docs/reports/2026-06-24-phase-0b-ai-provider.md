# Report — Phase 0b.3: AI Provider Layer (kernel)

**Date:** 2026-06-24 · **Repo:** `Desktop/aura-os` (local, branch `main`) · **Increment:** Phase 0b step 3 of the kernel.

> Per the v2 architecture call, the AI provider is **kernel**, not Intelligence — every layer (modules, Intelligence, the web shell) consumes one seam and never touches a vendor SDK directly.

---

## What was built

**Framework-free port in `@aura/shared`** (`src/ai/ai-provider.ts`):
- `AiProvider` interface (`complete(req) → result`), `AiMessage` / `AiCompletionRequest` / `AiCompletionResult`.
- Constants: `DEFAULT_AI_MODEL = 'claude-opus-4-8'`, `DEFAULT_AI_MAX_TOKENS = 16000`.
- **Pure, unit-tested rules** (the "corrected algorithm" the kernel preserves):
  - `buildClaudeMessageParams()` — shapes a provider-agnostic request into Claude Messages-API params and **deliberately omits `temperature`/`top_p`/`top_k`** (Opus 4.x returns a 400 on them — steer with the prompt, not sampling).
  - `isSamplingLockedModel()` — documents the Opus 4.7+/Fable family guard.
  - `selectAiProviderName(apiKey)` — `claude` when a key is present, `local` otherwise.
  - `localFallbackText()` — deterministic stand-in output.

**Concrete providers + service in `@aura/core`** (`src/ai/`), wired into `CoreModule`:
- `ClaudeProvider` — the default, via the **official `@anthropic-ai/sdk`** (not hand-rolled HTTP). Builds params from the shared rule, sends no sampling params, returns text + model + usage.
- `LocalProvider` — network-free echo fallback so the kernel boots/runs with no key (dev/CI).
- `AiService` — the injectable seam. Picks the provider at boot from `ANTHROPIC_API_KEY` (model overridable via `AI_DEFAULT_MODEL`); exposes `complete()` and `activeProvider`.

## Verified

- `pnpm build` → **shared → core → api all compile** (incl. `ClaudeProvider` against the Anthropic SDK types).
- `pnpm test` → **21/21 vitest tests pass** (12 identity + **9 new AI**: model default, the no-temperature rule, override precedence, system-only-when-provided, sampling-locked detection, provider selection, local echo).
- **API boots**: `AiService … LOCAL fallback mode (no model calls)` (no key in env), relay still running, `Nest application successfully started`. The seam is live and boot-safe.
- `@anthropic-ai/sdk@^0.105` added to `@aura/core`.

## Decisions

- **Official SDK, not raw HTTP** — per the authoritative claude-api guidance; never hand-roll the wire or guess SDK shapes.
- **No `temperature` by construction** — the request type has no sampling fields, so the Opus-4.x 400 is impossible by design (the corrected behavior carried over from the old `ai-provider.ts` idea, which no longer exists in NEW-ERP — rebuilt fresh against current model rules: default `claude-opus-4-8`).
- **Boot-safe LOCAL fallback** — no key ⇒ deterministic local provider; the API never fails to boot for lack of an AI key.
- **Pluggable** — OpenAI / Gemini / Azure each become a new `AiProvider` impl + one branch in `AiService`; **no consumer changes**. Deliberately not implemented now (would mean guessing other vendors' SDKs) — Claude + local ship; the rest plug in on demand.

## To enable real model calls

Add `ANTHROPIC_API_KEY` (and optionally `AI_DEFAULT_MODEL`) to `apps/api/.env.local`; `AiService` switches from `local` to `claude` on next boot. None is set today, so the kernel runs in local mode.

## Next

Finish Phase 0b: **DMS substrate · Platform Workflow engine · Integration skeleton** (all kernel, all generic). Then 0c (Next.js shell + Workspace), then T1's 7 modules.
