import { isValidAlgerianPhone, normalizePhone } from "@/lib/format";
import { DELIVERY_TYPES, ORDER_STATUSES, SIZES } from "@/lib/types";
import type { CheckoutInput, DeliveryType, OrderStatus, Size } from "@/lib/types";

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
    ? Math.min(10, Math.max(1, Math.round(quantityRaw)))
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

/** "1550000000000" / "2026-10-01" -> "2026-10-01" for `<input type="date">`. */
export function toDateInputValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}
