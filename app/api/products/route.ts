import { NextResponse } from "next/server";
import { denyIfLocalMode, denyUnauthenticated, serverError } from "@/lib/api";
import {
  adminTokenMissing,
  isSupabaseConfigured,
  SupabaseStoreDriver,
} from "@/lib/db/supabase";
import { isSupabaseAdminConfigured } from "@/lib/db/config";
import { seedProducts } from "@/lib/seed";
import { validateProduct } from "@/lib/validation";

/**
 * `GET  /api/products` — public catalogue (used when the client hydrates from
 *                        the API instead of the server-rendered payload).
 * `POST /api/products` — admin: create a product.
 */

export const dynamic = "force-dynamic";

export async function GET() {
  if (!isSupabaseConfigured()) {
    // Local mode: the browser already holds the catalogue in `localStorage`, so
    // the seed list is only a useful fallback for a cold cache.
    return NextResponse.json({ products: seedProducts(), source: "seed" });
  }
  try {
    // `readPublic`, not `read`: this endpoint is unauthenticated, and the orders
    // table is invisible to the anon key by design.
    const { products } = await new SupabaseStoreDriver().readPublic();
    return NextResponse.json({ products, source: "supabase" });
  } catch (error) {
    return serverError("lecture produits", error);
  }
}

export async function POST(request: Request) {
  const denied = await denyUnauthenticated() ?? denyIfLocalMode();
  if (denied) return denied;

  if (!isSupabaseAdminConfigured()) {
    return NextResponse.json({ error: adminTokenMissing() }, { status: 503 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  }

  const parsed = validateProduct(body);
  if (!parsed.ok) {
    return NextResponse.json({ error: "Produit invalide.", fields: parsed.errors }, { status: 422 });
  }
  const product = parsed.value;

  // `upsertProduct` is an upsert on the primary key, so posting an id that already
  // exists would silently overwrite a live product, dropping whatever photos the
  // admin never saw. Refusing the collision turns that into an explicit 409 the
  // panel can report, instead of data loss.
  if (await productExists(product.id)) {
    return NextResponse.json(
      { error: "Un produit porte déjà cet identifiant.", fields: { id: "Identifiant déjà utilisé." } },
      { status: 409 },
    );
  }

  try {
    await new SupabaseStoreDriver().upsertProduct(product);
    return NextResponse.json({ product }, { status: 201 });
  } catch (error) {
    return serverError("creation produit", error);
  }
}

/** `true` if a product with this id is already stored. */
async function productExists(id: string): Promise<boolean> {
  try {
    const { products } = await new SupabaseStoreDriver().readPublic();
    return products.some((p) => p.id === id);
  } catch (cause) {
    // Cannot prove the id is free, so let the write attempt decide instead of
    // blocking the admin on a read failure.
    console.warn("[thala] vérification d'identifiant ignorée:", cause);
    return false;
  }
}
