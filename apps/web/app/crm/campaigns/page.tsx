import type { CSSProperties } from 'react';
import { getJson } from '@/lib/api';
import CampaignsClient, { type Campaign } from '../../../components/campaigns-client';

export const dynamic = 'force-dynamic';

export default async function CrmCampaignsPage() {
  const campaigns = await getJson<Campaign[]>('/api/crm/campaigns');

  return (
    <div style={st.page}>
      <h1 style={st.h1}>Marketing Campaigns</h1>
      <p style={st.sub}>
        The top of the funnel — email blasts, events, referral pushes, paid ads. Track the spend,
        record the leads and revenue it produced, and see which channel actually returns.
      </p>
      <CampaignsClient initial={campaigns ?? []} />
    </div>
  );
}

const st = {
  page: { maxWidth: 1200, margin: '0 auto', padding: '28px 28px 64px' } as CSSProperties,
  h1: { fontSize: 28, margin: '0 0 6px', letterSpacing: -0.5 } as CSSProperties,
  sub: { color: 'var(--muted)', margin: '0 0 18px', maxWidth: 740, lineHeight: 1.5 } as CSSProperties,
};
