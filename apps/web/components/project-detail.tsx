'use client';

import { type CSSProperties, useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

interface WbsNode {
  id: string;
  projectId: string;
  parentId: string | null;
  code: string;
  title: string;
  plannedValue: number;
  earnedValue: number;
  actualCost: number;
  progress: number;
  status: 'pending' | 'in_progress' | 'completed';
  createdAt: string;
}

interface EvmMetrics {
  plannedValue: number;
  earnedValue: number;
  actualCost: number;
  costVariance: number;
  scheduleVariance: number;
  cpi: number;
  spi: number;
}

function money(n: number): string {
  return typeof n === 'number' ? '$' + n.toLocaleString(undefined, { maximumFractionDigits: 0 }) : '—';
}

function fmtDate(iso: string): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString();
}

export default function ProjectDetail({
  projectId,
  projectTitle,
  nodes,
  evm,
}: {
  projectId: string;
  projectTitle: string;
  nodes: WbsNode[];
  evm: EvmMetrics;
}) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<'wbs' | 'cbs' | 'delays'>('wbs');
  const [busyNodeId, setBusyNodeId] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  // ── WBS STATE ────────────────────────────────────────────────────────────
  const [editingProgressId, setEditingProgressId] = useState<string | null>(null);
  const [editProgress, setEditProgress] = useState(0);
  const [editStatus, setEditStatus] = useState<'pending' | 'in_progress' | 'completed'>('pending');
  const [addingUnderParentId, setAddingUnderParentId] = useState<string | null>(null);
  const [newCode, setNewCode] = useState('');
  const [newTitle, setNewTitle] = useState('');
  const [newPv, setNewPv] = useState('');

  // ── CBS STATE ────────────────────────────────────────────────────────────
  const [cbsNodes, setCbsNodes] = useState<any[]>([]);
  const [cbsSummary, setCbsSummary] = useState<any>(null);
  const [loadingCbs, setLoadingCbs] = useState(false);
  const [addingCbsParentId, setAddingCbsParentId] = useState<string | null>(null);
  const [newCbsCode, setNewCbsCode] = useState('');
  const [newCbsTitle, setNewCbsTitle] = useState('');
  const [newCbsCategory, setNewCbsCategory] = useState<'direct' | 'indirect' | 'overhead' | 'contingency'>('direct');
  const [newCbsBudget, setNewCbsBudget] = useState('');
  const [newCbsNotes, setNewCbsNotes] = useState('');

  // Inline CBS Edit state
  const [editingCbsId, setEditingCbsId] = useState<string | null>(null);
  const [editCbsBudget, setEditCbsBudget] = useState('');
  const [editCbsCommitted, setEditCbsCommitted] = useState('');
  const [editCbsActual, setEditCbsActual] = useState('');
  const [editCbsForecast, setEditCbsForecast] = useState('');

  // ── DELAYS & EOT STATE ───────────────────────────────────────────────────
  const [delays, setDelays] = useState<any[]>([]);
  const [delayAnalysis, setDelayAnalysis] = useState<any>(null);
  const [eotClaims, setEotClaims] = useState<any[]>([]);
  const [loadingDelays, setLoadingDelays] = useState(false);

  // New Delay Event Form
  const [newDelayTitle, setNewDelayTitle] = useState('');
  const [newDelayCategory, setNewDelayCategory] = useState('weather');
  const [newDelayStart, setNewDelayStart] = useState('');
  const [newDelayEnd, setNewDelayEnd] = useState('');
  const [newDelayDays, setNewDelayDays] = useState('');
  const [newDelayConcurrent, setNewDelayConcurrent] = useState(false);
  const [newDelayWbsCode, setNewDelayWbsCode] = useState('');
  const [newDelayDesc, setNewDelayDesc] = useState('');

  // New EOT Claim Form
  const [newEotTitle, setNewEotTitle] = useState('');
  const [newEotDays, setNewEotDays] = useState('');
  const [newEotJustification, setNewEotJustification] = useState('');
  const [newEotOriginalDate, setNewEotOriginalDate] = useState('');
  const [selectedDelayIds, setSelectedDelayIds] = useState<string[]>([]);

  // EOT Claim Decision Form
  const [decidingEotId, setDecidingEotId] = useState<string | null>(null);
  const [eotApproveDays, setEotApproveDays] = useState('');
  const [eotRevisedDate, setEotRevisedDate] = useState('');

  // Fetch functions
  async function fetchCbsData() {
    setLoadingCbs(true);
    setErr(null);
    try {
      const [nodesRes, sumRes] = await Promise.all([
        fetch(`/api/projects/cbs?projectId=${projectId}`),
        fetch(`/api/projects/cbs/summary/${projectId}`),
      ]);
      if (nodesRes.ok) setCbsNodes(await nodesRes.ok ? await nodesRes.json() : []);
      if (sumRes.ok) setCbsSummary(await sumRes.json());
    } catch {
      setErr('Failed to fetch Cost Breakdown Structure (CBS) data.');
    } finally {
      setLoadingCbs(false);
    }
  }

  async function fetchDelaysData() {
    setLoadingDelays(true);
    setErr(null);
    try {
      const [delRes, anaRes, eotRes] = await Promise.all([
        fetch(`/api/projects/delays?projectId=${projectId}`),
        fetch(`/api/projects/delays/analysis/${projectId}`),
        fetch(`/api/projects/eot-claims?projectId=${projectId}`),
      ]);
      if (delRes.ok) setDelays(await delRes.json());
      if (anaRes.ok) setDelayAnalysis(await anaRes.json());
      if (eotRes.ok) setEotClaims(await eotRes.json());
    } catch {
      setErr('Failed to fetch Delays and EOT Claims data.');
    } finally {
      setLoadingDelays(false);
    }
  }

  // Load appropriate data on tab change
  useEffect(() => {
    if (activeTab === 'cbs') {
      fetchCbsData();
    } else if (activeTab === 'delays') {
      fetchDelaysData();
    }
  }, [activeTab, projectId]);

  // ── WBS METRIC HELPERS ───────────────────────────────────────────────────
  const sortedWbsNodes = [...nodes].sort((a, b) => {
    const aParts = a.code.split('.').map(Number);
    const bParts = b.code.split('.').map(Number);
    const len = Math.max(aParts.length, bParts.length);
    for (let i = 0; i < len; i++) {
      if (aParts[i] === undefined) return -1;
      if (bParts[i] === undefined) return 1;
      if (aParts[i] !== bParts[i]) return aParts[i] - bParts[i];
    }
    return 0;
  });

  const wbsParentIds = new Set(nodes.map((n) => n.parentId).filter(Boolean));
  const isWbsLeaf = (nodeId: string) => !wbsParentIds.has(nodeId);

  // ── CBS METRIC HELPERS ───────────────────────────────────────────────────
  const sortedCbsNodes = [...cbsNodes].sort((a, b) => {
    const aParts = a.code.split('.').map(Number);
    const bParts = b.code.split('.').map(Number);
    const len = Math.max(aParts.length, bParts.length);
    for (let i = 0; i < len; i++) {
      if (aParts[i] === undefined) return -1;
      if (bParts[i] === undefined) return 1;
      if (aParts[i] !== bParts[i]) return aParts[i] - bParts[i];
    }
    return 0;
  });

  const cbsParentIds = new Set(cbsNodes.map((n) => n.parentId).filter(Boolean));
  const isCbsLeaf = (nodeId: string) => !cbsParentIds.has(nodeId);

  // ── ACTIONS ──────────────────────────────────────────────────────────────

  // WBS Actions
  async function saveWbsProgress(nodeId: string) {
    setBusyNodeId(nodeId);
    setErr(null);
    try {
      const res = await fetch(`/api/projects/wbs/${nodeId}/progress`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ progress: editProgress, status: editStatus }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setErr(d.error ?? 'Error updating task progress');
      } else {
        setEditingProgressId(null);
        router.refresh();
      }
    } catch {
      setErr('Failed to save progress.');
    } finally {
      setBusyNodeId(null);
    }
  }

  async function addWbsTask(parentId: string | null) {
    if (!newCode.trim() || !newTitle.trim()) {
      setErr('Please enter both Code and Title.');
      return;
    }
    setBusyNodeId(parentId ? `add-under-${parentId}` : 'add-root');
    setErr(null);
    try {
      const res = await fetch('/api/projects/wbs', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          projectId,
          parentId,
          code: newCode.trim(),
          title: newTitle.trim(),
          plannedValue: Number(newPv) || 0,
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setErr(d.error ?? 'Error adding WBS task');
      } else {
        setNewCode('');
        setNewTitle('');
        setNewPv('');
        setAddingUnderParentId(null);
        router.refresh();
      }
    } catch {
      setErr('Failed to add WBS task.');
    } finally {
      setBusyNodeId(null);
    }
  }

  // CBS Actions
  async function addCbsNode(parentId: string | null) {
    if (!newCbsCode.trim() || !newCbsTitle.trim()) {
      setErr('Please enter both Code and Title.');
      return;
    }
    setBusyNodeId(parentId ? `add-cbs-under-${parentId}` : 'add-cbs-root');
    setErr(null);
    try {
      const res = await fetch('/api/projects/cbs', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          projectId,
          parentId,
          code: newCbsCode.trim(),
          title: newCbsTitle.trim(),
          category: newCbsCategory,
          budgetAmount: Number(newCbsBudget) || 0,
          notes: newCbsNotes,
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setErr(d.error ?? 'Error adding CBS node');
      } else {
        setNewCbsCode('');
        setNewCbsTitle('');
        setNewCbsBudget('');
        setNewCbsNotes('');
        setAddingCbsParentId(null);
        await fetchCbsData();
      }
    } catch {
      setErr('Failed to add CBS node.');
    } finally {
      setBusyNodeId(null);
    }
  }

  async function saveCbsAmounts(nodeId: string) {
    setBusyNodeId(nodeId);
    setErr(null);
    try {
      const res = await fetch(`/api/projects/cbs/${nodeId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          budgetAmount: editCbsBudget ? Number(editCbsBudget) : undefined,
          committedAmount: editCbsCommitted ? Number(editCbsCommitted) : undefined,
          actualAmount: editCbsActual ? Number(editCbsActual) : undefined,
          forecastAmount: editCbsForecast ? Number(editCbsForecast) : undefined,
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setErr(d.error ?? 'Error updating CBS node');
      } else {
        setEditingCbsId(null);
        await fetchCbsData();
      }
    } catch {
      setErr('Failed to update CBS amounts.');
    } finally {
      setBusyNodeId(null);
    }
  }

  async function deleteCbsNode(nodeId: string) {
    if (!confirm('Are you sure you want to delete this cost code from the CBS?')) return;
    setBusyNodeId(`delete-${nodeId}`);
    setErr(null);
    try {
      const res = await fetch(`/api/projects/cbs/${nodeId}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setErr(d.error ?? 'Error deleting CBS node');
      } else {
        await fetchCbsData();
      }
    } catch {
      setErr('Failed to delete CBS node.');
    } finally {
      setBusyNodeId(null);
    }
  }

  // Delay & EOT Actions
  async function submitDelay() {
    if (!newDelayTitle.trim() || !newDelayStart) {
      setErr('Please enter title and start date.');
      return;
    }
    setBusyNodeId('add-delay');
    setErr(null);
    try {
      const res = await fetch('/api/projects/delays', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          projectId,
          title: newDelayTitle.trim(),
          causeCategory: newDelayCategory,
          startDate: newDelayStart,
          endDate: newDelayEnd || undefined,
          delayDays: newDelayDays ? Number(newDelayDays) : undefined,
          isConcurrent: newDelayConcurrent,
          linkedActivityCode: newDelayWbsCode || undefined,
          description: newDelayDesc,
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setErr(d.error ?? 'Error logging delay event');
      } else {
        setNewDelayTitle('');
        setNewDelayStart('');
        setNewDelayEnd('');
        setNewDelayDays('');
        setNewDelayConcurrent(false);
        setNewDelayWbsCode('');
        setNewDelayDesc('');
        await fetchDelaysData();
      }
    } catch {
      setErr('Failed to log delay event.');
    } finally {
      setBusyNodeId(null);
    }
  }

  async function updateDelayStatus(delayId: string, status: string) {
    setBusyNodeId(`delay-status-${delayId}`);
    setErr(null);
    try {
      const res = await fetch(`/api/projects/delays/${delayId}/status`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setErr(d.error ?? 'Error updating delay status');
      } else {
        await fetchDelaysData();
      }
    } catch {
      setErr('Failed to update delay status.');
    } finally {
      setBusyNodeId(null);
    }
  }

  async function submitEotClaim() {
    if (!newEotTitle.trim() || !newEotDays) {
      setErr('Please enter claim title and submitted days.');
      return;
    }
    setBusyNodeId('add-eot');
    setErr(null);
    try {
      const res = await fetch('/api/projects/eot-claims', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          projectId,
          title: newEotTitle.trim(),
          submittedDays: Number(newEotDays),
          justification: newEotJustification,
          originalCompletionDate: newEotOriginalDate || undefined,
          delayEventIds: selectedDelayIds,
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setErr(d.error ?? 'Error submitting EOT Claim');
      } else {
        setNewEotTitle('');
        setNewEotDays('');
        setNewEotJustification('');
        setNewEotOriginalDate('');
        setSelectedDelayIds([]);
        await fetchDelaysData();
      }
    } catch {
      setErr('Failed to submit EOT claim.');
    } finally {
      setBusyNodeId(null);
    }
  }

  async function sendEotSubmission(eotId: string) {
    setBusyNodeId(`eot-sub-${eotId}`);
    setErr(null);
    try {
      const res = await fetch(`/api/projects/eot-claims/${eotId}/submit`, {
        method: 'POST',
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setErr(d.error ?? 'Error submitting EOT claim');
      } else {
        await fetchDelaysData();
      }
    } catch {
      setErr('Failed to submit EOT claim.');
    } finally {
      setBusyNodeId(null);
    }
  }

  async function decideEotClaim(eotId: string, status: 'approved' | 'rejected') {
    setBusyNodeId(`eot-decide-${eotId}`);
    setErr(null);
    try {
      const res = await fetch(`/api/projects/eot-claims/${eotId}/decide`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          status,
          approvedDays: status === 'approved' ? Number(eotApproveDays) || 0 : 0,
          revisedCompletionDate: status === 'approved' ? eotRevisedDate || undefined : undefined,
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setErr(d.error ?? 'Error finalizing EOT decision');
      } else {
        setDecidingEotId(null);
        setEotApproveDays('');
        setEotRevisedDate('');
        await fetchDelaysData();
      }
    } catch {
      setErr('Failed to record EOT decision.');
    } finally {
      setBusyNodeId(null);
    }
  }

  function handleDelaySelect(delayId: string) {
    if (selectedDelayIds.includes(delayId)) {
      setSelectedDelayIds(selectedDelayIds.filter(id => id !== delayId));
    } else {
      setSelectedDelayIds([...selectedDelayIds, delayId]);
    }
  }

  return (
    <div style={s.container}>
      {/* Tab Select Header */}
      <div style={s.tabHeader}>
        <div style={{ display: 'flex', gap: 6 }}>
          <button
            style={activeTab === 'wbs' ? s.tabActive : s.tab}
            onClick={() => setActiveTab('wbs')}
          >
            WBS & Earned Value (EVM)
          </button>
          <button
            style={activeTab === 'cbs' ? s.tabActive : s.tab}
            onClick={() => setActiveTab('cbs')}
          >
            Cost Breakdown Structure (CBS)
          </button>
          <button
            style={activeTab === 'delays' ? s.tabActive : s.tab}
            onClick={() => setActiveTab('delays')}
          >
            Delay & EOT claims
          </button>
        </div>

        {activeTab === 'wbs' && (
          <button
            type="button"
            style={s.btnAccent}
            onClick={() => {
              setAddingUnderParentId('root');
              setNewCode('');
              setNewTitle('');
              setNewPv('');
            }}
          >
            + Add Root WBS Task
          </button>
        )}
        {activeTab === 'cbs' && (
          <button
            type="button"
            style={s.btnAccent}
            onClick={() => {
              setAddingCbsParentId('root');
              setNewCbsCode('');
              setNewCbsTitle('');
              setNewCbsBudget('');
              setNewCbsNotes('');
            }}
          >
            + Add Root Cost Code
          </button>
        )}
      </div>

      {err && <div style={s.errorBar}>{err}</div>}

      {/* ── TAB 1: WBS & EVM ──────────────────────────────────────────────── */}
      {activeTab === 'wbs' && (
        <>
          {/* EVM METRICS SUMMARY */}
          <section style={s.evmGrid}>
            <div style={s.evmCard}>
              <span style={s.evmLabel}>Planned Value (PV)</span>
              <span style={s.evmVal}>{money(evm.plannedValue)}</span>
              <span style={s.evmDesc}>Baseline Budget</span>
            </div>
            <div style={s.evmCard}>
              <span style={s.evmLabel}>Earned Value (EV)</span>
              <span style={s.evmVal}>{money(evm.earnedValue)}</span>
              <span style={s.evmDesc}>Budgeted Cost of Work Done</span>
            </div>
            <div style={s.evmCard}>
              <span style={s.evmLabel}>Actual Cost (AC)</span>
              <span style={s.evmVal}>{money(evm.actualCost)}</span>
              <span style={s.evmDesc}>Committed actual invoice cost</span>
            </div>
            <div style={s.evmCard}>
              <span style={s.evmLabel}>Cost Performance (CPI)</span>
              <span style={s.cpiVal(evm.cpi)}>{evm.cpi}</span>
              <span style={s.evmDesc}>{evm.cpi >= 1 ? 'Under/On Budget ✓' : 'Over Budget ⚠'}</span>
            </div>
            <div style={s.evmCard}>
              <span style={s.evmLabel}>Schedule Performance (SPI)</span>
              <span style={s.spiVal(evm.spi)}>{evm.spi}</span>
              <span style={s.evmDesc}>{evm.spi >= 1 ? 'On/Ahead of Schedule ✓' : 'Behind Schedule ⚠'}</span>
            </div>
          </section>

          {/* Root level task creation form */}
          {addingUnderParentId === 'root' && (
            <div style={s.addTaskForm}>
              <h4 style={s.formHeader}>Create New Root WBS Node</h4>
              <div style={s.formFields}>
                <input
                  style={s.input}
                  value={newCode}
                  onChange={(e) => setNewCode(e.target.value)}
                  placeholder="Code (e.g. 1)"
                />
                <input
                  style={s.input}
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="Task Title (e.g. Civil Works)"
                />
                <input
                  style={s.inputPv}
                  value={newPv}
                  onChange={(e) => setNewPv(e.target.value)}
                  placeholder="Planned Value ($)"
                  inputMode="numeric"
                />
                <button
                  type="button"
                  onClick={() => addWbsTask(null)}
                  disabled={busyNodeId === 'add-root'}
                  style={s.btnAccent}
                >
                  Add Task
                </button>
                <button type="button" onClick={() => setAddingUnderParentId(null)} style={s.btnSecondary}>
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* WBS TREE TABLE */}
          <div style={s.panel}>
            <table style={s.table}>
              <thead>
                <tr>
                  <th style={s.th}>WBS Code & Title</th>
                  <th style={s.th}>Status</th>
                  <th style={s.th}>Planned Value (PV)</th>
                  <th style={s.th}>Earned Value (EV)</th>
                  <th style={s.th}>Actual Cost (AC)</th>
                  <th style={s.th}>Progress</th>
                  <th style={s.th}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {sortedWbsNodes.map((n) => {
                  const depth = n.code.split('.').length - 1;
                  const leaf = isWbsLeaf(n.id);
                  const isEditing = editingProgressId === n.id;
                  const isBusy = busyNodeId === n.id || busyNodeId === `add-under-${n.id}`;

                  return (
                    <>
                      <tr key={n.id} style={leaf ? s.rowLeaf : s.rowParent}>
                        {/* WBS Code & Title (Indented) */}
                        <td style={{ ...s.td, paddingLeft: `${12 + depth * 20}px` }}>
                          <span style={s.codeBadge}>{n.code}</span>{' '}
                          <strong>{n.title}</strong>
                        </td>

                        {/* Status */}
                        <td style={s.td}>
                          {isEditing ? (
                            <select
                              style={s.select}
                              value={editStatus}
                              onChange={(e) => setEditStatus(e.target.value as any)}
                            >
                              <option value="pending">Pending</option>
                              <option value="in_progress">In Progress</option>
                              <option value="completed">Completed</option>
                            </select>
                          ) : (
                            <span style={s.statusTag(n.status)}>{n.status.replace('_', ' ')}</span>
                          )}
                        </td>

                        {/* PV, EV, AC */}
                        <td style={s.td}>{money(n.plannedValue)}</td>
                        <td style={{ ...s.td, color: 'var(--good)' }}>{money(n.earnedValue)}</td>
                        <td style={{ ...s.td, color: n.actualCost > n.earnedValue ? 'var(--bad)' : 'inherit' }}>
                          {money(n.actualCost)}
                        </td>

                        {/* Progress Slider / Bar */}
                        <td style={s.td}>
                          {isEditing ? (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <input
                                type="range"
                                min="0"
                                max="100"
                                value={editProgress}
                                onChange={(e) => setEditProgress(Number(e.target.value))}
                                style={{ width: '80px' }}
                              />
                              <span>{editProgress}%</span>
                            </div>
                          ) : (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <div style={s.progressBarOuter}>
                                <div style={s.progressBarInner(n.progress)} />
                              </div>
                              <span>{n.progress}%</span>
                            </div>
                          )}
                        </td>

                        {/* Actions */}
                        <td style={s.td}>
                          <div style={s.actions}>
                            {leaf ? (
                              isEditing ? (
                                <>
                                  <button
                                    type="button"
                                    disabled={isBusy}
                                    onClick={() => saveWbsProgress(n.id)}
                                    style={s.btnAccent}
                                  >
                                    Save
                                  </button>
                                  <button
                                    type="button"
                                    disabled={isBusy}
                                    onClick={() => setEditingProgressId(null)}
                                    style={s.btnSecondary}
                                  >
                                    Cancel
                                  </button>
                                </>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setEditingProgressId(n.id);
                                    setEditProgress(n.progress);
                                    setEditStatus(n.status);
                                  }}
                                  style={s.btnSecondary}
                                >
                                  Update Progress
                                </button>
                              )
                            ) : (
                              <span style={s.parentLabel}>Rollup</span>
                            )}

                            <button
                              type="button"
                              onClick={() => {
                                setAddingUnderParentId(addingUnderParentId === n.id ? null : n.id);
                                setNewCode(n.code + '.');
                                setNewTitle('');
                                setNewPv('');
                              }}
                              style={s.btnSecondary}
                            >
                              + Child
                            </button>
                          </div>
                        </td>
                      </tr>

                      {/* Inline creation form for adding subtasks */}
                      {addingUnderParentId === n.id && (
                        <tr key={`add-task-${n.id}`} style={s.addTaskRow}>
                          <td colSpan={7} style={{ padding: '10px 12px 10px ' + (24 + depth * 20) + 'px' }}>
                            <div style={s.addTaskFormInline}>
                              <h4 style={{ margin: '0 0 6px 0', fontSize: 12, color: 'var(--accent)' }}>
                                Add child task under {n.title}
                              </h4>
                              <div style={{ display: 'flex', gap: 10 }}>
                                <input
                                  style={s.input}
                                  value={newCode}
                                  onChange={(e) => setNewCode(e.target.value)}
                                  placeholder="Code (e.g. 1.1)"
                                />
                                <input
                                  style={s.input}
                                  value={newTitle}
                                  onChange={(e) => setNewTitle(e.target.value)}
                                  placeholder="Subtask Title"
                                />
                                <input
                                  style={s.inputPv}
                                  value={newPv}
                                  onChange={(e) => setNewPv(e.target.value)}
                                  placeholder="Budget PV ($)"
                                  inputMode="numeric"
                                />
                                <button
                                  type="button"
                                  onClick={() => addWbsTask(n.id)}
                                  disabled={isBusy}
                                  style={s.btnAccent}
                                >
                                  Add Subtask
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setAddingUnderParentId(null)}
                                  style={s.btnSecondary}
                                >
                                  Cancel
                                </button>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* ── TAB 2: COST BREAKDOWN STRUCTURE (CBS) ─────────────────────────── */}
      {activeTab === 'cbs' && (
        <>
          {loadingCbs ? (
            <div style={s.loading}>Loading CBS cost code registries...</div>
          ) : (
            <>
              {/* CBS ROLLUP SUMMARY */}
              {cbsSummary && (
                <section style={s.evmGrid}>
                  <div style={s.evmCard}>
                    <span style={s.evmLabel}>Total Budgeted Cost</span>
                    <span style={s.evmVal}>{money(cbsSummary.totalBudget)}</span>
                    <span style={s.evmDesc}>Total approved cost classification</span>
                  </div>
                  <div style={s.evmCard}>
                    <span style={s.evmLabel}>Committed Cost</span>
                    <span style={s.evmVal}>{money(cbsSummary.totalCommitted)}</span>
                    <span style={s.evmDesc}>POs & Subcontracts issued</span>
                  </div>
                  <div style={s.evmCard}>
                    <span style={s.evmLabel}>Actual Invoiced Cost</span>
                    <span style={s.evmVal}>{money(cbsSummary.totalActual)}</span>
                    <span style={s.evmDesc}>Accounts Payable Actuals</span>
                  </div>
                  <div style={s.evmCard}>
                    <span style={s.evmLabel}>Forecast Cost (EAC)</span>
                    <span style={s.evmVal}>{money(cbsSummary.totalForecast)}</span>
                    <span style={s.evmDesc}>Estimated cost at completion</span>
                  </div>
                  <div style={s.evmCard}>
                    <span style={s.evmLabel}>Budget Variance</span>
                    <span style={{
                      ...s.evmVal,
                      color: (cbsSummary.totalBudget - cbsSummary.totalForecast) >= 0 ? 'var(--good)' : 'var(--bad)'
                    }}>
                      {money(cbsSummary.totalBudget - cbsSummary.totalForecast)}
                    </span>
                    <span style={s.evmDesc}>Positive represents savings</span>
                  </div>
                </section>
              )}

              {/* CBS Root level creation form */}
              {addingCbsParentId === 'root' && (
                <div style={s.addTaskForm}>
                  <h4 style={s.formHeader}>Create New Root Cost Code (CBS)</h4>
                  <div style={s.formFields}>
                    <input
                      style={s.input}
                      value={newCbsCode}
                      onChange={(e) => setNewCbsCode(e.target.value)}
                      placeholder="Cost Code (e.g. 5000)"
                    />
                    <input
                      style={s.input}
                      value={newCbsTitle}
                      onChange={(e) => setNewCbsTitle(e.target.value)}
                      placeholder="Cost Description (e.g. Concrete Materials)"
                    />
                    <select
                      style={s.select}
                      value={newCbsCategory}
                      onChange={(e: any) => setNewCbsCategory(e.target.value)}
                    >
                      <option value="direct">Direct Cost</option>
                      <option value="indirect">Indirect Cost</option>
                      <option value="overhead">Overhead</option>
                      <option value="contingency">Contingency</option>
                    </select>
                    <input
                      style={s.inputPv}
                      value={newCbsBudget}
                      onChange={(e) => setNewCbsBudget(e.target.value)}
                      placeholder="Budget ($)"
                      inputMode="numeric"
                    />
                    <input
                      style={s.input}
                      value={newCbsNotes}
                      onChange={(e) => setNewCbsNotes(e.target.value)}
                      placeholder="Notes"
                    />
                    <button
                      type="button"
                      onClick={() => addCbsNode(null)}
                      disabled={busyNodeId === 'add-cbs-root'}
                      style={s.btnAccent}
                    >
                      Create Code
                    </button>
                    <button type="button" onClick={() => setAddingCbsParentId(null)} style={s.btnSecondary}>
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {/* CBS CODE HIERARCHY TABLE */}
              <div style={s.panel}>
                {cbsNodes.length === 0 ? (
                  <div style={s.empty}>No cost classification codes defined yet for this project.</div>
                ) : (
                  <table style={s.table}>
                    <thead>
                      <tr>
                        <th style={s.th}>CBS Code & Description</th>
                        <th style={s.th}>Category</th>
                        <th style={s.th}>Budget Amount</th>
                        <th style={s.th}>Committed (PO/Sub)</th>
                        <th style={s.th}>Actual (Invoiced)</th>
                        <th style={s.th}>Forecast (EAC)</th>
                        <th style={s.th}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sortedCbsNodes.map((n) => {
                        const depth = n.code.split('.').length - 1;
                        const leaf = isCbsLeaf(n.id);
                        const isEditing = editingCbsId === n.id;
                        const isBusy = busyNodeId === n.id || busyNodeId === `add-cbs-under-${n.id}` || busyNodeId === `delete-${n.id}`;

                        return (
                          <>
                            <tr key={n.id} style={leaf ? s.rowLeaf : s.rowParent}>
                              {/* Cost code & details */}
                              <td style={{ ...s.td, paddingLeft: `${12 + depth * 20}px` }}>
                                <span style={s.codeBadge}>{n.code}</span>
                                <strong>{n.title}</strong>
                                {n.notes && <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>{n.notes}</div>}
                              </td>

                              {/* Category */}
                              <td style={s.td}>
                                <span style={s.categoryTag(n.category)}>{n.category}</span>
                              </td>

                              {/* Budget Amount */}
                              <td style={s.td}>
                                {isEditing ? (
                                  <input
                                    style={s.inputInline}
                                    value={editCbsBudget}
                                    onChange={(e) => setEditCbsBudget(e.target.value)}
                                    placeholder="Budget"
                                  />
                                ) : (
                                  money(n.budgetAmount)
                                )}
                              </td>

                              {/* Committed Amount */}
                              <td style={s.td}>
                                {isEditing ? (
                                  <input
                                    style={s.inputInline}
                                    value={editCbsCommitted}
                                    onChange={(e) => setEditCbsCommitted(e.target.value)}
                                    placeholder="Committed"
                                  />
                                ) : (
                                  money(n.committedAmount)
                                )}
                              </td>

                              {/* Actual Amount */}
                              <td style={{ ...s.td, color: n.actualAmount > n.budgetAmount ? 'var(--bad)' : 'inherit' }}>
                                {isEditing ? (
                                  <input
                                    style={s.inputInline}
                                    value={editCbsActual}
                                    onChange={(e) => setEditCbsActual(e.target.value)}
                                    placeholder="Actual"
                                  />
                                ) : (
                                  money(n.actualAmount)
                                )}
                              </td>

                              {/* Forecast Amount */}
                              <td style={s.td}>
                                {isEditing ? (
                                  <input
                                    style={s.inputInline}
                                    value={editCbsForecast}
                                    onChange={(e) => setEditCbsForecast(e.target.value)}
                                    placeholder="Forecast"
                                  />
                                ) : (
                                  money(n.forecastAmount)
                                )}
                              </td>

                              {/* Actions */}
                              <td style={s.td}>
                                <div style={s.actions}>
                                  {leaf ? (
                                    isEditing ? (
                                      <>
                                        <button
                                          type="button"
                                          disabled={isBusy}
                                          onClick={() => saveCbsAmounts(n.id)}
                                          style={s.btnAccent}
                                        >
                                          Save
                                        </button>
                                        <button
                                          type="button"
                                          disabled={isBusy}
                                          onClick={() => setEditingCbsId(null)}
                                          style={s.btnSecondary}
                                        >
                                          Cancel
                                        </button>
                                      </>
                                    ) : (
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setEditingCbsId(n.id);
                                          setEditCbsBudget(String(n.budgetAmount ?? ''));
                                          setEditCbsCommitted(String(n.committedAmount ?? ''));
                                          setEditCbsActual(String(n.actualAmount ?? ''));
                                          setEditCbsForecast(String(n.forecastAmount ?? ''));
                                        }}
                                        style={s.btnSecondary}
                                      >
                                        Edit Costs
                                      </button>
                                    )
                                  ) : (
                                    <span style={s.parentLabel}>Rollup</span>
                                  )}

                                  <button
                                    type="button"
                                    onClick={() => {
                                      setAddingCbsParentId(addingCbsParentId === n.id ? null : n.id);
                                      setNewCbsCode(n.code + '.');
                                      setNewCbsTitle('');
                                      setNewCbsBudget('');
                                      setNewCbsNotes('');
                                    }}
                                    style={s.btnSecondary}
                                  >
                                    + Child
                                  </button>

                                  <button
                                    type="button"
                                    disabled={isBusy}
                                    onClick={() => deleteCbsNode(n.id)}
                                    style={s.btnDangerSmall}
                                  >
                                    Delete
                                  </button>
                                </div>
                              </td>
                            </tr>

                            {/* Inline child node addition form */}
                            {addingCbsParentId === n.id && (
                              <tr key={`add-cbs-${n.id}`} style={s.addTaskRow}>
                                <td colSpan={7} style={{ padding: '10px 12px 10px ' + (24 + depth * 20) + 'px' }}>
                                  <div style={s.addTaskFormInline}>
                                    <h4 style={{ margin: '0 0 6px 0', fontSize: 12, color: 'var(--accent)' }}>
                                      Add child cost classification under {n.title}
                                    </h4>
                                    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                                      <input
                                        style={s.input}
                                        value={newCbsCode}
                                        onChange={(e) => setNewCbsCode(e.target.value)}
                                        placeholder="Cost Code (e.g. 5000.1)"
                                      />
                                      <input
                                        style={s.input}
                                        value={newCbsTitle}
                                        onChange={(e) => setNewCbsTitle(e.target.value)}
                                        placeholder="Description"
                                      />
                                      <select
                                        style={s.select}
                                        value={newCbsCategory}
                                        onChange={(e: any) => setNewCbsCategory(e.target.value)}
                                      >
                                        <option value="direct">Direct Cost</option>
                                        <option value="indirect">Indirect Cost</option>
                                        <option value="overhead">Overhead</option>
                                        <option value="contingency">Contingency</option>
                                      </select>
                                      <input
                                        style={s.inputPv}
                                        value={newCbsBudget}
                                        onChange={(e) => setNewCbsBudget(e.target.value)}
                                        placeholder="Budget ($)"
                                        inputMode="numeric"
                                      />
                                      <button
                                        type="button"
                                        onClick={() => addCbsNode(n.id)}
                                        disabled={isBusy}
                                        style={s.btnAccent}
                                      >
                                        Add Code
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => setAddingCbsParentId(null)}
                                        style={s.btnSecondary}
                                      >
                                        Cancel
                                      </button>
                                    </div>
                                  </div>
                                </td>
                              </tr>
                            )}
                          </>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            </>
          )}
        </>
      )}

      {/* ── TAB 3: DELAY & EOT ANALYSIS ────────────────────────────────────── */}
      {activeTab === 'delays' && (
        <>
          {loadingDelays ? (
            <div style={s.loading}>Analyzing project delays and EOT claim ledger...</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              {/* DELAY ANALYSIS HEADLINES */}
              {delayAnalysis && (
                <section style={s.evmGrid}>
                  <div style={s.evmCard}>
                    <span style={s.evmLabel}>Total Calendar Delay</span>
                    <span style={s.evmVal}>{delayAnalysis.totalDelayDays} days</span>
                    <span style={s.evmDesc}>Cumulative logged delay event durations</span>
                  </div>
                  <div style={s.evmCard}>
                    <span style={s.evmLabel}>Concurrent Delays</span>
                    <span style={{ ...s.evmVal, color: 'var(--bad)' }}>
                      {delayAnalysis.concurrentDelayDays} days
                    </span>
                    <span style={s.evmDesc}>Overlapping/parallel delay periods</span>
                  </div>
                  <div style={s.evmCard}>
                    <span style={s.evmLabel}>Net Non-Concurrent Delay</span>
                    <span style={{ ...s.evmVal, color: 'var(--accent)' }}>
                      {delayAnalysis.netNonConcurrentDays} days
                    </span>
                    <span style={s.evmDesc}>Sole-causation critical path impact</span>
                  </div>
                  <div style={s.evmCard}>
                    <span style={s.evmLabel}>Approved Extensions (EOT)</span>
                    <span style={{ ...s.evmVal, color: 'var(--good)' }}>
                      {eotClaims
                        .filter(c => c.status === 'approved')
                        .reduce((sum, c) => sum + (c.approvedDays || 0), 0)}{' '}
                      days
                    </span>
                    <span style={s.evmDesc}>Contractually approved time extension</span>
                  </div>
                </section>
              )}

              {/* LOG DELAY EVENT FORM */}
              <section style={s.formPanel}>
                <h3 style={s.panelTitle}>Log Critical Path Delay Event</h3>
                <div style={s.formGrid}>
                  <div style={s.fieldWrapper}>
                    <label style={s.label}>Delay Title / Cause</label>
                    <input
                      style={s.input}
                      value={newDelayTitle}
                      onChange={(e) => setNewDelayTitle(e.target.value)}
                      placeholder="e.g. Heavy Rainstorm flooding excavation"
                    />
                  </div>
                  <div style={s.formRow}>
                    <div style={s.fieldWrapper}>
                      <label style={s.label}>Delay Cause Category</label>
                      <select
                        style={s.select}
                        value={newDelayCategory}
                        onChange={(e) => setNewDelayCategory(e.target.value)}
                      >
                        <option value="weather">Inclement Weather</option>
                        <option value="client_change">Client Variation Order</option>
                        <option value="force_majeure">Force Majeure</option>
                        <option value="site_conditions">Unforeseen Site Conditions</option>
                        <option value="supplier_delay">Material Delivery Delay</option>
                        <option value="other">Other Excusable / Non-Excusable</option>
                      </select>
                    </div>
                    <div style={s.fieldWrapper}>
                      <label style={s.label}>Start Date</label>
                      <input
                        type="date"
                        style={s.input}
                        value={newDelayStart}
                        onChange={(e) => setNewDelayStart(e.target.value)}
                      />
                    </div>
                    <div style={s.fieldWrapper}>
                      <label style={s.label}>End Date (Optional)</label>
                      <input
                        type="date"
                        style={s.input}
                        value={newDelayEnd}
                        onChange={(e) => setNewDelayEnd(e.target.value)}
                      />
                    </div>
                    <div style={s.fieldWrapper}>
                      <label style={s.label}>Delay Days</label>
                      <input
                        style={s.inputPv}
                        value={newDelayDays}
                        onChange={(e) => setNewDelayDays(e.target.value)}
                        placeholder="Days"
                        inputMode="numeric"
                      />
                    </div>
                  </div>
                  <div style={s.formRow}>
                    <div style={s.fieldWrapper}>
                      <label style={s.label}>Linked WBS Activity Code</label>
                      <input
                        style={s.input}
                        value={newDelayWbsCode}
                        onChange={(e) => setNewDelayWbsCode(e.target.value)}
                        placeholder="e.g. 1.2"
                      />
                    </div>
                    <label style={s.checkboxLabel}>
                      <input
                        type="checkbox"
                        checked={newDelayConcurrent}
                        onChange={(e) => setNewDelayConcurrent(e.target.checked)}
                      />
                      Concurrent Delay (overlaps other delay causes)
                    </label>
                  </div>
                  <div style={s.fieldWrapper}>
                    <label style={s.label}>Description & Impact Justification</label>
                    <input
                      style={s.input}
                      value={newDelayDesc}
                      onChange={(e) => setNewDelayDesc(e.target.value)}
                      placeholder="Provide detailed description of critical path disruption"
                    />
                  </div>
                  <button
                    type="button"
                    style={s.btnAccent}
                    onClick={submitDelay}
                    disabled={busyNodeId === 'add-delay'}
                  >
                    Log Delay Event
                  </button>
                </div>
              </section>

              {/* DELAY EVENTS LEDGER */}
              <div style={s.panel}>
                <h3 style={{ margin: '8px 12px', fontSize: 15, fontWeight: 600 }}>Delay Event Ledger</h3>
                {delays.length === 0 ? (
                  <div style={s.empty}>No delay events recorded.</div>
                ) : (
                  <table style={s.table}>
                    <thead>
                      <tr>
                        <th style={s.th}>Delay ID & Title</th>
                        <th style={s.th}>Category</th>
                        <th style={s.th}>Duration</th>
                        <th style={s.th}>WBS Activity</th>
                        <th style={s.th}>Concurrency</th>
                        <th style={s.th}>Status</th>
                        <th style={s.th}>Review / Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {delays.map((d) => (
                        <tr key={d.id} style={s.rowLeaf}>
                          <td style={s.td}>
                            <strong>{d.title}</strong>
                            {d.description && <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>{d.description}</div>}
                          </td>
                          <td style={s.td}>
                            <span style={s.categoryTag('direct')}>{d.causeCategory.replace('_', ' ')}</span>
                          </td>
                          <td style={s.td}>
                            <div>{fmtDate(d.startDate)} to {fmtDate(d.endDate)}</div>
                            <div style={{ fontSize: 11.5, color: 'var(--accent)', fontWeight: 600 }}>{d.delayDays} calendar days</div>
                          </td>
                          <td style={s.td}>
                            <span style={s.codeBadge}>{d.linkedActivityCode ?? 'N/A'}</span>
                          </td>
                          <td style={s.td}>
                            {d.isConcurrent ? (
                              <span style={{ color: 'var(--bad)', fontSize: 12 }}>⚠ Concurrent</span>
                            ) : (
                              <span style={{ color: 'var(--good)', fontSize: 12 }}>✓ Non-concurrent</span>
                            )}
                          </td>
                          <td style={s.td}>
                            <span style={s.statusTag(d.status)}>{d.status}</span>
                          </td>
                          <td style={s.td}>
                            {d.status === 'logged' && (
                              <div style={s.actions}>
                                <button
                                  type="button"
                                  style={s.btnGoodSmall}
                                  onClick={() => updateDelayStatus(d.id, 'certified')}
                                  disabled={busyNodeId === `delay-status-${d.id}`}
                                >
                                  Certify Cause
                                </button>
                                <button
                                  type="button"
                                  style={s.btnDangerSmall}
                                  onClick={() => updateDelayStatus(d.id, 'disputed')}
                                  disabled={busyNodeId === `delay-status-${d.id}`}
                                >
                                  Dispute
                                </button>
                              </div>
                            )}
                            {d.status !== 'logged' && (
                              <span style={{ fontSize: 12, color: 'var(--muted)', textTransform: 'capitalize' }}>
                                Reviewed ({d.status})
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>

              {/* EOT CLAIM CREATION SECTION */}
              <section style={s.formPanel}>
                <h3 style={s.panelTitle}>Submit Formal Extension of Time (EOT) Claim</h3>
                <div style={s.formGrid}>
                  <div style={s.formRow}>
                    <div style={s.fieldWrapper}>
                      <label style={s.label}>EOT Claim Title</label>
                      <input
                        style={s.input}
                        value={newEotTitle}
                        onChange={(e) => setNewEotTitle(e.target.value)}
                        placeholder="e.g. EOT Claim #1 - Weather & Site Variances"
                      />
                    </div>
                    <div style={s.fieldWrapper}>
                      <label style={s.label}>Requested Time Extension (Days)</label>
                      <input
                        style={s.inputPv}
                        value={newEotDays}
                        onChange={(e) => setNewEotDays(e.target.value)}
                        placeholder="Days"
                        inputMode="numeric"
                      />
                    </div>
                    <div style={s.fieldWrapper}>
                      <label style={s.label}>Current/Original Completion Date</label>
                      <input
                        type="date"
                        style={s.input}
                        value={newEotOriginalDate}
                        onChange={(e) => setNewEotOriginalDate(e.target.value)}
                      />
                    </div>
                  </div>

                  <div style={s.fieldWrapper}>
                    <label style={s.label}>Justification & Contractual Clause References</label>
                    <input
                      style={s.input}
                      value={newEotJustification}
                      onChange={(e) => setNewEotJustification(e.target.value)}
                      placeholder="e.g. Pursuant to Clause 44.1 for adverse weather events..."
                    />
                  </div>

                  {/* SELECT DELAY EVENTS TO BIND */}
                  {delays.length > 0 && (
                    <div style={s.fieldWrapper}>
                      <label style={s.label}>Select Delay Events to Link in support of this Claim:</label>
                      <div style={s.delayCheckboxGrid}>
                        {delays.map(d => (
                          <label key={d.id} style={s.delayCheckboxItem}>
                            <input
                              type="checkbox"
                              checked={selectedDelayIds.includes(d.id)}
                              onChange={() => handleDelaySelect(d.id)}
                            />
                            <div style={{ marginLeft: 6 }}>
                              <strong>{d.title}</strong> ({d.delayDays} days, status: {d.status})
                            </div>
                          </label>
                        ))}
                      </div>
                    </div>
                  )}

                  <button
                    type="button"
                    style={s.btnAccent}
                    onClick={submitEotClaim}
                    disabled={busyNodeId === 'add-eot'}
                  >
                    Draft EOT Claim
                  </button>
                </div>
              </section>

              {/* EOT CLAIMS TABLE */}
              <div style={s.panel}>
                <h3 style={{ margin: '8px 12px', fontSize: 15, fontWeight: 600 }}>Extension of Time (EOT) Claims Ledger</h3>
                {eotClaims.length === 0 ? (
                  <div style={s.empty}>No EOT claims submitted.</div>
                ) : (
                  <table style={s.table}>
                    <thead>
                      <tr>
                        <th style={s.th}>Claim ID & Title</th>
                        <th style={s.th}>Submitted Days</th>
                        <th style={s.th}>Justification</th>
                        <th style={s.th}>Linked Events</th>
                        <th style={s.th}>Status</th>
                        <th style={s.th}>Approved Days & Date</th>
                        <th style={s.th}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {eotClaims.map((claim) => {
                        const isClaimBusy = busyNodeId === `eot-sub-${claim.id}` || busyNodeId === `eot-decide-${claim.id}`;
                        const isDeciding = decidingEotId === claim.id;

                        return (
                          <tr key={claim.id} style={s.rowLeaf}>
                            <td style={s.td}>
                              <strong>Claim #{claim.claimNumber}</strong>
                              <div style={{ fontSize: 12, fontWeight: 500, marginTop: 2 }}>{claim.title}</div>
                            </td>
                            <td style={s.td}>
                              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--accent)' }}>
                                {claim.submittedDays} days
                              </span>
                            </td>
                            <td style={s.tdMuted}>{claim.justification || '—'}</td>
                            <td style={s.td}>
                              <span style={s.parentLabel}>
                                {claim.delayEvents?.length ?? 0} linked events
                              </span>
                            </td>
                            <td style={s.td}>
                              <span style={s.statusTag(claim.status)}>{claim.status}</span>
                            </td>
                            <td style={s.td}>
                              {claim.status === 'approved' ? (
                                <div>
                                  <div style={{ fontWeight: 600, color: 'var(--good)' }}>+{claim.approvedDays} days</div>
                                  <div style={{ fontSize: 11, color: 'var(--muted)' }}>Revised: {fmtDate(claim.revisedCompletionDate)}</div>
                                </div>
                              ) : (
                                <span style={{ color: 'var(--muted)' }}>—</span>
                              )}
                            </td>
                            <td style={s.td}>
                              {claim.status === 'draft' && (
                                <button
                                  type="button"
                                  style={s.btnAccent}
                                  onClick={() => sendEotSubmission(claim.id)}
                                  disabled={isClaimBusy}
                                >
                                  Submit Claim
                                </button>
                              )}
                              {claim.status === 'submitted' && !isDeciding && (
                                <div style={s.actions}>
                                  <button
                                    type="button"
                                    style={s.btnGoodSmall}
                                    onClick={() => {
                                      setDecidingEotId(claim.id);
                                      setEotApproveDays(String(claim.submittedDays));
                                    }}
                                    disabled={isClaimBusy}
                                  >
                                    Approve/Decide
                                  </button>
                                  <button
                                    type="button"
                                    style={s.btnDangerSmall}
                                    onClick={() => decideEotClaim(claim.id, 'rejected')}
                                    disabled={isClaimBusy}
                                  >
                                    Reject
                                  </button>
                                </div>
                              )}
                              {isDeciding && (
                                <div style={s.decisionInlineBox}>
                                  <h4 style={{ margin: '0 0 6px 0', fontSize: 12, color: 'var(--good)' }}>Approve Claim</h4>
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                    <input
                                      style={s.inputInline}
                                      value={eotApproveDays}
                                      onChange={(e) => setEotApproveDays(e.target.value)}
                                      placeholder="Approved days"
                                    />
                                    <input
                                      type="date"
                                      style={s.inputInline}
                                      value={eotRevisedDate}
                                      onChange={(e) => setEotRevisedDate(e.target.value)}
                                      placeholder="Revised Completion Date"
                                    />
                                    <div style={{ display: 'flex', gap: 4 }}>
                                      <button
                                        type="button"
                                        style={s.btnGoodSmall}
                                        onClick={() => decideEotClaim(claim.id, 'approved')}
                                      >
                                        Confirm Approve
                                      </button>
                                      <button
                                        type="button"
                                        style={s.btnSecondarySmall}
                                        onClick={() => setDecidingEotId(null)}
                                      >
                                        Cancel
                                      </button>
                                    </div>
                                  </div>
                                </div>
                              )}
                              {claim.status !== 'draft' && claim.status !== 'submitted' && !isDeciding && (
                                <span style={{ fontSize: 12, color: 'var(--muted)', textTransform: 'capitalize' }}>
                                  Finalized ({claim.status})
                                </span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

const field: CSSProperties = {
  background: 'var(--panel)',
  border: '1px solid var(--border)',
  borderRadius: 8,
  color: 'var(--text)',
  padding: '6px 10px',
  fontSize: 13,
  outline: 'none',
};

const s = {
  container: { marginTop: 24, display: 'flex', flexDirection: 'column', gap: 14 } as CSSProperties,
  tabHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border)', paddingBottom: 10 } as CSSProperties,
  tab: {
    background: 'none',
    border: 'none',
    color: 'var(--muted)',
    fontSize: 13.5,
    fontWeight: 500,
    cursor: 'pointer',
    padding: '8px 14px',
    borderRadius: 8,
    transition: 'all 0.15s ease',
  } as CSSProperties,
  tabActive: {
    background: 'var(--panel-2)',
    border: '1px solid var(--border)',
    color: 'var(--accent)',
    fontSize: 13.5,
    fontWeight: 600,
    cursor: 'pointer',
    padding: '8px 14px',
    borderRadius: 8,
  } as CSSProperties,
  evmGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 12 } as CSSProperties,
  evmCard: {
    background: 'var(--panel)',
    border: '1px solid var(--border)',
    borderRadius: 12,
    padding: '14px 16px',
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
  } as CSSProperties,
  evmLabel: { fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 0.5 } as CSSProperties,
  evmVal: { fontSize: 20, fontWeight: 700 } as CSSProperties,
  cpiVal: (val: number): CSSProperties => ({
    fontSize: 20,
    fontWeight: 700,
    color: val >= 1.0 ? 'var(--good)' : 'var(--bad)',
  }),
  spiVal: (val: number): CSSProperties => ({
    fontSize: 20,
    fontWeight: 700,
    color: val >= 1.0 ? 'var(--good)' : 'var(--bad)',
  }),
  evmDesc: { fontSize: 11, color: 'var(--muted)' } as CSSProperties,
  panel: { background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 14, padding: '8px 8px', overflowX: 'auto' } as CSSProperties,
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 13 } as CSSProperties,
  th: {
    textAlign: 'left',
    color: 'var(--muted)',
    fontWeight: 500,
    fontSize: 11.5,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    padding: '10px 12px',
    borderBottom: '1px solid var(--border)',
  } as CSSProperties,
  td: { padding: '10px 12px', borderBottom: '1px solid var(--border)', verticalAlign: 'middle' } as CSSProperties,
  tdMuted: { padding: '10px 12px', borderBottom: '1px solid var(--border)', color: 'var(--muted)', fontSize: 12.5 } as CSSProperties,
  rowLeaf: { borderBottom: '1px solid var(--border)' } as CSSProperties,
  rowParent: { borderBottom: '1px solid var(--border)', background: 'rgba(255,255,255,0.01)' } as CSSProperties,
  codeBadge: {
    fontFamily: 'ui-monospace, monospace',
    fontSize: 11.5,
    background: 'var(--panel-2)',
    border: '1px solid var(--border)',
    borderRadius: 5,
    padding: '1px 5px',
    marginRight: 6,
  } as CSSProperties,
  progressBarOuter: {
    width: '60px',
    height: '6px',
    background: 'var(--panel-2)',
    borderRadius: 3,
    overflow: 'hidden',
  } as CSSProperties,
  progressBarInner: (prog: number): CSSProperties => ({
    width: `${prog}%`,
    height: '100%',
    background: prog === 100 ? 'var(--good)' : 'var(--accent)',
    borderRadius: 3,
  }),
  statusTag: (status: string): CSSProperties => {
    let color = 'var(--muted)';
    let border = '1px solid var(--border)';
    let background = 'var(--panel-2)';
    const s = status.toLowerCase();
    if (s === 'completed' || s === 'approved' || s === 'certified') {
      color = 'var(--good)';
      border = '1px solid rgba(40,167,69,0.2)';
      background = 'rgba(40,167,69,0.05)';
    } else if (s === 'in_progress' || s === 'submitted' || s === 'logged') {
      color = 'var(--accent)';
      border = '1px solid rgba(255,193,7,0.2)';
      background = 'rgba(255,193,7,0.05)';
    } else if (s === 'disputed' || s === 'rejected') {
      color = 'var(--bad)';
      border = '1px solid rgba(220,53,69,0.2)';
      background = 'rgba(220,53,69,0.05)';
    }
    return {
      fontSize: 10.5,
      fontWeight: 600,
      background,
      border,
      color,
      borderRadius: 6,
      padding: '2px 6px',
      textTransform: 'uppercase',
    };
  },
  categoryTag: (cat: string): CSSProperties => {
    let background = 'rgba(255,255,255,0.05)';
    let color = 'var(--text)';
    if (cat === 'direct') {
      background = 'rgba(0,123,255,0.1)';
      color = '#007bff';
    } else if (cat === 'indirect') {
      background = 'rgba(108,117,125,0.1)';
      color = '#6c757d';
    } else if (cat === 'overhead') {
      background = 'rgba(23,162,184,0.1)';
      color = '#17a2b8';
    } else if (cat === 'contingency') {
      background = 'rgba(111,66,193,0.1)';
      color = '#6f42c1';
    }
    return {
      fontSize: 10.5,
      fontWeight: 600,
      background,
      color,
      borderRadius: 5,
      padding: '2px 5px',
      textTransform: 'uppercase',
    };
  },
  actions: { display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' } as CSSProperties,
  btnAccent: {
    background: 'var(--accent)',
    color: '#0b0e14',
    fontWeight: 600,
    border: 'none',
    borderRadius: 8,
    padding: '6px 12px',
    fontSize: 12.5,
    cursor: 'pointer',
  } as CSSProperties,
  btnSecondary: {
    background: 'var(--panel-2)',
    border: '1px solid var(--border)',
    color: 'var(--text)',
    borderRadius: 8,
    padding: '6px 12px',
    fontSize: 12.5,
    cursor: 'pointer',
  } as CSSProperties,
  btnSecondarySmall: {
    background: 'var(--panel-2)',
    border: '1px solid var(--border)',
    color: 'var(--text)',
    borderRadius: 6,
    padding: '3px 8px',
    fontSize: 11,
    cursor: 'pointer',
  } as CSSProperties,
  btnGoodSmall: {
    background: 'rgba(40,167,69,0.1)',
    border: '1px solid rgba(40,167,69,0.2)',
    color: 'var(--good)',
    borderRadius: 6,
    padding: '3px 8px',
    fontSize: 11,
    cursor: 'pointer',
    fontWeight: 600,
  } as CSSProperties,
  btnDangerSmall: {
    background: 'rgba(220,53,69,0.1)',
    border: '1px solid rgba(220,53,69,0.2)',
    color: 'var(--bad)',
    borderRadius: 6,
    padding: '3px 8px',
    fontSize: 11,
    cursor: 'pointer',
    fontWeight: 600,
  } as CSSProperties,
  parentLabel: { fontSize: 11, color: 'var(--muted)', background: 'var(--panel-2)', borderRadius: 5, padding: '2px 5px', textTransform: 'uppercase' } as CSSProperties,
  addTaskRow: { background: 'rgba(0,0,0,0.1)' } as CSSProperties,
  addTaskFormInline: {
    background: 'var(--panel)',
    border: '1px solid var(--border)',
    borderRadius: 10,
    padding: '10px 12px',
  } as CSSProperties,
  addTaskForm: {
    background: 'var(--panel)',
    border: '1px solid var(--border)',
    borderRadius: 12,
    padding: '14px 16px',
    marginBottom: 14,
  } as CSSProperties,
  formPanel: {
    background: 'var(--panel)',
    border: '1px solid var(--border)',
    borderRadius: 14,
    padding: '16px 18px',
  } as CSSProperties,
  panelTitle: {
    fontSize: 14,
    fontWeight: 600,
    margin: '0 0 14px 0',
    color: 'var(--accent)',
  } as CSSProperties,
  formGrid: {
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
  } as CSSProperties,
  formRow: {
    display: 'flex',
    gap: 10,
    flexWrap: 'wrap',
  } as CSSProperties,
  fieldWrapper: {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
    flex: 1,
    minWidth: 140,
  } as CSSProperties,
  label: {
    fontSize: 11.5,
    color: 'var(--muted)',
    fontWeight: 500,
  } as CSSProperties,
  checkboxLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    fontSize: 12.5,
    color: 'var(--text)',
    cursor: 'pointer',
    userSelect: 'none',
    alignSelf: 'center',
    marginTop: 14,
  } as CSSProperties,
  delayCheckboxGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
    gap: 8,
    background: 'var(--panel-2)',
    padding: 10,
    borderRadius: 8,
    border: '1px solid var(--border)',
    maxHeight: 140,
    overflowY: 'auto',
  } as CSSProperties,
  delayCheckboxItem: {
    display: 'flex',
    alignItems: 'flex-start',
    fontSize: 12,
    cursor: 'pointer',
    userSelect: 'none',
  } as CSSProperties,
  decisionInlineBox: {
    background: 'var(--panel-2)',
    border: '1px solid var(--border)',
    borderRadius: 8,
    padding: 8,
    marginTop: 4,
  } as CSSProperties,
  formHeader: { margin: '0 0 10px 0', fontSize: 14, color: 'var(--accent)' } as CSSProperties,
  formFields: { display: 'flex', gap: 10, flexWrap: 'wrap' } as CSSProperties,
  input: { ...field, flex: 1, minWidth: 150 } as CSSProperties,
  inputInline: {
    background: 'var(--panel-2)',
    border: '1px solid var(--border)',
    borderRadius: 6,
    color: 'var(--text)',
    padding: '3px 6px',
    fontSize: 12,
    width: '90px',
    outline: 'none',
  } as CSSProperties,
  inputPv: { ...field, width: 120 } as CSSProperties,
  select: { ...field, minWidth: 100 } as CSSProperties,
  errorBar: {
    background: 'rgba(220,53,69,0.1)',
    border: '1px solid rgba(220,53,69,0.2)',
    color: '#dc3545',
    padding: '10px 14px',
    borderRadius: 10,
    fontSize: 13,
  } as CSSProperties,
  loading: { color: 'var(--muted)', padding: '20px 0', textAlign: 'center', fontSize: 13.5 } as CSSProperties,
  empty: { color: 'var(--muted)', padding: '20px 0', textAlign: 'center', fontSize: 13 } as CSSProperties,
};
