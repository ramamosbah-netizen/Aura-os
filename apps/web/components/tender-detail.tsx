'use client';

import { type CSSProperties, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

interface Tender {
  id: string;
  title: string;
  reference: string | null;
  accountName: string | null;
  status: 'draft' | 'submitted' | 'won' | 'lost';
  source?: string | null;
  submissionDeadline?: string | null;
  value: number;
  createdAt: string;
}

// T4 — the register's Q&A/change trail on this tender.
interface Clarification {
  id: string;
  kind: 'clarification' | 'addendum';
  reference: string | null;
  title: string;
  body: string | null;
  issuedAt: string;
  responseDue: string | null;
  answer: string | null;
  answeredAt: string | null;
  deadlineExtendedTo: string | null;
}

const SOURCE_LABELS: Record<string, string> = { invitation: 'Invitation to bid', public: 'Public advertisement', private: 'Private / single-source', opportunity: 'From opportunity' };

// T3 — the Go/No-Go bid decision the submission gate requires. Score is computed
// server-side (weighted 0–100 → go ≥70 / conditional ≥50 / no-go); we only render.
interface BidCriterion { name: string; weight: number; score: number }
interface BidScoreRec {
  id: string; totalScore: number; recommendation: 'go' | 'conditional' | 'no_go';
  criteria: BidCriterion[]; notes: string | null; createdAt: string;
}
const DEFAULT_BID_CRITERIA: BidCriterion[] = [
  { name: 'Strategic fit', weight: 3, score: 5 },
  { name: 'Winability (relationship & competition)', weight: 3, score: 5 },
  { name: 'Technical capability', weight: 2, score: 5 },
  { name: 'Capacity to deliver', weight: 1, score: 5 },
  { name: 'Commercial risk (payment, terms)', weight: 1, score: 5 },
];
const REC_META: Record<BidScoreRec['recommendation'], { label: string; color: string }> = {
  go: { label: 'GO', color: '#10b981' },
  conditional: { label: 'CONDITIONAL', color: '#d97706' },
  no_go: { label: 'NO-GO', color: '#ef4444' },
};

interface BOQ {
  id: string;
  tenderId: string;
}

interface BOQItem {
  id: string;
  boqId: string;
  itemCode: string;
  description: string;
  unit: string;
  quantity: number;
  rate: number;
  totalAmount: number;
  ifcGuid: string | null;
}

function money(n: number): string {
  return typeof n === 'number' ? 'AED ' + n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—';
}

export default function TenderDetail({ tender }: { tender: Tender }) {
  const router = useRouter();
  
  // Component State
  const [boq, setBoq] = useState<BOQ | null>(null);
  const [items, setItems] = useState<BOQItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [statusBusy, setStatusBusy] = useState(false);

  // Forms State
  const [addingItem, setAddingItem] = useState(false);
  const [newItemCode, setNewItemCode] = useState('');
  const [newItemDesc, setNewItemDesc] = useState('');
  const [newItemUnit, setNewItemUnit] = useState('m3');
  const [newItemQty, setNewItemQty] = useState('');
  const [newItemRate, setNewItemRate] = useState('');
  const [newItemIfc, setNewItemIfc] = useState('');

  // Edit State
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editItemCode, setEditItemCode] = useState('');
  const [editItemDesc, setEditItemDesc] = useState('');
  const [editItemUnit, setEditItemUnit] = useState('');
  const [editItemQty, setEditItemQty] = useState('');
  const [editItemRate, setEditItemRate] = useState('');
  const [editItemIfc, setEditItemIfc] = useState('');

  // AI Import State
  const [showImportModal, setShowImportModal] = useState(false);
  const [rawText, setRawText] = useState('');
  const [importing, setImporting] = useState(false);
  const [importStep, setImportStep] = useState('');
  const [uploadingExcel, setUploadingExcel] = useState(false);
  const [replaceExisting, setReplaceExisting] = useState(false);
  const [importNote, setImportNote] = useState<string | null>(null);

  // Bid decision (Go/No-Go) state
  const [bidScore, setBidScore] = useState<BidScoreRec | null>(null);
  const [scoringOpen, setScoringOpen] = useState(false);
  const [bidCriteria, setBidCriteria] = useState<BidCriterion[]>(DEFAULT_BID_CRITERIA);
  const [bidNotes, setBidNotes] = useState('');
  const [bidBusy, setBidBusy] = useState(false);

  // Load BOQ on mount
  useEffect(() => {
    fetchBOQ();
    void fetchBidScore();
  }, [tender.id]);

  async function fetchBidScore() {
    try {
      const res = await fetch(`/api/tendering/bid-scores?tenderId=${tender.id}`, { cache: 'no-store' });
      if (!res.ok) return;
      const list = (await res.json()) as BidScoreRec[];
      if (Array.isArray(list) && list.length > 0) {
        setBidScore([...list].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]);
      }
    } catch { /* panel simply stays in "not decided" state */ }
  }

  async function recordBidDecision() {
    setBidBusy(true);
    setErr(null);
    try {
      const res = await fetch('/api/tendering/bid-scores', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ tenderId: tender.id, tenderTitle: tender.title, criteria: bidCriteria, notes: bidNotes || undefined }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.message || d.error || 'Failed to record the bid decision');
      setBidScore(d as BidScoreRec);
      setScoringOpen(false);
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBidBusy(false);
    }
  }

  async function fetchBOQ() {
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch(`/api/tendering/tenders/${tender.id}/boq`);
      if (!res.ok) {
        throw new Error('Failed to load BOQ details');
      }
      const data = await res.json();
      setBoq(data.boq || null);
      setItems(data.items || []);
    } catch (e: any) {
      setErr(e.message || 'API connection failed');
    } finally {
      setLoading(false);
    }
  }

  // Update Status
  async function updateStatus(newStatus: string) {
    setStatusBusy(true);
    setErr(null);
    try {
      const res = await fetch(`/api/tendering/tenders/${tender.id}/status`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        // The gate's verdict lives in `message` (taxonomy body); `error` is just the class label.
        throw new Error(d.message || d.error || 'Failed to update status');
      }
      router.refresh();
      // Reload tender value in local view
      window.location.reload();
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setStatusBusy(false);
    }
  }

  // Add Item
  async function handleAddItem(e: React.FormEvent) {
    e.preventDefault();
    if (!boq) return;
    setErr(null);

    try {
      const res = await fetch(`/api/tendering/tenders/${tender.id}/boq`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          boqId: boq.id,
          itemCode: newItemCode,
          description: newItemDesc,
          unit: newItemUnit,
          quantity: Number(newItemQty) || 0,
          rate: Number(newItemRate) || 0,
          ifcGuid: newItemIfc || null,
        }),
      });

      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || 'Failed to add BOQ item');
      }

      // Reset form
      setNewItemCode('');
      setNewItemDesc('');
      setNewItemUnit('m3');
      setNewItemQty('');
      setNewItemRate('');
      setNewItemIfc('');
      setAddingItem(false);

      // Refresh BOQ & Tender value
      await fetchBOQ();
      router.refresh();
    } catch (e: any) {
      setErr(e.message);
    }
  }

  // Start Edit
  function startEdit(item: BOQItem) {
    setEditingId(item.id);
    setEditItemCode(item.itemCode);
    setEditItemDesc(item.description);
    setEditItemUnit(item.unit);
    setEditItemQty(String(item.quantity));
    setEditItemRate(String(item.rate));
    setEditItemIfc(item.ifcGuid || '');
  }

  // Save Edit
  async function handleSaveEdit(itemId: string) {
    setErr(null);
    try {
      const res = await fetch(`/api/tendering/tenders/${tender.id}/boq/items/${itemId}`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          itemCode: editItemCode,
          description: editItemDesc,
          unit: editItemUnit,
          quantity: Number(editItemQty) || 0,
          rate: Number(editItemRate) || 0,
          ifcGuid: editItemIfc || null,
        }),
      });

      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || 'Failed to update item');
      }

      setEditingId(null);
      await fetchBOQ();
      router.refresh();
    } catch (e: any) {
      setErr(e.message);
    }
  }

  // Delete Item
  async function handleDeleteItem(itemId: string) {
    if (!confirm('Are you sure you want to delete this BOQ item?')) return;
    setErr(null);
    try {
      const res = await fetch(`/api/tendering/tenders/${tender.id}/boq/items/${itemId}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || 'Failed to delete item');
      }
      await fetchBOQ();
      router.refresh();
    } catch (e: any) {
      setErr(e.message);
    }
  }

  // Simulate AI OCR / PDF parsing
  async function handleAIImport() {
    if (!boq) return;
    setImporting(true);
    setErr(null);

    setImportStep('Parsing pasted BOQ lines…');

    // Parse pasted CSV/tab lines — what does not parse is reported, never invented.
    const parsedItems = [];
    if (rawText.trim()) {
      // Simple CSV/tab parser
      const lines = rawText.split('\n');
      for (const line of lines) {
        const parts = line.split(/[,\t]/);
        if (parts.length >= 4) {
          const itemCode = parts[0]?.trim();
          const description = parts[1]?.trim();
          const unit = parts[2]?.trim();
          const quantity = Number(parts[3]) || 0;
          const rate = Number(parts[4]) || 0;
          const ifcGuid = parts[5]?.trim() || null;
          if (itemCode && description && unit) {
            parsedItems.push({ itemCode, description, unit, quantity, rate, ifcGuid });
          }
        }
      }
    }

    if (parsedItems.length === 0) {
      setErr('Nothing parseable — paste lines as: code, description, unit, quantity, rate[, ifcGuid]. No data is ever invented.');
      setImporting(false);
      setImportStep('');
      return;
    }

    try {
      const res = await fetch(`/api/tendering/tenders/${tender.id}/boq/import`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          boqId: boq.id,
          mode: replaceExisting ? 'replace' : 'append',
          items: parsedItems,
        }),
      });

      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.message || d.error || 'BOQ import failed');

      setRawText('');
      setShowImportModal(false);
      setImportNote(`Imported ${d.items?.length ?? 0} line(s)${d.replaced ? ` (replaced ${d.replaced} existing)` : ''}.`);
      await fetchBOQ();
      router.refresh();
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setImporting(false);
      setImportStep('');
    }
  }

  async function handleExcelUpload(file: File) {
    if (!boq) return;
    setUploadingExcel(true);
    setErr(null);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('boqId', boq.id);
      formData.append('mode', replaceExisting ? 'replace' : 'append');

      const res = await fetch(`/api/tendering/tenders/${tender.id}/boq/upload`, {
        method: 'POST',
        body: formData,
      });

      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.message || d.error || 'Failed to upload BOQ Excel file');

      setShowImportModal(false);
      setImportNote(
        `Imported ${d.items?.length ?? 0} line(s) from the sheet (header on row ${d.headerRow})` +
          (d.replaced ? `, replaced ${d.replaced} existing` : '') +
          (d.issues?.length ? `. ${d.issues.length} row(s) need attention: ${d.issues.slice(0, 5).map((i: { row: number; problem: string }) => `row ${i.row} — ${i.problem}`).join('; ')}${d.issues.length > 5 ? '…' : ''}` : '.'),
      );
      await fetchBOQ();
      router.refresh();
    } catch (e: any) {
      setErr(e.message || 'Excel upload failed');
    } finally {
      setUploadingExcel(false);
    }
  }

  return (
    <div style={s.container}>
      {/* HEADER CARD */}
      <section style={s.panelHeader}>
        <div style={s.headerMain}>
          <div>
            <span style={s.refTag}>{tender.reference || 'REF-PENDING'}</span>
            <h1 style={s.title}>{tender.title}</h1>
            <p style={s.subtitle}>
              Customer: <strong>{tender.accountName ?? '—'}</strong> | Created: {new Date(tender.createdAt).toLocaleDateString()}
              {tender.source && <> | Source: <strong>{SOURCE_LABELS[tender.source] ?? tender.source}</strong></>}
              {tender.submissionDeadline && <> | Deadline: <strong>{tender.submissionDeadline}</strong></>}
            </p>
          </div>
          <div style={s.headerStats}>
            <div style={s.statCard}>
              <span style={s.statLabel}>Total Cost Estimate</span>
              <span style={s.statVal}>{money(tender.value)}</span>
            </div>
          </div>
        </div>

        {/* STATUS ACTIONS */}
        <div style={s.statusBar}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={s.statusTag(tender.status)}>Status: {tender.status}</span>
            {statusBusy && <span style={s.spinnerSmall} />}
          </div>
          <div style={s.btnGroup}>
            <button
              disabled={tender.status === 'won' || statusBusy}
              onClick={() => updateStatus('won')}
              style={{ ...s.btnStatus, background: '#10b981', color: '#fff' }}
            >
              Mark Won (Awarded)
            </button>
            <button
              disabled={tender.status === 'lost' || statusBusy}
              onClick={() => updateStatus('lost')}
              style={{ ...s.btnStatus, background: '#ef4444', color: '#fff' }}
            >
              Mark Lost
            </button>
            <button
              disabled={tender.status === 'submitted' || statusBusy}
              onClick={() => updateStatus('submitted')}
              style={s.btnSecondary}
            >
              Submit Tender
            </button>
          </div>
        </div>
      </section>

      {err && <div style={s.errorBar}>{err}</div>}
      {importNote && <div style={{ ...s.errorBar, borderColor: 'var(--good, #10b981)', color: 'var(--good, #10b981)' }}>{importNote}</div>}

      {/* BID DECISION (Go/No-Go) — the submission gate requires this on record */}
      <section style={s.boqSection}>
        <div style={s.sectionHeader}>
          <h2 style={s.sectionTitle}>Bid Decision (Go / No-Go)</h2>
          {bidScore && !scoringOpen && (
            <button type="button" style={s.btnSecondary} onClick={() => setScoringOpen(true)}>Re-score</button>
          )}
        </div>
        {bidScore && !scoringOpen ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 13, fontWeight: 800, color: REC_META[bidScore.recommendation].color, border: `1px solid ${REC_META[bidScore.recommendation].color}`, borderRadius: 999, padding: '3px 14px' }}>
              {REC_META[bidScore.recommendation].label}
            </span>
            <span style={{ fontSize: 13, color: 'var(--muted)' }}>
              Score <strong style={{ color: 'var(--fg)' }}>{bidScore.totalScore}/100</strong>
              {' · '}{bidScore.criteria.map((c) => `${c.name} ${c.score}/10`).join(' · ')}
            </span>
            {bidScore.notes && <span style={{ fontSize: 12.5, color: 'var(--muted)' }}>“{bidScore.notes}”</span>}
          </div>
        ) : (
          <div>
            <p style={{ fontSize: 12.5, color: 'var(--muted)', margin: '0 0 10px' }}>
              {scoringOpen ? 'Re-score the bid — a new decision supersedes the old one.' : 'Not decided yet — the submission gate requires a Go/Conditional decision on record before this bid can be submitted.'}
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxWidth: 560 }}>
              {bidCriteria.map((c, i) => (
                <label key={c.name} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12.5 }}>
                  <span style={{ flex: 1 }}>{c.name} <span style={{ color: 'var(--muted)' }}>(w{c.weight})</span></span>
                  <input type="range" min={0} max={10} value={c.score} style={{ width: 160 }}
                    onChange={(e) => setBidCriteria(bidCriteria.map((x, j) => j === i ? { ...x, score: Number(e.target.value) } : x))} />
                  <span style={{ width: 34, textAlign: 'right', fontWeight: 700 }}>{c.score}/10</span>
                </label>
              ))}
              <input value={bidNotes} onChange={(e) => setBidNotes(e.target.value)} placeholder="Notes — why this call? (optional)"
                style={{ background: 'var(--panel-2, transparent)', border: '1px solid var(--border)', borderRadius: 8, padding: '7px 10px', color: 'var(--fg)', fontSize: 12.5, marginTop: 4 }} />
              <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                <button type="button" disabled={bidBusy} style={s.btnAccent} onClick={() => void recordBidDecision()}>Record decision</button>
                {scoringOpen && <button type="button" style={s.btnSecondary} onClick={() => setScoringOpen(false)}>Cancel</button>}
              </div>
            </div>
          </div>
        )}
      </section>

      {/* BOQ SECTION */}
      <section style={s.boqSection}>
        <div style={s.sectionHeader}>
          <h2 style={s.sectionTitle}>Bill of Quantities (BOQ) & Pricing Breakdown</h2>
          <div style={{ display: 'flex', gap: 10 }}>
            <button type="button" onClick={() => setShowImportModal(true)} style={s.btnAI}>
              ✦ AI Import (OCR/Excel)
            </button>
            <button type="button" onClick={() => setAddingItem(!addingItem)} style={s.btnAccent}>
              {addingItem ? 'Cancel' : '+ Add Line Item'}
            </button>
          </div>
        </div>

        {/* Add Item form panel */}
        {addingItem && (
          <form onSubmit={handleAddItem} style={s.formPanel}>
            <h3 style={s.formTitle}>Add New Estimating Line</h3>
            <div style={s.formFields}>
              <input
                style={s.inputCode}
                value={newItemCode}
                onChange={(e) => setNewItemCode(e.target.value)}
                placeholder="Code (e.g. 1.1)"
                required
              />
              <input
                style={s.inputDesc}
                value={newItemDesc}
                onChange={(e) => setNewItemDesc(e.target.value)}
                placeholder="Item Description"
                required
              />
              <input
                style={s.inputUnit}
                value={newItemUnit}
                onChange={(e) => setNewItemUnit(e.target.value)}
                placeholder="Unit (m3, ton, sqm)"
                required
              />
              <input
                style={s.inputNum}
                type="number"
                step="any"
                value={newItemQty}
                onChange={(e) => setNewItemQty(e.target.value)}
                placeholder="Qty"
                required
              />
              <input
                style={s.inputNum}
                type="number"
                step="any"
                value={newItemRate}
                onChange={(e) => setNewItemRate(e.target.value)}
                placeholder="Rate (AED)"
                required
              />
              <input
                style={s.inputIfc}
                value={newItemIfc}
                onChange={(e) => setNewItemIfc(e.target.value)}
                placeholder="BIM IFC GUID (Optional)"
              />
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
              <button type="submit" style={s.btnAccent}>Save Line Item</button>
              <button type="button" onClick={() => setAddingItem(false)} style={s.btnSecondary}>Cancel</button>
            </div>
          </form>
        )}

        {/* BOQ Items Tree Table */}
        <div style={s.panelTable}>
          {loading ? (
            <div style={s.loaderContainer}>
              <div style={s.spinnerLarge} />
              <p style={s.muted}>Loading estimating spreadsheet...</p>
            </div>
          ) : items.length === 0 ? (
            <div style={s.emptyState}>
              <p style={{ margin: 0, fontWeight: 500 }}>No BOQ items exist yet.</p>
              <p style={{ margin: '4px 0 16px', color: 'var(--muted)', fontSize: 13 }}>
                Populate the estimate manually or import a BOQ spreadsheet using AURA AI.
              </p>
              <div style={{ display: 'flex', gap: 10 }}>
                <button type="button" onClick={() => setShowImportModal(true)} style={s.btnAI}>
                  ✦ AI Import PDF/Excel
                </button>
                <button type="button" onClick={() => setAddingItem(true)} style={s.btnSecondary}>
                  Add Line Item Manually
                </button>
              </div>
            </div>
          ) : (
            <table style={s.table}>
              <thead>
                <tr>
                  <th style={s.th}>Item Code</th>
                  <th style={s.thDesc}>Description</th>
                  <th style={s.th}>Unit</th>
                  <th style={s.thRight}>Quantity</th>
                  <th style={s.thRight}>Rate</th>
                  <th style={s.thRight}>Total Amount</th>
                  <th style={s.th}>BIM IFC Link</th>
                  <th style={s.thActions}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => {
                  const depth = item.itemCode.split('.').length - 1;
                  const isEditing = editingId === item.id;

                  return (
                    <tr key={item.id} style={s.row(depth)}>
                      {isEditing ? (
                        <>
                          <td style={s.td}>
                            <input
                              style={s.tableInput}
                              value={editItemCode}
                              onChange={(e) => setEditItemCode(e.target.value)}
                            />
                          </td>
                          <td style={s.td}>
                            <input
                              style={{ ...s.tableInput, width: '100%' }}
                              value={editItemDesc}
                              onChange={(e) => setEditItemDesc(e.target.value)}
                            />
                          </td>
                          <td style={s.td}>
                            <input
                              style={s.tableInput}
                              value={editItemUnit}
                              onChange={(e) => setEditItemUnit(e.target.value)}
                            />
                          </td>
                          <td style={s.td}>
                            <input
                              style={{ ...s.tableInput, textAlign: 'right' }}
                              type="number"
                              value={editItemQty}
                              onChange={(e) => setEditItemQty(e.target.value)}
                            />
                          </td>
                          <td style={s.td}>
                            <input
                              style={{ ...s.tableInput, textAlign: 'right' }}
                              type="number"
                              value={editItemRate}
                              onChange={(e) => setEditItemRate(e.target.value)}
                            />
                          </td>
                          <td style={s.tdRight}>
                            {money((Number(editItemQty) || 0) * (Number(editItemRate) || 0))}
                          </td>
                          <td style={s.td}>
                            <input
                              style={s.tableInput}
                              value={editItemIfc}
                              onChange={(e) => setEditItemIfc(e.target.value)}
                              placeholder="IFC GUID"
                            />
                          </td>
                          <td style={s.td}>
                            <div style={{ display: 'flex', gap: 6 }}>
                              <button
                                type="button"
                                onClick={() => handleSaveEdit(item.id)}
                                style={{ ...s.btnTableAction, background: 'var(--good)', color: '#0b0e14' }}
                              >
                                Save
                              </button>
                              <button
                                type="button"
                                onClick={() => setEditingId(null)}
                                style={s.btnTableAction}
                              >
                                Cancel
                              </button>
                            </div>
                          </td>
                        </>
                      ) : (
                        <>
                          <td style={{ ...s.td, paddingLeft: `${12 + depth * 14}px` }}>
                            <span style={s.itemCodeTag(depth)}>{item.itemCode}</span>
                          </td>
                          <td style={s.tdDesc(depth)}>
                            {item.description}
                          </td>
                          <td style={s.tdMuted}>{item.unit}</td>
                          <td style={s.tdRight}>{item.quantity.toLocaleString()}</td>
                          <td style={s.tdRight}>{item.rate.toLocaleString()}</td>
                          <td style={{ ...s.tdRight, fontWeight: depth === 0 ? '700' : '500' }}>
                            {money(item.totalAmount)}
                          </td>
                          <td style={s.td}>
                            {item.ifcGuid ? (
                              <span style={s.bimTag} title={item.ifcGuid}>
                                🧊 {item.ifcGuid.substring(0, 10)}...
                              </span>
                            ) : (
                              <span style={{ color: 'var(--muted)', fontSize: 11 }}>No Link</span>
                            )}
                          </td>
                          <td style={s.td}>
                            <div style={{ display: 'flex', gap: 6 }}>
                              <button
                                type="button"
                                onClick={() => startEdit(item)}
                                style={s.btnTableAction}
                              >
                                Edit
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteItem(item.id)}
                                style={{ ...s.btnTableAction, color: '#ef4444' }}
                              >
                                Delete
                              </button>
                            </div>
                          </td>
                        </>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </section>

      {/* CLARIFICATIONS & ADDENDA (T4) */}
      <ClarificationsPanel tenderId={tender.id} onDeadlineMoved={() => router.refresh()} />

      {/* AI IMPORT DIALOG MODAL */}
      {showImportModal && (
        <div style={s.modalOverlay}>
          <div style={s.modalContent}>
            <div style={s.modalHeader}>
              <h3 style={{ margin: 0, fontSize: 18 }}>AURA AI - Bill of Quantities OCR Engine</h3>
              <button
                type="button"
                onClick={() => {
                  if (!importing) setShowImportModal(false);
                }}
                style={s.modalClose}
                disabled={importing}
              >
                ✕
              </button>
            </div>

            <div style={{ padding: '16px 20px 24px' }}>
              {importing || uploadingExcel ? (
                <div style={s.aiLoaderBox}>
                  <div style={s.spinnerLarge} />
                  <p style={s.aiProgressStep}>{uploadingExcel ? 'Uploading & parsing Excel spreadsheet...' : importStep}</p>
                  <p style={{ color: 'var(--muted)', fontSize: 12, margin: 0 }}>
                    Please wait. AURA is reading Excel columns and syncing items to the CBS database.
                  </p>
                </div>
              ) : (
                <>
                  <div style={{
                    border: '2px dashed var(--border)',
                    borderRadius: 12,
                    padding: '24px 20px',
                    textAlign: 'center',
                    marginBottom: 20,
                    background: 'rgba(255, 255, 255, 0.02)',
                  }}>
                    <p style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 600 }}>Direct Excel Ingestion</p>
                    <p style={{ margin: '0 0 16px', fontSize: 12, color: 'var(--muted)' }}>
                      Ingest standard .xlsx formats. Columns for Item Code, Description, Unit, Qty, and Rate will be matched automatically.
                    </p>
                    <input
                      type="file"
                      accept=".xlsx, .xls"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handleExcelUpload(file);
                      }}
                      style={{ display: 'none' }}
                      id="excel-upload-file-input"
                    />
                    <label htmlFor="excel-upload-file-input" style={s.btnAccent}>
                      Select Excel File
                    </label>
                    <label style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 12, fontSize: 12.5, color: 'var(--muted)', justifyContent: 'center' }}>
                      <input type="checkbox" checked={replaceExisting} onChange={(e) => setReplaceExisting(e.target.checked)} />
                      Replace the existing BOQ (clears current items — their estimates go with them)
                    </label>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', margin: '20px 0', color: 'var(--muted)' }}>
                    <div style={{ flex: 1, height: '1px', background: 'var(--border)' }}></div>
                    <span style={{ padding: '0 10px', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5 }}>OR AI OCR Extraction</span>
                    <div style={{ flex: 1, height: '1px', background: 'var(--border)' }}></div>
                  </div>

                  <p style={{ margin: '0 0 14px', fontSize: 13, color: 'var(--muted)', lineHeight: 1.5 }}>
                    Copy-paste raw BOQ lines (code, description, unit, quantity, rate[, ifcGuid]) from a
                    PDF or spreadsheet — only what parses is imported, nothing is invented. PDF/OCR file
                    extraction is a later slice.
                  </p>
                  <textarea
                    style={s.textarea}
                    placeholder="Example raw paste:
1.1, Earthworks and general site clearing, m3, 1500, 45, IFC-E-102
2.1, Cast in situ concrete slabs, m3, 400, 390, IFC-S-550
..."
                    value={rawText}
                    onChange={(e) => setRawText(e.target.value)}
                    rows={8}
                  />
                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 18 }}>
                    <button
                      type="button"
                      disabled={importing || uploadingExcel}
                      onClick={() => setShowImportModal(false)}
                      style={s.btnSecondary}
                    >
                      Cancel
                    </button>
                    <button type="button" onClick={handleAIImport} style={s.btnAI}>
                      ✦ Run AI Extraction & Import
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// STYLING
const inputStyle: CSSProperties = {
  background: 'var(--panel-2)',
  border: '1px solid var(--border)',
  borderRadius: 8,
  color: 'var(--text)',
  padding: '8px 12px',
  fontSize: 13,
  outline: 'none',
};

const s = {
  container: { display: 'flex', flexDirection: 'column', gap: 20 } as CSSProperties,
  muted: { color: 'var(--muted)', fontSize: 13 } as CSSProperties,
  panelHeader: {
    background: 'var(--panel)',
    border: '1px solid var(--border)',
    borderRadius: 16,
    padding: '24px 24px 18px',
  } as CSSProperties,
  headerMain: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    borderBottom: '1px solid var(--border)',
    paddingBottom: 20,
    flexWrap: 'wrap',
    gap: 16,
  } as CSSProperties,
  refTag: {
    fontSize: 11,
    fontWeight: 600,
    background: 'rgba(255, 193, 7, 0.1)',
    color: 'var(--accent)',
    border: '1px solid rgba(255, 193, 7, 0.2)',
    borderRadius: 6,
    padding: '2px 8px',
    letterSpacing: 0.5,
  } as CSSProperties,
  title: {
    fontSize: 26,
    margin: '8px 0 4px',
    letterSpacing: -0.5,
  } as CSSProperties,
  subtitle: {
    color: 'var(--muted)',
    margin: 0,
    fontSize: 13.5,
  } as CSSProperties,
  headerStats: {
    display: 'flex',
    gap: 16,
  } as CSSProperties,
  statCard: {
    background: 'var(--panel-2)',
    border: '1px solid var(--border)',
    borderRadius: 12,
    padding: '12px 18px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-end',
  } as CSSProperties,
  statLabel: {
    fontSize: 11,
    color: 'var(--muted)',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  } as CSSProperties,
  statVal: {
    fontSize: 22,
    fontWeight: 800,
    color: 'var(--good)',
    marginTop: 4,
  } as CSSProperties,
  statusBar: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 14,
    flexWrap: 'wrap',
    gap: 12,
  } as CSSProperties,
  btnGroup: {
    display: 'flex',
    gap: 8,
  } as CSSProperties,
  btnStatus: {
    border: 'none',
    borderRadius: 8,
    padding: '7px 14px',
    fontSize: 12.5,
    fontWeight: 600,
    cursor: 'pointer',
  } as CSSProperties,
  btnSecondary: {
    background: 'var(--panel-2)',
    border: '1px solid var(--border)',
    color: 'var(--text)',
    borderRadius: 8,
    padding: '7px 14px',
    fontSize: 12.5,
    cursor: 'pointer',
  } as CSSProperties,
  btnAccent: {
    background: 'var(--accent)',
    color: '#0b0e14',
    fontWeight: 600,
    border: 'none',
    borderRadius: 8,
    padding: '7px 14px',
    fontSize: 12.5,
    cursor: 'pointer',
  } as CSSProperties,
  btnAI: {
    background: 'linear-gradient(135deg, #a855f7 0%, #6366f1 100%)',
    color: '#fff',
    fontWeight: 600,
    border: 'none',
    borderRadius: 8,
    padding: '7px 14px',
    fontSize: 12.5,
    cursor: 'pointer',
    boxShadow: '0 0 12px rgba(99, 102, 241, 0.3)',
  } as CSSProperties,
  boqSection: {
    background: 'var(--panel)',
    border: '1px solid var(--border)',
    borderRadius: 16,
    padding: 20,
  } as CSSProperties,
  sectionHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
    flexWrap: 'wrap',
    gap: 12,
  } as CSSProperties,
  sectionTitle: {
    fontSize: 18,
    margin: 0,
    fontWeight: 600,
  } as CSSProperties,
  formPanel: {
    background: 'var(--panel-2)',
    border: '1px solid var(--border)',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  } as CSSProperties,
  formTitle: {
    fontSize: 14,
    margin: '0 0 12px',
    color: 'var(--accent)',
  } as CSSProperties,
  formFields: {
    display: 'grid',
    gridTemplateColumns: '80px 1fr 100px 100px 120px 180px',
    gap: 8,
  } as CSSProperties,
  inputCode: { ...inputStyle } as CSSProperties,
  inputDesc: { ...inputStyle } as CSSProperties,
  inputUnit: { ...inputStyle } as CSSProperties,
  inputNum: { ...inputStyle, textAlign: 'right' } as CSSProperties,
  inputIfc: { ...inputStyle } as CSSProperties,
  panelTable: {
    border: '1px solid var(--border)',
    borderRadius: 12,
    overflow: 'hidden',
  } as CSSProperties,
  loaderContainer: {
    padding: '60px 0',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 12,
  } as CSSProperties,
  emptyState: {
    padding: '48px 24px',
    textAlign: 'center',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
  } as CSSProperties,
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    fontSize: 13,
  } as CSSProperties,
  th: {
    textAlign: 'left',
    color: 'var(--muted)',
    fontWeight: 500,
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    padding: '10px 12px',
    borderBottom: '1px solid var(--border)',
    background: 'var(--panel-2)',
  } as CSSProperties,
  thDesc: {
    textAlign: 'left',
    color: 'var(--muted)',
    fontWeight: 500,
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    padding: '10px 12px',
    borderBottom: '1px solid var(--border)',
    background: 'var(--panel-2)',
    width: '35%',
  } as CSSProperties,
  thRight: {
    textAlign: 'right',
    color: 'var(--muted)',
    fontWeight: 500,
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    padding: '10px 12px',
    borderBottom: '1px solid var(--border)',
    background: 'var(--panel-2)',
  } as CSSProperties,
  thActions: {
    textAlign: 'center',
    color: 'var(--muted)',
    fontWeight: 500,
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    padding: '10px 12px',
    borderBottom: '1px solid var(--border)',
    background: 'var(--panel-2)',
    width: '120px',
  } as CSSProperties,
  td: {
    padding: '10px 12px',
    borderBottom: '1px solid var(--border)',
    verticalAlign: 'middle',
  } as CSSProperties,
  tdMuted: {
    padding: '10px 12px',
    borderBottom: '1px solid var(--border)',
    verticalAlign: 'middle',
    color: 'var(--muted)',
  } as CSSProperties,
  tdRight: {
    padding: '10px 12px',
    borderBottom: '1px solid var(--border)',
    verticalAlign: 'middle',
    textAlign: 'right',
  } as CSSProperties,
  tableInput: {
    background: 'rgba(0,0,0,0.2)',
    border: '1px solid var(--border)',
    borderRadius: 5,
    color: 'var(--text)',
    padding: '4px 8px',
    fontSize: 12.5,
    width: '80px',
  } as CSSProperties,
  btnTableAction: {
    background: 'var(--panel-2)',
    border: '1px solid var(--border)',
    color: 'var(--text)',
    borderRadius: 6,
    padding: '4px 8px',
    fontSize: 11.5,
    cursor: 'pointer',
  } as CSSProperties,
  row: (depth: number): CSSProperties => ({
    borderBottom: '1px solid var(--border)',
    background: depth === 0 ? 'rgba(255,255,255,0.02)' : 'none',
  }),
  itemCodeTag: (depth: number): CSSProperties => ({
    fontFamily: 'ui-monospace, monospace',
    fontSize: depth === 0 ? '12px' : '11.5px',
    fontWeight: depth === 0 ? '700' : '400',
    color: depth === 0 ? 'var(--accent)' : 'inherit',
  }),
  tdDesc: (depth: number): CSSProperties => ({
    padding: '10px 12px',
    borderBottom: '1px solid var(--border)',
    verticalAlign: 'middle',
    fontWeight: depth === 0 ? '600' : '400',
  }),
  bimTag: {
    fontSize: 11,
    background: 'rgba(59, 130, 246, 0.1)',
    color: '#60a5fa',
    border: '1px solid rgba(59, 130, 246, 0.2)',
    borderRadius: 5,
    padding: '2px 6px',
    cursor: 'help',
  } as CSSProperties,
  statusTag: (status: string): CSSProperties => {
    let background = 'var(--panel-2)';
    let color = 'var(--text)';
    let border = '1px solid var(--border)';
    if (status === 'won') {
      background = 'rgba(16, 185, 129, 0.1)';
      color = '#34d399';
      border = '1px solid rgba(16, 185, 129, 0.2)';
    } else if (status === 'lost') {
      background = 'rgba(239, 68, 68, 0.1)';
      color = '#f87171';
      border = '1px solid rgba(239, 68, 68, 0.2)';
    } else if (status === 'submitted') {
      background = 'rgba(99, 102, 241, 0.1)';
      color = '#818cf8';
      border = '1px solid rgba(99, 102, 241, 0.2)';
    }
    return {
      fontSize: 12,
      fontWeight: 600,
      textTransform: 'uppercase',
      padding: '3px 8px',
      borderRadius: 6,
      background,
      color,
      border,
    };
  },
  errorBar: {
    background: 'rgba(239, 68, 68, 0.1)',
    border: '1px solid rgba(239, 68, 68, 0.2)',
    color: '#f87171',
    padding: '12px 16px',
    borderRadius: 12,
    fontSize: 13,
  } as CSSProperties,

  // MODAL STYLING
  modalOverlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    width: '100vw',
    height: '100vh',
    background: 'rgba(0,0,0,0.6)',
    backdropFilter: 'blur(8px)',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 9999,
  } as CSSProperties,
  modalContent: {
    background: 'var(--panel)',
    border: '1px solid var(--border)',
    borderRadius: 20,
    width: '600px',
    maxWidth: '90vw',
    boxShadow: '0 20px 40px rgba(0,0,0,0.4)',
  } as CSSProperties,
  modalHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '18px 20px',
    borderBottom: '1px solid var(--border)',
  } as CSSProperties,
  modalClose: {
    background: 'none',
    border: 'none',
    color: 'var(--muted)',
    fontSize: 18,
    cursor: 'pointer',
  } as CSSProperties,
  textarea: {
    width: '100%',
    background: 'var(--panel-2)',
    border: '1px solid var(--border)',
    borderRadius: 10,
    color: 'var(--text)',
    padding: '12px',
    fontFamily: 'ui-monospace, monospace',
    fontSize: 12,
    outline: 'none',
    resize: 'vertical',
  } as CSSProperties,
  aiLoaderBox: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '40px 0',
    textAlign: 'center',
  } as CSSProperties,
  aiProgressStep: {
    fontSize: 14,
    fontWeight: 600,
    color: 'var(--accent)',
    margin: '16px 0 8px',
  } as CSSProperties,

  // ANIMATIONS / SPINNERS
  spinnerSmall: {
    width: '16px',
    height: '16px',
    border: '2px solid rgba(255,255,255,0.1)',
    borderTopColor: 'var(--accent)',
    borderRadius: '50%',
    animation: 'spin 0.6s linear infinite',
  } as CSSProperties,
  spinnerLarge: {
    width: '36px',
    height: '36px',
    border: '3px solid rgba(255,255,255,0.1)',
    borderTopColor: 'var(--accent)',
    borderRadius: '50%',
    animation: 'spin 0.8s linear infinite',
  } as CSSProperties,
};

/** T4 — Clarifications & addenda: record the Q&A/change traffic, answer/acknowledge it, and
 * see an addendum's deadline extension reflected on the tender (the server mirrors it). */
function ClarificationsPanel({ tenderId, onDeadlineMoved }: { tenderId: string; onDeadlineMoved: () => void }) {
  const [records, setRecords] = useState<Clarification[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [kind, setKind] = useState<'clarification' | 'addendum'>('clarification');
  const [reference, setReference] = useState('');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [responseDue, setResponseDue] = useState('');
  const [deadlineExtendedTo, setDeadlineExtendedTo] = useState('');
  const [answerDraft, setAnswerDraft] = useState<Record<string, string>>({});

  const load = async (): Promise<void> => {
    const res = await fetch(`/api/tendering/tenders/${tenderId}/clarifications`, { cache: 'no-store' });
    if (res.ok) setRecords(await res.json());
  };
  useEffect(() => { void load(); }, [tenderId]);

  const add = async (): Promise<void> => {
    setBusy(true); setErr(null);
    try {
      const res = await fetch(`/api/tendering/tenders/${tenderId}/clarifications`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          kind,
          title,
          reference: reference || undefined,
          body: body || undefined,
          responseDue: responseDue || undefined,
          deadlineExtendedTo: kind === 'addendum' && deadlineExtendedTo ? deadlineExtendedTo : undefined,
        }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { setErr(d.message ?? d.error ?? 'Failed to record'); return; }
      setAdding(false); setTitle(''); setReference(''); setBody(''); setResponseDue('');
      const moved = Boolean(deadlineExtendedTo);
      setDeadlineExtendedTo('');
      await load();
      if (moved) onDeadlineMoved();
    } finally { setBusy(false); }
  };

  const answer = async (c: Clarification): Promise<void> => {
    const text = answerDraft[c.id]?.trim();
    if (!text) return;
    setBusy(true); setErr(null);
    try {
      const res = await fetch(`/api/tendering/tenders/${tenderId}/clarifications/${c.id}/answer`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ answer: text }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { setErr(d.message ?? d.error ?? 'Failed'); return; }
      setAnswerDraft((m) => ({ ...m, [c.id]: '' }));
      await load();
    } finally { setBusy(false); }
  };

  const open = records.filter((c) => !c.answeredAt).length;
  const input: CSSProperties = { background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--fg)', padding: '7px 10px', fontSize: 13, outline: 'none' };

  return (
    <section style={s.boqSection}>
      <div style={s.sectionHeader}>
        <h2 style={s.sectionTitle}>
          Clarifications & Addenda{records.length > 0 && <span style={{ color: 'var(--muted)', fontWeight: 500 }}> · {records.length} on record{open > 0 ? `, ${open} open` : ''}</span>}
        </h2>
        <button style={s.btnSecondary} onClick={() => setAdding((v) => !v)}>{adding ? 'Close' : '+ Record'}</button>
      </div>

      {err && <div style={s.errorBar}>{err}</div>}

      {adding && (
        <div style={{ display: 'grid', gap: 10, padding: '12px 0', borderBottom: '1px solid var(--border)', marginBottom: 12 }}>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <select style={input} value={kind} onChange={(e) => setKind(e.target.value as 'clarification' | 'addendum')}>
              <option value="clarification">Clarification (RFI we raised)</option>
              <option value="addendum">Addendum (client-issued change)</option>
            </select>
            <input style={input} placeholder={kind === 'addendum' ? 'Ref e.g. ADD-02' : 'Ref e.g. RFI-04'} value={reference} onChange={(e) => setReference(e.target.value)} />
            <input style={{ ...input, flex: 1, minWidth: 220 }} placeholder="Subject (required)" value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <textarea style={{ ...input, minHeight: 56 }} placeholder={kind === 'addendum' ? 'What changed?' : 'The question…'} value={body} onChange={(e) => setBody(e.target.value)} />
          <div style={{ display: 'flex', gap: 14, alignItems: 'end', flexWrap: 'wrap' }}>
            <label style={{ display: 'grid', gap: 3, fontSize: 11.5, color: 'var(--muted)' }}>
              Response due
              <input type="date" style={input} value={responseDue} onChange={(e) => setResponseDue(e.target.value)} />
            </label>
            {kind === 'addendum' && (
              <label style={{ display: 'grid', gap: 3, fontSize: 11.5, color: 'var(--muted)' }}>
                Deadline extended to (moves the tender deadline)
                <input type="date" style={input} value={deadlineExtendedTo} onChange={(e) => setDeadlineExtendedTo(e.target.value)} />
              </label>
            )}
            <button style={{ ...s.btnStatus, background: 'var(--accent)', color: '#fff' }} disabled={busy || !title.trim()} onClick={() => void add()}>
              Record {kind}
            </button>
          </div>
        </div>
      )}

      {records.length === 0 ? (
        <p style={{ color: 'var(--muted)', fontSize: 13, margin: '8px 0' }}>None on record — RFIs you raise and addenda the client issues live here; a submission acknowledges addenda by these references.</p>
      ) : (
        <div style={{ display: 'grid', gap: 10 }}>
          {records.map((c) => (
            <div key={c.id} style={{ border: '1px solid var(--border)', borderRadius: 10, padding: '10px 14px' }}>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: 0.5, textTransform: 'uppercase', color: c.kind === 'addendum' ? 'var(--accent)' : 'var(--muted)' }}>
                  {c.kind === 'addendum' ? '▲ Addendum' : '? Clarification'}
                </span>
                {c.reference && <span style={{ fontFamily: 'ui-monospace, monospace', fontSize: 12, color: 'var(--muted)' }}>{c.reference}</span>}
                <strong style={{ fontSize: 13.5 }}>{c.title}</strong>
                <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--muted)' }}>
                  issued {c.issuedAt}{c.responseDue && !c.answeredAt ? ` · due ${c.responseDue}` : ''}
                </span>
                <span style={{ fontSize: 11.5, fontWeight: 700, color: c.answeredAt ? 'var(--good, #10b981)' : 'var(--warn, #d97706)' }}>
                  {c.answeredAt ? (c.kind === 'addendum' ? 'acknowledged' : 'answered') : 'open'}
                </span>
              </div>
              {c.body && <p style={{ margin: '6px 0 0', fontSize: 13, color: 'var(--fg)' }}>{c.body}</p>}
              {c.deadlineExtendedTo && <p style={{ margin: '6px 0 0', fontSize: 12.5, color: 'var(--accent)' }}>Deadline extended to {c.deadlineExtendedTo} — mirrored onto the tender.</p>}
              {c.answer ? (
                <p style={{ margin: '6px 0 0', fontSize: 13, color: 'var(--muted)' }}><b>{c.kind === 'addendum' ? 'Acknowledgement' : 'Answer'}:</b> {c.answer}</p>
              ) : (
                <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                  <input style={{ ...input, flex: 1 }} placeholder={c.kind === 'addendum' ? 'Acknowledge — what we did about it…' : 'The answer…'}
                    value={answerDraft[c.id] ?? ''} onChange={(e) => setAnswerDraft((m) => ({ ...m, [c.id]: e.target.value }))} />
                  <button style={s.btnSecondary} disabled={busy || !(answerDraft[c.id] ?? '').trim()} onClick={() => void answer(c)}>
                    {c.kind === 'addendum' ? 'Acknowledge' : 'Answer'}
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
