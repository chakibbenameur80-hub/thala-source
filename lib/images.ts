/**
 * Server-side image validation and normalisation.
 *
 * Every admin upload is decoded and re-encoded here rather than being stored
 * byte-for-byte. Two reasons:
 *
 *   1. **Size.** A modern phone camera produces 4-8 MB files. Storing those as-is
 *      bloats the bucket and makes the storefront slow on mobile data.
 *   2. **Trust.** The declared `Content-Type` and the filename both come from the
 *      client. Decoding with sharp and re-encoding to WebP proves the bytes really
 *      are a supported image and drops anything that is not — a `.jpg` that is
 *      really an HTML document never reaches Storage.
 *
 * Output is always WebP at `CONTENT_TYPE`, which is why the stored object path
 * ends in `.webp` regardless of what the admin picked.
 */

import sharp from "sharp";
import type { Metadata } from "sharp";

/** Hard ceiling on the uploaded file, checked before decoding. */
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024; // 10 MB

/** Longest edge of the stored image. Portrait product shots stay legible well below this. */
const MAX_EDGE = 1600;

/**
 * Quality for the WebP re-encode. 82 is visually indistinguishable from the
 * source at product-card sizes while cutting typical photos by ~70%.
 */
const WEBP_QUALITY = 82;

const CONTENT_TYPE = "image/webp";

/** Extensions we are willing to decode. Checked against the *real* format below. */
const ALLOWED_INPUT = new Set(["image/jpeg", "image/png", "image/webp"]);

export type PreparedImage = {
  bytes: Buffer;
  contentType: string;
  width: number;
  height: number;
};

/**
 * Validates, resizes and re-encodes an uploaded file.
 *
 * @throws Error with a French, user-facing message. The route handler turns these
 *         into the appropriate status code, so the text must be safe to display.
 */
export async function prepareImage(file: File): Promise<PreparedImage> {
  const input = Buffer.from(await file.arrayBuffer());

  // Cheap pre-check: reject a file over the limit without paying for a decode.
  if (input.byteLength > MAX_IMAGE_BYTES) {
    throw new Error("Image trop volumineuse. Taille maximale : 10 MB.");
  }

  if (!ALLOWED_INPUT.has(file.type)) {
    throw new Error("Format d'image non pris en charge. Utilisez JPG, PNG ou WEBP.");
  }

  // Decode far enough to learn the real dimensions and confirm the bytes really
  // are an image. This rejects a renamed non-image (an HTML document called
  // `.jpg`) before any bytes are stored.
  let meta: Metadata;
  try {
    meta = await sharp(input, { failOn: "error" }).metadata();
  } catch {
    throw new Error("Image illisible ou corrompue.");
  }

  if (!meta.width || !meta.height) {
    throw new Error("Image illisible ou corrompue.");
  }

  // `rotate()` with no argument applies the EXIF orientation, so a photo shot in
  // portrait does not get stored (and later displayed) on its side.
  const output = await sharp(input)
    .rotate()
    .resize({
      width: MAX_EDGE,
      height: MAX_EDGE,
      fit: "inside",
      withoutEnlargement: true,
    })
    .webp({ quality: WEBP_QUALITY, effort: 4 })
    .toBuffer({ resolveWithObject: true });

  // A well-compressed source can still land above the limit after re-encoding if
  // it was already enormous; surface the real ceiling rather than a generic error.
  if (output.data.byteLength > MAX_IMAGE_BYTES) {
    throw new Error("Image trop volumineuse. Taille maximale : 10 MB.");
  }

  return {
    bytes: output.data,
    contentType: CONTENT_TYPE,
    width: output.info.width,
    height: output.info.height,
  };
}
