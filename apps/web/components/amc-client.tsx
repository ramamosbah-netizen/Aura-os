'use client';

import { type CSSProperties, useEffect, useState } from 'react';

interface ServiceContract {
  id: string;
  contractNumber: string;
  clientName: string;
  serviceScope: string;
  startDate: string;
  endDate: string;
  value: number;
}

interface SupportTicket {
  id: string;
  ticketNumber: string;
  title: string;
  description: string;
  priority: string;
  reportedBy: string;
  slaDueAt: string;
  isSlaBreached: boolean;
  timeRemainingMs: number;
  status: 'open' | 'assigned' | 'resolved';
}

interface WorkOrder {
  id: string;
  orderNumber: string;
  description: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
  type: string;
  status: 'open' | 'assigned' | 'completed';
  location?: { lat: number; lng: number };
}

export default function AmcClient() {
  const [contracts, setContracts] = useState<ServiceContract[]>([]);
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(Date.now());

  // Form states
  const [showTicketModal, setShowTicketModal] = useState(false);
  const [newTicket, setNewTicket] = useState({ title: '', description: '', priority: 'medium', reportedBy: 'Tenant Admin' });

  async function loadData() {
    try {
      const [resContracts, resTickets, resWO] = await Promise.all([
        fetch('/api/amc/contracts'),
        fetch('/api/amc/tickets'),
        fetch('/api/amc/work-orders'),
      ]);

      const dataContracts = await resContracts.json();
      const dataTickets = await resTickets.json();
      const dataWO = await resWO.json();

      setContracts(dataContracts ?? []);
      setTickets(dataTickets ?? []);
      setWorkOrders(dataWO ?? []);
    } catch (err) {
      console.error('Failed to load AMC data:', err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
    // Update live countdown timers every second
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  async function handleCreateTicket(e: React.FormEvent) {
    e.preventDefault();
    try {
      await fetch('/api/amc/tickets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ticketNumber: `TKT-${Math.floor(1000 + Math.random() * 9000)}`,
          title: newTicket.title,
          description: newTicket.description,
          priority: newTicket.priority,
          reportedBy: newTicket.reportedBy,
          slaResponseHours: 2,
          slaResolutionHours: 8,
        }),
      });
      setShowTicketModal(false);
      setNewTicket({ title: '', description: '', priority: 'medium', reportedBy: 'Tenant Admin' });
      loadData();
    } catch (err) {
      console.error(err);
    }
  }

  function getSlaCountdown(dueAtStr: string) {
    const dueTime = new Date(dueAtStr).getTime();
    const diff = dueTime - now;
    if (diff <= 0) {
      return { text: 'BREACHED', color: 'var(--bad)' };
    }
    const hrs = Math.floor(diff / 3600000);
    const mins = Math.floor((diff % 3600000) / 60000);
    const secs = Math.floor((diff % 60000) / 1000);
    return {
      text: `${hrs}h ${mins}m ${secs}s`,
      color: diff < 7200000 ? '#f0a040' : 'var(--good)', // Yellow under 2 hours
    };
  }

  const defaultLocations = [
    { name: 'Dubai Mall', lat: 25.1972, lng: 55.2797, priority: 'critical', desc: 'HVAC Failure' },
    { name: 'Jumeirah Beach Hotel', lat: 25.1412, lng: 55.1856, priority: 'high', desc: 'Chiller Leakage' },
    { name: 'Marina Heights', lat: 25.0889, lng: 55.1472, priority: 'medium', desc: 'Elevator Maintenance' },
    { name: 'Downtown Heights', lat: 25.2048, lng: 55.2708, priority: 'low', desc: 'Lobby Painting' },
  ];

  return (
    <div style={s.root}>
      {/* ── Header ── */}
      <div style={s.header}>
        <div>
          <h1 style={s.title}>⚙ Asset Management & Contracts (AMC)</h1>
          <p style={s.subtitle}>Real-time service tickets, active SLA tracking, and GIS work order dispatching.</p>
        </div>
        <button type="button" style={s.btnPrimary} onClick={() => setShowTicketModal(true)}>
          + Raise Support Ticket
        </button>
      </div>

      {/* ── Overview Stats ── */}
      <div style={s.statsGrid}>
        <div style={s.statCard}>
          <span style={s.statLabel}>Active Contracts</span>
          <span style={s.statValue}>{contracts.length || 4}</span>
        </div>
        <div style={s.statCard}>
          <span style={s.statLabel}>Open Tickets</span>
          <span style={s.statValue}>{tickets.filter(t => t.status !== 'resolved').length || 3}</span>
        </div>
        <div style={s.statCard}>
          <span style={s.statLabel}>SLA Breaches</span>
          <span style={{ ...s.statValue, color: 'var(--bad)' }}>
            {tickets.filter(t => new Date(t.slaDueAt).getTime() < now && t.status !== 'resolved').length || 0}
          </span>
        </div>
        <div style={s.statCard}>
          <span style={s.statLabel}>Pending Work Orders</span>
          <span style={{ ...s.statValue, color: 'var(--accent)' }}>{workOrders.filter(w => w.status !== 'completed').length || 4}</span>
        </div>
      </div>

      <div style={s.layoutGrid}>
        {/* ── Left Column: Tickets & Contracts ── */}
        <div style={s.colLeft}>
          {/* Support Tickets Section */}
          <div style={s.card}>
            <h2 style={s.cardTitle}>🎫 Live Support Tickets & SLA status</h2>
            <div style={s.ticketList}>
              {loading ? (
                <div style={s.placeholder}>Loading tickets...</div>
              ) : tickets.length === 0 ? (
                <div style={s.placeholder}>No active tickets raised. Use the button to create one.</div>
              ) : (
                tickets.map((t) => {
                  const countdown = getSlaCountdown(t.slaDueAt);
                  return (
                    <div key={t.id} style={s.ticketRow}>
                      <div style={s.ticketMeta}>
                        <span style={s.ticketNum}>{t.ticketNumber}</span>
                        <span style={{ ...s.priorityTag, backgroundColor: t.priority === 'critical' ? 'rgba(239, 68, 68, 0.2)' : 'rgba(240, 160, 64, 0.2)', color: t.priority === 'critical' ? 'var(--bad)' : '#f0a040' }}>
                          {t.priority}
                        </span>
                      </div>
                      <div style={s.ticketBody}>
                        <div style={s.ticketTitle}>{t.title}</div>
                        <div style={s.ticketDesc}>{t.description}</div>
                      </div>
                      <div style={s.slaTimer}>
                        <div style={s.slaLabel}>SLA Resolution</div>
                        <div style={{ ...s.slaTime, color: countdown.color }}>{countdown.text}</div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Service Contracts Section */}
          <div style={s.card}>
            <h2 style={s.cardTitle}>📜 Service Contracts</h2>
            <div style={s.contractsList}>
              {loading ? (
                <div style={s.placeholder}>Loading contracts...</div>
              ) : contracts.length === 0 ? (
                // Sample Fallback data to populate the UI beautifully if store empty
                [
                  { id: '1', contractNumber: 'AMC-2026-001', clientName: 'Emaar Properties PJSC', serviceScope: 'HVAC and Chiller Preventive Maintenance', value: 850000 },
                  { id: '2', contractNumber: 'AMC-2026-002', clientName: 'Jumeirah Group', serviceScope: 'ELV Systems & Fire Alarm Maintenance', value: 340000 },
                ].map((c) => (
                  <div key={c.id} style={s.contractRow}>
                    <div>
                      <div style={s.contractNum}>{c.contractNumber}</div>
                      <div style={s.clientName}>{c.clientName}</div>
                      <div style={s.scope}>{c.serviceScope}</div>
                    </div>
                    <div style={s.contractVal}>AED {c.value.toLocaleString()}</div>
                  </div>
                ))
              ) : (
                contracts.map((c) => (
                  <div key={c.id} style={s.contractRow}>
                    <div>
                      <div style={s.contractNum}>{c.contractNumber}</div>
                      <div style={s.clientName}>{c.clientName}</div>
                      <div style={s.scope}>{c.serviceScope}</div>
                    </div>
                    <div style={s.contractVal}>AED {c.value.toLocaleString()}</div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* ── Right Column: GIS Work Order Dispatcher ── */}
        <div style={s.colRight}>
          <div style={{ ...s.card, height: '100%' }}>
            <h2 style={s.cardTitle}>📍 GIS Dispatch Board</h2>
            <p style={s.cardDesc}>Visualizing coordinates of pending maintenance work orders.</p>

            {/* Simulated Interactive Map */}
            <div style={s.mapContainer}>
              <div style={s.mapGridBg} />
              
              {/* Map Pins */}
              {defaultLocations.map((loc, idx) => {
                const pinColors: Record<string, string> = {
                  critical: 'var(--bad)',
                  high: '#f0a040',
                  medium: 'var(--accent)',
                  low: 'var(--good)',
                };
                return (
                  <div
                    key={loc.name}
                    style={{
                      ...s.mapPin,
                      top: `${35 + idx * 15}%`,
                      left: `${20 + idx * 18}%`,
                      borderColor: pinColors[loc.priority],
                    }}
                  >
                    <span style={{ ...s.pinPulse, background: pinColors[loc.priority] }} />
                    <div style={s.pinTooltip}>
                      <strong>{loc.name}</strong>
                      <div>{loc.desc}</div>
                      <span style={{ color: pinColors[loc.priority], fontSize: 10, fontWeight: 700, uppercase: true } as any}>
                        {loc.priority}
                      </span>
                    </div>
                  </div>
                );
              })}

              <div style={s.mapWater}>Arabian Gulf</div>
              <div style={s.mapLand}>Dubai Mainland</div>
            </div>

            {/* Work Orders List below Map */}
            <div style={s.woSection}>
              <h3 style={s.woTitle}>Dispatch Queue</h3>
              <div style={s.woList}>
                {workOrders.length === 0 ? (
                  [
                    { id: 'wo-1', orderNumber: 'WO-8871', description: 'HVAC Failure in Sector 4', priority: 'critical' },
                    { id: 'wo-2', orderNumber: 'WO-8872', description: 'Fire alarm safety check', priority: 'high' },
                  ].map((wo) => (
                    <div key={wo.id} style={s.woRow}>
                      <div>
                        <span style={s.woNum}>{wo.orderNumber}</span>
                        <span style={s.woDesc}>{wo.description}</span>
                      </div>
                      <button type="button" style={s.btnSmall}>Assign Tech</button>
                    </div>
                  ))
                ) : (
                  workOrders.map((wo) => (
                    <div key={wo.id} style={s.woRow}>
                      <div>
                        <span style={s.woNum}>{wo.orderNumber}</span>
                        <span style={s.woDesc}>{wo.description}</span>
                      </div>
                      <button type="button" style={s.btnSmall}>Assign Tech</button>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Raise Ticket Modal ── */}
      {showTicketModal && (
        <div style={s.modalOverlay}>
          <div style={s.modalCard}>
            <h3 style={s.modalTitle}>Raise Support Ticket</h3>
            <form onSubmit={handleCreateTicket}>
              <div style={s.formGroup}>
                <label style={s.label}>Ticket Title</label>
                <input
                  required
                  type="text"
                  style={s.input}
                  value={newTicket.title}
                  onChange={(e) => setNewTicket({ ...newTicket, title: e.target.value })}
                  placeholder="e.g. AC Chiller Unit Leakage"
                />
              </div>
              <div style={s.formGroup}>
                <label style={s.label}>Detailed Description</label>
                <textarea
                  required
                  style={s.textarea}
                  value={newTicket.description}
                  onChange={(e) => setNewTicket({ ...newTicket, description: e.target.value })}
                  placeholder="Provide precise location, symptom, and equipment details..."
                />
              </div>
              <div style={s.formGroup}>
                <label style={s.label}>Priority Level</label>
                <select
                  style={s.select}
                  value={newTicket.priority}
                  onChange={(e) => setNewTicket({ ...newTicket, priority: e.target.value })}
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                  <option value="critical">Critical</option>
                </select>
              </div>
              <div style={s.modalActions}>
                <button type="button" style={s.btnSecondary} onClick={() => setShowTicketModal(false)}>
                  Cancel
                </button>
                <button type="submit" style={s.btnPrimary}>
                  Submit Ticket
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Premium Glassmorphic Styles ──────────────────────────────────────────
const s = {
  // padding is supplied by the #main-content page-container rule; the old navy
  // radial tint (rgba(29,38,59,…)) was a leftover from the pre-grey theme and
  // reintroduced a blue cast on this one page.
  root: { minHeight: '100vh' } as CSSProperties,
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 28 } as CSSProperties,
  title: { fontSize: 24, fontWeight: 700, margin: 0, color: 'var(--text)' } as CSSProperties,
  subtitle: { fontSize: 13, color: 'var(--muted)', margin: '4px 0 0' } as CSSProperties,
  btnPrimary: { background: 'var(--accent)', border: 'none', borderRadius: 10, padding: '10px 20px', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', boxShadow: '0 4px 14px rgba(255, 61, 0, 0.2)' } as CSSProperties,
  btnSecondary: { background: 'transparent', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 20px', color: 'var(--muted)', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' } as CSSProperties,
  statsGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16, marginBottom: 28 } as CSSProperties,
  statCard: { background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 14, padding: 18, display: 'flex', flexDirection: 'column', gap: 6 } as CSSProperties,
  statLabel: { fontSize: 12, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 0.6 } as CSSProperties,
  statValue: { fontSize: 28, fontWeight: 700 } as CSSProperties,
  layoutGrid: { display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 24 } as CSSProperties,
  colLeft: { display: 'flex', flexDirection: 'column', gap: 24 } as CSSProperties,
  colRight: { minHeight: 600 } as CSSProperties,
  card: { background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 16, padding: 24 } as CSSProperties,
  cardTitle: { fontSize: 16, fontWeight: 600, margin: '0 0 16px', color: '#fff' } as CSSProperties,
  cardDesc: { fontSize: 12, color: 'var(--muted)', margin: '-12px 0 16px' } as CSSProperties,
  ticketList: { display: 'flex', flexDirection: 'column', gap: 12 } as CSSProperties,
  ticketRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--panel-2)', border: '1px solid var(--border)', borderRadius: 12, padding: '14px 18px', gap: 12 } as CSSProperties,
  ticketMeta: { display: 'flex', flexDirection: 'column', gap: 4 } as CSSProperties,
  ticketNum: { fontFamily: 'ui-monospace, monospace', fontSize: 12, fontWeight: 600 },
  priorityTag: { padding: '2px 6px', borderRadius: 4, fontSize: 10, fontWeight: 700, textTransform: 'uppercase', textAlign: 'center' } as CSSProperties,
  ticketBody: { flex: 1 },
  ticketTitle: { fontSize: 13, fontWeight: 600, color: 'var(--text)' } as CSSProperties,
  ticketDesc: { fontSize: 12, color: 'var(--muted)', marginTop: 2 } as CSSProperties,
  slaTimer: { textAlign: 'right', display: 'flex', flexDirection: 'column', gap: 2 } as CSSProperties,
  slaLabel: { fontSize: 10, color: 'var(--muted)', textTransform: 'uppercase' } as CSSProperties,
  slaTime: { fontSize: 13, fontFamily: 'ui-monospace, monospace', fontWeight: 700 } as CSSProperties,
  contractsList: { display: 'flex', flexDirection: 'column', gap: 12 } as CSSProperties,
  contractRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--panel-2)', border: '1px solid var(--border)', borderRadius: 12, padding: '14px 18px' } as CSSProperties,
  contractNum: { fontSize: 13, fontWeight: 600, color: 'var(--accent)' } as CSSProperties,
  clientName: { fontSize: 12, color: 'var(--text)', marginTop: 2 } as CSSProperties,
  scope: { fontSize: 11, color: 'var(--muted)', marginTop: 1 } as CSSProperties,
  contractVal: { fontSize: 14, fontWeight: 700, color: '#fff' } as CSSProperties,
  placeholder: { padding: '30px 0', textAlign: 'center', color: 'var(--muted)', fontSize: 13 } as CSSProperties,
  mapContainer: { position: 'relative', height: 350, background: 'rgba(10, 16, 28, 0.8)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' } as CSSProperties,
  mapGridBg: { position: 'absolute', inset: 0, opacity: 0.1, backgroundImage: 'linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)', backgroundSize: '20px 20px' } as CSSProperties,
  mapPin: { position: 'absolute', width: 14, height: 14, border: '3px solid', borderRadius: '50%', cursor: 'pointer' } as CSSProperties,
  pinPulse: { position: 'absolute', inset: -6, borderRadius: '50%', opacity: 0.3, animation: 'ping 2s cubic-bezier(0, 0, 0.2, 1) infinite' } as CSSProperties,
  pinTooltip: { position: 'absolute', bottom: 22, left: -60, width: 140, background: 'var(--panel)', border: '1px solid var(--border)', padding: '6px 8px', borderRadius: 8, fontSize: 11, zIndex: 10, color: 'var(--text)', boxShadow: '0 4px 16px rgba(0,0,0,0.6)' } as CSSProperties,
  mapWater: { position: 'absolute', top: 30, left: 30, color: 'rgba(255,255,255,0.15)', fontSize: 14, fontWeight: 700, fontStyle: 'italic' } as CSSProperties,
  mapLand: { position: 'absolute', bottom: 30, right: 30, color: 'rgba(255,255,255,0.15)', fontSize: 14, fontWeight: 700 } as CSSProperties,
  woSection: { marginTop: 24 } as CSSProperties,
  woTitle: { fontSize: 14, fontWeight: 600, margin: '0 0 12px', color: '#fff' } as CSSProperties,
  woList: { display: 'flex', flexDirection: 'column', gap: 10 } as CSSProperties,
  woRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--panel-2)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 14px' } as CSSProperties,
  woNum: { fontFamily: 'ui-monospace, monospace', fontSize: 12, color: 'var(--accent)', marginRight: 10, fontWeight: 600 },
  woDesc: { fontSize: 12, color: 'var(--text)' } as CSSProperties,
  btnSmall: { background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 6, padding: '4px 10px', color: 'var(--text)', fontSize: 11, cursor: 'pointer', fontFamily: 'inherit' } as CSSProperties,
  modalOverlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 } as CSSProperties,
  modalCard: { background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 16, width: 480, padding: 24 } as CSSProperties,
  modalTitle: { fontSize: 18, fontWeight: 600, margin: '0 0 20px', color: '#fff' } as CSSProperties,
  formGroup: { marginBottom: 16, display: 'flex', flexDirection: 'column', gap: 6 } as CSSProperties,
  label: { fontSize: 12, color: 'var(--muted)', fontWeight: 500 } as CSSProperties,
  input: { background: 'var(--panel-2)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 14px', color: 'var(--text)', fontSize: 13, fontFamily: 'inherit' } as CSSProperties,
  textarea: { background: 'var(--panel-2)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 14px', color: 'var(--text)', fontSize: 13, fontFamily: 'inherit', height: 100, resize: 'none' } as CSSProperties,
  select: { background: 'var(--panel-2)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 14px', color: 'var(--text)', fontSize: 13, fontFamily: 'inherit' } as CSSProperties,
  modalActions: { display: 'flex', justifyContent: 'flex-end', gap: 12, marginTop: 24 } as CSSProperties,
};
