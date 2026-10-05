/**
 * Supabase configuration — safe to import from anywhere.
 *
 * This module deliberately contains **no** Supabase client and no reference to
 * `ADMIN_TOKEN`. It only reads the two `NEXT_PUBLIC_*` variables, which Next.js
 * inlines into the browser bundle by design.
 *
 * Why it is split out of `lib/db/supabase.ts`: that file creates a
 * service-role client for admin writes. When it lived alone, any client module
 * that imported the driver — `lib/services/shop.ts` does — dragged the admin
 * code path into the browser bundle. The secret itself never leaked (Next.js
 * replaces a non-`NEXT_PUBLIC_` variable with `undefined` in client code), but
 * the code that reads it was in the client graph, one rename away from shipping
 * the service-role key to every visitor. Keeping the config here means client
 * code can ask "is Supabase live?" without being able to reach the admin client.
 */

export function isSupabaseConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
}

/**
 * True when the service-role key is present.
 *
 * Separate from {@link isSupabaseConfigured} on purpose: the public pair is enough
 * to *read* the catalogue, so the storefront works with only those two. Any route
 * that writes — or reads the orders table — additionally needs `ADMIN_TOKEN`, and
 * should say so precisely rather than letting the request fail somewhere deeper
 * with an opaque permission error.
 */
export function isSupabaseAdminConfigured(): boolean {
  return isSupabaseConfigured() && Boolean(process.env.ADMIN_TOKEN);
}

/** The public project URL, or `null` when Supabase is not configured. */
export function supabaseUrl(): string | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  return url ? url.replace(/\/+$/, "") : null;
}

/**
 * Backend selection, evaluated once per process.
 *
 * This is the only place that decides where the shop's data lives; nothing else
 * branches on the backend. `useShop` and the service layer both read it.
 */
export const IS_SUPABASE = isSupabaseConfigured();
