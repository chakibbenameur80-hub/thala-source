import { defaultShippingRates } from "@/lib/shipping";
import { seedProducts } from "@/lib/seed";
import type { Order, OrderItem, Product, ShippingRate, ShopData } from "@/lib/types";

/**
 * Persistence contract.
 *
 * The app never talks to `localStorage` or Supabase directly — it always goes
 * through this interface (see `lib/db/index.ts`). That is what makes the
 * "works offline with zero config" prototype and the "real database" deployment
 * share 100% of the same UI code.
 *
 * Read-only on purpose: there is deliberately no "write the whole shop" method.
 * A blanket replace would have to upsert every row *and* delete every id absent
 * from the payload, which turns one bad id into a silent wipe and needs a
 * hand-built `not in (...)` filter. Admin changes go through the targeted
 * routes instead (`POST`/`PUT`/`DELETE` on products, orders and shipping), each
 * of which validates a single record and reports precisely what it did.
 */
export interface StoreDriver {
  readonly mode: "local" | "supabase";
  read(): Promise<ShopData>;
}

/** A brand-new, unpersisted shop state. */
export function emptyShopData(): ShopData {
  return {
    products: seedProducts(),
    orders: [],
    shipping: defaultShippingRates(),
  };
}

/**
 * Defensive normalisation.
 *
 * Everything read out of `localStorage` is attacker-ish input from the app's own
 * point of view: a user can edit it, an old version of the app may have written
 * a shape we no longer support, etc. Rather than let a malformed record crash a
 * render, we coerce it back to a valid shape here.
 */
export function normalizeShopData(input: unknown): ShopData {
  const base = emptyShopData();
  if (!input || typeof input !== "object") return base;

  const raw = input as Partial<ShopData>;

  const products = Array.isArray(raw.products)
    ? raw.products.map(normalizeProduct).filter((p): p is Product => p !== null)
    : base.products;

  const orders = Array.isArray(raw.orders)
    ? raw.orders.map(normalizeOrder).filter((o): o is Order => o !== null)
    : base.orders;

  const shipping = Array.isArray(raw.shipping)
    ? normalizeShipping(raw.shipping, base.shipping)
    : base.shipping;

  return { products, orders, shipping };
}

function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function asNumber(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
}

const VALID_SIZES = new Set(["S", "M", "L", "XL", "CUSTOM"]);
const VALID_STATUSES = new Set(["pending", "confirmed", "shipped", "delivered", "cancelled"]);

function normalizeProduct(input: unknown): Product | null {
  if (!input || typeof input !== "object") return null;
  const p = input as Record<string, unknown>;
  const id = asString(p.id);
  const title = asString(p.title);
  if (!id || !title) return null;

  const createdAt = asString(p.createdAt, new Date().toISOString());
  return {
    id,
    title,
    subtitle: asString(p.subtitle) || undefined,
    description: asString(p.description) || undefined,
    price: Math.max(0, Math.round(asNumber(p.price))),
    compareAtPrice:
      typeof p.compareAtPrice === "number" && p.compareAtPrice > 0
        ? Math.round(p.compareAtPrice)
        : null,
    images: asStringArray(p.images),
    sizes: (Array.isArray(p.sizes) ? p.sizes : []).filter((s): s is Product["sizes"][number] =>
      VALID_SIZES.has(s as string),
    ),
    featured: p.featured === true,
    inStock: p.inStock !== false,
    createdAt,
    updatedAt: asString(p.updatedAt, createdAt),
  };
}

function normalizeOrder(input: unknown): Order | null {
  if (!input || typeof input !== "object") return null;
  const o = input as Record<string, unknown>;
  const id = asString(o.id);
  if (!id) return null;

  const items: OrderItem[] = Array.isArray(o.items)
    ? o.items
        .map((raw): OrderItem | null => {
          if (!raw || typeof raw !== "object") return null;
          const i = raw as Record<string, unknown>;
          const size = asString(i.size, "M");
          return {
            productId: asString(i.productId),
            productTitle: asString(i.productTitle, "Article"),
            productImage: asString(i.productImage) || undefined,
            size: (VALID_SIZES.has(size) ? size : "M") as OrderItem["size"],
            unitPrice: Math.max(0, Math.round(asNumber(i.unitPrice))),
            quantity: Math.max(1, Math.round(asNumber(i.quantity, 1))),
          };
        })
        .filter((v): v is OrderItem => v !== null)
    : [];

  const subtotal = asNumber(o.subtotal, items.reduce((s, i) => s + i.unitPrice * i.quantity, 0));

  return {
    id,
    reference: asString(o.reference, id.slice(0, 8).toUpperCase()),
    createdAt: asString(o.createdAt, new Date().toISOString()),
    status: (VALID_STATUSES.has(asString(o.status))
      ? asString(o.status)
      : "pending") as Order["status"],
    customerName: asString(o.customerName, "Client"),
    phone: asString(o.phone),
    wilayaCode: asNumber(o.wilayaCode, 16),
    wilayaName: asString(o.wilayaName),
    commune: asString(o.commune) || undefined,
    deliveryType: asString(o.deliveryType) === "home" ? "home" : "office",
    shippingPrice: Math.max(0, Math.round(asNumber(o.shippingPrice))),
    items,
    subtotal,
    total: Math.max(0, Math.round(asNumber(o.total, subtotal))),
    note: asString(o.note) || undefined,
  };
}

/**
 * Guarantees exactly one rate per wilaya.
 * A wilaya missing from storage (added to the list after the shop was created)
 * gets the default price instead of `undefined`, so the checkout can never
 * compute `NaN` for a delivery fee.
 */
function normalizeShipping(input: unknown[], defaults: ShippingRate[]): ShippingRate[] {
  const byCode = new Map<number, ShippingRate>();
  for (const raw of input) {
    if (!raw || typeof raw !== "object") continue;
    const r = raw as Record<string, unknown>;
    const code = asNumber(r.wilayaCode, -1);
    if (code < 1 || code > 58) continue;
    byCode.set(code, {
      wilayaCode: code,
      home: Math.max(0, Math.round(asNumber(r.home))),
      office: Math.max(0, Math.round(asNumber(r.office))),
    });
  }
  return defaults.map(
    (fallback) => byCode.get(fallback.wilayaCode) ?? { ...fallback },
  );
}
