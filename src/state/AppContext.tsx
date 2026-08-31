import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { emptyState, type AppState, type ModuleId } from '../lib/schema';
import { createAdapter } from '../lib/storage';
import { reconcileAwards } from '../lib/awards';
import { mergeNotifications, raiseDeviceAlerts } from '../lib/notifications';
import { todayKey } from '../lib/date';
import { uid } from '../lib/id';
import { AppCtx, type AppContextValue, type Toast } from './context';

export function AppProvider({ children }: { children: ReactNode }) {
  // Lazy initialiser: the adapter probes localStorage once, on mount.
  const [adapter] = useState(createAdapter);

  const [state, setState] = useState<AppState>(emptyState);
  const [ready, setReady] = useState(false);
  const [saveError, setSaveError] = useState<'full' | 'failed' | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);

  useEffect(() => {
    let cancelled = false;
    adapter.load().then((loaded) => {
      if (cancelled) return;
      if (loaded) {
        // Conditions are evaluated once per load: opening the app three times
        // in a day must not raise the same thing three times.
        const withAwards = reconcileAwards(loaded);
        const withNotifications = mergeNotifications(withAwards);
        const fresh = withNotifications.notifications.items.filter(
          (n) => !withAwards.notifications.items.some((old) => old.key === n.key),
        );
        setState(withNotifications);
        if (withNotifications.notifications.deviceAlerts) raiseDeviceAlerts(fresh);
      }
      setReady(true);
    });
    return () => { cancelled = true; };
  }, [adapter]);

  // Debounced write — typing in a notes field should not hit storage per keystroke.
  //
  // The rejection is caught rather than left to float. A failed write means the
  // screen is showing something that is not stored, and the previous version of
  // this dropped that on the floor: the change looked saved, and was gone on the
  // next reload.
  useEffect(() => {
    if (!ready) return;
    const t = setTimeout(() => {
      adapter.save(state).then(
        () => setSaveError(null),
        (err: unknown) => {
          const full =
            err instanceof DOMException &&
            (err.name === 'QuotaExceededError' || err.name === 'NS_ERROR_DOM_QUOTA_REACHED');
          console.error('[storage] save failed', err);
          setSaveError(full ? 'full' : 'failed');
        },
      );
    }, 250);
    return () => clearTimeout(t);
  }, [state, ready, adapter]);

  const dismissToast = useCallback((id: string) => {
    setToasts((list) => list.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback((text: string, xp?: number) => {
    const id = uid('toast');
    setToasts((list) => [...list, { id, text, xp }]);
    setTimeout(() => setToasts((list) => list.filter((t) => t.id !== id)), 3200);
  }, []);

  const update = useCallback((fn: (s: AppState) => AppState) => {
    setState((prev) => markActive(fn(prev)));
  }, []);

  const reward = useCallback(
    (module: ModuleId | 'general', amount: number, reason: string, fn: (s: AppState) => AppState) => {
      setState((prev) => {
        const next = fn(prev);
        return markActive({
          ...next,
          xp: [...next.xp, { id: uid('xp'), date: todayKey(), amount, reason, module }],
        });
      });
      toast(reason, amount);
    },
    [toast],
  );

  const replaceAll = useCallback((next: AppState) => setState(next), []);

  const value = useMemo<AppContextValue>(
    () => ({ state, ready, storageName: adapter.name, saveError, update, reward, replaceAll, toasts, toast, dismissToast }),
    [state, ready, adapter.name, saveError, update, reward, replaceAll, toasts, toast, dismissToast],
  );

  return <AppCtx.Provider value={value}>{children}</AppCtx.Provider>;
}

/** Records today in the streak ledger. Idempotent. */
function markActive(s: AppState): AppState {
  const today = todayKey();
  if (s.activeDays.includes(today)) return s;
  return { ...s, activeDays: [...s.activeDays, today] };
}
