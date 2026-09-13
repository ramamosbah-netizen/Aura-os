import type { CSSProperties } from 'react';
import { getJson } from '@/lib/api';
import MyProjectsClient, { type MyProjectsPage } from '@/components/my-projects-client';
import AuraTabAnchor from '@/components/aura-tab-anchor';

export const dynamic = 'force-dynamic';

/**
 * My Projects — where project work starts.
 *
 * The list comes from `/api/projects/mine`, which decides at the API what this caller is entitled
 * to see. A null response means the API could not be reached, and the client says so rather than
 * rendering an empty list: "the server is down" and "you have no projects" are different answers
 * and a screen that blurs them tells someone they have no work when they have no connection.
 *
 * The global workspaces are not replaced by this and are linked from here on purpose. They answer a
 * different question — "what needs me across everything I work on" — over the same records and the
 * same authorisation.
 */
export default async function MyProjectsPage() {
  const page = await getJson<MyProjectsPage>('/api/projects/mine');

  return (
    <div style={st.page}>
      <AuraTabAnchor href="/my-projects" title="My Projects" type="Workspace" />
      <h1 style={st.h1}>My Projects</h1>
      <p style={st.sub}>
        The projects you are assigned to. Open one to work inside it — engineering, site, quality,
        HSE, testing &amp; commissioning, handover and its reports all read the same records you
        would reach from the global registers, narrowed to that project.
      </p>

      <MyProjectsClient initial={page} />

      <p style={st.footnote}>
        Looking across projects instead? The global registers —{' '}
        <a href="/engineering" style={st.link}>Engineering</a>,{' '}
        <a href="/quality/control" style={st.link}>Quality</a>,{' '}
        <a href="/hse/control" style={st.link}>HSE</a>,{' '}
        <a href="/commissioning" style={st.link}>Testing &amp; Commissioning</a>,{' '}
        <a href="/handover" style={st.link}>Handover</a> — answer what needs your attention across
        everything you are authorised to work on.
      </p>
    </div>
  );
}

const st = {
  page: { padding: '28px 28px 64px' } as CSSProperties,
  h1: { fontSize: 28, margin: '0 0 6px', letterSpacing: -0.5 } as CSSProperties,
  sub: { color: 'var(--muted)', margin: '0 0 22px', maxWidth: 720, lineHeight: 1.5 } as CSSProperties,
  footnote: { marginTop: 28, fontSize: 12.5, color: 'var(--muted)', lineHeight: 1.7, maxWidth: 760 } as CSSProperties,
  link: { color: 'var(--accent)', textDecoration: 'none', fontWeight: 600 } as CSSProperties,
};
