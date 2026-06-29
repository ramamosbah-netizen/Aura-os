'use client';

import { type CSSProperties, useState, useEffect } from 'react';

interface Project {
  id: string;
  name: string;
  code: string;
}

interface ProjectLedger {
  projectId: string;
  projectName: string | null;
  budget: number;
  committed: number;
  invoiced: number;
  variance: number;
}

interface WbsNode {
  id: string;
  code: string;
  title: string;
  plannedValue: number;
  earnedValue: number;
  actualCost: number;
  progressPercent: number;
  parentId: string | null;
}

function money(n: number): string {
  return typeof n === 'number' ? '$' + n.toLocaleString(undefined, { maximumFractionDigits: 0 }) : '—';
}

export default function PmDashboard({
  projects,
  ledgers,
}: {
  projects: Project[];
  ledgers: ProjectLedger[];
}) {
  const [selectedProj, setSelectedProj] = useState<string>('');
  const [nodes, setNodes] = useState<WbsNode[]>([]);
  const [loading, setLoading] = useState(false);

  // Set default selected project
  useEffect(() => {
    if (projects && projects.length > 0 && !selectedProj) {
      setSelectedProj(projects[0].id);
    }
  }, [projects, selectedProj]);

  // Fetch WBS nodes on project switcher change
  useEffect(() => {
    if (!selectedProj) return;
    setLoading(true);
    fetch(`/api/projects/wbs?projectId=${selectedProj}`)
      .then((res) => res.json())
      .then((data) => {
        setNodes(Array.isArray(data) ? data : []);
      })
      .catch(() => setNodes([]))
      .finally(() => setLoading(false));
  }, [selectedProj]);

  const activeLedger = ledgers.find((l) => l.projectId === selectedProj);

  // Math for depletion progress
  const budget = activeLedger?.budget ?? 0;
  const committed = activeLedger?.committed ?? 0;
  const invoiced = activeLedger?.invoiced ?? 0;

  const committedPct = budget > 0 ? (committed / budget) * 100 : 0;
  const invoicedPct = budget > 0 ? (invoiced / budget) * 100 : 0;

  return (
    <div style={s.container}>
      <div style={s.head}>
        <div>
          <h2 style={s.h2}>🏗️ Project Manager Dashboard</h2>
          <p style={s.sub}>Track project execution, commit depletion status, and WBS progress nodes.</p>
        </div>
        <div>
          <select
            style={s.select}
            value={selectedProj}
            onChange={(e) => setSelectedProj(e.target.value)}
          >
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({p.code})
              </option>
            ))}
          </select>
        </div>
      </div>

      {activeLedger ? (
        <>
          {/* Project EVM metrics */}
          <div style={s.grid}>
            <div style={s.card}>
              <div style={s.cardVal}>{money(budget)}</div>
              <div style={s.cardLabel}>Authorized Budget</div>
            </div>

            <div style={s.card}>
              <div style={s.cardVal}>{money(committed)}</div>
              <div style={s.cardLabel}>PO Commitments</div>
            </div>

            <div style={s.card}>
              <div style={s.cardVal}>{money(invoiced)}</div>
              <div style={s.cardLabel}>Invoiced Actuals</div>
            </div>

            <div style={s.card}>
              <div style={{ ...s.cardVal, color: activeLedger.variance >= 0 ? 'var(--good)' : 'var(--bad)' }}>
                {activeLedger.variance >= 0 ? money(activeLedger.variance) : `(${money(-activeLedger.variance)})`}
              </div>
              <div style={s.cardLabel}>Remaining Variance</div>
            </div>
          </div>

          {/* Depletion Tracker */}
          <div style={s.panel}>
            <h3 style={s.sectionTitle}>Budget Depletion Progress</h3>
            
            <div style={s.progressRow}>
              <div style={s.progressText}>
                <span>PO Commitments Outflow</span>
                <span>{committedPct.toFixed(1)}%</span>
              </div>
              <div style={s.barTrack}>
                <span style={{ ...s.barFill, width: `${Math.min(100, committedPct)}%`, background: 'var(--accent)' }} />
              </div>
            </div>

            <div style={s.progressRow}>
              <div style={s.progressText}>
                <span>Invoice Actuals Paid Out</span>
                <span>{invoicedPct.toFixed(1)}%</span>
              </div>
              <div style={s.barTrack}>
                <span style={{ ...s.barFill, width: `${Math.min(100, invoicedPct)}%`, background: 'var(--good)' }} />
              </div>
            </div>
          </div>

          {/* WBS nodes tracker */}
          <div style={s.panel}>
            <h3 style={s.sectionTitle}>Work Breakdown Structure (WBS) Nodes</h3>
            {loading ? (
              <div style={s.empty}>Loading WBS hierarchy...</div>
            ) : nodes.length === 0 ? (
              <div style={s.empty}>No WBS tasks configured.</div>
            ) : (
              <div style={s.wbsList}>
                {nodes.map((n) => {
                  const depth = n.code.split('.').length - 1;
                  return (
                    <div
                      key={n.id}
                      style={{
                        ...s.wbsItem,
                        paddingLeft: `${Math.max(12, depth * 24)}px`,
                        background: depth === 0 ? 'var(--panel-2)' : 'transparent',
                      }}
                    >
                      <div style={s.wbsCode}>{n.code}</div>
                      <div style={s.wbsTitle}>{n.title}</div>
                      <div style={s.wbsProgressWrap}>
                        <div style={s.wbsBarTrack}>
                          <span style={{ ...s.wbsBarFill, width: `${n.progressPercent}%` }} />
                        </div>
                        <span style={s.wbsPct}>{n.progressPercent}%</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </>
      ) : (
        <div style={s.panel}>
          <div style={s.empty}>Please select a project to load PM analysis.</div>
        </div>
      )}
    </div>
  );
}

const s = {
  container: { display: 'flex', flexDirection: 'column', gap: 16 } as CSSProperties,
  head: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16 } as CSSProperties,
  h2: { fontSize: 20, margin: 0, fontWeight: 700 } as CSSProperties,
  sub: { fontSize: 13.5, color: 'var(--muted)', margin: 0 } as CSSProperties,
  select: {
    background: 'var(--panel)',
    border: '1px solid var(--border)',
    borderRadius: 8,
    color: 'var(--text)',
    padding: '8px 12px',
    fontSize: 13.5,
    outline: 'none',
    minWidth: 200,
  } as CSSProperties,
  grid: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginTop: 4 } as CSSProperties,
  card: {
    background: 'var(--panel)',
    border: '1px solid var(--border)',
    borderRadius: 14,
    padding: '16px 20px',
  } as CSSProperties,
  cardVal: { fontSize: 22, fontWeight: 700 } as CSSProperties,
  cardLabel: { fontSize: 12.5, color: 'var(--muted)', marginTop: 4 } as CSSProperties,
  panel: {
    background: 'var(--panel)',
    border: '1px solid var(--border)',
    borderRadius: 14,
    padding: '20px',
  } as CSSProperties,
  sectionTitle: { fontSize: 15, margin: '0 0 16px', color: 'var(--text)', fontWeight: 600 } as CSSProperties,
  progressRow: { marginBottom: 14 } as CSSProperties,
  progressText: { display: 'flex', justifyContent: 'space-between', fontSize: 12.5, color: 'var(--muted)', marginBottom: 6 } as CSSProperties,
  barTrack: { height: 8, background: 'var(--panel-2)', borderRadius: 999, overflow: 'hidden' } as CSSProperties,
  barFill: { display: 'block', height: '100%', borderRadius: 999 } as CSSProperties,
  empty: { textAlign: 'center', padding: '24px', color: 'var(--muted)', fontSize: 13.5 } as CSSProperties,
  wbsList: { display: 'flex', flexDirection: 'column', gap: 2 } as CSSProperties,
  wbsItem: {
    display: 'flex',
    alignItems: 'center',
    padding: '10px 12px',
    borderRadius: 8,
    borderBottom: '1px solid var(--border-subtle, rgba(255,255,255,0.02))',
  } as CSSProperties,
  wbsCode: { width: 50, fontSize: 13, fontWeight: 600, color: 'var(--muted)' } as CSSProperties,
  wbsTitle: { flex: 1, fontSize: 13, color: 'var(--text)' } as CSSProperties,
  wbsProgressWrap: { display: 'flex', alignItems: 'center', gap: 10, width: 160 } as CSSProperties,
  wbsBarTrack: { flex: 1, height: 6, background: 'var(--panel-2)', borderRadius: 999, overflow: 'hidden' } as CSSProperties,
  wbsBarFill: { display: 'block', height: '100%', background: 'var(--good)', borderRadius: 999 } as CSSProperties,
  wbsPct: { fontSize: 12, fontWeight: 600, color: 'var(--text)', width: 35, textAlign: 'right' } as CSSProperties,
};
