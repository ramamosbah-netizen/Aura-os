import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * `@SignedInbound` SKIPS THE USER-PERMISSION GUARD — SO EXACTLY WHO CARRIES IT IS PINNED HERE.
 *
 * The marker exists for machines calling in (SEC-01 stage 4: Meta's WhatsApp webhook and a telematics
 * box), which have no user for a role to describe; each marked handler verifies a signature itself
 * before doing any work. That makes the marker the most dangerous line a controller can carry: put on
 * an ordinary route, it would open it to anyone. So the set is closed, named, and checked three ways —
 * the handlers that carry it, the paths the auth middleware lets through without a token, and the
 * paths whose raw bytes are kept for the signature — and the three must agree.
 */
const API_SRC = resolve(__dirname);
const REPO = resolve(__dirname, '../../..');
const ALLOWED = ['GET whatsapp/webhook', 'POST fleet/telemetry/webhook', 'POST whatsapp/webhook'];

function files(dir: string, suffix: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === 'dist') continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...files(p, suffix));
    else if (name.endsWith(suffix)) out.push(p);
  }
  return out;
}

/** Every handler carrying the marker, as `METHOD controller/handler`. */
function signedHandlers(): string[] {
  const found: string[] = [];
  for (const file of files(API_SRC, '.controller.ts')) {
    const src = readFileSync(file, 'utf8');
    if (!src.includes('@SignedInbound(')) continue;
    const ctrl = src.match(/@Controller\(\s*['"`]([^'"`]*)['"`]\s*\)/)?.[1] ?? '';
    const http = [...src.matchAll(/@(Get|Post|Put|Patch|Delete)\(\s*(?:'([^']*)'|"([^"]*)")?\s*\)/g)];
    for (const m of src.matchAll(/@SignedInbound\(/g)) {
      const nearest = http.reduce((best, h) => (Math.abs(h.index! - m.index!) < Math.abs(best.index! - m.index!) ? h : best));
      found.push(`${nearest[1].toUpperCase()} ${`${ctrl}/${nearest[2] ?? nearest[3] ?? ''}`.replace(/\/+$/, '')}`);
    }
  }
  return found.sort();
}

describe('signed inbound — the machines allowed past the user-permission guard', () => {
  it('exactly the two webhooks carry @SignedInbound — a new one must be added here, deliberately', () => {
    expect(signedHandlers()).toEqual(ALLOWED);
  });

  it('nothing outside the API controllers uses the marker', () => {
    const elsewhere = [...files(join(REPO, 'modules'), '.ts'), ...files(join(REPO, 'apps/api/src'), '.ts')]
      .filter((f) => !f.endsWith('.controller.ts') && !f.endsWith('.test.ts'))
      .filter((f) => readFileSync(f, 'utf8').includes('@SignedInbound('));
    expect(elsewhere).toEqual([]);
  });

  it('the auth middleware lets exactly those paths through without a token, and keeps their raw bytes', () => {
    const main = readFileSync(join(API_SRC, 'main.ts'), 'utf8');
    const publicPaths = [...(main.match(/const PUBLIC_PATHS = \[([^\]]*)\]/)?.[1] ?? '').matchAll(/'([^']+)'/g)].map((m) => m[1]);
    const webhooks = publicPaths.filter((p) => !/\/(health|auth)(\/|$)/.test(p)).sort();
    const expected = [...new Set(ALLOWED.map((k) => `/api/v1/${k.split(' ')[1]}`))].sort();
    expect(webhooks, 'a token-free path that is not a signed webhook would be open to anyone').toEqual(expected);
    for (const path of expected) {
      expect(main, `${path} must keep its raw body for the signature`).toContain(`path.endsWith('${path.replace('/api/v1', '')}')`);
    }
  });
});
