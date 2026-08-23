import { useCallback, useEffect, useState } from 'react';
import { useLocalStorage } from './useLocalStorage';
import {
  getNotificationPermission,
  getNotificationSupport,
  registerPeriodicUpdateCheck,
  requestNotificationPermission,
  requestUpdateCheck,
  type NotificationPermissionState,
} from '../lib/notifications';

const FOREGROUND_CHECK_INTERVAL_MS = 30 * 60 * 1000;

export interface ArticleNotificationsState {
  supported: boolean;
  permission: NotificationPermissionState;
  enabled: boolean;
  enable: () => Promise<void>;
  disable: () => void;
}

/**
 * Drives the "notify me on article updates" feature for a static, backend-less site:
 * the service worker compares the published data manifest's `generatedAt` on open,
 * on tab foreground, and (where supported) via Periodic Background Sync, then raises
 * an OS notification when it changed.
 */
export function useArticleNotifications(): ArticleNotificationsState {
  const supported = getNotificationSupport();
  const [enabled, setEnabled] = useLocalStorage<boolean>('notifications-enabled', false);
  const [permission, setPermission] = useState<NotificationPermissionState>(() =>
    getNotificationPermission(),
  );

  const runChecks = useCallback(() => {
    void requestUpdateCheck();
    void registerPeriodicUpdateCheck();
  }, []);

  const enable = useCallback(async () => {
    const result = await requestNotificationPermission();
    setPermission(result);
    if (result === 'granted') {
      setEnabled(true);
      runChecks();
    }
  }, [runChecks, setEnabled]);

  const disable = useCallback(() => {
    setEnabled(false);
  }, [setEnabled]);

  useEffect(() => {
    if (!supported || !enabled || permission !== 'granted') return;

    runChecks();

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') runChecks();
    };
    document.addEventListener('visibilitychange', handleVisibility);

    const interval = window.setInterval(() => {
      if (document.visibilityState === 'visible') runChecks();
    }, FOREGROUND_CHECK_INTERVAL_MS);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
      window.clearInterval(interval);
    };
  }, [supported, enabled, permission, runChecks]);

  return { supported, permission, enabled: enabled && permission === 'granted', enable, disable };
}
