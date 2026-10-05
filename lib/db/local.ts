import { normalizeShopData, emptyShopData, type StoreDriver } from "@/lib/db/schema";
import type { ShopData } from "@/lib/types";

/** Versioned key so a future schema change can migrate instead of corrupt. */
export const STORAGE_KEY = "thala-source:shop:v1";

/**
 * Zero-config driver: keeps the whole shop in `localStorage`.
 *
 * This is what makes the project a *fully working prototype* out of the box —
 * no account, no server, no env vars. Everything runs in the visitor's browser,
 * which is why:
 *
 *   - the storefront is seeded server-side for SEO/first paint, then hydrated
 *     from this store on the client (see `components/storefront/StoreApp.tsx`);
 *   - admin edits affect the same browser profile.
 *
 * Limitation to be aware of: `localStorage` is per-browser and per-device, so
 * orders placed by a customer's phone are **not** visible in the admin. Move to
 * the Supabase driver (set `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_ANON_KEY`
 * and run `supabase/schema.sql`) as soon as you take real orders.
 */
export class LocalStoreDriver implements StoreDriver {
  readonly mode = "local" as const;

  async read(): Promise<ShopData> {
    return this.readSync();
  }

  /** Synchronous variant so the client store can hydrate without a flash. */
  readSync(): ShopData {
    if (typeof window === "undefined") return emptyShopData();
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return emptyShopData();
      return normalizeShopData(JSON.parse(raw));
    } catch {
      // Corrupted or unreadable payload: fall back to a clean shop rather than
      // crashing the whole storefront.
      return emptyShopData();
    }
  }

  async write(next: ShopData): Promise<void> {
    this.writeSync(next);
  }

  writeSync(next: ShopData): void {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      // Let any other tab / open component react to the change.
      window.dispatchEvent(new CustomEvent(STORAGE_KEY, { detail: next }));
    } catch (error) {
      // QuotaExceededError is the realistic failure here (5 MB limit). Surface
      // it instead of silently losing the order.
      //
      // Note this only affects local mode. In local mode images are never
      // uploaded — `/api/upload` requires Supabase — so a full quota means the
      // catalogue itself has grown, not that a photo was added.
      throw new Error(
        error instanceof Error && error.name === "QuotaExceededError"
          ? "Stockage local plein : configurez Supabase pour passer à une base de données partagée."
          : "Impossible d'enregistrer les données.",
      );
    }
  }

  /** Wipes the store and re-seeds it. Exposed in the admin as a reset button. */
  reset(): ShopData {
    if (typeof window !== "undefined") window.localStorage.removeItem(STORAGE_KEY);
    return emptyShopData();
  }
}

export const STORAGE_EVENT = STORAGE_KEY;

/** Parses the raw `localStorage` payload, or `null` when absent/corrupted. */
export function parseStoredShop(raw: string | null): ShopData | null {
  if (!raw) return null;
  try {
    return normalizeShopData(JSON.parse(raw));
  } catch {
    return null;
  }
}

/** The raw payload, as stored. Used as a cheap, comparable React snapshot. */
export function readRawShop(): string {
  if (typeof window === "undefined") return "";
  try {
    return window.localStorage.getItem(STORAGE_KEY) ?? "";
  } catch {
    return "";
  }
}
