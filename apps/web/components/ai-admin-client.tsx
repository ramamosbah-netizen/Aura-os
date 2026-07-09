'use client';

import React, { useState } from 'react';
import type { CSSProperties } from 'react';
import { ErrorBanner, Pill, Toggle } from './admin-ui';

// AI administration (Admin Center phase 2, Vol 15 §2.7) — guardrail rule toggles.
// Rules are registered in code (in-memory registry); toggles apply immediately and
// reset to code defaults on reboot — durable rules land with the PG-backed registry.

export interface GuardrailRule {
  key: string;
  label: string;
  type: string;
  enabled: boolean;
  config: Record<string, unknown>;
}

export default function AiAdminClient({ initialRules }: { initialRules: GuardrailRule[] }) {
  const [rules, setRules] = useState<GuardrailRule[]>(initialRules);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const toggle = async (rule: GuardrailRule, enabled: boolean): Promise<void> => {
    setErr(null);
    setBusy(true);
    try {
      const res = await fetch('/api/admin/platform/ai/guardrails', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ key: rule.key, enabled }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setErr(d.message ?? d.error ?? 'Failed to toggle guardrail');
        return;
      }
      setRules(rules.map((r) => (r.key === rule.key ? { ...r, enabled } : r)));
    } finally {
      setBusy(false);
    }
  };

  const summary = (r: GuardrailRule): string => {
    const c = r.config ?? {};
    if (r.type === 'blocked_keywords') return `${((c.keywords as string[]) ?? []).length} blocked keyword(s)`;
    if (r.type === 'max_tokens') return `cap ${c.maxTokens ?? '—'} tokens`;
    if (r.type === 'topic_filter') return `${((c.blockedTopics as string[]) ?? []).length} blocked topic(s)`;
    if (r.type === 'pii_mask') return 'masks PII before model calls';
    return r.type;
  };

  return (
    <section style={st.card}>
      <h2 style={st.h2}>Guardrail rules</h2>
      <p style={st.hint}>
        Every AI completion and autonomy proposal passes these checks. Toggles apply immediately;
        rules are code-registered, so a reboot restores defaults.
      </p>
      <ErrorBanner>{err}</ErrorBanner>
      {rules.length === 0 ? (
        <p style={{ color: 'var(--muted)', fontSize: 13 }}>No guardrail rules registered.</p>
      ) : (
        rules.map((r) => (
          <div key={r.key} style={st.row}>
            <Toggle on={r.enabled} disabled={busy} onChange={(next) => void toggle(r, next)} />
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={st.label}>{r.label}</div>
              <div style={st.sub}>
                <code style={st.code}>{r.key}</code> · {summary(r)}
              </div>
            </div>
            <Pill tone={r.enabled ? 'good' : 'muted'}>{r.enabled ? 'enforcing' : 'off'}</Pill>
          </div>
        ))
      )}
    </section>
  );
}

const st = {
  card: { border: '1px solid var(--border)', borderRadius: 14, padding: 18, marginBottom: 14, background: 'var(--panel)', boxShadow: 'var(--shadow-sm)' } as CSSProperties,
  h2: { fontSize: 14.5, fontWeight: 700, margin: 0 } as CSSProperties,
  hint: { fontSize: 12.5, color: 'var(--muted)', margin: '5px 0 12px', lineHeight: 1.5 } as CSSProperties,
  row: { display: 'flex', alignItems: 'center', gap: 14, padding: '11px 4px', borderTop: '1px solid var(--border)' } as CSSProperties,
  label: { fontSize: 13.5, fontWeight: 700 } as CSSProperties,
  sub: { fontSize: 12, color: 'var(--muted)', marginTop: 1 } as CSSProperties,
  code: { fontFamily: 'ui-monospace, monospace', fontSize: 11, background: 'var(--panel-2)', border: '1px solid var(--border)', borderRadius: 5, padding: '0 4px' } as CSSProperties,
};
