'use client';

import { type CSSProperties, type FormEvent, useState, useRef, useEffect } from 'react';
import { usePathname } from 'next/navigation';

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

// Context-aware quick prompts: the dock reads the current route and offers
// actions that make sense on this page, not a generic chat opener.
const CONTEXT_SUGGESTIONS: { prefix: string; suggestions: string[] }[] = [
  {
    prefix: '/tendering',
    suggestions: [
      'Analyze the open tenders and flag the riskiest one',
      'Estimate the margin on our latest tender',
      'Generate a risk summary for active bids',
      'Which tenders have deadlines this month?',
    ],
  },
  {
    prefix: '/crm',
    suggestions: [
      'Summarize the sales pipeline',
      'Which opportunities are most likely to close?',
      'Draft a follow-up plan for stale leads',
      'Show the weighted forecast by stage',
    ],
  },
  {
    prefix: '/finance',
    suggestions: [
      'Summarize AR and AP aging',
      'Are there any budget variances?',
      'What is our current cash position?',
      'Which invoices are overdue?',
    ],
  },
  {
    prefix: '/projects',
    suggestions: [
      'Summarize active project performance',
      'Which projects are over budget?',
      'List projects behind schedule',
      'Summarize open variations and their value',
    ],
  },
  {
    prefix: '/procurement',
    suggestions: [
      'Summarize open purchase orders',
      'Which RFQs are waiting on vendor quotes?',
      'Top suppliers by spend',
    ],
  },
  {
    prefix: '/inventory',
    suggestions: [
      'Summarize stock value by warehouse',
      'Any items below reorder level?',
      'Recent goods receipts summary',
    ],
  },
  {
    prefix: '/hr',
    suggestions: [
      'Summarize headcount by department',
      'Which employee documents expire soon?',
      'Summarize pending leave and expense claims',
    ],
  },
  {
    prefix: '/subcontracts',
    suggestions: [
      'Summarize subcontractor exposure',
      'Any claims awaiting certification?',
      'Open back-charges summary',
    ],
  },
  {
    prefix: '/inbox',
    suggestions: [
      'Summarize my pending approvals',
      'Which approvals are most urgent?',
    ],
  },
];

function suggestionsFor(pathname: string): string[] {
  const match = CONTEXT_SUGGESTIONS.find((c) => pathname.startsWith(c.prefix));
  return match?.suggestions ?? DEFAULT_SUGGESTIONS;
}

export default function AiDock() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const threadEndRef = useRef<HTMLDivElement | null>(null);
  const suggestions = suggestionsFor(pathname);

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

  // No dock on the sign-in screen.
  if (pathname === '/login') return null;

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
              Ask anything about active project budgets, the tendering pipeline, or financial
              status. The copilot answers from your live business data.
            </p>
            <div style={s.suggestions}>
              <div style={s.suggestionLabel}>Suggested Queries</div>
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
