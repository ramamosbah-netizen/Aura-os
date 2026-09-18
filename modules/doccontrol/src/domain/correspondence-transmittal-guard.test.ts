import { describe, it, expect } from 'vitest';
import { InMemoryTransmittalStore } from '../in-memory-transmittal-store';
import { InMemoryDocumentRevisionStore, InMemoryTransmittalAcknowledgementStore } from '../in-memory-document-revision-store';
import { InMemoryTransmittalRecipientStore } from '../transmittal-recipient-store';
import { InMemoryCorrespondenceStore } from '../in-memory-correspondence-store';
import { InMemorySubmittalStore } from '../in-memory-submittal-store';
import { InMemoryDrawingRegisterStore } from '../in-memory-drawing-register-store';
import { InMemoryTransmittalItemStore } from '../in-memory-transmittal-item-store';
import { DocControlService } from '../doccontrol.service';
import { AccessService, type EventStore, type TxRunner } from '@aura/core';

// Coverage for the doc-control verticals the QA volume flags as thin: the
// correspondence log→close lifecycle and the transmittal-item guards (project
// mismatch, revision snapshotting) that keep the register linkage trustworthy.

const mockTx: TxRunner = { run: (fn) => fn(null) };

/**
 * The Document Controller is a REAL SEEDED ROLE here, not a permissive stub. These tests used to
 * close correspondence as `null`, which skipped the guard entirely — so naming an actor is what made
 * `doccontrol.correspondence.close` start being checked at all.
 */
const DC = 'u-document-controller';

function build(): { svc: DocControlService; emitted: Array<{ type: string; payload: Record<string, unknown> }> } {
  const emitted: Array<{ type: string; payload: Record<string, unknown> }> = [];
  const events = {
    appendWithClient: async (_h: unknown, evts: Array<{ type: string; payload: Record<string, unknown> }>) => {
      emitted.push(...evts);
      return evts;
    },
  } as unknown as EventStore;
  const access = new AccessService(null); // no pool → in-memory grants
  access.seedStandardRoles();
  access.grant({ userId: DC, roleId: 'r-document-controller', scope: { kind: 'org', level: 'tenant', id: 't1' } });
  const svc = new DocControlService(
    new InMemoryTransmittalStore(),
    new InMemoryTransmittalItemStore(), new InMemoryTransmittalAcknowledgementStore(), new InMemoryTransmittalRecipientStore(), new InMemoryDocumentRevisionStore(),
    new InMemoryCorrespondenceStore(),
    new InMemorySubmittalStore(),
    new InMemoryDrawingRegisterStore(),
    events,
    mockTx,
    access,
  );
  return { svc, emitted };
}

describe('Correspondence log → close', () => {
  it('logs inbound correspondence (emits the logged event) and closes it', async () => {
    const { svc, emitted } = build();
    const corr = await svc.createCorrespondence({
      tenantId: 't1', projectId: 'p1', code: 'COR-IN-014',
      subject: 'Consultant comments on ELV riser diagrams', direction: 'inbound',
      sender: 'DAR Consultants',
    });
    expect(corr.status).not.toBe('closed');
    const logged = emitted.find((e) => e.type.includes('correspondence'));
    expect(logged?.payload).toMatchObject({ code: 'COR-IN-014', direction: 'inbound', projectId: 'p1' });

    const closed = await svc.closeCorrespondence('t1', DC, corr.id, 'Answered by RFI-0042');
    expect(closed.status).toBe('closed');
    expect(closed.closedBy).toBe(DC);
    expect(closed.closeReason).toBe('Answered by RFI-0042');
  });

  it('refuses a close with no reason, and refuses a second one', async () => {
    const { svc } = build();
    const corr = await svc.createCorrespondence({
      tenantId: 't1', projectId: 'p1', code: 'COR-2', subject: 'x', direction: 'inbound',
    });
    await expect(svc.closeCorrespondence('t1', DC, corr.id, '   ')).rejects.toThrow(/reason/i);
    await svc.closeCorrespondence('t1', DC, corr.id, 'Superseded by COR-3');
    // Second close → 409. Closing an already-closed item used to return 200 and quietly rewrite who
    // closed it and why, overwriting the first account of it with the second.
    await expect(svc.closeCorrespondence('t1', DC, corr.id, 'again')).rejects.toThrow(/already closed/i);
  });

  it('is tenant-isolated on close', async () => {
    const { svc } = build();
    const corr = await svc.createCorrespondence({
      tenantId: 't1', projectId: 'p1', code: 'COR-1', subject: 'x', direction: 'outbound',
    });
    await expect(svc.closeCorrespondence('t2', DC, corr.id, 'wrong tenant')).rejects.toThrow(/not found/);
  });
});

describe('Transmittal items — register linkage guards', () => {
  it('attaches register documents, snapshotting number/title/current revision', async () => {
    const { svc } = build();
    const t = await svc.createTransmittal({
      tenantId: 't1', projectId: 'p1', code: 'TRA-055', title: 'IFC package — CCTV',
    });
    const entry = await svc.createRegisterEntry({
      tenantId: 't1', projectId: 'p1', documentNumber: 'ELV-DWG-014', title: 'CCTV layout — L3',
    });

    const items = await svc.addTransmittalItems('t1', t.id, [{ registerEntryId: entry.id }]);
    expect(items).toHaveLength(1);
    expect(items[0].documentNumber).toBe('ELV-DWG-014');
    expect(items[0].revision).toBe(entry.currentRevision); // defaults to the register's revision

    const listed = await svc.listTransmittalItems('t1', t.id);
    expect(listed).toHaveLength(1);
  });

  it('refuses documents from another project (linkage integrity)', async () => {
    const { svc } = build();
    const t = await svc.createTransmittal({
      tenantId: 't1', projectId: 'p1', code: 'TRA-056', title: 'Fire alarm package',
    });
    const foreign = await svc.createRegisterEntry({
      tenantId: 't1', projectId: 'p2', documentNumber: 'FA-DWG-001', title: 'FA riser',
    });
    await expect(svc.addTransmittalItems('t1', t.id, [{ registerEntryId: foreign.id }])).rejects.toThrow(
      /another project/,
    );
  });

  it('acknowledges a sent transmittal', async () => {
    const { svc } = build();
    const t = await svc.createTransmittal({
      tenantId: 't1', projectId: 'p1', code: 'TRA-057', title: 'Access control package',
    });
    await svc.sendTransmittal('t1', null, t.id); // draft → sent before it can be acknowledged
    const ack = await svc.acknowledgeTransmittal('t1', null, t.id);
    expect(ack.status).toBe('acknowledged');
  });
});
