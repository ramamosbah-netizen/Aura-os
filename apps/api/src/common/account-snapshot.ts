import type { AccountService } from '@aura/crm';

/**
 * The deal chain carries the account as `accountId` + `accountName` — a reference *and* a snapshot
 * of what the account was called at the time (opportunity → tender → contract → project, and the
 * contacts hanging off an account). Only the reference is ever posted: the UI and the API send an
 * `accountId` picked from a list, so a create that trusts the caller for the name stores none, and
 * every downstream reader that trusts the snapshot renders a raw UUID.
 *
 * Resolving the name lives here, at the app layer, rather than in each domain: the snapshot is a
 * cross-context read (four modules, one CRM account), and modules do not import each other
 * (ADR-0004). An explicitly supplied name still wins — the caller may be recording what the account
 * was called on a historical document, which is the whole point of a snapshot.
 */
export async function resolveAccountSnapshot(
  accounts: AccountService,
  accountId: string | null | undefined,
  suppliedName: string | null | undefined,
): Promise<string | null> {
  const explicit = suppliedName?.trim();
  if (explicit) return explicit;
  if (!accountId) return null;
  // An unresolvable account (deleted, or another tenant's — RLS returns nothing) leaves the
  // snapshot null rather than failing the create: the reference is the caller's claim to validate,
  // not this helper's.
  const account = await accounts.get(accountId);
  return account?.name ?? null;
}

/**
 * The PATCH half. Returns the `accountName` field to merge into a sparse patch, or `{}` to leave
 * the stored snapshot untouched — a patch that says nothing about the account must not blank it.
 * Changing the `accountId` re-snapshots: the deal moved to a different account, so the name that
 * described the old one is simply wrong.
 */
export async function accountSnapshotPatch(
  accounts: AccountService,
  accountId: string | null | undefined,
  suppliedName: string | null | undefined,
): Promise<{ accountName?: string | null }> {
  const explicit = suppliedName?.trim();
  if (explicit) return { accountName: explicit };
  // A moved deal re-snapshots from the new account (and `accountId: null` unlinks → no name).
  if (accountId !== undefined) return { accountName: await resolveAccountSnapshot(accounts, accountId, null) };
  // An explicit blank with no account to re-read from is a request to clear the snapshot.
  if (suppliedName !== undefined) return { accountName: null };
  return {};
}
