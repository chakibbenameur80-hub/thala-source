/**
 * Small, dependency-free id helpers.
 *
 * `crypto.randomUUID` is available in every browser that supports Next 16's
 * baseline, but we still keep a manual fallback so ids can also be generated in
 * a server action / route handler running on an older runtime.
 */

/** URL-safe random id, e.g. `p_9f2a1c8b4d7e`. */
export function createId(prefix: string): string {
  const uuid =
    typeof globalThis.crypto?.randomUUID === "function"
      ? globalThis.crypto.randomUUID()
      : fallbackUuid();
  return `${prefix}_${uuid.replace(/-/g, "").slice(0, 12)}`;
}

function fallbackUuid(): string {
  let out = "";
  for (let i = 0; i < 32; i += 1) {
    out += Math.floor(Math.random() * 16).toString(16);
    if (i === 7 || i === 11 || i === 15 || i === 19) out += "-";
  }
  return out;
}

const REFERENCE_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ"; // no 0/O/1/I

/**
 * Customer-facing order reference, e.g. `TS-7K4Q2M`.
 * Read out loud over the phone, so ambiguous characters are excluded.
 */
export function createOrderReference(): string {
  let tail = "";
  for (let i = 0; i < 6; i += 1) {
    tail += REFERENCE_ALPHABET[Math.floor(Math.random() * REFERENCE_ALPHABET.length)];
  }
  return `TS-${tail}`;
}

/** URL slug from a product title, used for the shareable `/produit/[slug]` page. */
export function slugify(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}
