import type { MailRecord } from './mail-domain';
import { normaliseAddress } from './mail-domain';
import type { DispatchRecord, MailFilter, MailStore } from './mail-store';

/**
 * In-memory mail persistence so the API boots and the suite runs without a database, matching
 * every other AURA store. Not the production path: without DATABASE_URL, mail is lost on restart,
 * which is exactly what the Postgres store exists to prevent.
 */
export class InMemoryMailStore implements MailStore {
  private readonly mail = new Map<string, Map<string, MailRecord>>();
  /** Stands in for aura_comms_mail_reads: `${mailId}::${participantKey}` -> readAt. */
  private readonly reads = new Map<string, Map<string, string>>();
  private readonly dispatch = new Map<string, Map<string, DispatchRecord>>();
  /** Stands in for aura_comms_accounts.sync_cursor. */
  private readonly cursors = new Map<string, string>();

  private box(tenantId: string): Map<string, MailRecord> {
    let box = this.mail.get(tenantId);
    if (!box) { box = new Map(); this.mail.set(tenantId, box); }
    return box;
  }

  private queue(tenantId: string): Map<string, DispatchRecord> {
    let queue = this.dispatch.get(tenantId);
    if (!queue) { queue = new Map(); this.dispatch.set(tenantId, queue); }
    return queue;
  }

  private readKey(participant: { address?: string | null; userId?: string | null }): string {
    return participant.userId ? `user:${participant.userId}` : normaliseAddress(participant.address ?? '');
  }

  private readsFor(tenantId: string): Map<string, string> {
    let map = this.reads.get(tenantId);
    if (!map) { map = new Map(); this.reads.set(tenantId, map); }
    return map;
  }

  /** readAt is a projection: it comes from the reads map, never from what was saved. */
  private hydrate(tenantId: string, mail: MailRecord): MailRecord {
    const reads = this.readsFor(tenantId);
    const copy = structuredClone(mail);
    for (const participant of copy.participants) {
      participant.readAt = participant.role === 'from'
        ? null
        : reads.get(`${mail.id}::${this.readKey(participant)}`) ?? null;
    }
    return copy;
  }

  async save(tenantId: string, mail: MailRecord): Promise<void> {
    // Strip any readAt a caller round-tripped: read state is owned by the reads map, and letting
    // a save write it back would be exactly the "stored on participants" mistake.
    const clean = structuredClone(mail);
    for (const participant of clean.participants) delete participant.readAt;
    this.box(tenantId).set(mail.id, clean);
  }

  async get(tenantId: string, mailId: string): Promise<MailRecord | null> {
    const found = this.box(tenantId).get(mailId);
    return found ? this.hydrate(tenantId, found) : null;
  }

  /** Does this reader appear on the envelope in one of the given roles? */
  private matches(mail: MailRecord, filter: MailFilter, roles: string[]): boolean {
    return mail.participants.some((participant) => {
      if (!roles.includes(participant.role)) return false;
      if (filter.address && participant.address && normaliseAddress(participant.address) === normaliseAddress(filter.address)) return true;
      return Boolean(filter.userId && participant.userId === filter.userId);
    });
  }

  async list(tenantId: string, filter: MailFilter): Promise<MailRecord[]> {
    const all = [...this.box(tenantId).values()];
    const limit = Math.min(filter.limit ?? 100, 500);

    if (filter.folder === 'drafts' || filter.folder === 'scheduled') {
      const state = filter.folder === 'drafts' ? 'draft' : 'scheduled';
      return all
        .filter((mail) => mail.state === state && mail.fromUser === (filter.userId ?? null))
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
        .slice(0, limit)
        .map((mail) => this.hydrate(tenantId, mail));
    }

    const visible: MailRecord['state'][] = ['sent', 'received', 'queued', 'sending', 'failed'];
    const roles = filter.folder === 'sent' ? ['from'] : ['to', 'cc', 'bcc'];
    return all
      .filter((mail) => visible.includes(mail.state) && this.matches(mail, filter, roles))
      .sort((a, b) => (b.sentAt ?? b.createdAt).localeCompare(a.sentAt ?? a.createdAt))
      .slice(0, limit)
      .map((mail) => this.hydrate(tenantId, mail));
  }

  async thread(tenantId: string, threadId: string): Promise<MailRecord[]> {
    return [...this.box(tenantId).values()]
      .filter((mail) => mail.threadId === threadId)
      .sort((a, b) => (a.sentAt ?? a.createdAt).localeCompare(b.sentAt ?? b.createdAt))
      .map((mail) => this.hydrate(tenantId, mail));
  }

  async remove(tenantId: string, mailId: string): Promise<void> {
    this.box(tenantId).delete(mailId);
  }

  async markRead(tenantId: string, mailId: string, reader: { address?: string | null; userId?: string | null }, at: string): Promise<void> {
    const mail = this.box(tenantId).get(mailId);
    if (!mail) return;
    // Only a recipient has anything to mark — the sender's copy is read by construction.
    for (const participant of mail.participants) {
      if (participant.role === 'from') continue;
      const byUser = reader.userId && participant.userId === reader.userId;
      const byAddress = reader.address && participant.address
        && normaliseAddress(participant.address) === normaliseAddress(reader.address);
      if (!byUser && !byAddress) continue;
      const key = `${mailId}::${this.readKey(participant)}`;
      if (!this.readsFor(tenantId).has(key)) this.readsFor(tenantId).set(key, at);
    }
  }

  async findByProviderMessage(tenantId: string, accountId: string | null, providerMessageId: string): Promise<MailRecord | null> {
    const found = [...this.box(tenantId).values()].find(
      (mail) => mail.providerMessageId === providerMessageId && (mail.accountId ?? null) === (accountId ?? null),
    );
    return found ? this.hydrate(tenantId, found) : null;
  }

  async findByProviderThread(tenantId: string, accountId: string | null, providerThreadId: string): Promise<MailRecord | null> {
    const found = [...this.box(tenantId).values()].find(
      (mail) => mail.providerThreadId === providerThreadId && (mail.accountId ?? null) === (accountId ?? null),
    );
    return found ? this.hydrate(tenantId, found) : null;
  }

  async findByInternetMessageId(tenantId: string, internetMessageId: string): Promise<MailRecord | null> {
    const found = [...this.box(tenantId).values()].find((mail) => mail.internetMessageId === internetMessageId);
    return found ? this.hydrate(tenantId, found) : null;
  }

  async listAccounts(): Promise<Array<{ id: string; provider: string; label: string; status: string; capabilities: string[] }>> {
    // Without a database there are no configured accounts, and inventing one would let the UI
    // offer a sender that cannot send.
    return [];
  }

  async getSyncCursor(tenantId: string, accountId: string): Promise<string | null> {
    return this.cursors.get(`${tenantId}::${accountId}`) ?? null;
  }

  async saveSyncCursor(tenantId: string, accountId: string, cursor: string | null): Promise<void> {
    if (cursor === null) this.cursors.delete(`${tenantId}::${accountId}`);
    else this.cursors.set(`${tenantId}::${accountId}`, cursor);
  }

  async listStalledDeliveries(tenantId: string, olderThan: string, limit: number): Promise<MailRecord[]> {
    return [...this.box(tenantId).values()]
      .filter((mail) => mail.state === 'sending' && (mail.deliveryStartedAt ?? '') < olderThan)
      .slice(0, limit)
      .map((mail) => this.hydrate(tenantId, mail));
  }

  async upsertDispatch(tenantId: string, dispatch: DispatchRecord): Promise<void> {
    this.queue(tenantId).set(dispatch.subjectId, structuredClone(dispatch));
  }

  async getDispatch(tenantId: string, subjectId: string): Promise<DispatchRecord | null> {
    const found = this.queue(tenantId).get(subjectId);
    return found ? structuredClone(found) : null;
  }

  async listTenantsWithMailbox(): Promise<string[]> {
    return [...new Set([...this.mail.keys(), ...this.dispatch.keys()])];
  }

  async claimDueDispatch(tenantId: string, now: string, limit: number): Promise<DispatchRecord[]> {
    const claimed: DispatchRecord[] = [];
    for (const dispatch of this.queue(tenantId).values()) {
      if (claimed.length >= limit) break;
      // Only pending work that is actually due. Mirrors the Postgres claim exactly, including the
      // fact that a claimed row is invisible to the next caller.
      if (dispatch.state !== 'pending' || dispatch.scheduledAt > now) continue;
      const taken = { ...dispatch, state: 'processing' as const };
      this.queue(tenantId).set(dispatch.subjectId, taken);
      claimed.push(structuredClone(taken));
    }
    return claimed;
  }

  async completeDispatch(tenantId: string, dispatchId: string, _at: string): Promise<void> {
    for (const [key, dispatch] of this.queue(tenantId)) {
      if (dispatch.id === dispatchId) this.queue(tenantId).set(key, { ...dispatch, state: 'done' });
    }
  }

  async failDispatch(tenantId: string, dispatchId: string, error: string, retryAt: string | null): Promise<void> {
    for (const [key, dispatch] of this.queue(tenantId)) {
      if (dispatch.id !== dispatchId) continue;
      this.queue(tenantId).set(key, {
        ...dispatch,
        attempts: dispatch.attempts + 1,
        // Back to pending when there is another attempt to make; dead-lettered when there is not.
        state: retryAt ? 'pending' : 'failed',
        scheduledAt: retryAt ?? dispatch.scheduledAt,
        lastError: error,
      } as DispatchRecord);
    }
  }

  async cancelDispatch(tenantId: string, subjectId: string, _at: string): Promise<void> {
    const found = this.queue(tenantId).get(subjectId);
    // Mirrors the Postgres rule: a dispatch already in flight belongs to the worker.
    if (found && (found.state === 'pending' || found.state === 'claimed')) {
      this.queue(tenantId).set(subjectId, { ...found, state: 'cancelled' });
    }
  }
}
