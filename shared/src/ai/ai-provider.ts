// Framework-free AI provider port. The kernel's single seam to LLMs: every layer
// (Intelligence, modules, the web shell) calls `AiProvider.complete()` and never
// touches a vendor SDK directly. Concrete providers (Claude, local fallback, and
// later OpenAI/Gemini/Azure) live in @aura/core and implement this interface.

export type AiRole = 'user' | 'assistant';

export interface AiMessage {
  role: AiRole;
  content: string;
}

export interface AiCompletionRequest {
  /** System prompt — defines behavior. */
  system?: string;
  /** Conversation turns (first should be `user`). */
  messages: AiMessage[];
  /** Override the provider's default model. */
  model?: string;
  /** Output ceiling; defaults to DEFAULT_AI_MAX_TOKENS. */
  maxTokens?: number;
}

export interface AiCompletionResult {
  text: string;
  /** The model that actually answered (echoed from the provider). */
  model: string;
  /** Which provider served it: `claude` | `local` | … */
  provider: string;
  stopReason?: string;
  usage?: { inputTokens?: number; outputTokens?: number };
}

/** The one method every consumer depends on. */
export interface AiProvider {
  readonly name: string;
  complete(req: AiCompletionRequest): Promise<AiCompletionResult>;
  embed(text: string): Promise<number[]>;
}

/** Default to the latest, most capable Claude model. */
export const DEFAULT_AI_MODEL = 'claude-opus-4-8';
/** Safe non-streaming ceiling (keeps requests under SDK HTTP timeouts). */
export const DEFAULT_AI_MAX_TOKENS = 16000;

/**
 * Models that REJECT sampling params (`temperature`/`top_p`/`top_k`) with a 400 —
 * the Opus 4.7+/Fable family, which is our default. We never send those params for
 * any model (see buildClaudeMessageParams), so this is the documented guard, not a
 * branch: steer these models with the prompt, not with temperature.
 */
export function isSamplingLockedModel(model: string): boolean {
  return /^claude-(opus-4-(7|8)|fable-5|mythos-5)/.test(model);
}

/** Plain Claude Messages-API params (snake_case) — built here so the rule is unit-testable. */
export interface ClaudeMessageParams {
  model: string;
  max_tokens: number;
  system?: string;
  messages: { role: AiRole; content: string }[];
}

/**
 * Shape a provider-agnostic request into Claude Messages-API params.
 * Deliberately omits `temperature`/`top_p`/`top_k` — Opus 4.x (our default) 400s on
 * them. This is the corrected behavior the kernel must preserve.
 */
export function buildClaudeMessageParams(
  req: AiCompletionRequest,
  defaults: { model?: string; maxTokens?: number } = {},
): ClaudeMessageParams {
  const params: ClaudeMessageParams = {
    model: req.model ?? defaults.model ?? DEFAULT_AI_MODEL,
    max_tokens: req.maxTokens ?? defaults.maxTokens ?? DEFAULT_AI_MAX_TOKENS,
    messages: req.messages.map((m) => ({ role: m.role, content: m.content })),
  };
  if (req.system) params.system = req.system;
  return params;
}

/** Deterministic stand-in text when no model is configured (dev / CI / no key). */
export function localFallbackText(messages: AiMessage[]): string {
  const lastUser = [...messages].reverse().find((m) => m.role === 'user');
  return `[local-ai] no model configured — echoing your input: ${lastUser?.content ?? '(none)'}`;
}

/** Embedding vector dimension — matches the `vector(1536)` column (migration 0019). */
export const DEFAULT_EMBEDDING_DIMS = 1536;

/**
 * Deterministic, offline LEXICAL embedding via the feature-hashing "trick": each token is
 * hashed into one of `dims` buckets (with a sign hash to limit collisions), accumulating a
 * term-frequency count; the vector is then L2-normalized so cosine similarity (a dot product
 * of unit vectors) reflects **shared-token overlap**. This is NOT a neural/semantic embedding —
 * it has no synonymy or paraphrase awareness — but it gives genuinely useful lexical retrieval
 * with no network call and is fully deterministic for tests/CI. Wire a dedicated embeddings
 * provider (e.g. Voyage / OpenAI text-embedding) for true semantic depth.
 */
export function lexicalEmbedding(text: string, dims: number = DEFAULT_EMBEDDING_DIMS): number[] {
  const vec = new Array<number>(dims).fill(0);
  const tokens = text.toLowerCase().match(/[a-z0-9]+/g) ?? [];
  for (const tok of tokens) {
    const h = fnv1a32(tok);
    const bucket = h % dims;
    const sign = ((h >>> 16) & 1) === 0 ? 1 : -1; // independent bit → sign hash
    vec[bucket] += sign;
  }
  let sumSq = 0;
  for (let i = 0; i < dims; i++) sumSq += vec[i] * vec[i];
  const norm = Math.sqrt(sumSq) || 1;
  for (let i = 0; i < dims; i++) vec[i] = Number((vec[i] / norm).toFixed(6));
  return vec;
}

/** FNV-1a 32-bit hash → unsigned 32-bit int. */
function fnv1a32(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Pick the active provider from whether a real key is present. */
export function selectAiProviderName(apiKey: string | undefined): 'claude' | 'local' {
  return apiKey && apiKey.trim().length > 0 ? 'claude' : 'local';
}
