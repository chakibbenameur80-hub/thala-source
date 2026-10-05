import "server-only";

import { getAdminSupabase } from "@/lib/db/supabase";
import { isSupabaseAdminConfigured, supabaseUrl } from "@/lib/db/config";

/**
 * Supabase Storage helpers for product photos.
 *
 * Kept separate from the upload route so the admin UI can reason about deletion
 * without importing Route Handler code.
 */

const BUCKET = "product-images";

/**
 * The storage URL prefix for this project's bucket, or `null` when Supabase is
 * not configured.
 *
 * Every URL produced by `/api/upload` starts with exactly this string, which is
 * what makes it safe to delete: we only ever remove objects we created. Anything
 * else — a `/images/robe.jpg` that ships with the repo, or a URL on someone
 * else's host — is recognised as foreign and left alone.
 */
export function storageUrlPrefix(): string | null {
  const url = supabaseUrl();
  if (!url) return null;
  return `${url}/storage/v1/object/public/${BUCKET}/`;
}

/**
 * Extracts the object path from a public Storage URL.
 *
 * @returns the path inside the bucket, or `null` if the URL is not one of ours.
 */
export function storagePathFromUrl(url: string): string | null {
  const prefix = storageUrlPrefix();
  if (!prefix) return null;

  let pathname: string;
  try {
    pathname = new URL(url.trim()).pathname;
  } catch {
    // Not an absolute URL, so not one of ours.
    return null;
  }

  // Compare parsed pathnames rather than raw strings so a query string or fragment
  // on the stored URL cannot become part of the object path.
  const prefixPath = new URL(prefix).pathname;
  if (!pathname.startsWith(prefixPath)) return null;

  const path = pathname.slice(prefixPath.length);
  // Guard against a URL that tries to climb out with `..`.
  if (!path || path.includes("..")) return null;
  return path;
}

/** True when the URL points at an object this project uploaded. */
export function isStoredImage(url: string): boolean {
  return storagePathFromUrl(url) !== null;
}

/**
 * Deletes a stored image.
 *
 * Safe by construction: a URL that is not one of our Storage objects resolves to
 * no path and nothing is deleted. That matters because a product may legitimately
 * reference an image we did not upload, and removing it would corrupt a file that
 * is not ours to touch.
 *
 * @returns `true` when an object was removed, `false` when there was nothing to do.
 */
export async function deleteStoredImage(url: string): Promise<boolean> {
  const path = storagePathFromUrl(url);
  if (!path) return false;
  if (!isSupabaseAdminConfigured()) return false;

  const { error } = await getAdminSupabase().storage.from(BUCKET).remove([path]);
  if (error) throw error;
  return true;
}

/**
 * Best-effort cleanup for a set of URLs.
 *
 * Used when a product is deleted. Individual failures are swallowed on purpose:
 * an orphaned object is a storage cost, whereas a failed deletion that blocks the
 * product row from being removed would leave the admin stuck on an error they
 * cannot act on.
 */
export async function deleteStoredImages(urls: string[]): Promise<void> {
  if (!isSupabaseAdminConfigured()) return;
  const paths = urls
    .map((url) => storagePathFromUrl(url))
    .filter((path): path is string => path !== null);
  if (paths.length === 0) return;
  try {
    await getAdminSupabase().storage.from(BUCKET).remove(paths);
  } catch (cause) {
    console.warn("[thala] cleanup orphans ignoré:", cause);
  }
}
