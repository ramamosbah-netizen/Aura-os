/* eslint-disable */
// Boot the COMPILED application context and read, from the live instances Nest actually built,
// whether each @Optional() dependency arrived. Reasoning about `design:paramtypes` says what SHOULD
// happen; this says what DID.
//
//   node -r dotenv/config scripts/probe-optional-injections.cjs dotenv_config_path=.env.local
//
// Binds no port, so it can run beside a live API.
const { NestFactory } = require('@nestjs/core');
const { AppModule } = require('../dist/app.module');

const SITES = [
  ['@aura/core', 'NotificationService', 'settings'],
  ['@aura/core', 'AuthenticationService', 'audit'],
  ['@aura/crm', 'PreAwardService', 'packages'],
  ['../dist/crm/quotation-reference.service', 'QuotationReferenceService', 'tenant'],
  ['@aura/projects', 'CostLedgerService', 'companies'],
  ['@aura/procurement', 'SourcingAwardService', 'locks'],
  ['../dist/comms/comms.service', 'CommsService', 'users'],
  ['../dist/comms/comms.service', 'CommsService', 'events'],
  // The control, fixed earlier today by adding @Inject(QuotationService).
  ['../dist/documents/document-requirements.controller', 'DocumentRequirementsController', 'quotations'],
];

(async () => {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  for (const [from, cls, field] of SITES) {
    let verdict;
    try {
      const Cls = require(from)[cls];
      let instance;
      try { instance = app.get(Cls, { strict: false }); } catch { instance = await app.resolve(Cls, undefined, { strict: false }); }
      const value = instance[field];
      verdict = value == null ? 'NULL      — silently absent' : `ARRIVED   — ${value.constructor?.name ?? typeof value}`;
    } catch (err) {
      verdict = `UNREADABLE — ${err.message.slice(0, 90)}`;
    }
    console.log(`${`${cls}.${field}`.padEnd(46)} ${verdict}`);
  }
  await app.close();
  process.exit(0);
})().catch((err) => { console.error(err); process.exit(1); });
