'use client';

import { type CSSProperties, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { computeBidScore, recommendationFor, DEFAULT_BID_CRITERIA, type BidCriterion, type BidRecommendation } from '@aura/shared';
import { DISPLAY_LOCALE, DISPLAY_TIME_ZONE } from '@/lib/locale';
import TenderAwardDialog from './tender-award-dialog';
import TenderSubmitDialog from './tender-submit-dialog';
import Tender360Context from './tender-360-context';
import BidCriterionHelp from './bid-criterion-help';
import TechnicalStudyWorkspace from './technical-study-workspace';
import TenderTakeoffPanel from './tender-takeoff-panel';

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

interface BOQ {
  id: string;
  tenderId: string;
  sourceBasisRevisionId: string | null;
  sourceRevisionRef: string | null;
  projectedAt: string | null;
}

interface BOQItem {
  id: string;
  boqId: string;
  sourceBasisLineId: string | null;
  itemCode: string;
  description: string;
  unit: string;
  quantity: number;
  rate: number;
  totalAmount: number;
  ifcGuid: string | null;
}

interface SubmissionReadiness {
  ready: boolean;
  technicalStudyApproved: boolean;
  technicalStudyId: string | null;
  technicalStudyRevision: number | null;
  quantityTakeoffProjected: boolean;
  quantityTakeoffRevisionId: string | null;
  commercialOfferApproved: boolean;
  commercialQuotationId: string | null;
  commercialQuoteNumber: string | null;
  commercialQuotationRevision: number | null;
  gaps: string[];
}

function money(n: number): string {
  return typeof n === 'number' ? 'AED ' + n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—';
}

export default function TenderDetail({ tender, workspace = 'dashboard' }: { tender: Tender; workspace?: 'dashboard' | 'boq' }) {
  const router = useRouter();
  
  // Component State
  const [boq, setBoq] = useState<BOQ | null>(null);
  const [items, setItems] = useState<BOQItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [statusBusy, setStatusBusy] = useState(false);
  const [submissionReadiness, setSubmissionReadiness] = useState<SubmissionReadiness | null>(null);

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

  // BOQ import state
  const [showImportModal, setShowImportModal] = useState(false);
  const [rawText, setRawText] = useState('');
  const [importing, setImporting] = useState(false);
  const [importStep, setImportStep] = useState('');
  const [uploadingExcel, setUploadingExcel] = useState(false);
  const [replaceExisting, setReplaceExisting] = useState(false);
  const [importNote, setImportNote] = useState<string | null>(null);

  // Load BOQ on mount
  useEffect(() => {
    if (workspace === 'boq') void fetchBOQ();
  }, [tender.id, workspace]);

  useEffect(() => {
    if (workspace !== 'dashboard') return;
    void fetch(`/api/tendering/tenders/${tender.id}/submission-readiness`, { cache: 'no-store' })
      .then(async (res) => res.ok ? res.json() as Promise<SubmissionReadiness> : null)
      .then(setSubmissionReadiness)
      .catch(() => setSubmissionReadiness(null));
  }, [tender.id, workspace]);

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

  // Parse pasted CSV/tabular rows. This path performs no OCR or AI extraction.
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
      <section id="status" style={s.panelHeader}>
        <div style={s.headerMain}>
          <div>
            <span style={s.refTag}>{tender.reference || 'REF-PENDING'}</span>
            <h1 style={s.title}>{tender.title}</h1>
            <p style={s.subtitle}>
              Customer: <strong>{tender.accountName ?? '—'}</strong> | Created: {new Date(tender.createdAt).toLocaleDateString(DISPLAY_LOCALE, { timeZone: DISPLAY_TIME_ZONE })}
              {tender.source && <> | Source: <strong>{SOURCE_LABELS[tender.source] ?? tender.source}</strong></>}
              {tender.submissionDeadline && <> | Deadline: <strong>{tender.submissionDeadline}</strong></>}
            </p>
          </div>
          <div style={s.headerStats}>
            <div style={s.statCard}>
              <span style={s.statLabel}>{workspace === 'boq' ? 'Total Cost Estimate' : 'Tender dashboard'}</span>
              <span style={{ ...s.statVal, fontSize: workspace === 'boq' ? 24 : 16 }}>{workspace === 'boq' ? money(tender.value) : 'Scope & qualification'}</span>
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
            {tender.status !== 'won' && (
              <TenderAwardDialog
                tenderId={tender.id}
                tenderTitle={tender.title}
                disabled={statusBusy}
                onAwarded={() => {
                  router.refresh();
                  window.location.reload();
                }}
              />
            )}
            <button
              disabled={tender.status === 'lost' || statusBusy}
              onClick={() => updateStatus('lost')}
              style={{ ...s.btnStatus, background: 'var(--bad)', color: 'var(--accent-ink)' }}
            >
              Mark Lost
            </button>
            {/* The governed submit, with its facts — not a status flip (see tender-submit-dialog). */}
            <TenderSubmitDialog
              tenderId={tender.id}
              tenderTitle={tender.title}
              disabled={tender.status === 'submitted' || statusBusy || submissionReadiness?.ready === false}
              disabledReason={submissionReadiness?.ready === false ? submissionReadiness.gaps.join(' ') : undefined}
              onSubmitted={() => {
                router.refresh();
                window.location.reload();
              }}
            />
            {submissionReadiness?.ready && (
              <a
                href={`/api/tendering/tenders/${tender.id}/technical-proposal.pdf`}
                target="_blank"
                rel="noopener noreferrer"
                style={{ ...s.btnSecondary, textDecoration: 'none' }}
                title={`Technical Study S-${submissionReadiness.technicalStudyRevision} with ${submissionReadiness.commercialQuoteNumber} Rev ${submissionReadiness.commercialQuotationRevision}`}
              >
                Download Technical Proposal
              </a>
            )}
          </div>
        </div>
        {workspace === 'dashboard' && submissionReadiness && tender.status !== 'submitted' && (
          <div style={s.submissionGate} aria-label="Tender submission readiness">
            <strong>{submissionReadiness.ready ? 'Ready for submission' : 'Before submitting'}</strong>
            <span style={submissionReadiness.technicalStudyApproved ? s.gateDone : s.gatePending}>
              {submissionReadiness.technicalStudyApproved ? '✓' : '1'} Technical Study approved
            </span>
            <span style={submissionReadiness.quantityTakeoffProjected ? s.gateDone : s.gatePending}>
              {submissionReadiness.quantityTakeoffProjected ? '✓' : '2'} Quantity Take-Off approved and sent to Estimation
            </span>
            <span style={submissionReadiness.commercialOfferApproved ? s.gateDone : s.gatePending}>
              {submissionReadiness.commercialOfferApproved ? '✓' : '3'} Commercial offer internally approved
            </span>
            {!submissionReadiness.technicalStudyApproved && <a href="#study" style={s.gateLink}>Open Technical Study</a>}
            {submissionReadiness.technicalStudyApproved && !submissionReadiness.quantityTakeoffProjected && <a href={`/tendering/tenders/${tender.id}/boq`} style={s.gateLink}>Complete Quantity Take-Off</a>}
            {submissionReadiness.quantityTakeoffProjected && !submissionReadiness.commercialOfferApproved && <a href={`/tendering/tenders/${tender.id}/pricing`} style={s.gateLink}>Open estimation &amp; offer</a>}
            {submissionReadiness.ready && <span style={s.gateDone}>Customer technical and commercial documents are ready as separate governed outputs.</span>}
          </div>
        )}
      </section>

      {err && <div style={s.errorBar}>{err}</div>}
      {importNote && <div style={{ ...s.errorBar, borderColor: 'var(--good, #10b981)', color: 'var(--good, #10b981)' }}>{importNote}</div>}

      {/* GO / NO-GO QUALIFICATION (T-A) — the bid/no-bid gate, before any estimating */}
      {workspace === 'dashboard' && <>
        <div id="qualification"><QualificationPanel tenderId={tender.id} /></div>
        <div id="study"><TechnicalStudyWorkspace opportunityId="" route="tender" tenderId={tender.id} /></div>
      </>}

      {/* BOQ SECTION */}
      {workspace === 'boq' && (
        <TenderTakeoffPanel
          tenderId={tender.id}
          projectedBasisId={boq?.sourceBasisRevisionId ?? null}
          onProjected={fetchBOQ}
        />
      )}
      {workspace === 'boq' && <section id="boq" style={s.boqSection}>
        <div style={s.sectionHeader}>
          <div>
            <h2 style={s.sectionTitle}>Commercial BOQ &amp; Costing</h2>
            <p style={{ ...s.muted, margin: '5px 0 0' }}>
              {boq?.sourceBasisRevisionId
                ? `Quantities locked to ${boq.sourceRevisionRef ?? 'the approved take-off'}. Build rates in Estimation; revise quantities through a new take-off revision.`
                : 'Client BOQ files are study inputs. Complete and approve the Quantity Take-Off above before any lines can become the commercial pricing basis.'}
            </p>
          </div>
          {!boq?.sourceBasisRevisionId && <div style={{ display: 'flex', gap: 10 }}>
            <button type="button" onClick={() => setShowImportModal(true)} style={s.btnAI}>
              Import client BOQ
            </button>
            <button type="button" onClick={() => setAddingItem(!addingItem)} style={s.btnAccent}>
              {addingItem ? 'Cancel' : '+ Add Line Item'}
            </button>
          </div>}
        </div>

        {/* Add Item form panel */}
        {addingItem && !boq?.sourceBasisRevisionId && (
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
                Upload any client BOQ with the study documents, then complete the governed Quantity Take-Off above.
              </p>
              {!boq?.sourceBasisRevisionId && <div style={{ display: 'flex', gap: 10 }}>
                <button type="button" onClick={() => setShowImportModal(true)} style={s.btnAI}>
                  Import client BOQ
                </button>
                <button type="button" onClick={() => setAddingItem(true)} style={s.btnSecondary}>
                  Add Line Item Manually
                </button>
              </div>}
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
                                style={{ ...s.btnTableAction, background: 'var(--good)', color: 'var(--accent-ink)' }}
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
                              {!boq?.sourceBasisRevisionId && <button
                                type="button"
                                onClick={() => startEdit(item)}
                                style={s.btnTableAction}
                              >
                                Edit
                              </button>}
                              {!boq?.sourceBasisRevisionId && <button
                                type="button"
                                onClick={() => handleDeleteItem(item.id)}
                                style={{ ...s.btnTableAction, color: 'var(--bad)' }}
                              >
                                Delete
                              </button>}
                              {boq?.sourceBasisRevisionId && <span style={{ color: 'var(--good)', fontSize: 11, fontWeight: 700 }}>Linked ✓</span>}
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

      }
      {/* CLARIFICATIONS & ADDENDA (T4) */}
      {workspace === 'dashboard' && <>
        <div id="clarifications"><ClarificationsPanel tenderId={tender.id} onDeadlineMoved={() => router.refresh()} /></div>
        <Tender360Context tender={tender} />
      </>}

      {/* BOQ IMPORT DIALOG MODAL */}
      {showImportModal && (
        <div style={s.modalOverlay}>
          <div style={s.modalContent}>
            <div style={s.modalHeader}>
              <h3 style={{ margin: 0, fontSize: 18 }}>Import Bill of Quantities</h3>
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
                    background: 'var(--panel-2)',
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
                    <span style={{ padding: '0 10px', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5 }}>Or paste rows</span>
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
                      Validate and import rows
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
    background: 'var(--warn-soft)',
    color: 'var(--accent)',
    border: '1px solid var(--warn-soft)',
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
  submissionGate: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    flexWrap: 'wrap',
    marginTop: 12,
    padding: '10px 12px',
    borderRadius: 10,
    border: '1px solid var(--border)',
    background: 'var(--panel-2)',
    fontSize: 12.5,
  } as CSSProperties,
  gateDone: { color: 'var(--good)', fontWeight: 700 } as CSSProperties,
  gatePending: { color: 'var(--warn)', fontWeight: 700 } as CSSProperties,
  gateLink: { color: 'var(--accent)', fontWeight: 700, textDecoration: 'none' } as CSSProperties,
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
    color: 'var(--accent-ink)',
    fontWeight: 600,
    border: 'none',
    borderRadius: 8,
    padding: '7px 14px',
    fontSize: 12.5,
    cursor: 'pointer',
  } as CSSProperties,
  btnAI: {
    background: 'var(--accent-grad)',
    color: 'var(--accent-ink)',
    fontWeight: 600,
    border: 'none',
    borderRadius: 8,
    padding: '7px 14px',
    fontSize: 12.5,
    cursor: 'pointer',
    boxShadow: '0 0 12px var(--accent-soft)',
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
    background: 'var(--panel-2)',
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
    background: depth === 0 ? 'var(--panel-2)' : 'none',
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
    background: 'var(--info-soft)',
    color: 'var(--info)',
    border: '1px solid var(--info-soft)',
    borderRadius: 5,
    padding: '2px 6px',
    cursor: 'help',
  } as CSSProperties,
  statusTag: (status: string): CSSProperties => {
    let background = 'var(--panel-2)';
    let color = 'var(--text)';
    let border = '1px solid var(--border)';
    if (status === 'won') {
      background = 'var(--good-soft)';
      color = 'var(--good)';
      border = '1px solid var(--good-soft)';
    } else if (status === 'lost') {
      background = 'var(--bad-soft)';
      color = 'var(--bad)';
      border = '1px solid var(--bad-soft)';
    } else if (status === 'submitted') {
      background = 'var(--accent-soft)';
      color = 'var(--accent)';
      border = '1px solid var(--accent-soft)';
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
    background: 'var(--bad-soft)',
    border: '1px solid var(--bad-soft)',
    color: 'var(--bad)',
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
    background: 'var(--overlay)',
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
    boxShadow: '0 20px 40px var(--overlay)',
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
    border: '2px solid var(--border)',
    borderTopColor: 'var(--accent)',
    borderRadius: '50%',
    animation: 'spin 0.6s linear infinite',
  } as CSSProperties,
  spinnerLarge: {
    width: '36px',
    height: '36px',
    border: '3px solid var(--border)',
    borderTopColor: 'var(--accent)',
    borderRadius: '50%',
    animation: 'spin 0.8s linear infinite',
  } as CSSProperties,
};

interface BidScore {
  id: string;
  tenderId: string;
  criteria: BidCriterion[];
  totalScore: number;
  recommendation: BidRecommendation;
  notes: string | null;
  createdAt: string;
  supersedesId: string | null;
  amendmentReason: string | null;
  supersededAt: string | null;
  supersededBy: string | null;
}

const REC: Record<BidRecommendation, { label: string; color: string; bg: string }> = {
  go: { label: 'BID', color: 'var(--good)', bg: 'var(--good-soft)' },
  conditional: { label: 'CONDITIONAL BID', color: 'var(--warn)', bg: 'var(--warn-soft)' },
  no_go: { label: 'NO BID', color: 'var(--bad)', bg: 'var(--bad-soft)' },
};

/**
 * T-A — the Bid/No-Bid qualification (Go/No-Go). A weighted checklist scores the tender 0–100 and
 * yields GO / CONDITIONAL / NO-GO; the latest decision is what the tender lifecycle gate reads
 * before it lets estimating begin. The live preview uses the SAME `computeBidScore` /
 * `recommendationFor` the API commits with (imported from @aura/shared) — never a second formula.
 */
function QualificationPanel({ tenderId }: { tenderId: string }) {
  const [records, setRecords] = useState<BidScore[]>([]);
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [amending, setAmending] = useState(false);
  const [amendmentReason, setAmendmentReason] = useState('');
  const [criteria, setCriteria] = useState<BidCriterion[]>(() => DEFAULT_BID_CRITERIA.map((c) => ({ ...c, score: 5 })));
  const [notes, setNotes] = useState('');

  const load = async (): Promise<void> => {
    const res = await fetch(`/api/tendering/bid-scores?tenderId=${tenderId}`, { cache: 'no-store' });
    if (!res.ok) throw new Error('Could not load the registered qualification. Please retry.');
    setRecords(await res.json());
  };
  useEffect(() => { void load().catch((error: Error) => setErr(error.message)); }, [tenderId]);

  // Live, from the shared engine — the estimator sees the verdict move as they score.
  const liveTotal = computeBidScore(criteria);
  const liveRec = recommendationFor(liveTotal);

  const setScore = (i: number, score: number): void =>
    setCriteria((cs) => cs.map((c, j) => (j === i ? { ...c, score } : c)));
  const setWeight = (i: number, weight: number): void =>
    setCriteria((cs) => cs.map((c, j) => (j === i ? { ...c, weight } : c)));

  const save = async (): Promise<void> => {
    if (busy || records.length) return;
    setBusy(true); setErr(null);
    try {
      const res = await fetch(`/api/tendering/bid-scores`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ tenderId, criteria, notes: notes || undefined }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErr(d.message ?? d.error ?? 'Failed to record the decision');
        if (res.status === 409) await load();
        return;
      }
      setRecords([d as BidScore]);
      setAdding(false);
    } catch (error) {
      setErr(error instanceof Error ? error.message : 'Could not confirm the decision. Reload to check whether it was registered.');
    } finally { setBusy(false); }
  };

  const beginAmendment = (current: BidScore): void => {
    setCriteria(current.criteria.map((criterion) => ({ ...criterion })));
    setNotes(current.notes ?? '');
    setAmendmentReason('');
    setAmending(true);
    setErr(null);
  };

  const saveAmendment = async (current: BidScore): Promise<void> => {
    if (busy || !amendmentReason.trim()) return;
    setBusy(true); setErr(null);
    try {
      const res = await fetch(`/api/tendering/bid-scores/${current.id}/amend`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ criteria, notes: notes || undefined, reason: amendmentReason.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setErr(data.message ?? data.error ?? 'The amendment was refused'); return; }
      await load();
      setAmending(false);
      setAmendmentReason('');
    } catch (error) {
      setErr(error instanceof Error ? error.message : 'Could not register the amended decision. Reload to verify the current record.');
    } finally { setBusy(false); }
  };

  const latest = records.find((record) => !record.supersededAt) ?? records[0] ?? null;
  const input: CSSProperties = { background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', padding: '7px 10px', fontSize: 13, outline: 'none' };

  return (
    <section style={s.boqSection}>
      <div style={s.sectionHeader}>
        <h2 style={s.sectionTitle}>
          Bid / No-Bid Qualification
          {records.length > 0 && <span style={{ color: 'var(--muted)', fontWeight: 500 }}> · {records.length} assessment{records.length > 1 ? 's' : ''}</span>}
        </h2>
        {!latest && <button disabled={busy} style={s.btnSecondary} onClick={() => setAdding((v) => !v)}>{adding ? 'Close' : '+ Assess Go/No-Go'}</button>}
        {latest && <button disabled={busy} style={s.btnSecondary} onClick={() => amending ? setAmending(false) : beginAmendment(latest)}>{amending ? 'Cancel amendment' : 'Governed amendment'}</button>}
      </div>

      {err && <div style={s.errorBar}>{err}</div>}

      {/* The current decision — the verdict the lifecycle gate reads. */}
      {latest ? (
        <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap', padding: '4px 0 8px' }}>
          <span style={{ fontSize: 15, fontWeight: 800, letterSpacing: 0.5, color: REC[latest.recommendation].color, background: REC[latest.recommendation].bg, border: `1px solid ${REC[latest.recommendation].color}`, borderRadius: 8, padding: '6px 14px' }}>
            {REC[latest.recommendation].label}
          </span>
          <span style={{ fontSize: 22, fontWeight: 800 }}>{latest.totalScore}<span style={{ fontSize: 13, color: 'var(--muted)', fontWeight: 500 }}>/100</span></span>
          <span style={{ fontSize: 12.5, color: 'var(--muted)' }}>decided {new Date(latest.createdAt).toLocaleDateString(DISPLAY_LOCALE, { timeZone: DISPLAY_TIME_ZONE })}</span>
          {latest.amendmentReason && <span style={{ fontSize: 12.5, color: 'var(--muted)' }}>Amendment reason: {latest.amendmentReason}</span>}
          {latest.notes && <span style={{ fontSize: 13, color: 'var(--text)', fontStyle: 'italic' }}>“{latest.notes}”</span>}
        </div>
      ) : (
        !adding && <p style={{ color: 'var(--muted)', fontSize: 13, margin: '4px 0 0' }}>Not yet qualified — score the tender against the checklist to make the bid/no-bid call before estimating.</p>
      )}

      {latest && <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12 }}>
        <p role="status" style={{ color: 'var(--good)', fontSize: 13 }}>Confirmed and registered · Ratings and decision are locked.</p>
        <div style={{ display: 'grid', gap: 8 }}>
          {latest.criteria.map((criterion, index) => <div key={`${criterion.name}-${index}`} style={{ display: 'flex', gap: 16, justifyContent: 'space-between', fontSize: 13 }}>
            <span>{criterion.name}</span><span>Weight {criterion.weight} · <strong>{criterion.score}/10</strong></span>
          </div>)}
        </div>
      </div>}
      {/* The weighted checklist. */}
      {((adding && !latest) || (amending && latest)) && (
        <div style={{ display: 'grid', gap: 10, padding: '12px 0 0', borderTop: latest ? '1px solid var(--border)' : 'none', marginTop: latest ? 12 : 0 }}>
          {amending && <div style={{ border: '1px solid var(--accent)', borderRadius: 8, background: 'var(--panel)', padding: 10, fontSize: 12.5 }}><strong>New locked decision</strong><br />The confirmed record stays in history. Enter why an authorized manager is replacing it, then confirm the complete new rating.</div>}
          {criteria.map((c, i) => (
            <div key={c.name} style={{ display: 'grid', gridTemplateColumns: '1fr 64px 210px 40px', gap: 12, alignItems: 'center' }}>
              <BidCriterionHelp name={c.name} score={c.score} weight={c.weight} totalWeight={criteria.reduce((sum, criterion) => sum + criterion.weight, 0)} id={`criterion-help-${i}`} />
              <label style={{ display: 'flex', gap: 5, alignItems: 'center', fontSize: 11, color: 'var(--muted)' }} title="Weight — relative importance">
                w
                <input aria-label={`${c.name} weight`} type="number" min={0} max={9} step={1} value={c.weight} onChange={(e) => setWeight(i, Math.min(9, Math.max(0, Math.round(Number(e.target.value) || 0))))} style={{ ...input, width: 44, padding: '4px 6px' }} />
              </label>
              <input aria-label={`${c.name} score`} type="range" min={0} max={10} step={1} value={c.score} onChange={(e) => setScore(i, Number(e.target.value))} style={{ accentColor: 'var(--accent)' }} />
              <span style={{ fontSize: 13, fontWeight: 700, textAlign: 'right' }}>{c.score}<span style={{ color: 'var(--muted)', fontWeight: 400, fontSize: 11 }}>/10</span></span>
            </div>
          ))}

          <p style={s.muted}>Total = sum of (score × weight) ÷ sum of weights × 10, rounded to two decimals. Go: 70–100; Conditional: 50–69.99; No-go: below 50. Initial scores of 5 are placeholders for your assessment.</p>
          <textarea style={{ ...input, minHeight: 48 }} placeholder="Rationale — why this go/no-go call (optional)" value={notes} onChange={(e) => setNotes(e.target.value)} />
          {amending && <textarea aria-label="Amendment reason" style={{ ...input, minHeight: 48 }} placeholder="Amendment reason — changed client input, corrected evidence, management direction…" value={amendmentReason} onChange={(e) => setAmendmentReason(e.target.value)} />}

          {/* Live verdict from the shared engine. */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap', borderTop: '1px solid var(--border)', paddingTop: 12 }}>
            <span style={{ fontSize: 11.5, textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--muted)' }}>Live score</span>
            <span style={{ fontSize: 20, fontWeight: 800 }}>{liveTotal}<span style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 500 }}>/100</span></span>
            <span style={{ fontSize: 13, fontWeight: 800, letterSpacing: 0.5, color: REC[liveRec].color, background: REC[liveRec].bg, border: `1px solid ${REC[liveRec].color}`, borderRadius: 7, padding: '4px 10px' }}>
              → {REC[liveRec].label}
            </span>
            <button style={{ ...s.btnStatus, background: 'var(--accent)', color: 'var(--accent-ink)', marginLeft: 'auto' }} disabled={busy || (amending && !amendmentReason.trim())} onClick={() => void (amending && latest ? saveAmendment(latest) : save())}>
              {busy ? 'Confirming…' : amending ? `Confirm new locked ${REC[liveRec].label.toLowerCase()}` : `Confirm & lock ${REC[liveRec].label.toLowerCase()}`}
            </button>
          </div>
          <p style={s.muted}>Confirmation permanently registers these ratings and the decision. A later correction creates another locked decision with its reason and keeps this one in history.</p>
        </div>
      )}

      {/* Prior assessments — the audit trail of how the call moved. */}
      {records.length > 1 && (
        <div style={{ marginTop: 12 }}>
          <button style={{ ...s.btnSecondary, fontSize: 11.5 }} onClick={() => setShowHistory((v) => !v)}>
            {showHistory ? 'Hide' : 'Show'} {records.length - 1} earlier assessment{records.length - 1 > 1 ? 's' : ''}
          </button>
          {showHistory && (
            <div style={{ display: 'grid', gap: 6, marginTop: 10 }}>
              {records.slice(1).map((r, index) => (
                <div key={r.id} style={{ display: 'flex', gap: 12, alignItems: 'center', fontSize: 12.5, color: 'var(--muted)' }}>
                  <span style={{ fontWeight: 700, color: REC[r.recommendation].color, minWidth: 96 }}>{REC[r.recommendation].label}</span>
                  <span style={{ fontWeight: 700, color: 'var(--text)' }}>{r.totalScore}/100</span>
                  <span>{new Date(r.createdAt).toLocaleDateString(DISPLAY_LOCALE, { timeZone: DISPLAY_TIME_ZONE })}</span>
                  {records[index]?.amendmentReason && <span>Superseded because: {records[index].amendmentReason}</span>}
                  {r.notes && <span style={{ fontStyle: 'italic' }}>“{r.notes}”</span>}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

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
  const input: CSSProperties = { background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', padding: '7px 10px', fontSize: 13, outline: 'none' };

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
            <button style={{ ...s.btnStatus, background: 'var(--accent)', color: 'var(--accent-ink)' }} disabled={busy || !title.trim()} onClick={() => void add()}>
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
                <span style={{ fontSize: 11.5, fontWeight: 700, color: c.answeredAt ? 'var(--good, #10b981)' : 'var(--warn)' }}>
                  {c.answeredAt ? (c.kind === 'addendum' ? 'acknowledged' : 'answered') : 'open'}
                </span>
              </div>
              {c.body && <p style={{ margin: '6px 0 0', fontSize: 13, color: 'var(--text)' }}>{c.body}</p>}
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
