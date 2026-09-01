import { createContext, useContext } from 'react';
import type { AppState, ModuleId } from '../lib/schema';

export interface Toast {
  id: string;
  text: string;
  xp?: number;
  /** An optional way back. A swipe that deletes something needs one. */
  action?: { label: string; run: () => void };
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
  /**
   * Set when a write to storage failed — in practice, when the browser's
   * storage is full. While this is set, what is on screen is ahead of what is
   * stored, which is the one situation the user has to be told about rather
   * than left to discover after a reload.
   */
  saveError: 'full' | 'failed' | null;
  toasts: Toast[];
  toast: (text: string, xp?: number, action?: { label: string; run: () => void }) => void;
  dismissToast: (id: string) => void;
}

export const AppCtx = createContext<AppContextValue | null>(null);

export function useApp(): AppContextValue {
  const ctx = useContext(AppCtx);
  if (!ctx) throw new Error('useApp must be used inside <AppProvider>');
  return ctx;
}
