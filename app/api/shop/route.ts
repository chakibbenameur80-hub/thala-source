import { NextResponse } from "next/server";
import { denyIfLocalMode, denyUnauthenticated, serverError } from "@/lib/api";
import { adminTokenMissing, SupabaseStoreDriver } from "@/lib/db/supabase";
import { isSupabaseAdminConfigured } from "@/lib/db/config";

/**
 * `GET /api/shop` — the admin dashboard's data source in Supabase mode.
 *
 * ## Why this route exists
 *
 * The dashboard used to read Postgres directly from the browser with the anon key.
 * That cannot work: RLS grants order reads to `service_role` and nothing else, so
 * the dashboard's very first refresh would have been denied and every admin panel
 * would have rendered an error. Reading the orders needs the service-role key, and
 * the service-role key must never reach a browser — so the read happens here,
 * server-side, behind the admin session cookie.
 *
 * The browser therefore holds only an httpOnly session cookie. The keys stay here.
 */

export const dynamic = "force-dynamic";

export async function GET() {
  const denied = await denyUnauthenticated() ?? denyIfLocalMode();
  if (denied) return denied;

  // Distinguish "you forgot the service-role key" from "the database is broken".
  // Without this the failure surfaces as a generic 500 and looks like a query bug.
  if (!isSupabaseAdminConfigured()) {
    return NextResponse.json({ error: adminTokenMissing() }, { status: 503 });
  }

  try {
    return NextResponse.json(await new SupabaseStoreDriver().read());
  } catch (error) {
    return serverError("lecture boutique", error);
  }
}
