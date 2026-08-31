import { createContext, useContext } from 'react';
import type { AppState, ModuleId } from '../lib/schema';

export interface Toast {
  id: string;
  text: string;
  xp?: number;
}

export interface AppContextValue {
  state: AppState;
  ready: boolean;
  storageName: string;
  /** Structural update. Every write funnels through here so persistence and
   *  the "active today" streak marker stay in one place. */
  update: (fn: (s: AppState) => AppState) => void;
  /** Update plus an XP award and a toast. */
  reward: (module: ModuleId | 'general', amount: number, reason: string, fn: (s: AppState) => AppState) => void;
  replaceAll: (next: AppState) => void;
  toasts: Toast[];
  toast: (text: string, xp?: number) => void;
  dismissToast: (id: string) => void;
}

export const AppCtx = createContext<AppContextValue | null>(null);

export function useApp(): AppContextValue {
  const ctx = useContext(AppCtx);
  if (!ctx) throw new Error('useApp must be used inside <AppProvider>');
  return ctx;
}
