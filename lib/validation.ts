import { isValidAlgerianPhone, normalizePhone } from "@/lib/format";
import { DELIVERY_TYPES, ORDER_STATUSES, SIZES } from "@/lib/types";
import type { CheckoutInput, DeliveryType, OrderStatus, Product, Size } from "@/lib/types";

/**
 * Input validation shared by the checkout form (instant, client-side feedback)
 * and the `/api/orders` route handler (authoritative, server-side).
 *
 * The server must never trust the browser for prices *or* for the shape of the
 * payload, so everything that reaches the database goes through
 * `validateCheckout` first.
 */

export type FieldErrors = Partial<Record<keyof CheckoutInput, string>>;

export type ValidationResult =
  | { ok: true; value: CheckoutInput }
  | { ok: false; errors: FieldErrors };

/** Anything shorter than this is a typo, not a name. */
const MIN_NAME_LENGTH = 4;
/** Guards against someone pasting a paragraph into the name field. */
const MAX_NAME_LENGTH = 80;
/**
 * Units per order.
 *
 * The dresses are made to order, so a real customer orders one or two. Ten is
 * already generous; past that it is a stock-pilot, not a shopper.
 */
export const MAX_QUANTITY = 10;

function isValidSize(value: unknown): value is Size {
  return typeof value === "string" && (SIZES as readonly string[]).includes(value);
}

function isValidDeliveryType(value: unknown): value is DeliveryType {
  return typeof value === "string" && (DELIVERY_TYPES as readonly string[]).includes(value);
}

/** Coerces a JSON value into a valid wilaya code, or `null`. */
export function parseWilayaCode(value: unknown): number | null {
  const code = typeof value === "string" ? Number(value) : value;
  if (typeof code !== "number" || !Number.isInteger(code)) return null;
  if (code < 1 || code > 58) return null;
  return code;
}

/** Trims and caps free text so a hostile client cannot bloat a column. */
function cleanText(value: unknown, max: number): string {
  if (typeof value !== "string") return "";
  return value.replace(/\s+/g, " ").trim().slice(0, max);
}

/** Keeps line breaks in long text (descriptions, notes) but caps the length. */
function cleanMultiline(value: unknown, max: number): string {
  if (typeof value !== "string") return "";
  return value.replace(/\r\n/g, "\n").trim().slice(0, max);
}

export function validateCheckout(input: unknown): ValidationResult {
  const errors: FieldErrors = {};
  const raw = (input ?? {}) as Record<string, unknown>;

  const customerName = cleanText(raw.customerName, MAX_NAME_LENGTH);
  if (customerName.length < MIN_NAME_LENGTH) {
    errors.customerName = "Merci d'indiquer votre nom complet (الاسم واللقب).";
  }

  const phoneRaw = cleanText(raw.phone, 30);
  const phone = normalizePhone(phoneRaw);
  if (!isValidAlgerianPhone(phone)) {
    errors.phone = "Numéro de mobile invalide (ex : 0555 12 34 56).";
  }

  const wilayaCode = parseWilayaCode(raw.wilayaCode);
  if (wilayaCode === null) {
    errors.wilayaCode = "Merci de choisir votre wilaya.";
  }

  const deliveryType = raw.deliveryType;
  if (!isValidDeliveryType(deliveryType)) {
    errors.deliveryType = "Choisissez le mode de livraison.";
  }

  const size = raw.size;
  if (!isValidSize(size)) {
    errors.size = "Choisissez une taille.";
  }

  const quantityRaw = Number(raw.quantity ?? 1);
  const quantity = Number.isFinite(quantityRaw)
    ? Math.min(MAX_QUANTITY, Math.max(1, Math.round(quantityRaw)))
    : 1;

  const commune = cleanText(raw.commune, 60);
  const note = cleanMultiline(raw.note, 500);

  if (Object.keys(errors).length > 0) return { ok: false, errors };

  return {
    ok: true,
    value: {
      customerName,
      phone,
      wilayaCode: wilayaCode as number,
      commune: commune || undefined,
      deliveryType: deliveryType as DeliveryType,
      size: size as Size,
      quantity,
      note: note || undefined,
    },
  };
}

export function isValidOrderStatus(value: unknown): value is OrderStatus {
  return typeof value === "string" && (ORDER_STATUSES as readonly string[]).includes(value);
}

/* ------------------------------------------------------------------ *
 * Product validation (admin writes)
 * ------------------------------------------------------------------ */

export type ProductErrors = Partial<Record<keyof Product, string>>;

export type ProductResult =
  | { ok: true; value: Product }
  | { ok: false; errors: ProductErrors };

/** Matches the schema's `images` check: at most six photos, and none absurdly long. */
const MAX_IMAGES = 6;
const MAX_IMAGE_URL = 2048;
const MAX_TITLE = 120;
const MAX_SUBTITLE = 160;
/** A description longer than this is a paste accident, and a slow admin page. */
const MAX_DESCRIPTION = 8000;

/**
 * Coerces and bounds an admin-supplied product.
 *
 * This runs on `POST /api/products` and `PUT /api/products/[id]`. It is not
 * defensive padding for a trusted caller: the admin panel is a React form, so
 * every field is attacker-controlled as far as the server is concerned — a
 * hand-written `curl` with the session cookie is the same request as the form
 * posting. Without this, a negative price or `compareAtPrice <= price` reaches
 * Postgres and comes back as an opaque 500 from a CHECK constraint instead of a
 * 422 the panel can display.
 *
 * Timestamps are *not* trusted from the body: an edit must not be able to
 * backdate a `createdAt`. Callers pass the existing `createdAt` through `keep`.
 */
export function validateProduct(
  input: unknown,
  options: { keep?: Pick<Product, "createdAt"> } = {},
): ProductResult {
  const errors: ProductErrors = {};
  const raw = (input ?? {}) as Record<string, unknown>;

  const id = cleanText(raw.id, 80);
  if (!/^[a-zA-Z0-9_-]+$/.test(id)) {
    errors.id = "Identifiant invalide (lettres, chiffres, - et _ uniquement).";
  }

  const title = cleanText(raw.title, MAX_TITLE);
  if (title.length < 2) errors.title = "Le titre est obligatoire.";

  // Whole-number DZD, and positive: a zero or negative price is never intentional.
  const price = Number(raw.price);
  if (!Number.isInteger(price) || price <= 0 || price > 100_000_000) {
    errors.price = "Prix invalide.";
  }

  const compareRaw = raw.compareAtPrice;
  let compareAtPrice: number | null = null;
  if (compareRaw !== undefined && compareRaw !== null && compareRaw !== "") {
    const value = Number(compareRaw);
    if (!Number.isInteger(value) || value <= 0) {
      errors.compareAtPrice = "Prix barré invalide.";
    } else if (Number.isInteger(price) && value <= price) {
      // The badge is computed as a discount against `price`, so a "was" price at
      // or below the current one renders as a negative discount.
      errors.compareAtPrice = "Le prix barré doit être supérieur au prix.";
    } else {
      compareAtPrice = value;
    }
  }

  const images = Array.isArray(raw.images)
    ? raw.images.filter((u): u is string => typeof u === "string" && u.trim() !== "").slice(0, MAX_IMAGES)
    : [];
  for (const url of images) {
    if (url.length > MAX_IMAGE_URL) {
      errors.images = "Adresse d'image trop longue.";
      break;
    }
  }

  const sizes = Array.isArray(raw.sizes)
    ? (raw.sizes.filter(isValidSize) as Size[])
    : ([] as Size[]);
  if (sizes.length === 0) {
    // Every order carries a size and the checkout rejects one that is not on the
    // product, so a product with no sizes cannot be bought at all.
    errors.sizes = "Ajoutez au moins une taille.";
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors };

  const now = new Date().toISOString();
  return {
    ok: true,
    value: {
      id,
      title,
      subtitle: cleanText(raw.subtitle, MAX_SUBTITLE) || undefined,
      description: cleanMultiline(raw.description, MAX_DESCRIPTION) || undefined,
      price,
      compareAtPrice,
      images,
      sizes: [...new Set(sizes)],
      featured: raw.featured === true,
      inStock: raw.inStock !== false,
      // A create has no prior row, so `keep` is absent and this is `now`.
      createdAt: options.keep?.createdAt ?? now,
      updatedAt: now,
    },
  };
}

/** "1550000000000" / "2026-10-01" -> "2026-10-01" for `<input type="date">`. */
export function toDateInputValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}
