/**
 * THALA SOURCE — Core domain types.
 *
 * These types are the single source of truth shared by:
 *   - the storefront (customer facing pages)
 *   - the admin dashboard
 *   - the persistence layer (localStorage driver / Supabase driver)
 *
 * Keeping them in one place means the JSON schema, the Supabase SQL schema
 * (see `supabase/schema.sql`) and the UI can never drift apart silently.
 */

/** Dress sizes offered by the shop. `CUSTOM` = made to the customer's measurements. */
export const SIZES = ["S", "M", "L", "XL", "CUSTOM"] as const;
export type Size = (typeof SIZES)[number];

/**
 * How the order is delivered.
 * - `office` => التوصيل للمكتب (pickup at the delivery company's desk)
 * - `home`   => التوصيل للمنزل (door to door)
 */
export const DELIVERY_TYPES = ["office", "home"] as const;
export type DeliveryType = (typeof DELIVERY_TYPES)[number];

/** Order lifecycle. `cancelled` is kept so an admin can void an order without deleting history. */
export const ORDER_STATUSES = [
  "pending",
  "confirmed",
  "shipped",
  "delivered",
  "cancelled",
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export type Product = {
  id: string;
  /** Display name, e.g. "Robe Kablye Iferhounen". */
  title: string;
  /** Optional one-liner shown under the title. */
  subtitle?: string;
  /** Long description, markdown-lite (plain text + line breaks). */
  description?: string;
  /** Unit price in Algerian Dinars (DZD). Always an integer. */
  price: number;
  /** Optional "was" price used to display a discount badge. */
  compareAtPrice?: number | null;
  /** Absolute paths (`/images/...`) or full remote URLs. First entry is the cover. */
  images: string[];
  sizes: Size[];
  /** Featured products are highlighted in the hero / first row of the catalog. */
  featured: boolean;
  inStock: boolean;
  createdAt: string;
  updatedAt: string;
};

/** Shipping price for a single wilaya, in DZD, per delivery method. */
export type ShippingRate = {
  /** 1..58, matches the official Algerian wilaya code. */
  wilayaCode: number;
  home: number;
  office: number;
};

/** One line of the order. Kept denormalised so historical orders survive product edits. */
export type OrderItem = {
  productId: string;
  productTitle: string;
  productImage?: string;
  size: Size;
  /** Price of the product at the moment the order was placed. */
  unitPrice: number;
  quantity: number;
};

export type Order = {
  id: string;
  /** Short human-readable reference, e.g. `TS-7K4Q2M`. Shown to the customer. */
  reference: string;
  createdAt: string;
  status: OrderStatus;
  /** الاسم واللقب */
  customerName: string;
  /** رقم الهاتف */
  phone: string;
  wilayaCode: number;
  /** Denormalised so an order still reads correctly if the wilaya list ever changes. */
  wilayaName: string;
  commune?: string;
  deliveryType: DeliveryType;
  /** Shipping cost charged for this order, in DZD. */
  shippingPrice: number;
  items: OrderItem[];
  /** Sum of item lines, in DZD. */
  subtotal: number;
  /** subtotal + shippingPrice, in DZD. */
  total: number;
  /** Free-form note from the customer (measurements for CUSTOM, preferred call time, ...). */
  note?: string;
};

/** The complete persisted state of the shop. */
export type ShopData = {
  products: Product[];
  orders: Order[];
  shipping: ShippingRate[];
};

/** What the customer fills in the checkout form. */
export type CheckoutInput = {
  customerName: string;
  phone: string;
  wilayaCode: number;
  commune?: string;
  deliveryType: DeliveryType;
  size: Size;
  quantity: number;
  note?: string;
};

/** Human readable labels — bilingual, so the UI never hard-codes strings. */
export const SIZE_LABELS: Record<Size, { fr: string; ar: string }> = {
  S: { fr: "S", ar: "S" },
  M: { fr: "M", ar: "M" },
  L: { fr: "L", ar: "L" },
  XL: { fr: "XL", ar: "XL" },
  CUSTOM: { fr: "Sur mesure", ar: "مقاس مخصص" },
};

export const DELIVERY_LABELS: Record<DeliveryType, { fr: string; ar: string }> = {
  office: { fr: "Livraison au bureau", ar: "التوصيل للمكتب" },
  home: { fr: "Livraison à domicile", ar: "التوصيل للمنزل" },
};

export const STATUS_LABELS: Record<OrderStatus, { fr: string; ar: string }> = {
  pending: { fr: "En attente", ar: "قيد الانتظار" },
  confirmed: { fr: "Confirmée", ar: "مؤكدة" },
  shipped: { fr: "Expédiée", ar: "تم الإرسال" },
  delivered: { fr: "Livrée", ar: "تم التسليم" },
  cancelled: { fr: "Annulée", ar: "ملغاة" },
};

/** Tailwind classes per status, used by the badges in the orders table. */
export const STATUS_BADGE_CLASS: Record<OrderStatus, string> = {
  pending: "bg-amber-500/15 text-amber-200 ring-amber-400/30",
  confirmed: "bg-sky-500/15 text-sky-200 ring-sky-400/30",
  shipped: "bg-violet-500/15 text-violet-200 ring-violet-400/30",
  delivered: "bg-emerald-500/15 text-emerald-200 ring-emerald-400/30",
  cancelled: "bg-rose-500/15 text-rose-200 ring-rose-400/30",
};
