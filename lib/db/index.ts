import "server-only";

import { SupabaseStoreDriver } from "@/lib/db/supabase";
import { IS_SUPABASE } from "@/lib/db/config";
import { emptyShopData } from "@/lib/db/schema";
import type { ShopData } from "@/lib/types";

/**
 * Backend selection — server side only.
 *
 * The rule is unchanged from before this module was split: the public Supabase
 * pair decides where data lives, `localStorage` is the zero-config fallback. What
 * changed is *who* can ask. This file is `server-only`, so a client component that
 * imports it fails the build instead of silently pulling the service-role driver
 * into the browser. Client code imports `IS_SUPABASE` from `@/lib/db/config`,
 * which has no client and no secret.
 */

/**
 * Server-side bootstrap payload for the storefront *and* the admin panels.
 *
 * Pages render on the server first (good for SEO and for a fast first paint on a
 * 3G connection), then the client takes over:
 *   - with Supabase, this is the real catalogue read through the anon key;
 *   - without it, `emptyShopData()` is the seed catalogue, and the client swaps to
 *     its own `localStorage` — the only place that copy exists.
 *
 * Reads only the public half of the shop. Orders are admin-only and are fetched
 * separately by `GET /api/shop` once a session cookie is present, which is why the
 * dashboard's first paint can briefly show no orders and then fill in.
 */
export async function loadStorefrontData(): Promise<ShopData> {
  if (IS_SUPABASE) {
    try {
      return await new SupabaseStoreDriver().readPublic();
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
