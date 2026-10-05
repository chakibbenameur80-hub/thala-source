import { NextResponse } from "next/server";
import { denyIfLocalMode, denyUnauthenticated, serverError } from "@/lib/api";
import {
  adminTokenMissing,
  SupabaseStoreDriver,
} from "@/lib/db/supabase";
import { isSupabaseAdminConfigured } from "@/lib/db/config";
import { deleteStoredImages } from "@/lib/storage";
import type { Product } from "@/lib/types";

/**
 * `PUT    /api/products/[id]` — admin: update a product.
 * `DELETE /api/products/[id]` — admin: delete a product.
 *
 * Both also handle the Storage side of the change: when an edit drops a photo, or
 * a delete removes the last product pointing at one, the orphaned object is removed
 * from `product-images`. The order is always *database first, storage second*.
 */

type RouteContext = { params: Promise<{ id: string }> };

export const dynamic = "force-dynamic";

export async function PUT(request: Request, context: RouteContext) {
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

  try {
    const { id } = await context.params;
    const driver = new SupabaseStoreDriver();

    // Capture the photos this product had *before* the edit, so the ones the edit
    // dropped can be cleaned up afterwards. Reading first means a failure here
    // leaves the images alone rather than orphaning them silently.
    const previous = await currentImages(driver, id);

    // The URL is authoritative for the id: never let the body rename a record.
    await driver.upsertProduct({ ...product, id });

    await purgeUnreferencedImages(driver, previous, product.images ?? []);

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

  if (!isSupabaseAdminConfigured()) {
    return NextResponse.json({ error: adminTokenMissing() }, { status: 503 });
  }

  try {
    const { id } = await context.params;
    const driver = new SupabaseStoreDriver();

    // Read the doomed product's images before deleting the row.
    const images = await currentImages(driver, id);

    await driver.deleteProduct(id);

    // Recompute which images are still referenced by a surviving product. The
    // deleted product's own id is passed as excluded so its row — already gone —
    // cannot be the thing keeping an image alive.
    await purgeUnreferencedImages(driver, images, [], id);

    return NextResponse.json({ ok: true });
  } catch (error) {
    return serverError("suppression produit", error);
  }
}

/* ------------------------------------------------------------------ *
 * Helpers
 * ------------------------------------------------------------------ */

/** The product's current photos, or `[]` if it does not exist / cannot be read. */
async function currentImages(driver: SupabaseStoreDriver, id: string): Promise<string[]> {
  try {
    const { products } = await driver.readPublic();
    return products.find((p) => p.id === id)?.images ?? [];
  } catch (cause) {
    // Losing the images is acceptable; failing the write is not.
    console.warn("[thala] lecture des photos ignorée:", cause);
    return [];
  }
}

/**
 * Deletes any of `candidates` that nothing references any more.
 *
 * `stillReferenced` is the edited product's own new list; `excludedId` lets the
 * DELETE path ignore the row it has just removed. Everything else is re-read from
 * the catalogue, which is the only place that knows the truth about sharing.
 *
 * Best effort throughout: an orphaned object costs a few kilobytes of storage,
 * while throwing here would turn a successful save into a visible error.
 */
async function purgeUnreferencedImages(
  driver: SupabaseStoreDriver,
  candidates: string[],
  stillReferenced: string[],
  excludedId?: string,
): Promise<void> {
  const dropped = candidates.filter((url) => !stillReferenced.includes(url));
  if (dropped.length === 0) return;

  try {
    const { products } = await driver.readPublic();
    const inUse = new Set(
      products.filter((p) => p.id !== excludedId).flatMap((p) => p.images),
    );
    const orphans = dropped.filter((url) => !inUse.has(url));
    if (orphans.length > 0) await deleteStoredImages(orphans);
  } catch (cause) {
    console.warn("[thala] purge storage ignorée:", cause);
  }
}
