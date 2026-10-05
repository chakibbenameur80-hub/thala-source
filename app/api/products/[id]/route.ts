import { NextResponse } from "next/server";
import { denyIfLocalMode, denyUnauthenticated, serverError } from "@/lib/api";
import {
  adminTokenMissing,
  SupabaseStoreDriver,
} from "@/lib/db/supabase";
import { isSupabaseAdminConfigured } from "@/lib/db/config";
import { deleteStoredImages } from "@/lib/storage";
import { validateProduct } from "@/lib/validation";
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

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  }

  let id: string;
  try {
    ({ id } = await context.params);
  } catch {
    return NextResponse.json({ error: "Identifiant manquant." }, { status: 400 });
  }

  try {
    const driver = new SupabaseStoreDriver();

    // Read the product as it stands *before* the edit. This serves three purposes:
    // it decides whether the row exists (a PUT to an unknown id must 404, not
    // silently create), it preserves `createdAt` so an edit cannot backdate a
    // product, and it captures the current photos so the ones this edit drops can
    // be cleaned up afterwards.
    const existing = await findProduct(driver, id);
    if (!existing) {
      return NextResponse.json({ error: "Produit introuvable." }, { status: 404 });
    }

    const parsed = validateProduct(body, { keep: { createdAt: existing.createdAt } });
    if (!parsed.ok) {
      return NextResponse.json({ error: "Produit invalide.", fields: parsed.errors }, { status: 422 });
    }
    // The URL is authoritative for the id: never let the body rename a record.
    const product = { ...parsed.value, id };

    await driver.upsertProduct(product);

    await purgeUnreferencedImages(driver, existing.images, product.images);

    return NextResponse.json({ ok: true, product });
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

    // Read the doomed product before deleting the row, for its photos.
    const existing = await findProduct(driver, id);
    if (!existing) {
      return NextResponse.json({ error: "Produit introuvable." }, { status: 404 });
    }

    const deleted = await driver.deleteProduct(id);
    if (!deleted) {
      // Lost a race with a concurrent delete. Its images are someone else's
      // problem now, not ours to purge.
      return NextResponse.json({ error: "Produit introuvable." }, { status: 404 });
    }

    // Recompute which images are still referenced by a surviving product. The
    // deleted product's own id is passed as excluded so its row — already gone —
    // cannot be the thing keeping an image alive.
    await purgeUnreferencedImages(driver, existing.images, [], id);

    return NextResponse.json({ ok: true });
  } catch (error) {
    return serverError("suppression produit", error);
  }
}

/* ------------------------------------------------------------------ *
 * Helpers
 * ------------------------------------------------------------------ */

/**
 * The product as currently stored, or `null` if no such id exists.
 *
 * `readPublic` is the anon client, which is enough: the catalogue is public by
 * design, and the admin reading its own catalogue back does not need the
 * service-role key. A read failure is reported as "not found" rather than
 * swallowed, because acting on a wrong answer here is worse than a 404 — an
 * unknown `createdAt` would reset the timestamp, and a wrong photo list would
 * delete an image that is still on a product.
 */
async function findProduct(
  driver: SupabaseStoreDriver,
  id: string,
): Promise<Product | null> {
  const { products } = await driver.readPublic();
  return products.find((p) => p.id === id) ?? null;
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
