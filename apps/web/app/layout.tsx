import type { ReactNode } from 'react';
import './globals.css';
import AppShell from '../components/app-shell';
import AiDock from '../components/ai-dock';
import { currentUser } from '@/lib/api';

export const metadata = {
  title: 'AURA OS — Workspace',
  description: 'Tier-1 ERP Operating System',
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const user = await currentUser();
  return (
    <html lang="en">
      <body>
        <AppShell user={user}>{children}</AppShell>
        <AiDock />
      </body>
    </html>
  );
}
