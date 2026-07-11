'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import type { CSSProperties } from 'react';
import { ADMIN_GROUPS, ADMIN_SECTIONS } from './admin-nav';

// Searchable Admin Center hub ("configure anything from one place"). Type to filter
// every admin function by name, description, group, or keyword — the fastest path
// from "where do I set X?" to the right screen.

/** Extra search keywords per section — what admins actually type. */
const KEYWORDS: Record<string, string> = {
  organization: 'company name trn currency fiscal locale timezone profile legal',
  users: 'invite deactivate leaver account register directory employee login block disable',
  access: 'permission role grant user rbac matrix mfa security who can',
  security: 'auth lockout mfa totp sso entra jwks pii encryption posture password policy',
  workflows: 'workflow approval states transitions instances definition engine',
  'approval-matrix': 'approve threshold band value limit purchase',
  workspace: 'sidebar functions visibility role workspace what users see',
  settings: 'key value tenant raw config',
  modules: 'enable disable module on off feature app crm finance hide turn',
  'module-settings': 'vat rate threshold retention stages defaults payment terms leave policy business',
  'feature-flags': 'toggle rollout enable disable flag',
  numbering: 'sequence prefix invoice number format',
  calendar: 'holiday weekend working days ramadan hours',
  data: 'demo seed csv export import excel power bi accounts',
  connectors: 'erp bank e-invoicing external integration',
  webhooks: 'event delivery endpoint signed subscription',
  notifications: 'email sms slack teams recipient channel routing',
  ai: 'claude provider guardrail keyword token autonomy model',
  health: 'dead letter outbox delivery lag ops monitor',
  audit: 'log compliance who did what history',
  intelligence: 'iec pricing insight proposal calibration',
  templates: 'print document layout builder',
  forms: 'form field label required hidden placeholder hint designer customize rename',
};

export default function AdminHubClient({ counts }: { counts: Record<string, number | undefined> }) {
  const [q, setQ] = useState('');

  const needle = q.trim().toLowerCase();
  const matches = (s: (typeof ADMIN_SECTIONS)[number]): boolean =>
    !needle ||
    `${s.title} ${s.desc} ${s.group} ${s.key} ${KEYWORDS[s.key] ?? ''}`.toLowerCase().includes(needle);

  const visible = ADMIN_SECTIONS.filter(matches);

  return (
    <div>
      <div style={st.searchWrap}>
        <span style={st.searchIcon}>🔎</span>
        <input
          className="input"
          style={st.search}
          placeholder="Find any setting… try “holiday”, “who can approve”, “vat”, “demo data”"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          autoFocus
        />
        {needle && (
          <span style={st.matchCount}>
            {visible.length} match{visible.length === 1 ? '' : 'es'}
          </span>
        )}
      </div>

      {visible.length === 0 ? (
        <p style={st.noHit}>
          No admin screen matches “{q}”. Raw tenant keys live in{' '}
          <Link href="/admin/settings" style={{ fontWeight: 700 }}>Organisation Settings</Link>.
        </p>
      ) : (
        ADMIN_GROUPS.map((group) => {
          const items = visible.filter((s) => s.group === group);
          if (items.length === 0) return null;
          return (
            <div key={group} style={st.groupBlock}>
              <div style={st.groupLabel}>{group}</div>
              <div style={st.grid}>
                {items.map((s) => {
                  const count = counts[s.key];
                  return (
                    <Link key={s.key} href={s.href} className="admin-tile" style={st.tile}>
                      <div style={st.tileTop}>
                        <span style={st.tileGlyph}>{s.glyph}</span>
                        {typeof count === 'number' ? <span style={st.tileCount}>{count}</span> : null}
                      </div>
                      <div style={st.tileTitle}>{s.title}</div>
                      <div style={st.tileDesc}>{s.desc}</div>
                      <div style={st.tileGo}>Open →</div>
                    </Link>
                  );
                })}
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}

const st = {
  searchWrap: { position: 'relative', display: 'flex', alignItems: 'center', gap: 10, marginBottom: 22 } as CSSProperties,
  searchIcon: { position: 'absolute', left: 14, fontSize: 14, pointerEvents: 'none' } as CSSProperties,
  search: { padding: '11px 14px 11px 38px', fontSize: 14, borderRadius: 12, maxWidth: 620 } as CSSProperties,
  matchCount: { fontSize: 12.5, color: 'var(--muted)', whiteSpace: 'nowrap' } as CSSProperties,
  noHit: { color: 'var(--muted)', fontSize: 13.5, padding: '10px 2px' } as CSSProperties,
  groupBlock: { marginBottom: 26 } as CSSProperties,
  groupLabel: { fontSize: 11, fontWeight: 800, letterSpacing: 1.4, textTransform: 'uppercase', color: 'var(--muted)', margin: '0 0 12px 2px' } as CSSProperties,
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(268px, 1fr))', gap: 14 } as CSSProperties,
  tile: { display: 'block', background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 14, padding: 16, color: 'var(--text)', boxShadow: 'var(--shadow-sm)' } as CSSProperties,
  tileTop: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 } as CSSProperties,
  tileGlyph: { width: 34, height: 34, borderRadius: 9, background: 'var(--accent-soft)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 16 } as CSSProperties,
  tileCount: { fontSize: 12, fontWeight: 800, color: 'var(--accent)', background: 'var(--accent-soft)', borderRadius: 999, padding: '2px 10px' } as CSSProperties,
  tileTitle: { fontSize: 14.5, fontWeight: 700, marginBottom: 4 } as CSSProperties,
  tileDesc: { fontSize: 12, color: 'var(--muted)', lineHeight: 1.5, minHeight: 36 } as CSSProperties,
  tileGo: { fontSize: 12, fontWeight: 700, color: 'var(--accent)', marginTop: 10 } as CSSProperties,
};
