import { NextResponse } from "next/server";
import { denyIfLocalMode, denyUnauthenticated, serverError } from "@/lib/api";
import { SupabaseStoreDriver } from "@/lib/db/supabase";
import { deleteStoredImages } from "@/lib/storage";
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

/**
 * Deletes a product, then cleans up any Storage object no other product still
 * references.
 *
 * The row is removed first: a product that has been deleted but whose images are
 * still on disk is untidy, whereas an image deleted while its product still exists
 * is a broken image on the storefront. Order matters, so the row goes first.
 *
 * An image still referenced by another product is left alone — the check is
 * against the catalogue *after* the delete, so shared images survive.
 */
export async function DELETE(_request: Request, context: RouteContext) {
  const denied = await denyUnauthenticated() ?? denyIfLocalMode();
  if (denied) return denied;

  try {
    const { id } = await context.params;
    const driver = new SupabaseStoreDriver();

    // Read the doomed product's images before deleting the row.
    let images: string[] = [];
    try {
      const { products } = await driver.read();
      images = products.find((p) => p.id === id)?.images ?? [];
    } catch (cause) {
      // Losing the images is acceptable; failing the delete is not.
      console.warn("[thala] cleanup suppression produit ignoré:", cause);
    }

    await driver.deleteProduct(id);

    // Recompute which images are still referenced by a surviving product.
    try {
      const { products } = await driver.read();
      const stillUsed = new Set(products.flatMap((p) => p.images));
      const orphans = images.filter((url) => !stillUsed.has(url));
      if (orphans.length > 0) await deleteStoredImages(orphans);
    } catch (cause) {
      console.warn("[thala] purge storage ignorée:", cause);
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return serverError("suppression produit", error);
  }
}
