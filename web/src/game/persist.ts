/**
 * Remembering preferences between visits.
 *
 * Settings and the last match setup only -- never an in-progress match. A
 * half-saved game that restores into an inconsistent state is far worse than
 * no save at all, and the engine has no serialisation contract that would
 * make it safe.
 *
 * Every access is wrapped: storage throws in private windows, is absent in
 * the Node test run, and can be disabled entirely. A failure here must never
 * stop the game loading.
 */

import type { AiLevel, PlayerColor } from './types';
import type { EnvironmentMode } from './environment';

const KEY = 'drosophila-neural-ludo:v1';

export interface StoredPreferences {
  /** Last match setup, so the screen opens where it was left. */
  setup?: {
    opponents: number;
    difficulty: AiLevel;
    colour: PlayerColor;
    name: string;
    environment: EnvironmentMode;
  };
  /** Comfort settings. */
  settings?: Record<string, unknown>;
}

function storage(): Storage | null {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return null;
    // Touch it: Safari in private mode has the object but throws on write.
    const probe = '__probe__';
    window.localStorage.setItem(probe, '1');
    window.localStorage.removeItem(probe);
    return window.localStorage;
  } catch {
    return null;
  }
}

export function loadPreferences(): StoredPreferences {
  const store = storage();
  if (!store) return {};
  try {
    const raw = store.getItem(KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return {};
    return parsed as StoredPreferences;
  } catch {
    // corrupt or from an older shape; start clean rather than crash
    return {};
  }
}

/** Merge a patch into what is already stored. */
export function savePreferences(patch: StoredPreferences): void {
  const store = storage();
  if (!store) return;
  try {
    const merged = { ...loadPreferences(), ...patch };
    store.setItem(KEY, JSON.stringify(merged));
  } catch {
    // out of quota, or blocked; preferences are not worth failing over
  }
}

export function clearPreferences(): void {
  try {
    storage()?.removeItem(KEY);
  } catch {
    /* nothing to do */
  }
}
