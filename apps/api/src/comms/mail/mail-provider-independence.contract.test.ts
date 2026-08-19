import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Provider independence (C3.2), enforced by reading the real source.
 *
 * Two failures this guards against, both of which look fine in review and are expensive later:
 *
 *   1. A vendor SDK type creeping into the domain or the service, so "add Gmail" quietly becomes
 *      "change the mail engine".
 *   2. A credential appearing in a Communication table, type or browser bundle — Communication
 *      must not be able to leak what it was never given.
 */

const MAIL = resolve(__dirname);
const COMMS = resolve(__dirname, '..');
const MIGRATIONS = resolve(__dirname, '..', '..', '..', '..', '..', 'infrastructure', 'migrations');
const WEB = resolve(__dirname, '..', '..', '..', '..', 'web');

const read = (file: string): string => readFileSync(file, 'utf8');

/** Anything that names a specific vendor's client library. */
const VENDOR_SDKS = [
  'googleapis', 'google-auth-library', '@microsoft/microsoft-graph-client', '@azure/msal',
  'nodemailer', 'imapflow', 'node-imap', 'smtp-connection',
];

/** Files the mail engine is built from — the domain and everything that orchestrates it. */
const ENGINE_FILES = ['mail-domain.ts', 'mail.service.ts', 'mail-store.ts', 'postgres-mail-store.ts', 'in-memory-mail-store.ts'];

describe('the mail engine does not depend on any provider', () => {
  it.each(ENGINE_FILES)('%s imports no vendor SDK', (file) => {
    const source = read(join(MAIL, file));
    for (const sdk of VENDOR_SDKS) {
      expect(
        source.includes(sdk),
        `${file} references ${sdk}. Provider code belongs in an adapter behind mail-delivery.ts,\n` +
          `so that adding a provider never means opening the mail engine.\n`,
      ).toBe(false);
    }
  });

  it('MailService imports the contract, never a concrete adapter', () => {
    const source = read(join(MAIL, 'mail.service.ts'));
    // Depending on an adapter directly would make the engine know one provider by name, which is
    // the coupling the whole seam exists to prevent.
    expect(source).not.toMatch(/from '\.\/[a-z-]*-adapter'/);
    expect(source).not.toMatch(/AuraInternalMailAdapter/);
  });

  it('every adapter implements the shared contract rather than inventing its own', () => {
    const adapters = readdirSync(MAIL).filter((name) => name.endsWith('-adapter.ts'));
    expect(adapters.length, 'there should be at least the reference adapter').toBeGreaterThan(0);
    for (const adapter of adapters) {
      const source = read(join(MAIL, adapter));
      expect(source, `${adapter} must implement MailProviderAdapter`).toContain('implements MailProviderAdapter');
      expect(source, `${adapter} must declare its capabilities explicitly`).toMatch(/readonly capabilities/);
    }
  });
});

describe('no credentials live in Communication', () => {
  const SECRET_COLUMNS = ['access_token', 'refresh_token', 'client_secret', 'webhook_secret', 'password', 'api_key'];

  it('the Communication migrations define no secret column', () => {
    const commsMigrations = readdirSync(MIGRATIONS)
      .filter((name) => /^(0234|0235|0236)_/.test(name))
      .map((name) => ({ name, sql: read(join(MIGRATIONS, name)) }));
    expect(commsMigrations.length).toBe(3);

    for (const { name, sql } of commsMigrations) {
      for (const column of SECRET_COLUMNS) {
        expect(
          new RegExp(`^\\s*${column}\\s`, 'm').test(sql),
          `${name} declares a ${column} column. Provider credentials belong to the Admin Center\n` +
            `integration layer — a leaked Communication row must not be able to send anything.\n`,
        ).toBe(false);
      }
    }
  });

  it('the account reference type exposes no secret field', () => {
    const source = read(join(MAIL, 'mail-delivery.ts'));
    const accountRef = source.slice(source.indexOf('export interface MailAccountRef'), source.indexOf('export interface ProviderHealth'));
    for (const secret of ['token', 'secret', 'password', 'credential']) {
      expect(accountRef.toLowerCase()).not.toMatch(new RegExp(`^\\s+\\w*${secret}\\w*[?]?:`, 'mi'));
    }
  });

  it('no Communication surface in the browser bundle mentions a provider credential', () => {
    // The web app must never receive one, so it must never name one either.
    const communicationSources = [
      join(WEB, 'app', 'my-work', 'communication', 'page.tsx'),
      join(WEB, 'components', 'internal-chat.tsx'),
    ];
    for (const file of communicationSources) {
      const source = read(file).toLowerCase();
      for (const secret of ['access_token', 'refresh_token', 'client_secret', 'webhook_secret']) {
        expect(source.includes(secret), `${file} mentions ${secret}`).toBe(false);
      }
    }
  });
});
