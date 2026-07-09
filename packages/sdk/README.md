# @aura/sdk

Typed TypeScript client for the AURA OS API — **generated from the live OpenAPI spec**
(646 operations), so it can never drift from the routes: CI regenerates it against the
built API and fails on any diff.

```ts
import { AuraSdk, AuraApiError } from '@aura/sdk';

const sdk = new AuraSdk({ baseUrl: 'https://aura.example.com' });

const { token } = (await sdk.authLogin({ username: 'u-admin', password: '…' })) as { token: string };
sdk.setToken(token);

// Spine create with idempotency (server may require the key on spine creates)
await sdk.crmAccountsCreate({ name: 'Emaar Properties' }, { idempotencyKey: crypto.randomUUID() });

// Universal pagination envelope
const page = await sdk.crmAccountsPaged({ offset: 0, limit: 50 });

// Every non-2xx is an AuraApiError carrying the enforced taxonomy
try {
  await sdk.financeInvoicesApprove(id);
} catch (e) {
  if (e instanceof AuraApiError && e.code === 'CONFLICT') {
    // state guard (3-way match failed, already approved, …) — surface e.message
  }
}
```

- **Method names** derive from controller operation ids (`crmAccountsCreate`,
  `financeInvoicesList`…); each carries its route in the doc comment.
- **Errors**: `AuraApiError { code: VALIDATION|AUTH|FORBIDDEN|NOT_FOUND|CONFLICT|RATE_LIMITED|SERVER, status, body }`.
- **Payload types are `unknown` today** — they tighten automatically as API DTOs gain
  swagger schemas; the generator already passes them through.

## Regenerating

```sh
pnpm exec turbo run build --filter=@aura/api...   # once
pnpm --filter @aura/sdk generate                  # boots the API in-memory, rewrites src/generated.ts
# or against a running instance:
SPEC_URL=http://localhost:4200/api/docs-json node scripts/generate-sdk.mjs
```
