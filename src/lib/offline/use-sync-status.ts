"use client";

import { useEffect, useState } from "react";
import { subscribeSyncStatus, flushQueue, type SyncStatus } from "@/lib/offline/sync";

/** Tracks the shared offline-sync status and re-attempts any leftover queued mutations on mount (e.g. after a reload while offline). */
export function useSyncStatus(): SyncStatus {
  const [status, setStatus] = useState<SyncStatus>("idle");
  useEffect(() => {
    const unsubscribe = subscribeSyncStatus(setStatus);
    void flushQueue();
    return unsubscribe;
  }, []);
  return status;
}
