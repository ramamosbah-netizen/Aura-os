import type { CSSProperties } from 'react';
import { getJson } from '@/lib/api';
import AmcDispatchClient from '../../../components/amc-dispatch-client';

export const dynamic = 'force-dynamic';

interface Contract { id: string; contractNumber: string; clientName: string }
interface WorkOrder {
  id: string; orderNumber: string; contractId?: string | null; description: string;
  priority: 'low' | 'medium' | 'high' | 'critical'; type: string;
  status: 'open' | 'assigned' | 'in_progress' | 'completed' | 'cancelled';
  assignedTo?: string | null; cost?: number | null; scheduledDate?: string | null;
}

export default async function AmcDispatchPage() {
  const [workOrders, contracts] = await Promise.all([
    getJson<WorkOrder[]>('/api/amc/work-orders'),
    getJson<Contract[]>('/api/amc/contracts'),
  ]);

  return (
    <div style={st.page}>
      <h1 style={st.h1}>Field Service · Dispatch</h1>
      <p style={st.sub}>
        The service board: raise work orders (from tickets, PPM visits or site calls), assign them
        to technicians, and complete them on site. A completed work order captures its billable cost,
        which drives the AMC → AR invoice. Filter by technician for a per-engineer view.
      </p>
      <AmcDispatchClient initialWorkOrders={workOrders ?? []} contracts={contracts ?? []} />
    </div>
  );
}

const st = {
  page: { maxWidth: 1240, margin: '0 auto', padding: '28px 28px 64px' } as CSSProperties,
  h1: { fontSize: 28, margin: '0 0 6px', letterSpacing: -0.5 } as CSSProperties,
  sub: { color: 'var(--muted)', margin: '0 0 22px', maxWidth: 720, lineHeight: 1.5 } as CSSProperties,
};
