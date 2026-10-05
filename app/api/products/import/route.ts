import { NextResponse } from "next/server";
import { denyIfLocalMode, denyUnauthenticated, serverError } from "@/lib/api";
import {
  adminTokenMissing,
  getAdminSupabase,
  productToRow,
} from "@/lib/db/supabase";
import { isSupabaseAdminConfigured } from "@/lib/db/config";
import { normalizeShopData } from "@/lib/db/schema";
import type { Product } from "@/lib/types";

/**
 * `POST /api/products/import` â€” move a `localStorage` catalogue into Postgres.
 *
 * ## Why this route is needed
 *
 * Before Supabase, the catalogue lived in each visitor's browser. Switching
 * backends does not move that data: the database starts empty, and the shop looks
 * broken until somebody re-types every dress. Re-typing is exactly the manual step
 * worth automating.
 *
 * The browser cannot be read from the server, so the data comes *in* through this
 * request: the admin panel reads its own `localStorage` (or a JSON export of it)
 * and posts the products here.
 *
 * ## Safety
 *
 *   - **Idempotent.** Existing ids are skipped, not overwritten. Running it twice,
 *     or running it from three different browsers, cannot create duplicates and
 *     cannot clobber edits already made in the dashboard. That is the behaviour
 *     `upsert` would *not* give us here.
 *   - **Validated.** Every record goes through the same `normalizeShopData` the rest
 *     of the app uses, so a hand-edited or truncated export cannot write junk.
 *   - **Admin-only**, and only in Supabase mode.
 */

export const dynamic = "force-dynamic";

/** Ceiling on one request, so a runaway script cannot flood the table. */
const MAX_IMPORT = 500;

export async function POST(request: Request) {
  const denied = await denyUnauthenticated() ?? denyIfLocalMode();
  if (denied) return denied;

  if (!isSupabaseAdminConfigured()) {
    return NextResponse.json({ error: adminTokenMissing() }, { status: 503 });
  }

  let body: { products?: unknown };
  try {
    body = (await request.json()) as { products?: unknown };
  } catch {
    return NextResponse.json({ error: "Requأھte invalide." }, { status: 400 });
  }

  if (!Array.isArray(body.products)) {
    return NextResponse.json(
      { error: "Aucun produit أ  importer. Exportez d'abord les donnأ©es du navigateur." },
      { status: 422 },
    );
  }

  if (body.products.length > MAX_IMPORT) {
    return NextResponse.json(
      { error: `Import limitأ© أ  ${MAX_IMPORT} produits par envoi.` },
      { status: 413 },
    );
  }

  // Same normalisation the app uses everywhere else, so an export written by an
  // older version of the site still imports cleanly.
  const candidates = normalizeShopData({
    products: body.products,
    orders: [],
    shipping: [],
  }).products;

  if (candidates.length === 0) {
    return NextResponse.json({ imported: 0, skipped: 0, titles: [] });
  }

  // De-duplicate within the payload itself, keeping the first occurrence: an export
  // that somehow contains the same id twice must still produce one row.
  const unique = new Map<string, Product>();
  for (const product of candidates) {
    if (!unique.has(product.id)) unique.set(product.id, product);
  }

  try {
    const supabase = getAdminSupabase();

    const { data: existing, error: readError } = await supabase
      .from("products")
      .select("id");
    if (readError) throw readError;

    const alreadyThere = new Set((existing ?? []).map((row) => String(row.id)));
    const toInsert = [...unique.values()].filter((product) => !alreadyThere.has(product.id));

    if (toInsert.length === 0) {
      return NextResponse.json({
        imported: 0,
        skipped: unique.size,
        titles: [...unique.values()].map((product) => product.title),
      });
    }

    const { error } = await supabase
      .from("products")
      .insert(toInsert.map(productToRow));
    if (error) throw error;

    return NextResponse.json({
      imported: toInsert.length,
      skipped: unique.size - toInsert.length,
      titles: toInsert.map((product) => product.title),
    });
  } catch (cause) {
    return serverError("import produits", cause);
  }
}
