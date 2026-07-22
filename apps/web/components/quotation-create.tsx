'use client';

import { type CSSProperties, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

// New quotation — step one of the two-step authoring flow.
//
// This does NOT ask for line items. A quote's items come from its pricing sheet, so step one only
// captures who it is for and what it is for; on submit it creates the shell and drops you straight
// into the pricing sheet to author the items. Deliberately two screens: the cost build-up is a
// deliberate estimating task, not something to cram beside a customer field.
//
// CUSTOMER IS SELECT-OR-CREATE. Type a name: an existing account is matched and reused (so quotes
// stay attached to one party rather than spawning duplicates); a genuinely new name is created as
// an account on submit. Either way the quote carries a real accountId, not just a free-text name.

interface Account { id: string; name: string }

export default function QuotationCreate() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [query, setQuery] = useState('');
  const [picked, setPicked] = useState<Account | null>(null);
  const [subject, setSubject] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const busyRef = useRef(false); // setBusy is async; a fast second submit lands before re-render

  // Load the account list once, when the drawer first opens.
  useEffect(() => {
    if (!open || accounts.length > 0) return;
    fetch('/api/crm/accounts', { cache: 'no-store' })
      .then((r) => r.json())
      .then((a) => setAccounts(Array.isArray(a) ? a : []))
      .catch(() => setAccounts([]));
  }, [open, accounts.length]);

  const trimmed = query.trim();
  const matches = useMemo(
    () => (trimmed ? accounts.filter((a) => a.name.toLowerCase().includes(trimmed.toLowerCase())).slice(0, 6) : []),
    [accounts, trimmed],
  );
  const exact = accounts.find((a) => a.name.toLowerCase() === trimmed.toLowerCase()) ?? null;
  // Offer "create" only when what was typed is not already an account and nothing is picked.
  const canCreateNew = trimmed.length > 0 && !exact && !picked;

  function choose(a: Account): void {
    setPicked(a);
    setQuery(a.name);
  }

  async function submit(): Promise<void> {
    if (busyRef.current) return;
    const name = (picked?.name ?? trimmed);
    if (!name) { setErr('Pick or name a customer first.'); return; }
    busyRef.current = true;
    setBusy(true);
    setErr(null);
    try {
      // Resolve the account: the one picked, an existing exact match, or a new one created now.
      let account: Account | null = picked ?? exact;
      if (!account) {
        const res = await fetch('/api/crm/accounts', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ name }),
        });
        if (!res.ok) { setErr('Could not create the customer.'); return; }
        account = (await res.json()) as Account;
      }

      // Create the shell. A placeholder line keeps the draft valid until the sheet generates the
      // real items; the pricing sheet's "Generate lines" replaces it wholesale.
      const res = await fetch('/api/crm/quotations', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          customerName: account.name,
          accountId: account.id,
          subject: subject.trim() || null,
          issueDate: new Date().toISOString().slice(0, 10),
          lines: [{ description: 'To be priced from the sheet', quantity: 1, unitPrice: 0 }],
        }),
      });
      if (!res.ok) { setErr('Could not create the quotation.'); return; }
      const q = await res.json();
      // Step two: straight to the pricing sheet to author the items.
      router.push(`/crm/quotations/${q.id}/pricing`);
    } catch {
      setErr('Could not reach the server — nothing was created.');
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  if (!open) {
    return <button type="button" style={st.openBtn} onClick={() => setOpen(true)}>+ New quotation</button>;
  }

  return (
    <div style={st.backdrop} onClick={() => !busy && setOpen(false)}>
      <div style={st.drawer} onClick={(e) => e.stopPropagation()}>
        <div style={st.head}>
          <b>New quotation</b>
          <button type="button" style={st.x} onClick={() => setOpen(false)} aria-label="close">✕</button>
        </div>
        <p style={st.hint}>Who it's for and what it's for. Items come next, from the pricing sheet.</p>

        <label style={st.label}>Customer
          <div style={st.combo}>
            <input
              value={query}
              onChange={(e) => { setQuery(e.target.value); setPicked(null); }}
              placeholder="Search or type a new customer…"
              style={st.input}
              aria-label="customer"
              autoFocus
            />
            {(matches.length > 0 || canCreateNew) && !picked && (
              <ul style={st.menu}>
                {matches.map((a) => (
                  <li key={a.id}>
                    <button type="button" style={st.option} onClick={() => choose(a)}>{a.name}</button>
                  </li>
                ))}
                {canCreateNew && (
                  <li>
                    <button type="button" style={{ ...st.option, ...st.createOption }} onClick={() => void submit()}>
                      + Create "{trimmed}" as a new customer
                    </button>
                  </li>
                )}
              </ul>
            )}
          </div>
        </label>
        {picked && <p style={st.pickedNote}>Using existing account · {picked.name}</p>}

        <label style={st.label}>Subject
          <input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="What the quote is for — e.g. Tower B ELV fit-out"
            style={st.input}
            aria-label="subject"
          />
          <span style={st.sub}>Becomes the title of the contract and the project.</span>
        </label>

        {err && <p style={st.err}>{err}</p>}

        <div style={st.foot}>
          <button type="button" style={st.primary} onClick={() => void submit()} disabled={busy || !trimmed}>
            {busy ? 'Creating…' : 'Create & open pricing sheet →'}
          </button>
          <button type="button" style={st.ghost} onClick={() => setOpen(false)} disabled={busy}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

const st = {
  openBtn: { background: 'var(--accent)', border: 'none', borderRadius: 8, color: '#0b1020', padding: '8px 16px', fontSize: 13, fontWeight: 700, cursor: 'pointer' } as CSSProperties,
  backdrop: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', justifyContent: 'flex-end', zIndex: 50 } as CSSProperties,
  drawer: { width: 'min(440px, 100%)', height: '100%', background: 'var(--panel)', borderLeft: '1px solid var(--border)', padding: 20, display: 'flex', flexDirection: 'column', gap: 12, overflowY: 'auto' } as CSSProperties,
  head: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 16 } as CSSProperties,
  x: { background: 'transparent', border: 'none', color: 'var(--muted)', fontSize: 16, cursor: 'pointer' } as CSSProperties,
  hint: { color: 'var(--muted)', fontSize: 12.5, lineHeight: 1.5, margin: 0 } as CSSProperties,
  label: { display: 'flex', flexDirection: 'column', gap: 5, fontSize: 12, color: 'var(--muted)', marginTop: 6 } as CSSProperties,
  combo: { position: 'relative' } as CSSProperties,
  input: { background: 'var(--panel-2, var(--panel))', border: '1px solid var(--border-strong, var(--border))', borderRadius: 8, color: 'var(--text, var(--fg))', padding: '9px 11px', fontSize: 13.5, width: '100%', boxSizing: 'border-box' } as CSSProperties,
  menu: { listStyle: 'none', margin: '4px 0 0', padding: 4, position: 'absolute', top: '100%', left: 0, right: 0, background: 'var(--panel)', border: '1px solid var(--border-strong, var(--border))', borderRadius: 8, zIndex: 5, display: 'flex', flexDirection: 'column', gap: 2, boxShadow: '0 8px 24px rgba(0,0,0,0.3)' } as CSSProperties,
  option: { width: '100%', textAlign: 'left', background: 'transparent', border: 'none', color: 'var(--text, var(--fg))', padding: '7px 9px', fontSize: 13, cursor: 'pointer', borderRadius: 6 } as CSSProperties,
  createOption: { color: 'var(--accent)', fontWeight: 600 } as CSSProperties,
  pickedNote: { color: 'var(--good)', fontSize: 11.5, margin: '2px 0 0' } as CSSProperties,
  sub: { color: 'var(--muted)', fontSize: 11, lineHeight: 1.4 } as CSSProperties,
  err: { color: 'var(--bad)', fontSize: 12, margin: '4px 0 0' } as CSSProperties,
  foot: { display: 'flex', gap: 10, marginTop: 'auto', paddingTop: 14 } as CSSProperties,
  primary: { background: 'var(--accent)', border: 'none', borderRadius: 8, color: '#0b1020', padding: '9px 16px', fontSize: 13, fontWeight: 700, cursor: 'pointer' } as CSSProperties,
  ghost: { background: 'transparent', border: '1px solid var(--border-strong, var(--border))', borderRadius: 8, color: 'var(--text, var(--fg))', padding: '9px 16px', fontSize: 13, cursor: 'pointer' } as CSSProperties,
};
