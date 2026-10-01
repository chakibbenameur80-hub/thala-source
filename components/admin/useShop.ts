"use client";

import { useCallback, useMemo, useState, useSyncExternalStore } from "react";
import { parseStoredShop, readRawShop, STORAGE_EVENT } from "@/lib/db/local";
import { getShop, isLocalMode } from "@/lib/services/shop";
import type { ShopData } from "@/lib/types";

/**
 * The shop state, as a real external store.
 *
 * `localStorage` genuinely *is* an external store — a mutable box that lives
 * outside React and can change without React knowing — so `useSyncExternalStore`
 * is the correct primitive for it, rather than an effect plus `setState`. That
 * buys three things:
 *
 *   - no "loading" flash on the storefront or in the admin, because there is no
 *     post-mount render pass;
 *   - no cascading renders from setting state in an effect;
 *   - multiple tabs and multiple panels stay in sync for free, because React
 *     re-reads the snapshot when the store changes.
 *
 * The snapshot is the **raw JSON string**, not the parsed object: `useSyncExternalStore`
 * compares snapshots with `Object.is`, and a freshly parsed object would never be
 * equal to the previous one, so every render would look like a change.
 *
 * In Supabase mode `localStorage` is not used, so this returns `initial`; the
 * panels then fall back to their own `useState` copy, refreshed from the API after
 * each mutation (see {@link useShop}).
 */

/** Active subscribers; the DOM listeners are attached only while one exists. */
const listeners = new Set<() => void>();

function notify() {
  for (const listener of listeners) listener();
}

function subscribe(onStoreChange: () => void) {
  listeners.add(onStoreChange);
  if (listeners.size === 1) {
    // `storage` fires in *other* tabs; the custom event fires in this one.
    window.addEventListener("storage", notify);
    window.addEventListener(STORAGE_EVENT, notify);
  }
  return () => {
    listeners.delete(onStoreChange);
    if (listeners.size === 0) {
      window.removeEventListener("storage", notify);
      window.removeEventListener(STORAGE_EVENT, notify);
    }
  };
}

/** `initial` is the server-rendered value, used until (and unless) the store has data. */
export function useLocalShop(initial: ShopData): ShopData {
  const raw = useSyncExternalStore(subscribe, readRawShop, () => "");

  return useMemo(() => parseStoredShop(raw) ?? initial, [raw, initial]);
}

/**
 * The shop state plus the operations the admin needs.
 *
 * Works unchanged in both backends:
 *   - local: `useLocalShop` is reactive, so mutations appear instantly and
 *     `refresh` is a no-op that simply returns the newest snapshot;
 *   - Supabase: `initial` is read on the server, and `refresh` re-reads the API
 *     after each mutation.
 */
export function useShop(initial: ShopData) {
  const local = useLocalShop(initial);
  const [remote, setRemote] = useState<ShopData>(initial);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const localMode = isLocalMode();

  const refresh = useCallback(async () => {
    if (localMode) return;
    setBusy(true);
    try {
      setRemote(await getShop());
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Chargement impossible.");
    } finally {
      setBusy(false);
    }
  }, [localMode]);

  return {
    data: localMode ? local : remote,
    loading: false,
    busy,
    error,
    refresh,
  };
}