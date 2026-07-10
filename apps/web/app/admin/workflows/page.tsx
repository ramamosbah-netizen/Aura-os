import type { CSSProperties } from 'react';
import { getJson } from '@/lib/api';
import { AdminHeader, AdminCard, AdminOffline, adminPage, type Kpi } from '@/components/admin-chrome';
import { Pill } from '@/components/admin-ui';

export const dynamic = 'force-dynamic';

// Admin Center depth (Vol 15 §2.3): the workflow-definitions registry — every approval
// workflow the kernel enforces, its shape, and live instance counts. Definitions are
// registered in code today; the workflow designer (Vol 11 §11, P3) makes them editable.

interface WorkflowDef {
  key: string;
  name: string;
  version: number;
  tenantScoped: boolean;
  states: number;
  transitions: number;
  initialState: string;
  instances: { running: number; completed: number; total: number };
}

export default async function WorkflowsAdminPage() {
  const data = await getJson<{ definitions: WorkflowDef[] }>('/api/admin/platform/workflows');

  if (!data) {
    return (
      <div style={adminPage}>
        <AdminHeader title="Workflow Registry" glyph="🔀" backToHub subtitle="Registered approval workflows and their live instances." />
        <AdminOffline label="Workflows" />
      </div>
    );
  }

  const defs = data.definitions;
  const totals = defs.reduce(
    (acc, d) => ({ running: acc.running + d.instances.running, total: acc.total + d.instances.total }),
    { running: 0, total: 0 },
  );
  const kpis: Kpi[] = [
    { label: 'Definitions', value: defs.length, sub: 'registered in the kernel', tone: 'accent' },
    { label: 'Open instances', value: totals.running, sub: 'awaiting a transition', tone: totals.running > 0 ? 'info' : 'good' },
    { label: 'All-time instances', value: totals.total, sub: 'this tenant', tone: 'info' },
  ];

  return (
    <div style={adminPage}>
      <AdminHeader
        title="Workflow Registry"
        glyph="🔀"
        backToHub
        subtitle="Every approval workflow the kernel enforces — transitions carry required permissions and ABAC value limits (configure bands in the Approval Matrix). Definitions register in code; the visual designer is on the roadmap (Vol 11 §11)."
        kpis={kpis}
      />

      <AdminCard title="Definitions">
        {defs.length === 0 ? (
          <p style={dim}>No workflow definitions registered for this tenant yet.</p>
        ) : (
          <table style={tbl}>
            <thead>
              <tr>
                <th style={th}>Key</th>
                <th style={th}>Name</th>
                <th style={th}>Scope</th>
                <th style={{ ...th, textAlign: 'right' }}>v</th>
                <th style={{ ...th, textAlign: 'right' }}>States</th>
                <th style={{ ...th, textAlign: 'right' }}>Transitions</th>
                <th style={th}>Initial state</th>
                <th style={{ ...th, textAlign: 'right' }}>Open</th>
                <th style={{ ...th, textAlign: 'right' }}>Completed</th>
              </tr>
            </thead>
            <tbody>
              {defs.map((d) => (
                <tr key={d.key}>
                  <td style={td}><code style={code}>{d.key}</code></td>
                  <td style={td}>{d.name}</td>
                  <td style={td}>{d.tenantScoped ? <Pill tone="info">tenant</Pill> : <Pill tone="muted">global</Pill>}</td>
                  <td style={{ ...td, textAlign: 'right' }}>{d.version}</td>
                  <td style={{ ...td, textAlign: 'right' }}>{d.states}</td>
                  <td style={{ ...td, textAlign: 'right' }}>{d.transitions}</td>
                  <td style={td}><code style={code}>{d.initialState}</code></td>
                  <td style={{ ...td, textAlign: 'right' }}>{d.instances.running > 0 ? <Pill tone="info">{d.instances.running}</Pill> : 0}</td>
                  <td style={{ ...td, textAlign: 'right' }}>{d.instances.completed}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </AdminCard>
    </div>
  );
}

const tbl: CSSProperties = { width: '100%', borderCollapse: 'collapse', fontSize: 12.5 };
const th: CSSProperties = { textAlign: 'left', padding: '6px 8px', borderBottom: '1px solid var(--border)', color: 'var(--muted)', fontSize: 11.5, textTransform: 'uppercase', letterSpacing: 0.4 };
const td: CSSProperties = { padding: '7px 8px', borderBottom: '1px solid var(--border)' };
const dim: CSSProperties = { fontSize: 12.5, color: 'var(--muted)', lineHeight: 1.5, margin: 0 };
const code: CSSProperties = { fontFamily: 'ui-monospace, monospace', fontSize: 11.5, background: 'var(--panel-2)', border: '1px solid var(--border)', borderRadius: 5, padding: '0 4px' };
