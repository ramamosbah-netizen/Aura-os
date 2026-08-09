'use client';

import { type CSSProperties, useState } from 'react';
import EmptyState from './ui/empty-state';
import NextBestActionBanner from './ui/next-best-action-banner';
import ProjectPicker from './ui/project-picker';
import SignatureCanvas from './ui/signature-canvas';

export interface ProjectCloseoutData {
  id: string;
  title: string;
  reference: string | null;
  status: string;
  value: number;
  accountName: string | null;
  commissioningCount: number;
  commissionedCount: number;
  openSnagCount: number;
  majorNcrCount: number;
}

interface CloseoutChecklist {
  omManuals: boolean;
  asBuilts: boolean;
  testCertificates: boolean;
  warrantyDocs: boolean;
  clientTraining: boolean;
  sparesHandover: boolean;
}

export default function ProjectCloseoutWizard({ projects = [] }: { projects: ProjectCloseoutData[] }) {
  const [selectedProjectId, setSelectedProjectId] = useState<string>(projects[0]?.id || '');
  const [step, setStep] = useState<number>(1);
  const [checklist, setChecklist] = useState<CloseoutChecklist>({
    omManuals: false,
    asBuilts: false,
    testCertificates: false,
    warrantyDocs: false,
    clientTraining: false,
    sparesHandover: false,
  });
  const [clientRep, setClientRep] = useState('');
  const [warrantyMonths, setWarrantyMonths] = useState('12');
  const [signature, setSignature] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [completed, setCompleted] = useState(false);

  const activeProject = projects.find((p) => p.id === selectedProjectId);

  const toggleCheck = (k: keyof CloseoutChecklist) => {
    setChecklist((prev) => ({ ...prev, [k]: !prev[k] }));
  };

  const coreDeliverablesReady = checklist.omManuals && checklist.asBuilts && checklist.testCertificates;

  const handleFinalHandover = async () => {
    if (!activeProject) return;
    setError('');
    if (!clientRep.trim()) {
      setError('Client representative name is required for formal sign-off.');
      return;
    }
    if (!signature) {
      setError('Digital signature capture is required for final handover acceptance.');
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/commissioning/handovers`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          projectId: activeProject.id,
          projectName: activeProject.title,
          code: `HO-${activeProject.id.slice(0, 6).toUpperCase()}`,
          title: `${activeProject.title} — Final Handover & Closeout`,
          clientRepresentative: clientRep,
          warrantyMonths: Number(warrantyMonths) || 12,
          signatureDataUrl: signature,
          checklist,
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.message || d.error || 'Failed to complete project closeout');
      }
      setCompleted(true);
    } catch (e: any) {
      setError(e.message || 'Failed to complete project closeout');
    } finally {
      setBusy(false);
    }
  };

  if (projects.length === 0) {
    return (
      <EmptyState
        title="No active projects for closeout"
        description="Select or create an active project to initiate the 4-step closeout and handover wizard."
      />
    );
  }

  return (
    <div style={st.container}>
      <div style={st.headCard}>
        <div style={st.headRow}>
          <div>
            <h2 style={st.title}>Project Closeout & Handover Wizard</h2>
            <p style={st.subtitle}>
              Validate ELV commissioning readiness, punch-list clearances, and closeout deliverables before executing formal client digital sign-off.
            </p>
          </div>
          <div style={st.pickerWrap}>
            <span style={st.pickerLabel}>Select Project:</span>
            <ProjectPicker value={selectedProjectId} onChange={(id) => { setSelectedProjectId(id); setStep(1); setCompleted(false); }} />
          </div>
        </div>

        {/* Step Stepper Header */}
        <div style={st.stepper}>
          {[
            { n: 1, title: '1. Commissioning Readiness' },
            { n: 2, title: '2. Punch-List & Defects' },
            { n: 3, title: '3. Closeout Deliverables' },
            { n: 4, title: '4. Client Sign-Off & DLP' },
          ].map((s) => (
            <div
              key={s.n}
              style={{
                ...st.stepItem,
                borderColor: step === s.n ? 'var(--accent)' : step > s.n ? 'var(--good)' : 'var(--border)',
                background: step === s.n ? 'var(--accent-soft)' : step > s.n ? 'var(--good-soft)' : 'var(--panel)',
                color: step === s.n ? 'var(--text)' : 'var(--muted)',
              }}
              onClick={() => setStep(s.n)}
            >
              <span style={{ ...st.stepNum, background: step > s.n ? 'var(--good)' : step === s.n ? 'var(--accent)' : 'var(--panel-2)' }}>
                {step > s.n ? '✓' : s.n}
              </span>
              <span>{s.title}</span>
            </div>
          ))}
        </div>
      </div>

      {activeProject && (
        <div style={{ marginTop: 16 }}>
          <NextBestActionBanner
            status={
              completed
                ? 'Handover Completed & DLP Active'
                : step === 1
                ? 'Validating Test Points'
                : step === 2
                ? 'Verifying Defects & Snags'
                : step === 3
                ? 'Compiling Documentation'
                : 'Client Acceptance Pending'
            }
            recommendedAction={
              completed
                ? 'Monitor 12/24-Month Defect Liability Period (DLP)'
                : step === 1
                ? 'Verify System Test-Point Pass Rate'
                : step === 2
                ? 'Clear Open Punch-List Items'
                : step === 3
                ? 'Attach O&M Manuals & As-Builts'
                : 'Capture Client Representative Digital Signature'
            }
            explanation={
              completed
                ? `Project ${activeProject.title} is formally accepted by the client. Warranty DLP clock is active.`
                : step === 1
                ? 'All ELV subsystems (CCTV, Access Control, Fire Alarm, BMS) must have passed test-point metrics.'
                : step === 2
                ? 'Ensure zero open major non-conformance reports (NCRs) or critical punch-list snags remain.'
                : step === 3
                ? 'Check off mandatory O&M manuals, as-built drawings, and commissioning certificates.'
                : 'Enter client representative details and sign the digital canvas pad to finalize handover.'
            }
          />
        </div>
      )}

      {/* Step Content Card */}
      <div style={st.stepCard}>
        {completed ? (
          <div style={st.successCard}>
            <span style={{ fontSize: 40 }}>🎉</span>
            <h3 style={st.successTitle}>Handover Completed Successfully!</h3>
            <p style={st.successDesc}>
              Project <strong>{activeProject?.title}</strong> is now transitioned to <strong>Completed</strong>. Client representative <strong>{clientRep}</strong> has signed acceptance. Warranty DLP clock is active for <strong>{warrantyMonths} months</strong>.
            </p>
            <button type="button" style={st.btnPrimary} onClick={() => { setCompleted(false); setStep(1); }}>
              Back to Overview
            </button>
          </div>
        ) : (
          <>
            {step === 1 && (
              <div style={st.stepBody}>
                <h3 style={st.stepHeading}>Step 1: ELV Commissioning System Readiness</h3>
                <div style={st.kpiRow}>
                  <div style={st.statBox}>
                    <span style={st.statVal}>{activeProject?.commissioningCount || 0}</span>
                    <span style={st.statLabel}>Registered Systems</span>
                  </div>
                  <div style={st.statBox}>
                    <span style={{ ...st.statVal, color: 'var(--good)' }}>{activeProject?.commissionedCount || 0}</span>
                    <span style={st.statLabel}>Commissioned</span>
                  </div>
                  <div style={st.statBox}>
                    <span style={{ ...st.statVal, color: 'var(--accent)' }}>
                      {activeProject?.commissioningCount ? Math.round(((activeProject.commissionedCount || 0) / activeProject.commissioningCount) * 100) : 100}%
                    </span>
                    <span style={st.statLabel}>System Pass Rate</span>
                  </div>
                </div>

                <div style={st.infoBox}>
                  <strong>Commissioning Policy Gate:</strong> At least 80% of registered systems must be fully tested and commissioned with witnessed sign-off before proceeding to client handover.
                </div>

                <div style={st.navBtnRow}>
                  <button type="button" style={st.btnPrimary} onClick={() => setStep(2)}>
                    Next: Punch-List Clearance →
                  </button>
                </div>
              </div>
            )}

            {step === 2 && (
              <div style={st.stepBody}>
                <h3 style={st.stepHeading}>Step 2: Defect & Punch-List Clearance</h3>
                <div style={st.kpiRow}>
                  <div style={st.statBox}>
                    <span style={{ ...st.statVal, color: activeProject?.openSnagCount ? 'var(--warn)' : 'var(--good)' }}>
                      {activeProject?.openSnagCount || 0}
                    </span>
                    <span style={st.statLabel}>Open Snag Items</span>
                  </div>
                  <div style={st.statBox}>
                    <span style={{ ...st.statVal, color: activeProject?.majorNcrCount ? 'var(--bad)' : 'var(--good)' }}>
                      {activeProject?.majorNcrCount || 0}
                    </span>
                    <span style={st.statLabel}>Open Major NCRs</span>
                  </div>
                </div>

                {activeProject?.majorNcrCount ? (
                  <div style={st.warnBox}>
                    ⚠️ <strong>Blocking Issue:</strong> {activeProject.majorNcrCount} open major NCR(s) detected. Major non-conformance reports must be corrected and closed prior to final handover.
                  </div>
                ) : (
                  <div style={st.goodBox}>
                    ✓ <strong>Clearance Verified:</strong> Zero open major NCRs detected. Punch-list items are clear for handover.
                  </div>
                )}

                <div style={st.navBtnRow}>
                  <button type="button" style={st.btnSecondary} onClick={() => setStep(1)}>
                    ← Back
                  </button>
                  <button type="button" style={st.btnPrimary} onClick={() => setStep(3)}>
                    Next: Closeout Deliverables →
                  </button>
                </div>
              </div>
            )}

            {step === 3 && (
              <div style={st.stepBody}>
                <h3 style={st.stepHeading}>Step 3: Close-Out Deliverables Checklist</h3>
                <p style={st.metaText}>Check off compiled documentation package deliverables. Core items (*) are required to proceed.</p>

                <div style={st.checkListGrid}>
                  {[
                    { key: 'omManuals', label: 'O&M Manuals (Operation & Maintenance)', core: true },
                    { key: 'asBuilts', label: 'As-Built CAD & Schematic Drawings', core: true },
                    { key: 'testCertificates', label: 'Test & Commissioning Certificates', core: true },
                    { key: 'warrantyDocs', label: 'Manufacturer Warranty Certificates', core: false },
                    { key: 'clientTraining', label: 'Client Operator Training Conducted', core: false },
                    { key: 'sparesHandover', label: 'Mandatory Spare Parts & Consumables Handed Over', core: false },
                  ].map((item) => (
                    <label key={item.key} style={st.checkLabel}>
                      <input
                        type="checkbox"
                        checked={checklist[item.key as keyof CloseoutChecklist]}
                        onChange={() => toggleCheck(item.key as keyof CloseoutChecklist)}
                        style={{ cursor: 'pointer' }}
                      />
                      <span>
                        {item.label} {item.core && <strong style={{ color: 'var(--accent)' }}>*</strong>}
                      </span>
                    </label>
                  ))}
                </div>

                {!coreReadyDeliverables(checklist) && (
                  <div style={st.warnBox}>
                    ⚠️ Please check off core mandatory deliverables (O&M manuals, as-builts, test certs) to enable client sign-off.
                  </div>
                )}

                <div style={st.navBtnRow}>
                  <button type="button" style={st.btnSecondary} onClick={() => setStep(2)}>
                    ← Back
                  </button>
                  <button
                    type="button"
                    style={coreReadyDeliverables(checklist) ? st.btnPrimary : st.btnDisabled}
                    disabled={!coreReadyDeliverables(checklist)}
                    onClick={() => setStep(4)}
                  >
                    Next: Client Sign-Off & DLP →
                  </button>
                </div>
              </div>
            )}

            {step === 4 && (
              <div style={st.stepBody}>
                <h3 style={st.stepHeading}>Step 4: Formal Client Acceptance & Digital Sign-Off</h3>

                <div style={st.formRow}>
                  <label style={st.fieldLabel}>
                    <span>Client Representative Name *</span>
                    <input
                      style={st.input}
                      value={clientRep}
                      onChange={(e) => setClientRep(e.target.value)}
                      placeholder="e.g. Eng. Mohammed Al-Hashemi"
                    />
                  </label>
                  <label style={st.fieldLabel}>
                    <span>Defects Liability Period (DLP)</span>
                    <select style={st.select} value={warrantyMonths} onChange={(e) => setWarrantyMonths(e.target.value)}>
                      <option value="12">12 Months (Standard)</option>
                      <option value="24">24 Months (Extended)</option>
                      <option value="36">36 Months (Specialized)</option>
                    </select>
                  </label>
                </div>

                <div style={{ marginTop: 14 }}>
                  <SignatureCanvas
                    label="Client Representative Acceptance Digital Signature Pad *"
                    value={signature}
                    onChange={setSignature}
                  />
                </div>

                {error && <div style={st.errorText}>{error}</div>}

                <div style={st.navBtnRow}>
                  <button type="button" style={st.btnSecondary} onClick={() => setStep(3)}>
                    ← Back
                  </button>
                  <button type="button" style={st.btnAccent} onClick={handleFinalHandover} disabled={busy}>
                    {busy ? 'Finalizing Handover…' : '✓ Execute Final Handover & Start DLP'}
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function coreReadyDeliverables(c: CloseoutChecklist) {
  return c.omManuals && c.asBuilts && c.testCertificates;
}

const st = {
  container: { display: 'flex', flexDirection: 'column', gap: 14 } as CSSProperties,
  headCard: { background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 14, padding: '16px 18px' } as CSSProperties,
  headRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' } as CSSProperties,
  title: { fontSize: 20, fontWeight: 700, margin: 0, color: 'var(--text)' } as CSSProperties,
  subtitle: { fontSize: 13, color: 'var(--muted)', margin: '4px 0 0' } as CSSProperties,
  pickerWrap: { display: 'flex', flexDirection: 'column', gap: 4, minWidth: 200 } as CSSProperties,
  pickerLabel: { fontSize: 12, color: 'var(--muted)', fontWeight: 600 } as CSSProperties,
  stepper: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10, marginTop: 18 } as CSSProperties,
  stepItem: {
    border: '1px solid var(--border)',
    borderRadius: 10,
    padding: '10px 12px',
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    fontSize: 12.5,
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'all 0.15s ease',
  } as CSSProperties,
  stepNum: {
    width: 24,
    height: 24,
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 12,
    fontWeight: 700,
    color: 'var(--accent-ink)',
    flexShrink: 0,
  } as CSSProperties,
  stepCard: { background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 14, padding: '20px 22px' } as CSSProperties,
  stepBody: { display: 'flex', flexDirection: 'column', gap: 14 } as CSSProperties,
  stepHeading: { fontSize: 16, fontWeight: 700, margin: 0, color: 'var(--text)' } as CSSProperties,
  metaText: { fontSize: 13, color: 'var(--muted)', margin: 0 } as CSSProperties,
  kpiRow: { display: 'flex', gap: 14, flexWrap: 'wrap' } as CSSProperties,
  statBox: {
    background: 'var(--panel-2)',
    border: '1px solid var(--border)',
    borderRadius: 10,
    padding: '12px 16px',
    minWidth: 140,
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
  } as CSSProperties,
  statVal: { fontSize: 22, fontWeight: 800, color: 'var(--text)' } as CSSProperties,
  statLabel: { fontSize: 11.5, color: 'var(--muted)' } as CSSProperties,
  infoBox: { background: 'var(--accent-soft)', border: '1px solid var(--accent)', borderRadius: 10, padding: '12px 14px', fontSize: 13, color: 'var(--text)' } as CSSProperties,
  warnBox: { background: 'var(--bad-soft)', border: '1px solid var(--bad)', borderRadius: 10, padding: '12px 14px', fontSize: 13, color: 'var(--bad)' } as CSSProperties,
  goodBox: { background: 'var(--good-soft)', border: '1px solid var(--good)', borderRadius: 10, padding: '12px 14px', fontSize: 13, color: 'var(--good)' } as CSSProperties,
  navBtnRow: { display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 10 } as CSSProperties,
  btnPrimary: { background: 'var(--accent)', border: 'none', borderRadius: 8, color: 'var(--accent-ink)', padding: '8px 16px', fontSize: 13, fontWeight: 700, cursor: 'pointer' } as CSSProperties,
  btnSecondary: { background: 'var(--panel-2)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', padding: '8px 16px', fontSize: 13, cursor: 'pointer' } as CSSProperties,
  btnDisabled: { background: 'var(--panel-2)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--muted)', padding: '8px 16px', fontSize: 13, cursor: 'not-allowed' } as CSSProperties,
  btnAccent: { background: 'var(--good)', border: 'none', borderRadius: 8, color: '#04140b', padding: '9px 18px', fontSize: 13.5, fontWeight: 700, cursor: 'pointer' } as CSSProperties,
  checkListGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 12 } as CSSProperties,
  checkLabel: { background: 'var(--panel-2)', border: '1px solid var(--border)', borderRadius: 8, padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, cursor: 'pointer' } as CSSProperties,
  formRow: { display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 14 } as CSSProperties,
  fieldLabel: { display: 'flex', flexDirection: 'column', gap: 5, fontSize: 12.5, fontWeight: 600, color: 'var(--text)' } as CSSProperties,
  input: { background: 'var(--panel-2)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 11px', fontSize: 13.5, color: 'var(--text)', fontFamily: 'inherit' } as CSSProperties,
  select: { background: 'var(--panel-2)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 11px', fontSize: 13.5, color: 'var(--text)', fontFamily: 'inherit', cursor: 'pointer' } as CSSProperties,
  errorText: { color: 'var(--bad)', fontSize: 13, marginTop: 8 } as CSSProperties,
  successCard: { display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: 12, padding: '20px 0' } as CSSProperties,
  successTitle: { fontSize: 20, fontWeight: 700, color: 'var(--good)', margin: 0 } as CSSProperties,
  successDesc: { fontSize: 14, color: 'var(--muted)', maxWidth: 500, lineHeight: 1.5, margin: 0 } as CSSProperties,
};
