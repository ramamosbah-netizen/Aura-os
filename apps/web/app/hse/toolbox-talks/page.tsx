import type { CSSProperties } from 'react';
import { getJson } from '@/lib/api';
import ToolboxTalksClient from '../../../components/toolbox-talks-client';

export const dynamic = 'force-dynamic';

interface ToolboxTalk {
  id: string;
  projectId: string;
  projectName: string | null;
  topic: string;
  conductedBy: string;
  talkDate: string;
  attendeeCount: number;
  notes: string;
}

export default async function ToolboxTalksPage() {
  const talks = await getJson<ToolboxTalk[]>('/api/hse/toolbox-talks');

  return (
    <div style={st.page}>
      <h1 style={st.h1}>HSE · Toolbox Talks</h1>
      <p style={st.sub}>
        The daily pre-work safety briefing logged on every site — topic, who ran it, the project, date
        and attendee headcount. The audit-trail HSE compliance asks for. Record today&apos;s talk and review
        the history.
      </p>
      <section style={{ marginTop: 10 }}>
        {talks === null ? <p style={st.muted}>API offline.</p> : <ToolboxTalksClient initialTalks={talks ?? []} />}
      </section>
    </div>
  );
}

const st = {
  page: { maxWidth: 1040, margin: '0 auto', padding: '28px 28px 64px' } as CSSProperties,
  h1: { fontSize: 28, margin: '0 0 6px', letterSpacing: -0.5 } as CSSProperties,
  sub: { color: 'var(--muted)', margin: '0 0 22px', maxWidth: 720, lineHeight: 1.5 } as CSSProperties,
  muted: { color: 'var(--muted)', padding: '14px 12px', margin: 0 } as CSSProperties,
};
