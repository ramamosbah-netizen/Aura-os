import type { ReactNode } from 'react';
import type { WorkspaceMe } from '@aura/shared';
import './globals.css';
import AppShell from '../components/app-shell';
import AiDock from '../components/ai-dock';
import { currentUser, getJson } from '@/lib/api';

export const metadata = {
  title: 'AURA OS — Workspace',
  description: 'Tier-1 ERP Operating System',
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const [user, me] = await Promise.all([
    currentUser(),
    getJson<WorkspaceMe>('/api/workspace/me'),
  ]);
  // The sidebar suites the current user's role may see (null = show all, e.g.
  // when the workspace API is unavailable — backward compatible).
  const navSuites = me ? me.functions.filter((f) => f.startsWith('suite.')) : null;

  return (
    <html lang="en">
      <body>
        <AppShell user={user} navSuites={navSuites} isAdmin={me?.isAdmin ?? false}>
          {children}
        </AppShell>
        <AiDock />
      </body>
    </html>
  );
}
