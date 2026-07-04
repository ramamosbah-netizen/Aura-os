import type { CSSProperties } from 'react';
import type { WorkspaceConfig, WorkspaceMe } from '@aura/shared';
import { defaultWorkspaceConfig } from '@aura/shared';
import { getJson } from '@/lib/api';
import WorkspaceAdminClient from '../../../components/workspace-admin-client';

export const dynamic = 'force-dynamic';

export default async function WorkspaceAdminPage() {
  const [config, me] = await Promise.all([
    getJson<WorkspaceConfig>('/api/workspace/config'),
    getJson<WorkspaceMe>('/api/workspace/me'),
  ]);

  return (
    <div style={s.shell}>
      <h1 style={s.h1}>Administrator Center · Workspace Access</h1>
      <p style={s.sub}>
        Assign users to roles and configure, per role, exactly which workspace functions each person
        can see and use — panels, quick actions, command perspectives and navigation. Admins see and
        preview every user&apos;s workspace; each user sees only what their role allows.
      </p>
      <WorkspaceAdminClient
        initialConfig={config ?? defaultWorkspaceConfig()}
        isAdmin={me?.isAdmin ?? false}
      />
    </div>
  );
}

const s = {
  shell: { maxWidth: 1080, margin: '0 auto', padding: '24px 28px 64px' } as CSSProperties,
  h1: { fontSize: 26, margin: '0 0 6px', letterSpacing: -0.5 } as CSSProperties,
  sub: { color: 'var(--muted)', margin: '0 0 20px', maxWidth: 760, lineHeight: 1.55, fontSize: 13.5 } as CSSProperties,
};
