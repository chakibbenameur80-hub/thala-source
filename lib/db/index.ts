import { isSupabaseConfigured, SupabaseStoreDriver } from "@/lib/db/supabase";
import { emptyShopData } from "@/lib/db/schema";
import type { ShopData } from "@/lib/types";

/**
 * Driver selection — the only place that decides where data lives.
 *
 * Priority:
 *   1. Supabase  — when the public env vars are present (real deployment).
 *   2. localStorage — otherwise (the default: a working prototype, zero config).
 *
 * Nothing else in the app branches on the backend.
 */

export const IS_SUPABASE = isSupabaseConfigured();

/**
 * Server-side bootstrap payload for the storefront *and* the admin panels.
 *
 * The pages are rendered on the server first (great for SEO and for a fast first
 * paint on a 3G connection), then the client takes over:
 *   - with Supabase, this is the real data;
 *   - without it, `emptyShopData()` is the seed catalogue, and the client swaps to
 *     its own `localStorage` — which is the only place that copy exists.
 */
export async function loadStorefrontData(): Promise<ShopData> {
  if (IS_SUPABASE) {
    try {
      return await new SupabaseStoreDriver().read();
    } catch (error) {
      // A misconfigured database must not take the whole shop offline: log the
      // real reason server-side and fall back to the seed catalogue.
      console.error("[thala] chargement Supabase impossible:", error);
      return emptyShopData();
    }
  }
  return emptyShopData();
}

export { LocalStoreDriver } from "@/lib/db/local";
export { SupabaseStoreDriver } from "@/lib/db/supabase";
export { emptyShopData, normalizeShopData } from "@/lib/db/schema";
export type { StoreDriver } from "@/lib/db/schema";
