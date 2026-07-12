import type { CSSProperties } from 'react';
import { getJson } from '@/lib/api';
import RelationshipIntelligenceClient, { type AlertsPayload } from '../../../components/relationship-intelligence-client';

export const dynamic = 'force-dynamic';

/**
 * Relationship Intelligence — the CRM alert engine. Turns the data we already
 * hold into one ranked list of "act on this now" signals: deals with no next
 * step, relationships going quiet, deals with no decision-maker, and quotes
 * about to expire.
 */
export default async function RelationshipIntelligencePage() {
  const data = await getJson<AlertsPayload>('/api/crm/intelligence/alerts');

  return (
    <div style={st.page}>
      <h1 style={st.h1}>CRM · Relationship Intelligence</h1>
      <p style={st.sub}>
        Every "act on this now" signal across your commercial relationships, ranked by urgency —
        deals with no next step, relationships going quiet, deals with no decision-maker mapped,
        and quotes about to expire. Act on each one where it lives.
      </p>
      <RelationshipIntelligenceClient data={data} />
    </div>
  );
}

const st = {
  page: { maxWidth: 1100, margin: '0 auto', padding: '28px 28px 64px' } as CSSProperties,
  h1: { fontSize: 28, margin: '0 0 6px', letterSpacing: -0.5 } as CSSProperties,
  sub: { color: 'var(--muted)', margin: '0 0 22px', maxWidth: 720, lineHeight: 1.5 } as CSSProperties,
};
