import { NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/auth";
import { isSupabaseConfigured } from "@/lib/db/supabase";

/**
 * Guards for admin-only Route Handlers.
 *
 * Every mutating endpoint re-checks the session cookie server-side. The UI
 * hiding a button is a convenience, not a security control — without this, any
 * visitor could call `DELETE /api/orders/xxx` directly.
 */

/** Returns a 401 response, or `null` when the caller is an authenticated admin. */
export async function denyUnauthenticated(): Promise<NextResponse | null> {
  if (await isAuthenticated()) return null;
  return NextResponse.json({ error: "Non autorisé." }, { status: 401 });
}

/**
 * `501` when the app runs in local mode, `null` otherwise.
 *
 * In local mode the admin dashboard writes straight to `localStorage` in the
 * browser, so there is deliberately no server-side write path. Returning an
 * explicit "not implemented" is more honest than silently succeeding.
 */
export function denyIfLocalMode(): NextResponse | null {
  if (isSupabaseConfigured()) return null;
  return NextResponse.json(
    {
      error:
        "Mode local : les modifications sont enregistrées dans le navigateur. Configurez Supabase pour une base de données partagée.",
    },
    { status: 501 },
  );
}

/** Uniform 500 handler that logs the real cause server-side. */
export function serverError(scope: string, error: unknown): NextResponse {
  console.error(`[thala] ${scope}:`, error);
  return NextResponse.json({ error: "Erreur serveur." }, { status: 500 });
}
