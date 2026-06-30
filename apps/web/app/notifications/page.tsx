import type { CSSProperties } from 'react';
import { getJson } from '@/lib/api';
import NotificationsClient from '../../components/notifications-client';

export const dynamic = 'force-dynamic';

interface Notification {
  id: string; title: string; body: string; category: string; read: boolean; createdAt: string;
}

export default async function NotificationsPage() {
  const items = await getJson<Notification[]>('/api/notifications');
  return (
    <div style={st.page}>
      <h1 style={st.h1}>Notifications</h1>
      <p style={st.sub}>
        In-app notification center — raised automatically from spine events (PO approvals, IPC
        certification, period close, tenders won).
      </p>
      <NotificationsClient initial={items ?? []} />
    </div>
  );
}

const st = {
  page: { maxWidth: 760, margin: '0 auto', padding: '28px 28px 64px' } as CSSProperties,
  h1: { fontSize: 28, margin: '0 0 6px', letterSpacing: -0.5 } as CSSProperties,
  sub: { color: 'var(--muted)', margin: '0 0 22px', maxWidth: 640, lineHeight: 1.5 } as CSSProperties,
};
