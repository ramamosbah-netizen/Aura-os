'use client';

import { useCallback, useMemo, useState, useTransition, type CSSProperties, type ReactNode } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useHydrated } from '@/lib/use-hydrated';
import { COMMISSIONING_PATH, COMMISSIONING_SECTIONS } from '@/lib/workspace-sections';
import { useWorkspaceSection } from '@/lib/use-workspace-section';
import EmptyState from '@/components/ui/empty-state';
import Pager, { usePaged } from '@/components/ui/pager';
import CommissioningSystemPanel from './commissioning-system-panel';
import {
  ItpSection, PreCommissioningSection, CertificatesSection, ReadinessSection, QualityEscalation,
  type QualityEvidence,
} from './commissioning-gate3-sections';

type Section = (typeof COMMISSIONING_SECTIONS)[number]['id'];
const SECTION_IDS = COMMISSIONING_SECTIONS.map((s) => s.id) as Section[];

export interface Project { id: string; title: string }

export interface FailingPoint {
  pointId: string; pointNo: string; description: string; expected: string | null;
  lastRunNo: number; lastActual: string | null; lastRemarks: string | null; lastTestedAt: string;
  runCount: number; openPunchIds: string[];
}
export interface ReadinessGate { id: string; label: string; state: string; reason: string; source: string }
export interface LinkedItpRequirement {
  linkId: string; itpId: string; reference: string; title: string; pointIndex: number | null;
  activity: string; pointType: string; acceptanceCriteria: string; result: string;
  testItemId: string | null; testPointNo: string | null;
}
export interface SystemView {
  record: { id: string; code: string; title: string; system: string; location: string | null; status: string; projectId: string; projectName: string | null };
  pointsTotal: number; pointsPassed: number; pointsFailing: number; pointsUntested: number;
  pointsEverFailed: number; retestsRequired: number; openPunch: number;
  eligible: boolean; commissioned: boolean; blockers: string[]; failingPoints: FailingPoint[];
  /** The wider handover chain (TC-GATE-3) — distinct from `eligible`, which is T&C's own evidence. */
  readiness: { gates: ReadinessGate[]; commissioningReady: boolean; blocking: string[] };
  itpRequirements: LinkedItpRequirement[];
  /** Drawings linked as this system's as-built, with what the register says about each now. */
  asBuiltRecords: LinkedAsBuilt[];
  /** The controlled document this system's evidence pack is registered as, or null (TC-GATE-10). */
  certificate: LinkedCertificate | null;
}
/** The controlled document a system's evidence pack is registered as. Resolved on read, never kept. */
export interface LinkedCertificate {
  linkId: string;
  documentId: string;
  documentNumber: string | null;
  title: string | null;
  revision: string | null;
  status: string | null;
  current: boolean;
  note: string | null;
}
/**
 * A drawing somebody linked as this system's as-built (TC-GATE-8).
 *
 * Everything but the two ids is read from document control at the moment of the read and stored
 * nowhere, so a superseded or renumbered drawing says so rather than showing what was true when it
 * was linked.
 */
export interface LinkedAsBuilt {
  linkId: string;
  documentId: string;
  documentNumber: string | null;
  title: string | null;
  revision: string | null;
  status: string | null;
  current: boolean;
  note: string | null;
}
export interface WorkspaceView {
  systems: SystemView[];
  totals: { inScope: number; notStarted: number; noTestPoints: number; failing: number; retestsRequired: number; openPunch: number; eligible: number; commissioned: number; commissioningReady: number };
}
export interface PunchRow {
  id: string; commissioningId: string; description: string; severity: string; status: string;
  location: string | null; resolution: string | null; testItemId: string | null; sourceRunId: string | null; createdAt: string;
  /** The Quality escalation seam: T&C's note, and a REFERENCE to the NCR someone raised over there. */
  escalationRequestedAt: string | null; escalatedBy: string | null; qualityNcrId: string | null;
}
export interface DeviceRow {
  id: string; tag: string; system: string; model: string | null; location: string | null;
  status: string; serialNumber: string | null; commissioningRecordId: string | null;
}

type Filter = 'all' | 'failing' | 'untested' | 'no-points' | 'eligible' | 'commissioned';

/**
 * The Testing & Commissioning workspace (TC-GATE-2).
 *
 * Four sections, because T&C has four jobs — not one register sliced by status, which would be a
 * filter wearing a section's clothes. Every number on every card is DERIVED from the test evidence
 * by the same calculation the sign-off guard uses, so the screen can never promise a commissioning
 * the backend will refuse, and there is no readiness flag for anyone to tick.
 */
export default function CommissioningWorkspaceClient({
  projects, view, punch, devices, qualityEvidence, selectedProject,
}: {
  projects: Project[];
  view: WorkspaceView | null;
  punch: PunchRow[] | null;
  devices: DeviceRow[] | null;
  /** Quality's ITPs and non-conformances. Null when Quality could not be read — never an empty list. */
  qualityEvidence: QualityEvidence | null;
  selectedProject: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const hydrated = useHydrated();
  const { active } = useWorkspaceSection<Section>(COMMISSIONING_PATH, SECTION_IDS, 'overview');
  const filter = (searchParams.get('filter') ?? 'all') as Filter;
  const [switching, startSwitch] = useTransition();

  /**
   * One writer of the URL. The section hook READS it (so this page behaves like every other
   * workspace) and this writes it, which keeps section and filter from fighting over history.
   * `replaceState` rather than a route push: the data for all four sections is already on the page,
   * so a section switch is instant and costs no round trip.
   */
  const go = useCallback((section: Section, nextFilter?: Filter) => {
    const next = new URLSearchParams(searchParams.toString());
    if (section === 'overview') next.delete('section'); else next.set('section', section);
    if (nextFilter && nextFilter !== 'all') next.set('filter', nextFilter); else next.delete('filter');
    const query = next.toString();
    window.history.replaceState(null, '', query ? `${COMMISSIONING_PATH}?${query}` : COMMISSIONING_PATH);
  }, [searchParams]);

  const hrefFor = (section: Section, nextFilter?: Filter): string => {
    const next = new URLSearchParams(searchParams.toString());
    if (section === 'overview') next.delete('section'); else next.set('section', section);
    if (nextFilter && nextFilter !== 'all') next.set('filter', nextFilter); else next.delete('filter');
    const query = next.toString();
    return query ? `${COMMISSIONING_PATH}?${query}` : COMMISSIONING_PATH;
  };

  /** Changing project changes the DATA, so this is a real navigation, with a visible pending state. */
  function chooseProject(projectId: string): void {
    const next = new URLSearchParams(searchParams.toString());
    if (projectId) next.set('project', projectId); else next.delete('project');
    const query = next.toString();
    startSwitch(() => router.push(query ? `${COMMISSIONING_PATH}?${query}` : COMMISSIONING_PATH));
  }

  const systems = view?.systems ?? [];
  const filtered = useMemo(() => {
    switch (filter) {
      case 'failing': return systems.filter((s) => s.pointsFailing > 0);
      case 'untested': return systems.filter((s) => !s.commissioned && s.pointsUntested > 0);
      case 'no-points': return systems.filter((s) => !s.commissioned && s.pointsTotal === 0);
      case 'eligible': return systems.filter((s) => s.eligible);
      case 'commissioned': return systems.filter((s) => s.commissioned);
      default: return systems;
    }
  }, [systems, filter]);

  return (
    <div style={st.wrap} data-testid="commissioning-workspace">
      {/* Project context. It stays in the URL, so every section — and a reopened AURA tab — keeps it. */}
      <div style={st.contextBar}>
        <label style={st.contextLabel}>
          <span>Project</span>
          <select
            value={selectedProject}
            onChange={(e) => chooseProject(e.target.value)}
            disabled={switching}
            style={st.select}
            data-testid="project-filter"
          >
            <option value="">All projects</option>
            {projects.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
          </select>
        </label>
        {switching && <span style={st.pending} role="status" data-testid="project-switching">Loading project…</span>}
      </div>

      <nav style={st.tabs} aria-label="Testing and commissioning sections">
        {COMMISSIONING_SECTIONS.map((section) => (
          <button
            key={section.id}
            onClick={() => go(section.id)}
            // Inert while a project change is in flight. `useSearchParams` still reports the OLD
            // query until that navigation commits, so a section click landing in the gap would write
            // the previous URL back and silently discard the project the reader just picked.
            disabled={switching}
            style={active === section.id ? st.activeTabBtn : st.tabBtn}
            aria-current={active === section.id ? 'page' : undefined}
            data-testid={`cx-section-${section.id}`}
          >
            {section.label}
          </button>
        ))}
      </nav>

      {view === null ? (
        <div style={st.unavailable} role="alert" data-testid="cx-unavailable">
          The commissioning workspace is unavailable because its source did not respond. No numbers are shown rather than numbers that might be wrong.
        </div>
      ) : active === 'overview' ? (
        <Overview view={view} hrefFor={hrefFor} go={go} hydrated={hydrated} />
      ) : active === 'systems' ? (
        <Systems systems={systems} devices={devices} selectedProject={selectedProject} projects={projects} />
      ) : active === 'itp' ? (
        <ItpSection systems={systems} evidence={qualityEvidence} />
      ) : active === 'pre-commissioning' ? (
        <PreCommissioningSection systems={systems} />
      ) : active === 'testing' ? (
        <Testing systems={filtered} filter={filter} go={go} hrefFor={hrefFor} hydrated={hydrated} />
      ) : active === 'certificates' ? (
        <CertificatesSection systems={systems} />
      ) : active === 'readiness' ? (
        <ReadinessSection systems={systems} />
      ) : (
        <Defects systems={systems} punch={punch} ncrs={qualityEvidence?.ncrs ?? null} />
      )}
    </div>
  );
}

// ── Overview ────────────────────────────────────────────────────────────────────────────────────

function Overview({
  view, hrefFor, go, hydrated,
}: { view: WorkspaceView; hrefFor: (s: Section, f?: Filter) => string; go: (s: Section, f?: Filter) => void; hydrated: boolean }) {
  const t = view.totals;
  const blocking = view.systems.filter((s) => !s.commissioned && s.blockers.length > 0);
  const blockingPage = usePaged(blocking);

  const cards: { label: string; value: number; hint: string; tone: keyof typeof toneStyle; section: Section; filter: Filter }[] = [
    { label: 'In commissioning scope', value: t.inScope, hint: 'Systems registered for T&C', tone: 'neutral', section: 'systems', filter: 'all' },
    { label: 'No test points', value: t.noTestPoints, hint: 'Nothing defined to prove yet', tone: 'warn', section: 'testing', filter: 'no-points' },
    { label: 'Never executed', value: t.notStarted, hint: 'Sheets defined, testing not started', tone: 'warn', section: 'testing', filter: 'untested' },
    { label: 'Failing', value: t.failing, hint: 'Systems with a point standing failed', tone: 'bad', section: 'defects', filter: 'failing' },
    { label: 'Retests required', value: t.retestsRequired, hint: 'Test points awaiting a retest', tone: 'bad', section: 'defects', filter: 'failing' },
    { label: 'Open punch items', value: t.openPunch, hint: 'Defects blocking sign-off', tone: 'warn', section: 'defects', filter: 'all' },
    { label: 'Eligible to commission', value: t.eligible, hint: 'Every point passed, no open defect', tone: 'good', section: 'testing', filter: 'eligible' },
    { label: 'Commissioned', value: t.commissioned, hint: 'Witnessed sign-off complete', tone: 'good', section: 'testing', filter: 'commissioned' },
    { label: 'Commissioning ready', value: t.commissioningReady, hint: 'Whole chain satisfied — what Handover reads', tone: 'good', section: 'readiness', filter: 'all' },
  ];

  return (
    <section aria-label="Commissioning overview" style={st.section}>
      <div style={st.cards}>
        {cards.map((card) => (
          // A real link, so it can be opened in a new tab and reached by keyboard — but handled in
          // place on a plain click, because the data for every section is already here.
          <a
            key={card.label}
            href={hrefFor(card.section, card.filter)}
            onClick={(e) => { if (e.metaKey || e.ctrlKey || e.shiftKey || !hydrated) return; e.preventDefault(); go(card.section, card.filter); }}
            style={{ ...st.card, ...toneStyle[card.tone] }}
            data-testid={`cx-card-${card.filter}-${card.section}`}
          >
            <b style={st.cardValue}>{card.value}</b>
            <span style={st.cardLabel}>{card.label}</span>
            <small style={st.cardHint}>{card.hint}</small>
          </a>
        ))}
      </div>

      <h3 style={st.h3}>What is preventing commissioning</h3>
      {view.systems.length === 0 ? (
        <EmptyState
          compact
          title="No systems are in commissioning scope"
          description="Register each system for Test & Commissioning in Systems & Equipment, then define the test points that prove it works."
        />
      ) : blocking.length === 0 ? (
        <div style={st.clear} data-testid="cx-nothing-blocking">Nothing is blocking commissioning on these systems.</div>
      ) : (
        <>
        <ul style={st.blockList} data-testid="cx-blocking">
          {blockingPage.slice.map((s) => (
            <li key={s.record.id} style={st.blockRow}>
              <a href={`/commissioning/${s.record.id}`} style={st.blockCode}>{s.record.code}</a>
              <span style={st.blockTitle}>{s.record.title}</span>
              <span style={st.blockReasons} title={s.blockers.join(' · ')}>{s.blockers.join(' · ')}</span>
            </li>
          ))}
        </ul>
        <Pager state={blockingPage} label="systems" testId="cx-blocking-pager" />
        </>
      )}
    </section>
  );
}

// ── Systems & Equipment ─────────────────────────────────────────────────────────────────────────

function Systems({
  systems, devices, selectedProject, projects,
}: { systems: SystemView[]; devices: DeviceRow[] | null; selectedProject: string; projects: Project[] }) {
  const bySystem = new Map<string, DeviceRow[]>();
  for (const device of devices ?? []) {
    const list = bySystem.get(device.system) ?? [];
    list.push(device);
    bySystem.set(device.system, list);
  }

  const scopePage = usePaged(systems);

  return (
    <section aria-label="Systems and equipment" style={st.section}>
      <RegisterSystem projects={projects} selectedProject={selectedProject} />

      <h3 style={st.h3}>Commissioning scope</h3>
      {systems.length === 0 ? (
        <EmptyState compact title="No systems registered for commissioning" description="Register each ELV system above. The scope is what T&C owns; the devices under it are read from the ELV device register." />
      ) : (
        <>
        <ul style={st.scopeList} data-testid="cx-scope">
          {scopePage.slice.map((s) => (
            <li key={s.record.id} style={st.scopeRow}>
              <a href={`/commissioning/${s.record.id}`} style={st.blockCode}>{s.record.code}</a>
              <span style={st.scopeTitle}><strong style={st.truncate} title={s.record.title}>{s.record.title}</strong><small style={st.truncate}>{s.record.system.replace(/_/g, ' ')}{s.record.location ? ` · ${s.record.location}` : ''}</small></span>
              <span style={st.scopePoints}>{s.pointsTotal === 0 ? 'no test points' : `${s.pointsPassed}/${s.pointsTotal} points passed`}</span>
              <span style={s.commissioned ? st.tagGood : s.pointsFailing > 0 ? st.tagBad : st.tagMuted}>{s.record.status.replace('_', ' ')}</span>
            </li>
          ))}
        </ul>
        <Pager state={scopePage} label="systems" testId="cx-scope-pager" />
        </>
      )}

      <h3 style={st.h3}>Equipment under these systems</h3>
      {/* The equipment authority is the ELV device register (@aura/elv), not T&C. This projects it
          and offers no writer: a second place to create a device would be a second equipment master. */}
      <p style={st.authorityNote} data-testid="equipment-authority">
        Read from the ELV device register, which owns this equipment. T&C adds commissioning scope and status on top of it and never edits a device here.
      </p>
      {devices === null ? (
        <div style={st.unavailable} role="alert">The ELV device register did not respond, so no equipment is shown.</div>
      ) : devices.length === 0 ? (
        <EmptyState
          compact
          title="No devices registered for this project"
          description="The ELV device register is the authority for equipment (tag, model, serial, cable, port). It has no authoring surface in the app yet, so devices exist only where they have been registered through the API."
        />
      ) : (
        <div style={st.deviceGroups} data-testid="cx-devices">
          {[...bySystem.entries()].map(([system, rows]) => (
            <div key={system} style={st.deviceGroup}>
              <div style={st.deviceGroupHead}>
                <strong>{system.replace(/_/g, ' ')}</strong>
                <span style={st.deviceCount}>{rows.length} device{rows.length === 1 ? '' : 's'}</span>
              </div>
              <table style={st.table}>
                <thead><tr>{['Tag', 'Model', 'Location', 'Status', 'In T&C scope'].map((h) => <th key={h} scope="col" style={st.th}>{h}</th>)}</tr></thead>
                <tbody>
                  {rows.map((d) => (
                    <tr key={d.id}>
                      <th scope="row" style={st.tdCode}>{d.tag}</th>
                      <td style={st.tdMuted}>{d.model ?? '—'}</td>
                      <td style={st.tdMuted}>{d.location ?? '—'}</td>
                      <td style={st.td}>{d.status}</td>
                      <td style={st.tdMuted}>{d.commissioningRecordId ? 'linked' : 'not linked'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function RegisterSystem({ projects, selectedProject }: { projects: Project[]; selectedProject: string }) {
  const router = useRouter();
  const hydrated = useHydrated();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [projectId, setProjectId] = useState(selectedProject || projects[0]?.id || '');
  const [code, setCode] = useState('');
  const [title, setTitle] = useState('');
  const [system, setSystem] = useState('cctv');
  const [location, setLocation] = useState('');

  async function submit(): Promise<void> {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/commissioning/records', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          projectId,
          projectName: projects.find((p) => p.id === projectId)?.title ?? null,
          code, title, system, location: location || undefined,
        }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { message?: string; error?: string };
        throw new Error(data.message || data.error || `Could not register the system (${res.status})`);
      }
      setCode(''); setTitle(''); setLocation(''); setOpen(false);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not register the system');
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return <button style={st.addBtn} onClick={() => setOpen(true)} disabled={!hydrated} data-testid="register-system">+ Register a system for T&amp;C</button>;
  }

  return (
    <div style={st.registerForm}>
      {error && <p style={st.error} role="alert" data-testid="register-error">{error}</p>}
      <div style={st.formRow}>
        <label style={st.field}><span>Project</span>
          <select value={projectId} onChange={(e) => setProjectId(e.target.value)} style={st.select} disabled={busy}>
            {projects.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
          </select>
        </label>
        <label style={st.field}><span>Code</span>
          <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="TC-CCTV-01" style={st.input} disabled={busy} data-testid="system-code" />
        </label>
        <label style={{ ...st.field, flex: 1 }}><span>System / title</span>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="CCTV — Tower A" style={st.input} disabled={busy} data-testid="system-title" />
        </label>
        <label style={st.field}><span>System type</span>
          <select value={system} onChange={(e) => setSystem(e.target.value)} style={st.select} disabled={busy}>
            {['cctv', 'access_control', 'fire_alarm', 'pa_va', 'bms', 'network', 'intercom', 'structured_cabling', 'audio_visual', 'other'].map((s) => (
              <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>
            ))}
          </select>
        </label>
        <label style={st.field}><span>Location</span>
          <input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Level 3 lobby" style={st.input} disabled={busy} />
        </label>
      </div>
      {/* No "test points (total)" field: the sheet is the authority for the tally since TC-GATE-1,
          so a number typed here would be overwritten the moment a point was executed. */}
      <div style={st.formRow}>
        <button style={st.primary} onClick={submit} disabled={busy || !hydrated || !code.trim() || !title.trim()} data-testid="system-save">{busy ? 'Registering…' : 'Register system'}</button>
        <button style={st.cancel} onClick={() => { setOpen(false); setError(null); }} disabled={busy}>Cancel</button>
        <span style={st.hint}>Test points are added to the system’s sheet in Testing &amp; Commissioning.</span>
      </div>
    </div>
  );
}

// ── Testing & Commissioning ─────────────────────────────────────────────────────────────────────

const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'no-points', label: 'No test points' },
  { id: 'untested', label: 'Never executed' },
  { id: 'failing', label: 'Failing' },
  { id: 'eligible', label: 'Eligible' },
  { id: 'commissioned', label: 'Commissioned' },
];

function Testing({
  systems, filter, go, hrefFor, hydrated,
}: { systems: SystemView[]; filter: Filter; go: (s: Section, f?: Filter) => void; hrefFor: (s: Section, f?: Filter) => string; hydrated: boolean }) {
  const [expanded, setExpanded] = useState<string | null>(null);

  const testingPage = usePaged(systems);

  return (
    <section aria-label="Testing and commissioning" style={st.section}>
      <div style={st.filters} role="group" aria-label="Filter systems">
        {FILTERS.map((f) => (
          <a
            key={f.id}
            href={hrefFor('testing', f.id)}
            onClick={(e) => { if (e.metaKey || e.ctrlKey || e.shiftKey || !hydrated) return; e.preventDefault(); go('testing', f.id); }}
            style={filter === f.id ? st.chipOn : st.chip}
            aria-current={filter === f.id ? 'true' : undefined}
            data-testid={`cx-filter-${f.id}`}
          >
            {f.label}
          </a>
        ))}
      </div>

      {systems.length === 0 ? (
        <EmptyState
          compact
          title="No systems match this filter"
          description="Clear the filter to see every system in commissioning scope, or register one in Systems & Equipment."
        />
      ) : (
        <>
        <ul style={st.systemList} data-testid="cx-systems">
          {testingPage.slice.map((s) => {
            const open = expanded === s.record.id;
            return (
              <li key={s.record.id} style={st.systemItem}>
                <div style={st.systemHead}>
                  <button
                    onClick={() => setExpanded(open ? null : s.record.id)}
                    style={st.expandBtn}
                    aria-expanded={open}
                    disabled={!hydrated}
                    data-testid={`cx-open-${s.record.code}`}
                  >
                    <span style={st.caret} aria-hidden>{open ? '▾' : '▸'}</span>
                    <span style={st.blockCode}>{s.record.code}</span>
                    <span style={st.systemTitle} title={s.record.title}>{s.record.title}</span>
                  </button>
                  <span style={st.systemPoints} data-testid={`cx-points-${s.record.code}`}>
                    {s.pointsTotal === 0 ? 'no test points' : `${s.pointsPassed}/${s.pointsTotal} passed`}
                  </span>
                  <span style={s.commissioned ? st.tagGood : s.eligible ? st.tagReady : s.pointsFailing > 0 ? st.tagBad : st.tagMuted} data-testid={`cx-state-${s.record.code}`}>
                    {s.commissioned ? 'commissioned' : s.eligible ? 'eligible' : s.pointsFailing > 0 ? 'failing' : 'in progress'}
                  </span>
                </div>
                {!s.commissioned && s.blockers.length > 0 && (
                  <p style={st.blockersLine} data-testid={`cx-blockers-${s.record.code}`}>{s.blockers.join(' · ')}</p>
                )}
                {open && <CommissioningSystemPanel recordId={s.record.id} />}
              </li>
            );
          })}
        </ul>
        <Pager state={testingPage} label="systems" testId="cx-systems-pager" />
        </>
      )}
    </section>
  );
}

// ── Defects & Retests ───────────────────────────────────────────────────────────────────────────

function Defects({ systems, punch, ncrs }: { systems: SystemView[]; punch: PunchRow[] | null; ncrs: { id: string; ncrNumber: string; system: string | null; severity: string; status: string }[] | null }) {
  const router = useRouter();
  const hydrated = useHydrated();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const failing = systems.filter((s) => s.failingPoints.length > 0);
  const open = (punch ?? []).filter((p) => p.status === 'open');

  /**
   * FLATTENED before paging. The rows here are test POINTS, not systems — one system can stand
   * several failed points — so paging the systems would put "1–20 of 6" above twenty-odd rows.
   * Pairing each point with its system keeps the row's link and code intact.
   */
  const failingPoints = failing.flatMap((s) => s.failingPoints.map((point) => ({ system: s, point })));
  const failingPage = usePaged(failingPoints);
  const openPage = usePaged(open);
  const byRecord = new Map(systems.map((s) => [s.record.id, s]));

  async function raiseDefect(system: SystemView, point: FailingPoint): Promise<void> {
    if (busy) return;
    setBusy(point.pointId);
    setError(null);
    try {
      const res = await fetch(`/api/commissioning/records/${system.record.id}/punch`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          description: `${point.pointNo} failed on run #${point.lastRunNo}${point.lastRemarks ? ` — ${point.lastRemarks}` : ''}`,
          severity: 'major',
          testItemId: point.pointId,
        }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { message?: string; error?: string };
        throw new Error(data.message || data.error || `Could not raise the defect (${res.status})`);
      }
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not raise the defect');
    } finally {
      setBusy(null);
    }
  }

  async function closeDefect(item: PunchRow): Promise<void> {
    if (busy) return;
    setBusy(item.id);
    setError(null);
    try {
      const res = await fetch(`/api/commissioning/records/${item.commissioningId}/punch/${item.id}/close`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ resolution: `Rectified: ${item.description}` }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { message?: string; error?: string };
        throw new Error(data.message || data.error || `Could not close the defect (${res.status})`);
      }
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not close the defect');
    } finally {
      setBusy(null);
    }
  }

  return (
    <section aria-label="Defects and retests" style={st.section}>
      {error && <p style={st.error} role="alert" data-testid="defect-error">{error}</p>}

      <h3 style={st.h3}>Failing test points — retests owed</h3>
      {failing.length === 0 ? (
        <div style={st.clear} data-testid="no-failing-points">No test point is standing failed on these systems.</div>
      ) : (
        <>
        <ul style={st.defectList} data-testid="cx-failing-points">
          {failingPage.slice.map(({ system: s, point }) => (
            <li key={point.pointId} style={st.defectRow} data-testid={`failing-${point.pointNo}`}>
              <span style={st.defectHead}>
                <a href={`/commissioning/${s.record.id}`} style={st.blockCode}>{s.record.code}</a>
                <strong>{point.pointNo}</strong>
                <span style={st.defectDesc} title={point.description}>{point.description}</span>
              </span>
              <span style={st.defectEvidence}>
                {/* The failure is the evidence: which run, what it measured, why it failed. */}
                failed on run #{point.lastRunNo} of {point.runCount}
                {point.lastActual ? ` · measured ${point.lastActual}` : ''}
                {point.lastRemarks ? ` · ${point.lastRemarks}` : ''}
              </span>
              <span style={st.defectAction}>
                {point.openPunchIds.length > 0 ? (
                  <span style={st.tagMuted} data-testid={`defect-raised-${point.pointNo}`}>defect raised</span>
                ) : (
                  <button
                    style={st.smallBtn}
                    onClick={() => raiseDefect(s, point)}
                    disabled={busy !== null || !hydrated}
                    data-testid={`raise-defect-${point.pointNo}`}
                  >
                    {busy === point.pointId ? 'Raising…' : 'Raise defect'}
                  </button>
                )}
              </span>
            </li>
          ))}
        </ul>
        <Pager state={failingPage} label="failing points" testId="cx-failing-points-pager" />
        </>
      )}

      <h3 style={st.h3}>Open defects</h3>
      {punch === null ? (
        <div style={st.unavailable} role="alert">The punch list did not respond.</div>
      ) : open.length === 0 ? (
        <div style={st.clear} data-testid="no-open-defects">No defect is open on these systems.</div>
      ) : (
        <>
        <ul style={st.defectList} data-testid="cx-open-defects">
          {openPage.slice.map((item) => {
            const system = byRecord.get(item.commissioningId);
            return (
              <li key={item.id} style={st.defectRow} data-testid={`defect-${item.id}`}>
                <span style={st.defectHead}>
                  {system && <a href={`/commissioning/${system.record.id}`} style={st.blockCode}>{system.record.code}</a>}
                  <strong>{item.severity}</strong>
                  <span style={st.defectDesc} title={item.description}>{item.description}</span>
                </span>
                <span style={st.defectEvidence}>
                  {item.testItemId ? 'raised from a failing test point' : 'raised outside testing'}
                  {item.location ? ` · ${item.location}` : ''}
                </span>
                <span style={st.defectAction}>
                  {/* Escalation is a note T&C keeps about its own defect plus a reference to the NCR
                      someone raised in Quality. No NCR is created here. */}
                  <QualityEscalation item={item} ncrs={ncrs} onDone={() => router.refresh()} />
                  <button style={st.smallBtn} onClick={() => closeDefect(item)} disabled={busy !== null || !hydrated} data-testid={`close-defect-${item.id}`}>
                    {busy === item.id ? 'Closing…' : 'Close'}
                  </button>
                </span>
              </li>
            );
          })}
        </ul>
        <Pager state={openPage} label="defects" testId="cx-open-defects-pager" />
        </>
      )}

      {/* The authority boundary, stated on the screen rather than assumed. */}
      <p style={st.authorityNote} data-testid="quality-boundary">
        A defect here is a <strong>commissioning punch item</strong> — T&amp;C’s own authority, and the gate on sign-off.
        Non-conformances and snags are owned by Quality and are not raised or mirrored from this workspace;
        a failure that needs one must be raised in Quality, and that linkage is not built yet.
      </p>
    </section>
  );
}

// ── styles ──────────────────────────────────────────────────────────────────────────────────────

const toneStyle = {
  neutral: { borderColor: 'var(--border, #e5e7eb)' } as CSSProperties,
  good: { borderColor: 'var(--good)' } as CSSProperties,
  warn: { borderColor: 'var(--warn)' } as CSSProperties,
  bad: { borderColor: 'var(--bad)' } as CSSProperties,
};

const chipBase: CSSProperties = {
  padding: '5px 12px', borderRadius: 999, border: '1px solid var(--border, #d1d5db)',
  fontSize: 12, textDecoration: 'none', color: 'var(--muted)', cursor: 'pointer',
};

const st = {
  wrap: { display: 'flex', flexDirection: 'column', gap: 16, marginTop: 18 } as CSSProperties,
  contextBar: { display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' } as CSSProperties,
  contextLabel: { display: 'flex', gap: 8, alignItems: 'center', fontSize: 12, color: 'var(--muted)' } as CSSProperties,
  pending: { fontSize: 12, color: 'var(--muted)' } as CSSProperties,
  tabs: { display: 'flex', gap: 8, flexWrap: 'wrap' } as CSSProperties,
  tabBtn: { padding: '8px 16px', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', color: 'var(--muted)', cursor: 'pointer', fontWeight: 500, fontSize: 14 } as CSSProperties,
  activeTabBtn: { padding: '8px 16px', borderRadius: 8, border: '1px solid var(--accent)', background: 'var(--panel-2)', color: 'var(--text)', cursor: 'pointer', fontWeight: 700, fontSize: 14 } as CSSProperties,
  section: { display: 'flex', flexDirection: 'column', gap: 14 } as CSSProperties,
  cards: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 10 } as CSSProperties,
  card: { display: 'flex', flexDirection: 'column', gap: 2, padding: '12px 14px', borderRadius: 12, border: '1px solid var(--border, #e5e7eb)', borderLeftWidth: 3, background: 'var(--panel-2)', textDecoration: 'none', color: 'inherit' } as CSSProperties,
  cardValue: { fontSize: 24, lineHeight: 1.1 } as CSSProperties,
  cardLabel: { fontSize: 12, fontWeight: 700 } as CSSProperties,
  cardHint: { fontSize: 11, color: 'var(--muted)' } as CSSProperties,
  h3: { fontSize: 13, textTransform: 'uppercase', letterSpacing: 0.6, color: 'var(--muted)', margin: '6px 0 0' } as CSSProperties,
  clear: { padding: '12px 14px', borderRadius: 10, background: 'var(--good-soft, rgba(34,197,94,.12))', color: 'var(--good)', fontSize: 13 } as CSSProperties,
  unavailable: { padding: '12px 14px', borderRadius: 10, border: '1px solid var(--border)', color: 'var(--muted)', fontSize: 13 } as CSSProperties,
  blockList: { listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 6 } as CSSProperties,
  blockRow: { display: 'grid', gridTemplateColumns: '120px 1fr 1.4fr', gap: 10, alignItems: 'center', padding: '9px 12px', border: '1px solid var(--border, #e5e7eb)', borderRadius: 10, fontSize: 13 } as CSSProperties,
  blockCode: { fontFamily: 'var(--mono, ui-monospace, monospace)', fontWeight: 700, color: 'var(--accent)', textDecoration: 'none' } as CSSProperties,
  blockTitle: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } as CSSProperties,
  // A grid child defaults to `min-width: auto`, so a long blocker list does not shrink — it widens
  // its track and pushes the row out of shape. `minWidth: 0` lets it shrink, and the ellipsis
  // keeps every row one line tall. The full text stays reachable through the `title`.
  blockReasons: { color: 'var(--warn)', fontSize: 12, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } as CSSProperties,
  scopeList: { listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 6 } as CSSProperties,
  scopeRow: { display: 'grid', gridTemplateColumns: '120px 1fr 160px 120px', gap: 10, alignItems: 'center', padding: '9px 12px', border: '1px solid var(--border, #e5e7eb)', borderRadius: 10, fontSize: 13 } as CSSProperties,
  scopeTitle: { display: 'flex', flexDirection: 'column', minWidth: 0 } as CSSProperties,
  // `minWidth: 0` on the column is not enough on its own: the TEXT inside still needs somewhere
  // to break, so each line truncates rather than stretching the row.
  truncate: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } as CSSProperties,
  scopePoints: { color: 'var(--muted)', fontSize: 12 } as CSSProperties,
  authorityNote: { margin: 0, padding: '10px 12px', borderRadius: 10, background: 'var(--panel-2)', color: 'var(--muted)', fontSize: 12, lineHeight: 1.5 } as CSSProperties,
  deviceGroups: { display: 'flex', flexDirection: 'column', gap: 12 } as CSSProperties,
  deviceGroup: { border: '1px solid var(--border, #e5e7eb)', borderRadius: 10, overflow: 'hidden' } as CSSProperties,
  deviceGroupHead: { display: 'flex', justifyContent: 'space-between', padding: '9px 12px', background: 'var(--panel-2)', fontSize: 13, textTransform: 'capitalize' } as CSSProperties,
  deviceCount: { color: 'var(--muted)', fontSize: 12 } as CSSProperties,
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 12 } as CSSProperties,
  th: { textAlign: 'left', padding: '7px 12px', borderBottom: '1px solid var(--border, #e5e7eb)', color: 'var(--muted)', fontWeight: 600, fontSize: 11, textTransform: 'uppercase' } as CSSProperties,
  td: { padding: '7px 12px', borderBottom: '1px solid var(--border, #f1f5f9)' } as CSSProperties,
  tdCode: { padding: '7px 12px', borderBottom: '1px solid var(--border, #f1f5f9)', fontFamily: 'var(--mono, ui-monospace, monospace)', fontWeight: 700, textAlign: 'left' } as CSSProperties,
  tdMuted: { padding: '7px 12px', borderBottom: '1px solid var(--border, #f1f5f9)', color: 'var(--muted)' } as CSSProperties,
  filters: { display: 'flex', gap: 6, flexWrap: 'wrap' } as CSSProperties,
  chip: chipBase,
  chipOn: { ...chipBase, borderColor: 'var(--accent)', color: 'var(--text)', fontWeight: 700 } as CSSProperties,
  systemList: { listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 8 } as CSSProperties,
  systemItem: { border: '1px solid var(--border, #e5e7eb)', borderRadius: 10, overflow: 'hidden' } as CSSProperties,
  systemHead: { display: 'grid', gridTemplateColumns: '1fr 150px 120px', gap: 10, alignItems: 'center', padding: '9px 12px' } as CSSProperties,
  expandBtn: { display: 'flex', gap: 10, alignItems: 'center', background: 'transparent', border: 'none', color: 'inherit', font: 'inherit', fontSize: 13, cursor: 'pointer', textAlign: 'left', padding: 0, minWidth: 0 } as CSSProperties,
  caret: { width: 12, color: 'var(--muted)' } as CSSProperties,
  systemTitle: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } as CSSProperties,
  systemPoints: { color: 'var(--muted)', fontSize: 12 } as CSSProperties,
  blockersLine: { margin: 0, padding: '0 12px 9px 34px', color: 'var(--warn)', fontSize: 12 } as CSSProperties,
  defectList: { listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 6 } as CSSProperties,
  defectRow: { display: 'grid', gridTemplateColumns: '1fr 1.2fr 130px', gap: 10, alignItems: 'center', padding: '9px 12px', border: '1px solid var(--border, #e5e7eb)', borderRadius: 10, fontSize: 13 } as CSSProperties,
  defectHead: { display: 'flex', gap: 8, alignItems: 'center', minWidth: 0 } as CSSProperties,
  defectDesc: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--muted)' } as CSSProperties,
  defectEvidence: { color: 'var(--muted)', fontSize: 12 } as CSSProperties,
  defectAction: { textAlign: 'right' } as CSSProperties,
  smallBtn: { padding: '5px 11px', borderRadius: 8, border: '1px solid var(--border, #d1d5db)', background: 'transparent', color: 'inherit', fontSize: 12, cursor: 'pointer' } as CSSProperties,
  tagGood: { padding: '3px 9px', borderRadius: 999, background: 'var(--good-soft, rgba(34,197,94,.15))', color: 'var(--good)', fontSize: 11, fontWeight: 700, textAlign: 'center' } as CSSProperties,
  tagReady: { padding: '3px 9px', borderRadius: 999, background: 'var(--info-soft)', color: 'var(--info)', fontSize: 11, fontWeight: 700, textAlign: 'center' } as CSSProperties,
  tagBad: { padding: '3px 9px', borderRadius: 999, background: 'var(--bad-soft, rgba(239,68,68,.15))', color: 'var(--bad)', fontSize: 11, fontWeight: 700, textAlign: 'center' } as CSSProperties,
  tagMuted: { padding: '3px 9px', borderRadius: 999, background: 'var(--panel-2)', color: 'var(--muted)', fontSize: 11, fontWeight: 700, textAlign: 'center' } as CSSProperties,
  registerForm: { display: 'flex', flexDirection: 'column', gap: 10, padding: '12px 14px', border: '1px solid var(--border, #e5e7eb)', borderRadius: 10 } as CSSProperties,
  formRow: { display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' } as CSSProperties,
  field: { display: 'flex', flexDirection: 'column', gap: 4, fontSize: 11, color: 'var(--muted)' } as CSSProperties,
  input: { padding: '6px 10px', borderRadius: 8, border: '1px solid var(--border, #d1d5db)', fontSize: 13, background: 'var(--bg, #fff)', color: 'inherit', minWidth: 150 } as CSSProperties,
  select: { padding: '6px 10px', borderRadius: 8, border: '1px solid var(--border, #d1d5db)', fontSize: 13, background: 'var(--bg, #fff)', color: 'inherit' } as CSSProperties,
  primary: { padding: '7px 14px', borderRadius: 8, border: 'none', background: 'var(--accent)', color: 'var(--accent-ink)', fontWeight: 700, fontSize: 12, cursor: 'pointer' } as CSSProperties,
  cancel: { padding: '7px 12px', borderRadius: 8, border: '1px solid var(--border, #d1d5db)', background: 'transparent', color: 'var(--muted)', fontSize: 12, cursor: 'pointer' } as CSSProperties,
  addBtn: { alignSelf: 'flex-start', padding: '6px 12px', borderRadius: 8, border: '1px dashed var(--border-strong, #cbd5e1)', background: 'transparent', color: 'inherit', fontSize: 12, cursor: 'pointer' } as CSSProperties,
  hint: { color: 'var(--muted)', fontSize: 11 } as CSSProperties,
  error: { color: 'var(--bad)', fontSize: 13, fontWeight: 600, margin: 0 } as CSSProperties,
};
