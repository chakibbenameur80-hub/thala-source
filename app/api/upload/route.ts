import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { denyUnauthenticated } from "@/lib/api";
import { getAdminSupabase, isSupabaseConfigured } from "@/lib/db/supabase";
import { prepareImage, MAX_IMAGE_BYTES } from "@/lib/images";
import { deleteStoredImage } from "@/lib/storage";

/**
 * `POST /api/upload` — stores a product photo in Supabase Storage.
 *
 * There is deliberately **no filesystem fallback**. On Vercel the server
 * filesystem is read-only and ephemeral, so `public/uploads` can never work
 * there; returning a red "not writable" message was the previous behaviour and it
 * left the admin with no way forward. Now, if Supabase is not configured the
 * route says exactly which variables are missing, which is actionable.
 *
 * Every upload is a real object in the `product-images` bucket, so the returned
 * URL is permanent and can be stored on the product row.
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
 * Called when the admin deletes a photo from a product, and when a product that
 * owned the only reference to a photo is deleted. `deleteStoredImage` refuses to
 * touch anything that is not one of our own Storage objects, so a URL that
 * points elsewhere (or one of the repo's own `/images/...` assets) is a no-op
 * rather than a failed request.
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

  try {
    const removed = await deleteStoredImage(url);
    return NextResponse.json({ removed });
  } catch (cause) {
    console.error("[thala] delete storage:", cause);
    return NextResponse.json({ error: "Suppression de l'image impossible." }, { status: 502 });
  }
}
