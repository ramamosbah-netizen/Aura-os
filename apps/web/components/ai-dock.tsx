'use client';

import { type CSSProperties, type FormEvent, useState, useRef, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { findNavMatch } from './nav';
import { RECORD_TITLE_EVENT } from './record-chrome';

interface Msg {
  role: 'user' | 'assistant';
  text: string;
  provider?: string;
  model?: string;
}

const DEFAULT_SUGGESTIONS = [
  'Summarize active project performance',
  'Are there any budget variances?',
  'Show tender-to-contract win rate',
  'Analyze the ERP pipeline status',
];

/** Page-aware prompt starters — keyed by the pathname's first segment. `{r}` becomes the
 * open record's title when one is announced, so a Tender page suggests analysing THAT tender. */
const AREA_SUGGESTIONS: Record<string, string[]> = {
  tendering: ['Analyze this tender: {r}', 'Estimate the margin on {r}', 'What are the risks on {r}?', 'Suggest vendors for {r}'],
  crm: ['Summarize the sales pipeline', 'Which opportunities need attention?', 'What is our win rate trend?'],
  contracts: ['Summarize contract {r}', 'What obligations are coming due?', 'Compare contract value vs project spend'],
  projects: ['Is {r} on budget?', 'Summarize project variances', 'Which projects have negative variance?'],
  procurement: ['Summarize open POs and spend', 'Which suppliers dominate our spend?', 'Any POs waiting on approval?'],
  finance: ['Summarize cash position and AP/AR', 'Any invoices overdue for payment?', 'Explain the budget variances'],
  inventory: ['Summarize stock value by warehouse', 'Which items are below reorder level?'],
  hr: ['Summarize headcount and pending HR approvals', 'Any visa/permit expiries coming up?'],
  subcontracts: ['Summarize subcontractor exposure', 'Which claims await certification?'],
  inbox: ['Prioritize my pending approvals', 'What is the highest-value item waiting on me?'],
};

function suggestionsFor(pathname: string, record: string | null): string[] {
  const area = pathname.split('/')[1] ?? '';
  const base = AREA_SUGGESTIONS[area];
  if (!base) return DEFAULT_SUGGESTIONS;
  return base
    .filter((s) => record || !s.includes('{r}'))
    .map((s) => s.replace(/\{r\}/g, record ?? ''))
    .concat(base.every((s) => s.includes('{r}')) && !record ? DEFAULT_SUGGESTIONS.slice(0, 2) : []);
}

export default function AiDock() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [record, setRecord] = useState<string | null>(null);
  const threadEndRef = useRef<HTMLDivElement | null>(null);

  // Track the open record so suggestions and chat context name it.
  useEffect(() => setRecord(null), [pathname]);
  useEffect(() => {
    function onTitle(e: Event) {
      const detail = (e as CustomEvent<{ title?: string }>).detail;
      if (detail?.title) setRecord(detail.title);
    }
    window.addEventListener(RECORD_TITLE_EVENT, onTitle);
    return () => window.removeEventListener(RECORD_TITLE_EVENT, onTitle);
  }, []);

  const navMatch = findNavMatch(pathname);
  const suggestions = suggestionsFor(pathname, record);

  // Auto-scroll to bottom of chat
  useEffect(() => {
    if (threadEndRef.current) {
      threadEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [msgs, busy]);

  async function executePrompt(promptText: string) {
    if (busy) return;
    setMsgs((m) => [...m, { role: 'user', text: promptText }]);
    setInput('');
    setBusy(true);

    // Build history matching ChatMessage structure
    const historyPayload = msgs.map((m) => ({
      role: m.role,
      content: m.text,
    }));

    try {
      const res = await fetch('/api/intelligence/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          message: promptText,
          history: historyPayload,
          page: {
            path: pathname,
            module: navMatch ? `${navMatch.group} · ${navMatch.label}` : null,
            record,
          },
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setMsgs((m) => [
          ...m,
          { role: 'assistant', text: data?.error ?? 'Something went wrong.' },
        ]);
      } else {
        setMsgs((m) => [
          ...m,
          {
            role: 'assistant',
            text: data.text ?? '(no response)',
            provider: data.provider,
            model: data.model,
          },
        ]);
      }
    } catch {
      setMsgs((m) => [...m, { role: 'assistant', text: 'Could not reach the AI service.' }]);
    } finally {
      setBusy(false);
    }
  }

  function handleSend(e: FormEvent) {
    e.preventDefault();
    const prompt = input.trim();
    if (!prompt) return;
    executePrompt(prompt);
  }

  if (!open) {
    return (
      <button type="button" style={s.fab} onClick={() => setOpen(true)} aria-label="Open AURA AI">
        <span style={{ fontSize: 16 }}>✦</span> Ask AURA Copilot
      </button>
    );
  }

  return (
    <div style={s.panel}>
      <header style={s.header}>
        <span style={s.title}>
          <span style={{ color: 'var(--accent)' }}>✦</span> AURA Copilot
        </span>
        <button type="button" style={s.close} onClick={() => setOpen(false)} aria-label="Close">
          ×
        </button>
      </header>

      <div style={s.thread}>
        {msgs.length === 0 ? (
          <div style={s.welcome}>
            <p style={s.hint}>
              Ask anything about active project budgets, the tendering pipeline, or financial status. 
              The copilot compiles live context directly from the event spine.
            </p>
            <div style={s.suggestions}>
              <div style={s.suggestionLabel}>
                {navMatch ? `Suggestions for ${navMatch.label}` : 'Suggested Queries'}
              </div>
              {suggestions.map((sug) => (
                <button
                  key={sug}
                  type="button"
                  style={s.sugBtn}
                  onClick={() => executePrompt(sug)}
                >
                  {sug}
                </button>
              ))}
            </div>
          </div>
        ) : (
          msgs.map((m, i) => (
            <div key={i} style={m.role === 'user' ? s.userMsg : s.aiMsg}>
              <div style={s.msgText}>{m.text}</div>
              {m.provider ? (
                <div style={s.badge}>
                  via {m.provider} {m.model ? `(${m.model})` : ''}
                </div>
              ) : null}
            </div>
          ))
        )}
        {busy ? (
          <div style={s.aiMsg}>
            <div style={s.thinkingContainer}>
              <span style={s.dot1}>•</span>
              <span style={s.dot2}>•</span>
              <span style={s.dot3}>•</span>
            </div>
          </div>
        ) : null}
        <div ref={threadEndRef} />
      </div>

      <form onSubmit={handleSend} style={s.inputRow}>
        <input
          style={s.input}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask Copilot..."
          disabled={busy}
        />
        <button type="submit" style={s.send} disabled={busy || !input.trim()}>
          Send
        </button>
      </form>
    </div>
  );
}

const s = {
  fab: {
    position: 'fixed',
    right: 24,
    bottom: 24,
    display: 'inline-flex',
    alignItems: 'center',
    gap: 8,
    background: 'var(--accent)',
    color: '#0b0e14',
    fontWeight: 600,
    fontSize: 13.5,
    border: 'none',
    borderRadius: 999,
    padding: '11px 20px',
    cursor: 'pointer',
    boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
    zIndex: 1000,
  } as CSSProperties,
  panel: {
    position: 'fixed',
    right: 24,
    bottom: 24,
    width: 380,
    maxWidth: 'calc(100vw - 48px)',
    height: 520,
    maxHeight: 'calc(100vh - 48px)',
    display: 'flex',
    flexDirection: 'column',
    background: 'rgba(16, 20, 30, 0.85)',
    backdropFilter: 'blur(16px)',
    border: '1px solid var(--border)',
    borderRadius: 16,
    boxShadow: '0 24px 64px rgba(0,0,0,0.6)',
    overflow: 'hidden',
    zIndex: 1000,
  } as CSSProperties,
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '14px 18px',
    borderBottom: '1px solid var(--border)',
    background: 'rgba(255, 255, 255, 0.02)',
  } as CSSProperties,
  title: { fontWeight: 600, fontSize: 14.5, letterSpacing: 0.2 } as CSSProperties,
  close: {
    background: 'none',
    border: 'none',
    color: 'var(--muted)',
    fontSize: 22,
    lineHeight: 1,
    cursor: 'pointer',
  } as CSSProperties,
  thread: {
    flex: 1,
    overflowY: 'auto',
    padding: 16,
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
  } as CSSProperties,
  welcome: {
    display: 'flex',
    flexDirection: 'column',
    gap: 16,
  } as CSSProperties,
  hint: {
    color: 'var(--muted)',
    fontSize: 13,
    lineHeight: 1.5,
    margin: 0,
  } as CSSProperties,
  suggestions: {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  } as CSSProperties,
  suggestionLabel: {
    fontSize: 11.5,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    color: 'var(--muted)',
    fontWeight: 600,
    marginBottom: 4,
  } as CSSProperties,
  sugBtn: {
    background: 'var(--panel-2)',
    border: '1px solid var(--border)',
    color: 'var(--text)',
    borderRadius: 8,
    padding: '8px 12px',
    fontSize: 12.5,
    textAlign: 'left',
    cursor: 'pointer',
    lineHeight: 1.3,
  } as CSSProperties,
  userMsg: {
    alignSelf: 'flex-end',
    maxWidth: '85%',
    background: 'var(--accent)',
    color: '#0b0e14',
    borderRadius: '12px 12px 2px 12px',
    padding: '10px 14px',
    fontSize: 13.5,
    lineHeight: 1.45,
    wordBreak: 'break-word',
  } as CSSProperties,
  aiMsg: {
    alignSelf: 'flex-start',
    maxWidth: '85%',
    background: 'var(--panel-2)',
    border: '1px solid var(--border)',
    borderRadius: '12px 12px 12px 2px',
    padding: '10px 14px',
    fontSize: 13.5,
    lineHeight: 1.45,
    wordBreak: 'break-word',
  } as CSSProperties,
  msgText: { whiteSpace: 'pre-wrap' } as CSSProperties,
  badge: {
    marginTop: 6,
    fontSize: 10,
    color: 'var(--muted)',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  } as CSSProperties,
  inputRow: {
    display: 'flex',
    gap: 8,
    padding: 14,
    borderTop: '1px solid var(--border)',
    background: 'rgba(0, 0, 0, 0.1)',
  } as CSSProperties,
  input: {
    flex: 1,
    background: 'rgba(0, 0, 0, 0.2)',
    border: '1px solid var(--border)',
    borderRadius: 10,
    color: 'var(--text)',
    padding: '10px 12px',
    fontSize: 13.5,
    outline: 'none',
  } as CSSProperties,
  send: {
    background: 'var(--accent)',
    color: '#0b0e14',
    fontWeight: 600,
    border: 'none',
    borderRadius: 10,
    padding: '0 16px',
    fontSize: 13.5,
    cursor: 'pointer',
  } as CSSProperties,
  thinkingContainer: {
    display: 'flex',
    gap: 4,
    alignItems: 'center',
    padding: '2px 6px',
  } as CSSProperties,
  // Typing animation simulation dots
  dot1: { color: 'var(--accent)', fontSize: 16 } as CSSProperties,
  dot2: { color: 'var(--accent)', fontSize: 16 } as CSSProperties,
  dot3: { color: 'var(--accent)', fontSize: 16 } as CSSProperties,
};
