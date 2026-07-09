import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readSecret } from './secret-source';

describe('secret-source (gap #3 — vault seam)', () => {
  afterEach(() => {
    delete process.env.TEST_SECRET;
    delete process.env.TEST_SECRET_FILE;
  });

  it('reads the plain env var (trimmed) as the fallback', () => {
    process.env.TEST_SECRET = '  s3cret  ';
    expect(readSecret('TEST_SECRET')).toBe('s3cret');
  });

  it('returns null when neither env nor _FILE is set', () => {
    expect(readSecret('TEST_SECRET')).toBeNull();
  });

  it('returns null for an empty env var', () => {
    process.env.TEST_SECRET = '   ';
    expect(readSecret('TEST_SECRET')).toBeNull();
  });

  it('reads from the _FILE mount and prefers it over the env var', () => {
    const dir = mkdtempSync(join(tmpdir(), 'aura-secret-'));
    const file = join(dir, 'token');
    writeFileSync(file, 'from-file\n');
    process.env.TEST_SECRET = 'from-env';
    process.env.TEST_SECRET_FILE = file;
    expect(readSecret('TEST_SECRET')).toBe('from-file');
  });

  it('throws when _FILE points at an unreadable path (explicit wiring must not run open)', () => {
    process.env.TEST_SECRET_FILE = join(tmpdir(), 'aura-secret-does-not-exist', 'token');
    expect(() => readSecret('TEST_SECRET')).toThrow(/unreadable secret file/);
  });
});
