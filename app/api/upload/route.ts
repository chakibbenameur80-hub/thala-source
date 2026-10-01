import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { denyUnauthenticated } from "@/lib/api";
import { getAdminSupabase, isSupabaseConfigured } from "@/lib/db/supabase";

/**
 * `POST /api/upload` — image upload for the admin product form.
 *
 * Two backends, picked automatically:
 *
 *   - **Supabase configured** → the file goes to the `product-images` Storage
 *     bucket and the public URL is returned. This is the path that works on
 *     Vercel, where the server filesystem is read-only.
 *   - **Local mode** → the file is written to `public/uploads/`, which works in
 *     `next dev` on your own machine. On Vercel this returns `501` with an
 *     explanatory message instead of pretending to have succeeded.
 *
 * Either way the admin can always paste an image URL manually, so uploading is
 * a convenience and never a hard requirement.
 */

export const dynamic = "force-dynamic";

const MAX_BYTES = 4 * 1024 * 1024; // 4 MB
const BUCKET = "product-images";
const ALLOWED: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/avif": "avif",
};

export async function POST(request: Request) {
  const denied = await denyUnauthenticated();
  if (denied) return denied;

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "Formulaire invalide." }, { status: 400 });
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Aucun fichier reçu." }, { status: 400 });
  }
  if (file.size === 0) {
    return NextResponse.json({ error: "Fichier vide." }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "Image trop lourde (4 Mo maximum)." }, { status: 413 });
  }

  const extension = ALLOWED[file.type];
  if (!extension) {
    return NextResponse.json(
      { error: "Format non supporté. Utilisez JPG, PNG, WEBP ou AVIF." },
      { status: 415 },
    );
  }

  // Random name: never trust the client filename (path traversal, collisions,
  // double extensions such as `x.php.jpg`).
  const filename = `${randomUUID()}.${extension}`;
  const bytes = Buffer.from(await file.arrayBuffer());

  if (isSupabaseConfigured()) {
    try {
      const supabase = getAdminSupabase();
      const { error } = await supabase.storage.from(BUCKET).upload(filename, bytes, {
        contentType: file.type,
        // `upsert: false` — the name is random, so a collision is not expected.
        upsert: false,
      });
      if (error) throw error;

      const { data } = supabase.storage.from(BUCKET).getPublicUrl(filename);
      return NextResponse.json({ url: data.publicUrl, backend: "supabase" }, { status: 201 });
    } catch (error) {
      console.error("[thala] upload Supabase:", error);
      return NextResponse.json(
        {
          error:
            "Envoi vers Supabase impossible. Vérifiez que le bucket « product-images » existe et est public.",
        },
        { status: 500 },
      );
    }
  }

  try {
    // `process.cwd()` is the project root in `next dev`.
    const dir = path.join(process.cwd(), "public", "uploads");
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, filename), bytes);
    return NextResponse.json({ url: `/uploads/${filename}`, backend: "local" }, { status: 201 });
  } catch (error) {
    console.error("[thala] upload local:", error);
    return NextResponse.json(
      {
        error:
          "Le dossier public n'est pas accessible en écriture (attendu sur Vercel). Collez l'URL de l'image, ou configurez Supabase Storage.",
      },
      { status: 501 },
    );
  }
}
