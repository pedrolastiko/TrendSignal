// Periodic Background Sync is a Chromium-only, still-non-standard API — it isn't
// declared in TypeScript's built-in webworker lib. Minimal ambient typing so
// src/sw.ts can register a handler without `any`.

interface PeriodicSyncEvent extends ExtendableEvent {
  readonly tag: string;
}

interface ServiceWorkerGlobalScopeEventMap {
  periodicsync: PeriodicSyncEvent;
}
