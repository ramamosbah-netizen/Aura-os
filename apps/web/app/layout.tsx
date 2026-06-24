import type { ReactNode } from 'react';
import './globals.css';

export const metadata = {
  title: 'AURA OS — Workspace',
  description: 'Tier-1 ERP Operating System',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
