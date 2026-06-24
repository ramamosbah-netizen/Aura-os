import type { ReactNode } from 'react';
import './globals.css';
import AiDock from '../components/ai-dock';

export const metadata = {
  title: 'AURA OS — Workspace',
  description: 'Tier-1 ERP Operating System',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        {children}
        <AiDock />
      </body>
    </html>
  );
}
