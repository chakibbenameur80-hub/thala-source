import { NextResponse } from "next/server";
import { denyIfLocalMode, denyUnauthenticated, serverError } from "@/lib/api";
import {
  adminTokenMissing,
  isSupabaseConfigured,
  SupabaseStoreDriver,
} from "@/lib/db/supabase";
import { isSupabaseAdminConfigured } from "@/lib/db/config";
import { seedProducts } from "@/lib/seed";
import type { Product } from "@/lib/types";

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

  let product: Product;
  try {
    product = (await request.json()) as Product;
  } catch {
    return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  }

  if (!product?.id || !product.title) {
    return NextResponse.json({ error: "Titre et identifiant obligatoires." }, { status: 422 });
  }
  if (!Number.isFinite(product.price) || product.price <= 0) {
    return NextResponse.json({ error: "Prix invalide." }, { status: 422 });
  }

  try {
    await new SupabaseStoreDriver().upsertProduct(product);
    return NextResponse.json({ product }, { status: 201 });
  } catch (error) {
    return serverError("creation produit", error);
  }
}
