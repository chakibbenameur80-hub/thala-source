import { wilayaName } from "@/lib/wilayas";
import type { Order, OrderStatus, Product } from "@/lib/types";
import { DEFAULT_WILAYA_CODE } from "@/lib/brand";

/** `12500` -> `"12 500 DA"`. Algerian shoppers read amounts in whole dinars. */
export function formatDZD(amount: number): string {
  const safe = Number.isFinite(amount) ? Math.round(amount) : 0;
  return `${new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(safe)} DA`;
}

/** Same as `formatDZD` but with the Arabic dinar sign, for the bilingual lines. */
export function formatDZDAr(amount: number): string {
  const safe = Number.isFinite(amount) ? Math.round(amount) : 0;
  return `${new Intl.NumberFormat("ar-DZ", { maximumFractionDigits: 0 }).format(safe)} دج`;
}

/** `"2026-10-01T12:30:00.000Z"` -> `"01/10/2026 12:30"`. */
export function formatDateTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("fr-DZ", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

/** `"2026-10-01T12:30:00.000Z"` -> `"01/10/2026"`. */
export function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("fr-DZ", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}

/** "il y a 3 jours" style label for the orders list. */
export function timeAgo(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "—";
  const diffSeconds = Math.round((Date.now() - then) / 1000);
  const units: Array<[Intl.RelativeTimeFormatUnit, number]> = [
    ["year", 31536000],
    ["month", 2592000],
    ["day", 86400],
    ["hour", 3600],
    ["minute", 60],
  ];
  const rtf = new Intl.RelativeTimeFormat("fr", { numeric: "auto" });
  for (const [unit, seconds] of units) {
    if (Math.abs(diffSeconds) >= seconds) {
      return rtf.format(-Math.round(diffSeconds / seconds), unit);
    }
  }
  return "à l'instant";
}

/**
 * Normalises an Algerian mobile number to the local form `0X XX XX XX XX`
 * so the shop can always read it back out loud to the courier.
 *
 * Accepts `0555 12 34 56`, `+213 555 12 34 56`, `00213 555123456`, `555123456`.
 */
export function normalizePhone(input: string): string {
  const digits = input.replace(/[^\d+]/g, "");
  const local = digits
    .replace(/^\+213/, "0")
    .replace(/^00213/, "0")
    .replace(/^213/, "0");
  const national = local.startsWith("0") ? local : `0${local}`;
  return national.slice(0, 10);
}

/** Pretty-prints a normalised number as `0555 12 34 56`. */
export function prettyPhone(normalized: string): string {
  const m = /^0(\d{2})(\d{2})(\d{2})(\d{2})$/.exec(normalized);
  return m ? `${m[0].slice(0, 4)} ${m[1]} ${m[2]} ${m[3]}` : normalized;
}

/** True when the number looks like a reachable Algerian mobile (`05`, `06`, `07`). */
export function isValidAlgerianPhone(input: string): boolean {
  return /^0[5-7]\d{8}$/.test(normalizePhone(input));
}

/** Subtotal of an order's lines. */
export function orderSubtotal(order: Order): number {
  return order.items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
}

/** "12 500 DA" for a product, with the strikethrough reference price handled by the caller. */
export function productPriceLabel(product: Product): string {
  return formatDZD(product.price);
}

/** True when the product has a `compareAtPrice` that is actually higher than the price. */
export function hasRealDiscount(product: Pick<Product, "price" | "compareAtPrice">): boolean {
  return (
    typeof product.compareAtPrice === "number" &&
    product.compareAtPrice > 0 &&
    product.compareAtPrice > product.price
  );
}

/** Discount percentage, rounded, or `null` when there is no real discount. */
export function discountPercent(
  product: Pick<Product, "price" | "compareAtPrice">,
): number | null {
  if (!hasRealDiscount(product) || !product.compareAtPrice) return null;
  return Math.round(((product.compareAtPrice - product.price) / product.compareAtPrice) * 100);
}

/** Orders that still need attention, used for the admin stat cards. */
export function countOpenOrders(orders: Order[]): number {
  return orders.filter((o) => o.status !== "cancelled" && o.status !== "delivered").length;
}

/** Revenue from delivered orders, in DZD. */
export function deliveredRevenue(orders: Order[]): number {
  return orders.filter((o) => o.status === "delivered").reduce((s, o) => s + o.total, 0);
}

/** Counts per status, so the admin filter chips can show a badge. */
export function countByStatus(orders: Order[]): Record<OrderStatus, number> {
  const out: Record<OrderStatus, number> = {
    pending: 0,
    confirmed: 0,
    shipped: 0,
    delivered: 0,
    cancelled: 0,
  };
  for (const order of orders) out[order.status] += 1;
  return out;
}

/**
 * Orders placed today (local timezone), newest first.
 * The admin list defaults to this so the shop sees the live activity first.
 */
export function ordersToday(orders: Order[]): Order[] {
  const now = new Date();
  return sortOrders(
    orders.filter((o) => {
      const d = new Date(o.createdAt);
      return (
        d.getFullYear() === now.getFullYear() &&
        d.getMonth() === now.getMonth() &&
        d.getDate() === now.getDate()
      );
    }),
  );
}

/** Newest orders first. */
export function sortOrders(orders: Order[]): Order[] {
  return [...orders].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
}

/** `+213 555 12 34 56` — used to build the WhatsApp deep link. */
export function whatsappNumber(phone: string): string {
  return normalizePhone(phone).replace(/^0/, "213");
}

/** The wilaya an order ships to, resolved defensively. */
export function orderWilayaLabel(order: Order): string {
  return order.wilayaName || wilayaName(order.wilayaCode);
}

/** A wa.me link pre-filled with an order reference, for admin follow-up. */
export function whatsappOrderLink(phone: string, reference: string): string {
  const text = encodeURIComponent(
    `Bonjour THALA SOURCE, je souhaite avoir des informations sur ma commande ${reference}.`,
  );
  return `https://wa.me/${whatsappNumber(phone)}?text=${text}`;
}

/** Where the shop is based — shown in the footer and the order confirmation. */
export const SHOP_ORIGIN_WILAYA = DEFAULT_WILAYA_CODE;
