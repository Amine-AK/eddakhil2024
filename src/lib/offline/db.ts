// Minimal raw IndexedDB wrapper — no external dependency. One object store
// holding mutations the teacher app queued while offline (or mid-request).

const DB_NAME = "school-attendance-offline";
const DB_VERSION = 1;
const STORE = "pendingMutations";

export type PendingMutation = {
  id: string; // the mutation's own idempotency key — also the primary key here
  url: string;
  method: "POST";
  body: unknown;
  createdAt: number;
  status: "pending" | "failed";
  lastError?: string;
};

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function withStore<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const request = fn(tx.objectStore(STORE));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function putMutation(mutation: PendingMutation): Promise<void> {
  await withStore("readwrite", (store) => store.put(mutation));
}

export async function deleteMutation(id: string): Promise<void> {
  await withStore("readwrite", (store) => store.delete(id));
}

export async function getAllMutations(): Promise<PendingMutation[]> {
  return withStore("readonly", (store) => store.getAll());
}
