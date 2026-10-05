/**
 * Browser-side image preparation.
 *
 * ## Why this exists
 *
 * Vercel Serverless Functions reject request bodies over roughly 4.5 MB **before
 * the Route Handler runs**. `lib/images.ts` accepts a 10 MB upload and the admin UI
 * says 10 MB, so without this step a phone photo taken at full resolution would be
 * refused by the platform with an opaque `413` that looks like a bug in the app.
 *
 * Compressing in the browser closes that gap: the file that leaves the device is
 * already a ~150 KB WebP, comfortably inside the limit, and the server's own decode
 * and re-encode stays the authority on what is actually stored.
 *
 * Nothing here is trusted. It is a transport optimisation, not validation — the
 * server re-checks the type, the size and the real bytes.
 */

/** Longest edge sent to the server. Matches `MAX_EDGE` in `lib/images.ts`. */
const MAX_EDGE = 1600;

/**
 * Well under the Vercel body limit even for a busy photo, and small enough that
 * uploading on mobile data finishes before the admin gives up.
 */
const TARGET_BYTES = 1.5 * 1024 * 1024;

const WEBP_QUALITY = 0.82;
const JPEG_FALLBACK_QUALITY = 0.85;

/** Types the picker accepts, mirrored from `lib/images.ts`. */
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

export function isAllowedImageType(type: string): boolean {
  return ALLOWED_TYPES.has(type);
}

/**
 * Returns a File small enough to survive the request, or the original if it is
 * already small enough.
 *
 * Never throws: if the browser cannot decode the file, the original is sent and
 * the server decides. A failed optimisation must not become a failed upload.
 */
export async function compressForUpload(file: File): Promise<File> {
  // Already small: nothing to gain, and re-encoding would only lose quality.
  if (file.size <= TARGET_BYTES) return file;

  try {
    // `imageOrientation: "from-image"` applies the EXIF rotation while decoding,
    // which is why the canvas does not need to know about it.
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    try {
      const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
      const width = Math.max(1, Math.round(bitmap.width * scale));
      const height = Math.max(1, Math.round(bitmap.height * scale));

      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d");
      if (!context) return file;

      context.drawImage(bitmap, 0, 0, width, height);

      // WebP is what the server stores anyway. Some older Safari versions cannot
      // encode it, in which case `toBlob` yields `null` and JPEG is the fallback.
      const blob = (await encode(canvas, "image/webp", WEBP_QUALITY)) ??
        (await encode(canvas, "image/jpeg", JPEG_FALLBACK_QUALITY));
      if (!blob || blob.size >= file.size) return file;

      return new File([blob], renameToExtension(file.name, blob.type), {
        type: blob.type,
        lastModified: Date.now(),
      });
    } finally {
      bitmap.close();
    }
  } catch {
    // Unsupported format, corrupted file, or no canvas support: let the server
    // be the one to reject it, with a message written for the admin.
    return file;
  }
}

function encode(
  canvas: HTMLCanvasElement,
  type: string,
  quality: number,
): Promise<Blob | null> {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), type, quality);
  });
}

/** Keeps the name recognisable while making the extension match the new bytes. */
function renameToExtension(name: string, type: string): string {
  const extension = type === "image/webp" ? "webp" : type === "image/png" ? "png" : "jpg";
  const base = name.replace(/\.[^./\\]+$/, "");
  return `${base || "photo"}.${extension}`;
}
