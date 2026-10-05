import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { denyUnauthenticated, serverError } from "@/lib/api";
import {
  adminTokenMissing,
  getAdminSupabase,
  SupabaseStoreDriver,
} from "@/lib/db/supabase";
import { isSupabaseAdminConfigured, isSupabaseConfigured } from "@/lib/db/config";
import { prepareImage, MAX_IMAGE_BYTES } from "@/lib/images";
import { deleteStoredImage } from "@/lib/storage";

/**
 * `POST   /api/upload` — stores a product photo in Supabase Storage.
 * `DELETE /api/upload` — removes a stored photo that nothing references any more.
 *
 * There is deliberately **no filesystem fallback**. On Vercel the server
 * filesystem is read-only and ephemeral, so `public/uploads` can never work there;
 * returning a red "not writable" message was the previous behaviour and it left
 * the admin with no way forward. Now, if Supabase is not configured the route says
 * exactly which variables are missing, which is actionable.
 *
 * Every upload is a real object in the `product-images` bucket, so the returned URL
 * is permanent and can be stored on the product row.
 */

export const dynamic = "force-dynamic";

const BUCKET = "product-images";

export async function POST(request: Request) {
  const denied = await denyUnauthenticated();
  if (denied) return denied;

  if (!isSupabaseConfigured()) {
    return NextResponse.json(
      {
        error:
          "Stockage d'images non configuré. Renseignez NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY et ADMIN_TOKEN, puis créez le compartiment « product-images ».",
      },
      { status: 503 },
    );
  }

  // Checked separately from `isSupabaseConfigured`: without the service-role key
  // the upload cannot succeed at all, and the resulting RLS error ("new row violates
  // row-level security") reads like a database problem rather than a missing secret.
  if (!isSupabaseAdminConfigured()) {
    return NextResponse.json({ error: adminTokenMissing() }, { status: 503 });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "Formulaire invalide." }, { status: 400 });
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Veuillez sélectionner une image." }, { status: 400 });
  }
  if (file.size === 0) {
    return NextResponse.json({ error: "Fichier vide." }, { status: 400 });
  }
  // Reject early on the raw upload so an oversized photo is refused before it is
  // decoded; `prepareImage` enforces the limit again on the decoded output.
  if (file.size > MAX_IMAGE_BYTES * 2) {
    return NextResponse.json(
      { error: "Image trop volumineuse. Taille maximale : 10 MB." },
      { status: 413 },
    );
  }

  let prepared: Awaited<ReturnType<typeof prepareImage>>;
  try {
    prepared = await prepareImage(file);
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "Image illisible.";
    const status = /volumineuse/i.test(message) ? 413 : /pris en charge/i.test(message) ? 415 : 400;
    return NextResponse.json({ error: message }, { status });
  }

  const supabase = getAdminSupabase();

  // The object path is the only thing that makes collisions impossible, so the
  // client's filename is discarded entirely: no path traversal, no double
  // extensions, and no chance of `x.php.jpg`.
  const path = `products/${randomUUID()}.webp`;

  try {
    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(path, prepared.bytes, {
        contentType: prepared.contentType,
        // The name is a fresh UUID, so overwriting is never intended.
        upsert: false,
        cacheControl: "31536000",
      });
    if (error) throw error;
  } catch (cause) {
    console.error("[thala] upload storage:", cause);
    return NextResponse.json(
      {
        error:
          "Échec du téléchargement de l'image. Vérifiez que le compartiment « product-images » existe et que ADMIN_TOKEN est une clé service_role.",
      },
      { status: 502 },
    );
  }

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);

  return NextResponse.json(
    {
      url: data.publicUrl,
      // Lets the admin UI report what actually happened to the file it picked.
      bytes: prepared.bytes.byteLength,
      width: prepared.width,
      height: prepared.height,
    },
    { status: 201 },
  );
}

/**
 * `DELETE /api/upload` — removes a stored photo.
 *
 * Two refusals, both deliberate:
 *   - a URL that is not one of our own Storage objects (a repo `/images/...` asset,
 *     or someone else's host) is never touched;
 *   - a photo still referenced by a product is never touched. The seed catalogue
 *     deliberately reuses its two covers, so "delete this image" has to be answered
 *     against the catalogue rather than against the record being edited.
 *
 * The check runs against the database on every call: it is the only thing standing
 * between a mistimed click and a broken photo on the storefront.
 */
export async function DELETE(request: Request) {
  const denied = await denyUnauthenticated();
  if (denied) return denied;

  let url = "";
  try {
    const body = (await request.json()) as { url?: unknown };
    url = typeof body.url === "string" ? body.url.trim() : "";
  } catch {
    return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  }

  if (!url) {
    return NextResponse.json({ error: "URL de l'image manquante." }, { status: 400 });
  }
  if (!isSupabaseAdminConfigured()) {
    return NextResponse.json({ error: adminTokenMissing() }, { status: 503 });
  }

  try {
    const driver = new SupabaseStoreDriver();
    const holders = await driver.productsUsingImage(url);
    if (holders.length > 0) {
      // Not an error: the admin asked for something that is in use. Say so plainly
      // so the UI can explain it rather than showing a red box.
      return NextResponse.json(
        {
          removed: false,
          reason: "encore utilisée",
          products: holders.map((p) => p.title),
        },
        { status: 409 },
      );
    }

    const removed = await deleteStoredImage(url);
    return NextResponse.json({ removed });
  } catch (cause) {
    return serverError("suppression de l'image", cause);
  }
}
