import { putMutation, deleteMutation, getAllMutations, type PendingMutation } from "@/lib/offline/db";

export type SyncStatus = "idle" | "pending" | "syncing" | "synced" | "failed";

type Listener = (status: SyncStatus) => void;
const listeners = new Set<Listener>();
let currentStatus: SyncStatus = "idle";
let flushing = false;

function setStatus(status: SyncStatus) {
  currentStatus = status;
  listeners.forEach((l) => l(status));
}

export function subscribeSyncStatus(listener: Listener): () => void {
  listeners.add(listener);
  listener(currentStatus);
  return () => listeners.delete(listener);
}

/**
 * Queues one mutation for a POST endpoint and immediately attempts to send
 * it. The UI never waits on the network: the mutation is durable in
 * IndexedDB the moment this resolves, so a page reload or a dropped
 * connection can never lose it or double-submit it (the caller supplies
 * the same idempotency key the server also de-duplicates on).
 */
export async function enqueueMutation(url: string, body: unknown, idempotencyKey: string): Promise<void> {
  const mutation: PendingMutation = {
    id: idempotencyKey,
    url,
    method: "POST",
    body,
    createdAt: Date.now(),
    status: "pending",
  };
  await putMutation(mutation);
  setStatus("pending");
  void flushQueue();
}

/** Sends every queued mutation. Safe to call repeatedly/concurrently — only one flush runs at a time. */
export async function flushQueue(): Promise<void> {
  if (flushing) return;
  flushing = true;
  try {
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      const pending = await getAllMutations();
      setStatus(pending.length > 0 ? "pending" : "synced");
      return;
    }

    const mutations = await getAllMutations();
    if (mutations.length === 0) {
      setStatus("synced");
      return;
    }
    setStatus("syncing");

    for (const mutation of mutations) {
      try {
        const res = await fetch(mutation.url, {
          method: mutation.method,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(mutation.body),
        });
        if (res.ok) {
          await deleteMutation(mutation.id);
        } else {
          await putMutation({ ...mutation, status: "failed", lastError: `HTTP ${res.status}` });
        }
      } catch {
        // Network error: leave it queued as "pending" for the next flush (online event or manual retry).
      }
    }

    const remaining = await getAllMutations();
    if (remaining.length === 0) setStatus("synced");
    else setStatus(remaining.some((m) => m.status === "failed") ? "failed" : "pending");
  } finally {
    flushing = false;
  }
}

if (typeof window !== "undefined") {
  window.addEventListener("online", () => void flushQueue());
  // Belt-and-suspenders: some environments don't reliably fire `online` the
  // instant connectivity returns, so also retry periodically whenever there
  // is anything left to send.
  setInterval(() => {
    if (currentStatus === "pending" || currentStatus === "failed") void flushQueue();
  }, 5000);
}
