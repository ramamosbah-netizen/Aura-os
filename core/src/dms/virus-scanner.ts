import { Socket } from 'node:net';

/**
 * VIRUS SCANNING — CENTRAL, SERVER-SIDE, FAIL-CLOSED (J1-06 / XOP-09).
 *
 * The owner's decision of 2026-09-27: ClamAV, as one central server-side service, fail-closed. Every
 * upload in the system reaches storage through `DmsService` (`createDocument` / `addVersion`), so the
 * scan sits there — a rule placed at a route would be bypassed by the next route that forgets it,
 * exactly as the file-type policy would have been.
 *
 * FAIL-CLOSED means the absence of a verdict is a refusal, never a pass:
 *   infected                    refused, and the scanner's signature is named
 *   unreachable / error / slow  refused as unavailable — the file is not stored unscanned
 *   not configured              refused — except under NODE_ENV=test, where unit and in-memory
 *                               suites run with no daemon and the pass-through says so by name
 */
export const VIRUS_SCANNER = Symbol('VIRUS_SCANNER');

export type ScanVerdict = { clean: true } | { clean: false; signature: string };

export interface VirusScanner {
  /** What judged the file, for the record (e.g. `clamav 127.0.0.1:3310`). */
  readonly engine: string;
  /** Resolves with a verdict, or rejects with `ScannerUnavailableError` — never resolves "clean" without a scan. */
  scan(data: Buffer): Promise<ScanVerdict>;
}

/** The scanner gave no verdict. The upload must be refused, not waved through. */
export class ScannerUnavailableError extends Error {
  constructor(reason: string) {
    super(reason);
    this.name = 'ScannerUnavailableError';
  }
}

const CHUNK = 64 * 1024;

/**
 * clamd over TCP with the INSTREAM command: `zINSTREAM\0`, then the bytes as length-prefixed chunks
 * (4-byte big-endian length), ended by a zero-length chunk; clamd answers one line ending in `\0`:
 * `stream: OK`, `stream: <Signature> FOUND`, or `... ERROR`.
 */
export class ClamAvScanner implements VirusScanner {
  readonly engine: string;

  constructor(private readonly host: string, private readonly port: number, private readonly timeoutMs = 20_000) {
    this.engine = `clamav ${host}:${port}`;
  }

  scan(data: Buffer): Promise<ScanVerdict> {
    return new Promise<ScanVerdict>((resolve, reject) => {
      const socket = new Socket();
      let reply = '';
      let settled = false;
      const finish = (fn: () => void) => {
        if (settled) return;
        settled = true;
        socket.destroy();
        fn();
      };
      socket.setTimeout(this.timeoutMs, () => finish(() => reject(new ScannerUnavailableError(`the virus scanner did not answer within ${this.timeoutMs} ms`))));
      socket.on('error', (err) => finish(() => reject(new ScannerUnavailableError(`the virus scanner could not be reached (${err.message})`))));
      socket.on('data', (chunk) => {
        reply += chunk.toString('utf8');
        if (!reply.includes('\0')) return;
        const line = reply.slice(0, reply.indexOf('\0')).trim();
        finish(() => {
          if (/:\s*OK$/.test(line)) return resolve({ clean: true });
          const found = /:\s*(.+)\s+FOUND$/.exec(line);
          if (found) return resolve({ clean: false, signature: found[1] });
          reject(new ScannerUnavailableError(`the virus scanner could not judge the file (${line || 'empty reply'})`));
        });
      });
      socket.on('close', () => finish(() => reject(new ScannerUnavailableError('the virus scanner closed the connection without a verdict'))));
      socket.connect(this.port, this.host, () => {
        socket.write(Buffer.from('zINSTREAM\0', 'utf8'));
        for (let at = 0; at < data.length; at += CHUNK) {
          const part = data.subarray(at, Math.min(at + CHUNK, data.length));
          const size = Buffer.alloc(4);
          size.writeUInt32BE(part.length, 0);
          socket.write(size);
          socket.write(part);
        }
        socket.write(Buffer.alloc(4)); // zero-length chunk: end of stream
      });
    });
  }
}

/** No scanner is configured: every upload is refused, by name. */
export class UnconfiguredScanner implements VirusScanner {
  readonly engine = 'none';
  async scan(): Promise<ScanVerdict> {
    throw new ScannerUnavailableError('no virus scanner is configured (set CLAMAV_HOST and CLAMAV_PORT)');
  }
}

/** Unit and in-memory suites only (NODE_ENV=test): passes, and says in its name that nothing scanned. */
export class TestOnlyNoScanner implements VirusScanner {
  readonly engine = 'none (NODE_ENV=test — not scanned)';
  async scan(): Promise<ScanVerdict> {
    return { clean: true };
  }
}

/** CLAMAV_HOST (+ CLAMAV_PORT, default 3310, + CLAMAV_TIMEOUT_MS) selects ClamAV; otherwise fail closed. */
export function virusScannerFromEnv(env: Record<string, string | undefined> = process.env): VirusScanner {
  const host = env.CLAMAV_HOST?.trim();
  if (host) {
    const port = Number(env.CLAMAV_PORT ?? 3310);
    const timeout = Number(env.CLAMAV_TIMEOUT_MS ?? 20_000);
    return new ClamAvScanner(host, Number.isFinite(port) ? port : 3310, Number.isFinite(timeout) ? timeout : 20_000);
  }
  return env.NODE_ENV === 'test' ? new TestOnlyNoScanner() : new UnconfiguredScanner();
}
