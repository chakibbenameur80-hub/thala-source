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
const REFERENCE_LENGTH = 6;

/**
 * Customer-facing order reference, e.g. `TS-7K4Q2M`.
 * Read out loud over the phone, so ambiguous characters are excluded.
 *
 * Drawn from `crypto.getRandomValues`, not `Math.random`: `orders.reference` has a
 * UNIQUE constraint, so a collision fails the customer's checkout with a 503.
 * Six characters over this 32-symbol alphabet is ~1.1e9 combinations, and the
 * birthday collision probability is already ~0.8% at 10k orders — too much risk to
 * hand to a non-cryptographic PRNG when the strong one is universally available.
 *
 * @param attempt retry number, for the caller to loop on a unique-constraint clash.
 */
export function createOrderReference(attempt = 0): string {
  const length = REFERENCE_LENGTH + Math.min(attempt, 4);
  const alphabetLength = REFERENCE_ALPHABET.length;

  let tail = "";
  if (typeof globalThis.crypto?.getRandomValues === "function") {
    // Rejection sampling: 256 is not a multiple of 32, so a plain modulo would bias
    // the first 8 symbols towards higher values.
    const max = Math.floor(256 / alphabetLength) * alphabetLength;
    while (tail.length < length) {
      const buf = new Uint8Array(length - tail.length);
      globalThis.crypto.getRandomValues(buf);
      for (const byte of buf) {
        if (byte >= max) continue;
        tail += REFERENCE_ALPHABET[byte % alphabetLength];
      }
    }
  } else {
    for (let i = 0; i < length; i += 1) {
      tail += REFERENCE_ALPHABET[Math.floor(Math.random() * alphabetLength)];
    }
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
