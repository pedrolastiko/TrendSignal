export type NotificationPermissionState = 'unsupported' | 'default' | 'granted' | 'denied';

export function getNotificationSupport(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window && 'serviceWorker' in navigator;
}

export function getNotificationPermission(): NotificationPermissionState {
  if (!getNotificationSupport()) return 'unsupported';
  return Notification.permission;
}

export async function requestNotificationPermission(): Promise<NotificationPermissionState> {
  if (!getNotificationSupport()) return 'unsupported';
  const result = await Notification.requestPermission();
  return result;
}

/** Asks the active service worker to compare the published data manifest against the
 * last one it saw, and to raise an OS notification if new articles were published. */
export async function requestUpdateCheck(): Promise<void> {
  if (!('serviceWorker' in navigator)) return;
  const registration = await navigator.serviceWorker.ready.catch(() => undefined);
  registration?.active?.postMessage({ type: 'TRENDSIGNAL_CHECK_FOR_UPDATES' });
}

const PERIODIC_SYNC_TAG = 'trendsignal-check-updates';
const PERIODIC_SYNC_MIN_INTERVAL_MS = 12 * 60 * 60 * 1000;

interface PeriodicSyncManager {
  register: (tag: string, options: { minInterval: number }) => Promise<void>;
}

/** Progressive enhancement for Chromium-based browsers (installed PWA + site engagement
 * heuristics). Safari/iOS has no periodic background sync, so it silently does nothing
 * there — the foreground/visibility checks are what cover those browsers. */
export async function registerPeriodicUpdateCheck(): Promise<void> {
  if (!('serviceWorker' in navigator)) return;
  const registration = await navigator.serviceWorker.ready.catch(() => undefined);
  const periodicSync = (registration as unknown as { periodicSync?: PeriodicSyncManager })
    ?.periodicSync;
  if (!periodicSync) return;

  try {
    await periodicSync.register(PERIODIC_SYNC_TAG, {
      minInterval: PERIODIC_SYNC_MIN_INTERVAL_MS,
    });
  } catch {
    // Permission not granted (e.g. site engagement too low) — ignore.
  }
}
