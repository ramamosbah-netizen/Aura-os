export interface OfflineQueueItem {
  id: string;
  tenantId: string;
  userId: string;
  operationId: string;
  clientEntityId: string;
  entityType: 'daily_report' | 'labour_return' | 'snag' | 'inspection' | 'ncr' | 'hse';
  entityId: string | null;
  method: 'POST' | 'PUT' | 'PATCH';
  endpoint: string;
  payload: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  retryCount: number;
  lastAttemptAt: string | null;
  lastError: string | null;
  status: 'pending' | 'syncing' | 'completed' | 'failed';
  priority: 'high' | 'normal' | 'low';
  schemaVersion: number;
  clientVersion: string;
}

const DB_NAME = 'aura_offline_db';
const DB_VERSION = 1;
const STORE_NAME = 'offline_queue';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !('indexedDB' in window)) {
      return reject(new Error('IndexedDB not supported in current environment'));
    }
    const req = window.indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex('tenantId', 'tenantId', { unique: false });
        store.createIndex('operationId', 'operationId', { unique: true });
        store.createIndex('status', 'status', { unique: false });
        store.createIndex('createdAt', 'createdAt', { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function enqueueOfflineItem(
  item: Omit<OfflineQueueItem, 'id' | 'createdAt' | 'updatedAt' | 'retryCount' | 'status' | 'lastAttemptAt' | 'lastError'>
): Promise<OfflineQueueItem> {
  const fullItem: OfflineQueueItem = {
    ...item,
    id: `item-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    retryCount: 0,
    lastAttemptAt: null,
    lastError: null,
    status: 'pending',
  };

  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).put(fullItem);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (e) {
    // Fallback to localStorage if IndexedDB is unavailable
    if (typeof window !== 'undefined' && window.localStorage) {
      const existing = JSON.parse(window.localStorage.getItem('aura_offline_fallback_queue') || '[]');
      window.localStorage.setItem('aura_offline_fallback_queue', JSON.stringify([fullItem, ...existing]));
    }
  }

  return fullItem;
}

export async function getOfflineQueue(): Promise<OfflineQueueItem[]> {
  try {
    const db = await openDb();
    return new Promise<OfflineQueueItem[]>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const req = tx.objectStore(STORE_NAME).getAll();
      req.onsuccess = () => {
        const res = req.result as OfflineQueueItem[];
        // Priority sort: high priority first, then oldest createdAt first
        const priorityScore: Record<string, number> = { high: 3, normal: 2, low: 1 };
        res.sort((a, b) => {
          const pDiff = (priorityScore[b.priority] || 2) - (priorityScore[a.priority] || 2);
          if (pDiff !== 0) return pDiff;
          return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
        });
        resolve(res);
      };
      req.onerror = () => reject(req.error);
    });
  } catch (e) {
    if (typeof window !== 'undefined' && window.localStorage) {
      return JSON.parse(window.localStorage.getItem('aura_offline_fallback_queue') || '[]');
    }
    return [];
  }
}

export async function updateOfflineItemStatus(
  id: string,
  status: OfflineQueueItem['status'],
  lastError?: string
): Promise<void> {
  try {
    const db = await openDb();
    const item = await new Promise<OfflineQueueItem | null>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const req = tx.objectStore(STORE_NAME).get(id);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });

    if (item) {
      item.status = status;
      item.updatedAt = new Date().toISOString();
      item.lastAttemptAt = new Date().toISOString();
      if (status === 'syncing') item.retryCount += 1;
      if (lastError) item.lastError = lastError;

      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        tx.objectStore(STORE_NAME).put(item);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    }
  } catch (e) {
    // localStorage fallback update
    if (typeof window !== 'undefined' && window.localStorage) {
      const items: OfflineQueueItem[] = JSON.parse(window.localStorage.getItem('aura_offline_fallback_queue') || '[]');
      const target = items.find((i) => i.id === id);
      if (target) {
        target.status = status;
        if (lastError) target.lastError = lastError;
        window.localStorage.setItem('aura_offline_fallback_queue', JSON.stringify(items));
      }
    }
  }
}

export async function removeOfflineItem(id: string): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (e) {
    if (typeof window !== 'undefined' && window.localStorage) {
      const items: OfflineQueueItem[] = JSON.parse(window.localStorage.getItem('aura_offline_fallback_queue') || '[]');
      window.localStorage.setItem('aura_offline_fallback_queue', JSON.stringify(items.filter((i) => i.id !== id)));
    }
  }
}

export async function clearFailedItems(): Promise<void> {
  const all = await getOfflineQueue();
  const failed = all.filter((i) => i.status === 'failed');
  for (const item of failed) {
    await removeOfflineItem(item.id);
  }
}
