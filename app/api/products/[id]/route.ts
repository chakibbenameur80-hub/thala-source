import { NextResponse } from "next/server";
import { denyIfLocalMode, denyUnauthenticated, serverError } from "@/lib/api";
import { SupabaseStoreDriver } from "@/lib/db/supabase";
import type { Product } from "@/lib/types";

/**
 * `PUT    /api/products/[id]` — admin: update a product.
 * `DELETE /api/products/[id]` — admin: delete a product.
 */

type RouteContext = { params: Promise<{ id: string }> };

export const dynamic = "force-dynamic";

export async function PUT(request: Request, context: RouteContext) {
  const denied = await denyUnauthenticated() ?? denyIfLocalMode();
  if (denied) return denied;

  let product: Product;
  try {
    product = (await request.json()) as Product;
  } catch {
    return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  }

  try {
    const { id } = await context.params;
    // The URL is authoritative for the id: never let the body rename a record.
    await new SupabaseStoreDriver().upsertProduct({ ...product, id });
    return NextResponse.json({ ok: true, id });
  } catch (error) {
    return serverError("maj produit", error);
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  const denied = await denyUnauthenticated() ?? denyIfLocalMode();
  if (denied) return denied;

  try {
    const { id } = await context.params;
    await new SupabaseStoreDriver().deleteProduct(id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return serverError("suppression produit", error);
  }
}
