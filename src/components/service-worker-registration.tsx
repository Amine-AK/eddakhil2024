"use client";

import { useEffect } from "react";

export function ServiceWorkerRegistration() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // PWA installability is a nice-to-have; a failed registration must never break the app.
      });
    }
  }, []);
  return null;
}
