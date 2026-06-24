import { describe, expect, it } from 'vitest';
import {
  DEFAULT_AI_MAX_TOKENS,
  DEFAULT_AI_MODEL,
  buildClaudeMessageParams,
  isSamplingLockedModel,
  localFallbackText,
  selectAiProviderName,
} from './ai-provider';

describe('ai-provider rules', () => {
  it('defaults to the latest Claude model', () => {
    expect(DEFAULT_AI_MODEL).toBe('claude-opus-4-8');
  });

  describe('buildClaudeMessageParams', () => {
    it('applies model + max_tokens defaults and maps messages', () => {
      const p = buildClaudeMessageParams({ messages: [{ role: 'user', content: 'hi' }] });
      expect(p.model).toBe('claude-opus-4-8');
      expect(p.max_tokens).toBe(DEFAULT_AI_MAX_TOKENS);
      expect(p.messages).toEqual([{ role: 'user', content: 'hi' }]);
    });

    it('NEVER sets temperature/top_p/top_k (Opus 4.x rejects them)', () => {
      const p = buildClaudeMessageParams({ messages: [{ role: 'user', content: 'hi' }] }) as unknown as Record<string, unknown>;
      expect(p.temperature).toBeUndefined();
      expect(p.top_p).toBeUndefined();
      expect(p.top_k).toBeUndefined();
    });

    it('honors request overrides and the provider default model', () => {
      const p = buildClaudeMessageParams(
        { messages: [{ role: 'user', content: 'hi' }], model: 'claude-sonnet-4-6', maxTokens: 512 },
        { model: 'claude-opus-4-8' },
      );
      expect(p.model).toBe('claude-sonnet-4-6');
      expect(p.max_tokens).toBe(512);
    });

    it('includes system only when provided', () => {
      const without = buildClaudeMessageParams({ messages: [{ role: 'user', content: 'hi' }] });
      expect('system' in without).toBe(false);
      const withSys = buildClaudeMessageParams({ system: 'be terse', messages: [{ role: 'user', content: 'hi' }] });
      expect(withSys.system).toBe('be terse');
    });
  });

  describe('isSamplingLockedModel', () => {
    it('flags the Opus 4.7+/Fable family', () => {
      expect(isSamplingLockedModel('claude-opus-4-8')).toBe(true);
      expect(isSamplingLockedModel('claude-fable-5')).toBe(true);
    });
    it('does not flag other models', () => {
      expect(isSamplingLockedModel('claude-opus-4-6')).toBe(false);
      expect(isSamplingLockedModel('gpt-4o')).toBe(false);
    });
  });

  describe('selectAiProviderName', () => {
    it('uses Claude when a key is present, local otherwise', () => {
      expect(selectAiProviderName('sk-ant-123')).toBe('claude');
      expect(selectAiProviderName(undefined)).toBe('local');
      expect(selectAiProviderName('')).toBe('local');
      expect(selectAiProviderName('   ')).toBe('local');
    });
  });

  it('localFallbackText echoes the last user message', () => {
    const text = localFallbackText([
      { role: 'user', content: 'forecast Q3' },
      { role: 'assistant', content: 'ok' },
      { role: 'user', content: 'now Q4' },
    ]);
    expect(text).toContain('now Q4');
  });
});
