'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  RecordShell, RecordHeader, ActionButton,
  RecordBand, RecordSituation, RecordMissing, RecordWorkflowGate,
  RecordCard, InfoRow, CardGrid,
  type RelatedGroup, type KpiItem, type Tone,
} from '@/components/ui/record';
import {
  ELV_NEXT, systemLabel, statusMeta, type ElvDevice, type ElvDeviceStatus, type ElvTone,
} from '@/lib/elv';

// The forward install→commission spine; used to name the "next milestone" gate.
const FORWARD: ElvDeviceStatus[] = ['planned', 'installed', 'terminated', 'tested', 'commissioned'];
const VERB: Record<ElvDeviceStatus, string> = {
  planned: 'Reset to planned', installed: 'Mark installed', terminated: 'Mark terminated',
  tested: 'Mark tested', commissioned: 'Commission', faulty: 'Flag faulty', removed: 'Remove',
};

const toRecordTone = (t: ElvTone): Tone => (t === 'info' ? 'accent' : t);

export default function ElvDevice360Client({ device, projectName }: { device: ElvDevice; projectName: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const meta = statusMeta(device.status);
  const nexts = ELV_NEXT[device.status] ?? [];

  async function transition(target: ElvDeviceStatus) {
    setBusy(target);
    setError(null);
    try {
      const res = await fetch(`/api/elv/devices/${device.id}/status`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status: target }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setError(d?.error ?? `Could not move to ${target}`);
      } else {
        router.refresh();
      }
    } catch {
      setError('ELV service unreachable');
    } finally {
      setBusy(null);
    }
  }

  // Next milestone on the linear spine (for the workflow gate).
  const idx = FORWARD.indexOf(device.status);
  const nextMilestone = idx >= 0 && idx < FORWARD.length - 1 ? FORWARD[idx + 1] : null;
  const milestoneAllowed = nextMilestone ? nexts.includes(nextMilestone) : false;

  // What the client will hold you to at handover — flagged once you're past install.
  const missing: string[] = [];
  if (['terminated', 'tested', 'commissioned'].includes(device.status)) {
    if (!device.serialNumber) missing.push('Serial number');
    if (!device.ipAddress && device.system !== 'gate_barrier') missing.push('IP address');
    if (!device.cableRef) missing.push('Cable reference');
  }

  const kpis: KpiItem[] = [
    { label: 'Status', value: meta.label, tone: toRecordTone(meta.tone) },
    { label: 'System', value: systemLabel(device.system) },
    { label: 'Commissioning', value: device.commissioningRecordId ? 'Linked' : '—', tone: device.commissioningRecordId ? 'good' : 'neutral' },
    { label: 'Warranty', value: device.warrantyExpiresAt ? device.warrantyExpiresAt.slice(0, 10) : '—' },
  ];

  const related: RelatedGroup[] = [
    { label: 'Project', icon: '▥', items: [{ code: projectName, href: `/project/${device.projectId}` }] },
    { label: 'Drawing', icon: '📐', items: device.drawingRef ? [{ code: device.drawingRef }] : [] },
    { label: 'Commissioning', icon: '✓', items: device.commissioningRecordId ? [{ code: 'Commissioning record', href: `/commissioning/${device.commissioningRecordId}`, status: 'linked', statusTone: 'good' }] : [] },
    { label: 'Asset (AMC)', icon: '🔧', items: device.assetId ? [{ code: 'Maintainable asset', href: `/assets/register/${device.assetId}`, status: 'handed over', statusTone: 'good' }] : [] },
  ];

  const dash = (v: string | null) => v ?? '—';

  return (
    <div style={{ padding: '4px 2px' }}>
      <RecordShell
        header={
          <RecordHeader
            title={device.tag}
            status={meta.label}
            statusTone={toRecordTone(meta.tone)}
            meta={[
              { label: 'System', value: systemLabel(device.system) },
              { label: 'Project', value: projectName },
              { value: device.model ?? '—' },
            ]}
            actions={
              <>
                {nexts.map((t) => (
                  <ActionButton
                    key={t}
                    kind={t === nextMilestone ? 'primary' : 'ghost'}
                    disabled={busy !== null}
                    onClick={() => transition(t)}
                  >
                    {busy === t ? '…' : VERB[t]}
                  </ActionButton>
                ))}
                <ActionButton href={`/elv/devices`}>← All devices</ActionButton>
              </>
            }
          />
        }
        kpis={kpis}
        situation={
          <RecordBand tone={toRecordTone(meta.tone)}>
            <RecordSituation
              situation={`${systemLabel(device.system)} device ${device.tag} is ${meta.label.toLowerCase()}${device.location ? ` at ${device.location}` : ''}.`}
            />
            {nextMilestone && (
              <RecordWorkflowGate
                gate={{
                  label: statusMeta(nextMilestone).label,
                  allowed: milestoneAllowed,
                  gaps: milestoneAllowed ? [] : [`Must clear the current ${meta.label} step first`],
                }}
              />
            )}
            {missing.length > 0 && <RecordMissing items={missing} />}
          </RecordBand>
        }
        related={{ groups: related }}
      >
        {error && <div style={{ color: 'var(--bad)', fontSize: 13, marginBottom: 12 }} role="alert">{error}</div>}
        <CardGrid>
          <RecordCard title="Identity">
            <InfoRow label="Model" value={dash(device.model)} />
            <InfoRow label="Manufacturer" value={dash(device.manufacturer)} />
            <InfoRow label="Serial number" value={dash(device.serialNumber)} />
            <InfoRow label="MAC address" value={dash(device.macAddress)} />
            <InfoRow label="IP address" value={dash(device.ipAddress)} />
          </RecordCard>
          <RecordCard title="Connectivity">
            <InfoRow label="Cable ref" value={dash(device.cableRef)} />
            <InfoRow label="Home run to" value={dash(device.homeRunTo)} />
            <InfoRow label="Port" value={dash(device.portRef)} />
          </RecordCard>
          <RecordCard title="Location & design">
            <InfoRow label="Location" value={dash(device.location)} />
            <InfoRow label="Drawing ref" value={dash(device.drawingRef)} />
          </RecordCard>
          <RecordCard title="Lifecycle">
            <InfoRow label="Warranty expires" value={device.warrantyExpiresAt ? device.warrantyExpiresAt.slice(0, 10) : '—'} />
            <InfoRow label="Created" value={device.createdAt.slice(0, 10)} />
            <InfoRow label="Updated" value={device.updatedAt.slice(0, 10)} />
            {device.notes && <InfoRow label="Notes" value={device.notes} />}
          </RecordCard>
        </CardGrid>
      </RecordShell>
    </div>
  );
}
