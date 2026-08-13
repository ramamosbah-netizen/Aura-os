import {
  type OfflineQueueItem,
  enqueueOfflineItem,
  getOfflineQueue,
  reclaimStrandedItem,
  removeOfflineItem,
  updateOfflineItemStatus,
} from './offline-store';

export interface OfflineSyncStatus {
  isOnline: boolean;
  pendingCount: number;
  syncingCount: number;
  failedCount: number;
  conflictCount: number;
}

type SyncListener = (status: OfflineSyncStatus) => void;
const listeners = new Set<SyncListener>();

function computeBackoffDelay(retryCount: number): number {
  const base = 2000;
  const jitter = Math.floor(Math.random() * 500);
  return Math.min(base * Math.pow(2, retryCount) + jitter, 60000);
}

export function generateUUID(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `id-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export async function getSyncStatus(): Promise<OfflineSyncStatus> {
  const isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;
  const queue = await getOfflineQueue();
  return {
    isOnline,
    pendingCount: queue.filter((i) => i.status === 'pending').length,
    syncingCount: queue.filter((i) => i.status === 'syncing').length,
    failedCount: queue.filter((i) => i.status === 'failed').length,
    conflictCount: queue.filter((i) => i.lastError?.includes('409') || i.lastError?.includes('CONFLICT')).length,
  };
}

export function subscribeSyncStatus(fn: SyncListener): () => void {
  listeners.add(fn);
  getSyncStatus().then(fn);
  return () => {
    listeners.delete(fn);
  };
}

function notifyListeners(): void {
  getSyncStatus().then((status) => {
    listeners.forEach((fn) => fn(status));
  });
}

/**
 * Fetch wrapper that handles offline network failures by enqueuing payloads to IndexedDB.
 * Permanent client errors (400, 401, 403, 404, 422) reject immediately without queuing.
 */
export async function fetchWithOfflineFallback<T = Record<string, unknown>>(
  endpoint: string,
  options: RequestInit = {},
  metadata: {
    entityType: OfflineQueueItem['entityType'];
    priority?: OfflineQueueItem['priority'];
    tenantId?: string;
    userId?: string;
  }
): Promise<{ ok: boolean; data?: T; offline?: boolean; pendingSync?: boolean; error?: string; status?: number }> {
  const method = (options.method || 'POST').toUpperCase() as 'POST' | 'PUT' | 'PATCH';
  const payload = options.body ? (typeof options.body === 'string' ? JSON.parse(options.body) : options.body) : {};
  const operationId = generateUUID();
  const clientEntityId = `client-${metadata.entityType}-${generateUUID()}`;

  // If navigator is strictly offline, skip fetch and enqueue directly
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    await enqueueOfflineItem({
      tenantId: metadata.tenantId || 'default-tenant',
      userId: metadata.userId || 'current-user',
      operationId,
      clientEntityId,
      entityType: metadata.entityType,
      entityId: null,
      method,
      endpoint,
      payload,
      priority: metadata.priority || 'normal',
      schemaVersion: 1,
      clientVersion: '6.0.0',
    });
    notifyListeners();
    return { ok: true, offline: true, pendingSync: true, data: { id: clientEntityId, _offline: true } as unknown as T };
  }

  try {
    const res = await fetch(endpoint, {
      ...options,
      headers: {
        ...options.headers,
        'content-type': 'application/json',
        'Idempotency-Key': operationId,
        'X-Operation-Id': operationId,
        'X-Client-Entity-Id': clientEntityId,
      },
    });

    const data = await res.json().catch(() => ({}));

    // Permanent Client Errors (400, 401, 403, 404, 422) -> Do NOT Queue!
    if (res.status === 400 || res.status === 401 || res.status === 403 || res.status === 404 || res.status === 422) {
      return { ok: false, status: res.status, error: data.message || data.error || `HTTP ${res.status} Error` };
    }

    // 409 Conflict Matrix
    if (res.status === 409) {
      const isPayloadMismatch = data.message?.includes('IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_PAYLOAD') || data.code === 'IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_PAYLOAD';
      if (isPayloadMismatch) {
        return { ok: false, status: 409, error: 'Idempotency payload mismatch — request rejected' };
      }
      return { ok: false, status: 409, error: data.message || 'Resource conflict — server version modified' };
    }

    if (res.ok) {
      return { ok: true, data };
    }

    // Retryable HTTP Errors (408, 429, 500, 502, 503, 504) -> Enqueue
    await enqueueOfflineItem({
      tenantId: metadata.tenantId || 'default-tenant',
      userId: metadata.userId || 'current-user',
      operationId,
      clientEntityId,
      entityType: metadata.entityType,
      entityId: null,
      method,
      endpoint,
      payload,
      priority: metadata.priority || 'normal',
      schemaVersion: 1,
      clientVersion: '6.0.0',
    });
    notifyListeners();
    return { ok: true, offline: true, pendingSync: true, data: { id: clientEntityId, _offline: true } as unknown as T };
  } catch (err) {
    // Network Fetch Exception (Offline / Timeout / DNS Failure) -> Enqueue
    await enqueueOfflineItem({
      tenantId: metadata.tenantId || 'default-tenant',
      userId: metadata.userId || 'current-user',
      operationId,
      clientEntityId,
      entityType: metadata.entityType,
      entityId: null,
      method,
      endpoint,
      payload,
      priority: metadata.priority || 'normal',
      schemaVersion: 1,
      clientVersion: '6.0.0',
    });
    notifyListeners();
    return { ok: true, offline: true, pendingSync: true, data: { id: clientEntityId, _offline: true } as unknown as T };
  }
}

let isSyncing = false;

/** Reset per page load: a new session cannot own a sync that was in flight before it existed. */
let hasFlushedThisSession = false;

/** Pending wake-up for items the last pass skipped on backoff. At most one is ever outstanding. */
let backoffWake: ReturnType<typeof setTimeout> | null = null;

/**
 * Wake the queue when the soonest backoff expires.
 *
 * `computeBackoffDelay` decides when an item may be retried, but nothing used to act on that
 * decision: a pass that skipped an item simply returned, leaving the next attempt to the 60s
 * periodic sweep. So every deferred retry actually waited up to a minute regardless of the delay
 * that was computed — a 4s backoff and a 32s one behaved identically. This closes the gap between
 * the two.
 */
function scheduleBackoffWake(delayMs: number): void {
  if (typeof window === 'undefined') return;
  if (backoffWake) clearTimeout(backoffWake);
  backoffWake = setTimeout(() => {
    backoffWake = null;
    if (typeof navigator === 'undefined' || navigator.onLine) void flushOfflineQueue();
  }, Math.max(250, delayMs));
}

export async function flushOfflineQueue(): Promise<{ synced: number; failed: number }> {
  if (isSyncing) return { synced: 0, failed: 0 };
  if (typeof navigator !== 'undefined' && !navigator.onLine) return { synced: 0, failed: 0 };

  isSyncing = true;
  let synced = 0;
  let failed = 0;

  try {
    let queue = await getOfflineQueue();

    // Crash recovery. An item is marked `syncing` immediately before its request goes out; if the
    // browser dies in that window nothing ever moves it back, and it is stranded forever — the
    // report is on the device, visibly queued, and will never be sent again.
    //
    // `isSyncing` is module state, so a freshly loaded page has no sync of its own in flight.
    // Any `syncing` item seen on this session's FIRST flush therefore belongs to a session that
    // is gone, and is safe to reclaim. Replaying it cannot double-commit: the request carries the
    // same Idempotency-Key, and the server's lease returns the original response instead of
    // executing again.
    if (!hasFlushedThisSession) {
      hasFlushedThisSession = true;
      const stranded = queue.filter((i) => i.status === 'syncing');
      for (const item of stranded) {
        await reclaimStrandedItem(item.id);
      }
      if (stranded.length > 0) queue = await getOfflineQueue();
    }

    const pendingItems = queue.filter((i) => i.status === 'pending' && i.retryCount < 5);

    /** Shortest wait among the items this pass declines to send, so we can come back for them. */
    let soonestRetryIn = Number.POSITIVE_INFINITY;

    for (const item of pendingItems) {
      // Exponential backoff check
      if (item.lastAttemptAt) {
        const elapsed = Date.now() - new Date(item.lastAttemptAt).getTime();
        const requiredDelay = computeBackoffDelay(item.retryCount);
        if (elapsed < requiredDelay) {
          soonestRetryIn = Math.min(soonestRetryIn, requiredDelay - elapsed);
          continue;
        }
      }

      await updateOfflineItemStatus(item.id, 'syncing');
      notifyListeners();

      try {
        const res = await fetch(item.endpoint, {
          method: item.method,
          headers: {
            'content-type': 'application/json',
            'Idempotency-Key': item.operationId,
            'X-Operation-Id': item.operationId,
            'X-Client-Entity-Id': item.clientEntityId,
          },
          body: JSON.stringify(item.payload),
        });

        const data = await res.json().catch(() => ({}));

        if (res.ok) {
          await removeOfflineItem(item.id);
          synced += 1;
        } else if (res.status === 400 || res.status === 401 || res.status === 403 || res.status === 404 || res.status === 422) {
          // Permanent Client Error -> Mark Failed
          await updateOfflineItemStatus(item.id, 'failed', data.message || `HTTP ${res.status}`);
          failed += 1;
        } else {
          // Retryable Error
          if (item.retryCount >= 4) {
            await updateOfflineItemStatus(item.id, 'failed', data.message || `Max retries exceeded (${res.status})`);
            failed += 1;
          } else {
            await updateOfflineItemStatus(item.id, 'pending', data.message || `HTTP ${res.status}`);
          }
        }
      } catch (err) {
        if (item.retryCount >= 4) {
          await updateOfflineItemStatus(item.id, 'failed', (err as Error).message);
          failed += 1;
        } else {
          await updateOfflineItemStatus(item.id, 'pending', (err as Error).message);
        }
      }

      notifyListeners();
    }

    if (Number.isFinite(soonestRetryIn)) scheduleBackoffWake(soonestRetryIn);
  } finally {
    isSyncing = false;
    notifyListeners();
  }

  return { synced, failed };
}

// Multi-Trigger Auto Sync Listeners (Window Online + Periodic Timer)
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    notifyListeners();
    flushOfflineQueue();
  });
  window.addEventListener('offline', () => {
    notifyListeners();
  });
  // Periodic background check every 60 seconds
  setInterval(() => {
    if (navigator.onLine) flushOfflineQueue();
  }, 60000);
}
