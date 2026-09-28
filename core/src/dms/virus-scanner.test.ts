import { afterEach, describe, expect, it } from 'vitest';
import { createServer, type Server, type Socket } from 'node:net';
import { ServiceUnavailableException } from '@nestjs/common';
import {
  ClamAvScanner, ScannerUnavailableError, TestOnlyNoScanner, UnconfiguredScanner, type VirusScanner, virusScannerFromEnv,
} from './virus-scanner';
import { DmsService } from './dms.service';
import { InMemoryDocumentStore } from './in-memory-document-store';
import { InMemoryDocumentPermissionStore } from './in-memory-document-permission-store';
import { DocumentAccessResolver } from './document-access-resolver';
import type { DocumentStorage } from './document-storage';
import type { EventStore } from '../events/event-store';

/**
 * J1-06 / XOP-09 — CENTRAL, SERVER-SIDE, FAIL-CLOSED VIRUS SCANNING (owner, 2026-09-27: ClamAV).
 *
 * The EICAR test file is assembled at run time from two halves: written contiguously in a source
 * file it is itself a "virus" to the antivirus on a developer's machine, which may quarantine the
 * test that proves the scanner works.
 */
const EICAR = Buffer.from(['X5O!P%@AP[4\\PZX54(P^)7CC)7}', '$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*'].join(''), 'latin1');

/** A clamd stand-in: reads the INSTREAM frames, reassembles the bytes, answers as told. */
function fakeClamd(answer: (bytes: Buffer) => string | null): Promise<{ port: number; received: Buffer[]; close: () => Promise<void> }> {
  const received: Buffer[] = [];
  const sockets = new Set<Socket>();
  const server: Server = createServer((socket) => {
    sockets.add(socket);
    let buf = Buffer.alloc(0);
    let headerSeen = false;
    const body: Buffer[] = [];
    socket.on('data', (chunk) => {
      buf = Buffer.concat([buf, chunk]);
      if (!headerSeen) {
        const nul = buf.indexOf(0);
        if (nul < 0) return;
        expect(buf.subarray(0, nul).toString()).toBe('zINSTREAM');
        buf = buf.subarray(nul + 1);
        headerSeen = true;
      }
      while (buf.length >= 4) {
        const size = buf.readUInt32BE(0);
        if (size === 0) {
          const all = Buffer.concat(body);
          received.push(all);
          const reply = answer(all);
          if (reply !== null) socket.write(`${reply}\0`);
          buf = buf.subarray(4);
          return;
        }
        if (buf.length < 4 + size) return;
        body.push(buf.subarray(4, 4 + size));
        buf = buf.subarray(4 + size);
      }
    });
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => {
    const port = (server.address() as { port: number }).port;
    resolve({
      port,
      received,
      close: () => new Promise((done) => { sockets.forEach((s) => s.destroy()); server.close(() => done()); }),
    });
  }));
}

const closers: Array<() => Promise<void>> = [];
afterEach(async () => { while (closers.length) await closers.pop()!(); });

describe('the ClamAV client (clamd INSTREAM)', () => {
  it('streams the exact bytes and reads a clean verdict', async () => {
    const clamd = await fakeClamd(() => 'stream: OK');
    closers.push(clamd.close);
    const big = Buffer.alloc(200_000, 7); // more than one 64 KiB chunk
    await expect(new ClamAvScanner('127.0.0.1', clamd.port).scan(big)).resolves.toEqual({ clean: true });
    expect(clamd.received[0].equals(big)).toBe(true);
  });

  it('names the signature it found', async () => {
    const clamd = await fakeClamd(() => 'stream: Win.Test.EICAR_HDB-1 FOUND');
    closers.push(clamd.close);
    await expect(new ClamAvScanner('127.0.0.1', clamd.port).scan(EICAR)).resolves.toEqual({ clean: false, signature: 'Win.Test.EICAR_HDB-1' });
  });

  it('treats every non-verdict as unavailable — an error reply, a refused connection, a silent daemon', async () => {
    const erroring = await fakeClamd(() => 'INSTREAM size limit exceeded. ERROR');
    closers.push(erroring.close);
    await expect(new ClamAvScanner('127.0.0.1', erroring.port).scan(Buffer.from('x'))).rejects.toBeInstanceOf(ScannerUnavailableError);

    const silent = await fakeClamd(() => null);
    closers.push(silent.close);
    await expect(new ClamAvScanner('127.0.0.1', silent.port, 300).scan(Buffer.from('x'))).rejects.toThrow(/did not answer within 300 ms/);

    const gone = await fakeClamd(() => 'stream: OK');
    const port = gone.port;
    await gone.close();
    await expect(new ClamAvScanner('127.0.0.1', port).scan(Buffer.from('x'))).rejects.toThrow(/could not be reached/);
  });
});

describe('choosing the scanner — fail-closed', () => {
  it('uses ClamAV when it is configured', () => {
    expect(virusScannerFromEnv({ CLAMAV_HOST: 'clamav.internal', CLAMAV_PORT: '3310' }).engine).toBe('clamav clamav.internal:3310');
  });

  it('refuses every upload when nothing is configured, outside tests', async () => {
    const scanner = virusScannerFromEnv({ NODE_ENV: 'production' });
    expect(scanner).toBeInstanceOf(UnconfiguredScanner);
    await expect(scanner.scan(Buffer.from('x'))).rejects.toThrow(/no virus scanner is configured/);
  });

  it('passes only under NODE_ENV=test, and says so by name', () => {
    const scanner = virusScannerFromEnv({ NODE_ENV: 'test' });
    expect(scanner).toBeInstanceOf(TestOnlyNoScanner);
    expect(scanner.engine).toContain('not scanned');
  });
});

describe('the DMS write path scans before a byte is stored', () => {
  function dms(scanner: VirusScanner) {
    const puts: string[] = [];
    const storage: DocumentStorage = {
      name: 'memory',
      put: async (key, data) => { puts.push(key); return { storageKey: key, sizeBytes: data.length, checksum: 'x' }; },
      read: async () => Buffer.alloc(0),
    };
    const store = new InMemoryDocumentStore();
    const perms = new InMemoryDocumentPermissionStore();
    const events = { append: async () => undefined, appendWithClient: async () => undefined } as unknown as EventStore;
    return { service: new DmsService(store, storage, events, perms, new DocumentAccessResolver(store, perms), scanner), puts };
  }
  const doc = { tenantId: 't1', kind: 'client_enquiry', title: 'Enquiry note', aggregateType: 'crm.lead', aggregateId: 'lead-1', createdBy: 'u1' };
  const note = (data: Buffer) => ({ fileName: 'note.txt', contentType: 'text/plain', data });
  const verdict = (v: Awaited<ReturnType<VirusScanner['scan']>> | Error): VirusScanner => ({
    engine: 'fake', scan: async () => { if (v instanceof Error) throw v; return v; },
  });

  it('stores a clean file', async () => {
    const { service, puts } = dms(verdict({ clean: true }));
    await expect(service.createDocument(doc, note(Buffer.from('scope of works')))).resolves.toBeDefined();
    expect(puts).toHaveLength(1);
  });

  it('refuses an infected file with the signature named, and stores nothing', async () => {
    const { service, puts } = dms(verdict({ clean: false, signature: 'Win.Test.EICAR_HDB-1' }));
    await expect(service.createDocument(doc, note(EICAR))).rejects.toThrow('"note.txt" cannot be stored: the virus scanner found Win.Test.EICAR_HDB-1');
    expect(puts).toHaveLength(0);
  });

  it('refuses as unavailable (503) when the scanner gives no verdict, and stores nothing', async () => {
    const { service, puts } = dms(verdict(new ScannerUnavailableError('the virus scanner could not be reached (ECONNREFUSED)')));
    const refused = service.createDocument(doc, note(Buffer.from('fine')));
    await expect(refused).rejects.toBeInstanceOf(ServiceUnavailableException);
    await expect(refused).rejects.toThrow(/cannot be stored: the virus scanner could not be reached .* uploads are refused until the scanner answers/);
    expect(puts).toHaveLength(0);
  });

  it('scans a new version exactly as it scans the first', async () => {
    let infected = false;
    const scanner: VirusScanner = { engine: 'fake', scan: async () => (infected ? { clean: false, signature: 'Eicar' } : { clean: true }) };
    const { service, puts } = dms(scanner);
    const created = await service.createDocument(doc, note(Buffer.from('v1')));
    infected = true;
    await expect(service.addVersion(created.document.id, note(EICAR), { userId: 'u1', tenantId: 't1' } as never)).rejects.toThrow(/virus scanner found Eicar/);
    expect(puts).toHaveLength(1);
  });
});

/** Against the real daemon when one answers locally (docker: aura-dev-clamav on 3310); skipped otherwise. */
describe('against a running ClamAV', () => {
  const host = process.env.CLAMAV_HOST ?? '127.0.0.1';
  const port = Number(process.env.CLAMAV_PORT ?? 3310);
  it('finds the EICAR test file and passes a clean one', async (ctx) => {
    const scanner = new ClamAvScanner(host, port, 10_000);
    const clean = await scanner.scan(Buffer.from('an ordinary specification note')).catch((e: Error) => e);
    if (clean instanceof Error) { ctx.skip(); return; }
    expect(clean).toEqual({ clean: true });
    const found = await scanner.scan(EICAR);
    expect(found.clean).toBe(false);
    expect((found as { signature: string }).signature).toMatch(/EICAR/i);
  });
});
