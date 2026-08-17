import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Communication timeline contract (C3.0).
 *
 * The timeline is a narrow projection, and a projection is only worth having if every write path
 * feeds it. The failure mode is silent: a channel ships, its messages are stored correctly, and
 * the Overview timeline simply never mentions them — nothing errors, nothing is lost, the feature
 * is just quietly incomplete for that channel.
 *
 * So the rule is enforced structurally rather than left to reviewer memory: a service that writes
 * a communication record must also publish it to the timeline, and a channel added later cannot
 * pass this file without doing the same.
 *
 * It is a CONTRACT test, not a mock: it reads the real source of the comms services.
 */

const COMMS_DIR = resolve(__dirname);

/** A write that creates a communication record a user could later look for in their timeline. */
const WRITE_PATHS: Array<{ file: string; method: string; channel: string }> = [
  { file: 'comms.service.ts', method: 'post', channel: 'chat' },
  { file: 'comms.service.ts', method: 'sendMail', channel: 'mail' },
];

/** The publish seam. Renaming it is fine; leaving a write path without one is not. */
const PUBLISH = /publishTimeline|timeline\.(publish|record)|recordTimelineActivity/;

function sourceOf(file: string): string {
  return readFileSync(join(COMMS_DIR, file), 'utf8');
}

/** The body of a method, from its signature to the closing brace at the same indentation. */
function methodBody(source: string, method: string): string | null {
  const start = source.search(new RegExp(`\\n  (?:async )?${method}\\s*\\(`));
  if (start < 0) return null;
  const rest = source.slice(start + 1);
  const end = rest.search(/\n {2}\}/);
  return end < 0 ? rest : rest.slice(0, end);
}

describe('communication write paths publish timeline activity', () => {
  it.each(WRITE_PATHS)('$channel: $method publishes to the timeline', ({ file, method }) => {
    const body = methodBody(sourceOf(file), method);
    expect(body, `${file} no longer has a ${method}() — update this contract with it`).not.toBeNull();
    expect(
      PUBLISH.test(body!),
      `${file}#${method} writes a communication record without publishing it to the timeline.\n\n` +
        `The Overview timeline is built from aura_comms_timeline, so a write that skips it is\n` +
        `invisible there — and invisible to the Communication Copilot later. Publish the activity\n` +
        `alongside the write, or remove the write path from WRITE_PATHS with a reason.\n`,
    ).toBe(true);
  });

  it('every comms service write path is covered by this contract', () => {
    // Guards the guard: a new channel service must be listed above, so adding WhatsApp or
    // Meetings cannot quietly bypass the rule by living in a file this test never opens.
    const services = readdirSync(COMMS_DIR).filter((name) => /\.service\.ts$/.test(name));
    const covered = new Set(WRITE_PATHS.map((path) => path.file));
    expect(
      services.filter((name) => !covered.has(name)),
      'A comms service exists that no timeline contract covers. Add its write paths to WRITE_PATHS.',
    ).toEqual([]);
  });
});
