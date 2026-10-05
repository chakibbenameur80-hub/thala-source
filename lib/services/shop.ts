import { IS_SUPABASE, LocalStoreDriver, SupabaseStoreDriver } from "@/lib/db";
import { calculateShipping } from "@/lib/shipping";
import { wilayaName } from "@/lib/wilayas";
import { createId, createOrderReference } from "@/lib/id";
import { validateCheckout, type FieldErrors } from "@/lib/validation";
import type { CheckoutInput, Order, Product, ShippingRate, ShopData } from "@/lib/types";

/**
 * Client-side service layer.
 *
 * This is the only module that knows whether the shop runs on `localStorage` or
 * on Supabase. Components call `getShop()`, `placeOrder()`, `createProduct()`…
 * and never branch on the backend themselves.
 *
 * Every mutation is followed by a `read()` so the caller always renders exactly
 * what was persisted, never an optimistic guess.
 */

const local = new LocalStoreDriver();

export function isLocalMode(): boolean {
  return !IS_SUPABASE;
}

/** Full shop state from whichever backend is live. */
export async function getShop(): Promise<ShopData> {
  if (IS_SUPABASE) {
    return new SupabaseStoreDriver().read();
  }
  return local.read();
}

/* ------------------------------------------------------------------ *
 * Products
 * ------------------------------------------------------------------ */

/**
 * Adds a new product to the catalogue.
 *
 * `id` is assigned here (not by the caller) so a client can never accidentally
 * overwrite an existing record by guessing an id.
 */
export async function createProduct(
  input: Omit<Product, "id" | "createdAt" | "updatedAt">,
): Promise<Product> {
  const now = new Date().toISOString();
  const record: Product = { ...input, id: createId("prd"), createdAt: now, updatedAt: now };

  if (IS_SUPABASE) {
    const response = await fetch("/api/products", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(record),
    });
    if (!response.ok) throw new Error((await response.json()).error ?? "Création impossible.");
    return record;
  }

  const shop = local.readSync();
  local.writeSync({ ...shop, products: [record, ...shop.products] });
  return record;
}

/**
 * Updates an existing product.
 *
 * Only `id` and the editable fields are taken, so the original `createdAt` and
 * the record's identity can never be overwritten by a stale client payload.
 */
export async function updateProduct(
  id: string,
  input: Omit<Product, "id" | "createdAt" | "updatedAt">,
): Promise<Product> {
  const existing = IS_SUPABASE
    ? null
    : local.readSync().products.find((p) => p.id === id);
  if (!IS_SUPABASE && !existing) throw new Error("Produit introuvable.");

  const record: Product = {
    ...input,
    id,
    createdAt: existing?.createdAt ?? new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  if (IS_SUPABASE) {
    const response = await fetch(`/api/products/${encodeURIComponent(id)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(record),
    });
    if (!response.ok) throw new Error((await response.json()).error ?? "Enregistrement impossible.");
    return record;
  }

  const shop = local.readSync();
  local.writeSync({
    ...shop,
    products: shop.products.map((p) => (p.id === id ? record : p)),
  });
  return record;
}

export async function deleteProduct(id: string): Promise<void> {
  if (IS_SUPABASE) {
    const response = await fetch(`/api/products/${encodeURIComponent(id)}`, { method: "DELETE" });
    if (!response.ok) throw new Error((await response.json()).error ?? "Suppression impossible.");
    return;
  }
  const shop = local.readSync();
  local.writeSync({ ...shop, products: shop.products.filter((p) => p.id !== id) });
}

/**
 * Deletes a stored image.
 *
 * Only meaningful with Supabase: in local mode the browser holds the catalogue
 * and the images were never on the server, so there is nothing to clean up. The
 * server ignores URLs that are not objects we uploaded, so calling this on one of
 * the repo's own `/images/...` assets is a harmless no-op.
 *
 * Never throws. Callers are already showing the user a success state, and failing
 * here would leave them staring at an error for something cosmetic.
 */
export async function removeImage(url: string): Promise<void> {
  if (!IS_SUPABASE) return;
  try {
    await fetch("/api/upload", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url }),
    });
  } catch {
    // Best effort: see above.
  }
}

/* ------------------------------------------------------------------ *
 * Orders
 * ------------------------------------------------------------------ */

export type PlaceOrderResult =
  | { ok: true; order: Order }
  | { ok: false; message: string; fields?: FieldErrors };

/**
 * Places an order.
 *
 * With Supabase: the server validates, recomputes the prices from the database
 * and inserts the row — the browser never decides what to charge.
 *
 * In local mode: the server is bypassed (it cannot see local products), so the
 * same `validateCheckout` + `calculateShipping` logic runs in the browser and the
 * order is persisted to `localStorage`.
 */
export async function placeOrder(
  product: Product,
  input: CheckoutInput,
  rates: ShippingRate[],
): Promise<PlaceOrderResult> {
  if (IS_SUPABASE) {
    try {
      const response = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...input, productId: product.id }),
      });
      const data = await response.json();
      if (!response.ok) {
        return { ok: false, message: data.error ?? "Commande non enregistrée.", fields: data.fields };
      }
      return { ok: true, order: data.order as Order };
    } catch {
      return { ok: false, message: "Connexion impossible. Vérifiez votre réseau et réessayez." };
    }
  }

  const parsed = validateCheckout(input);
  if (!parsed.ok) {
    return {
      ok: false,
      message: "Certains champs sont incorrects.",
      fields: parsed.errors,
    };
  }
  if (!product.inStock) {
    return { ok: false, message: "Cet article n'est plus disponible." };
  }
  if (!product.sizes.includes(parsed.value.size)) {
    return {
      ok: false,
      message: `La taille ${parsed.value.size} n'est plus disponible pour cette robe.`,
      fields: { size: "Taille indisponible." },
    };
  }

  const subtotal = product.price * parsed.value.quantity;
  const shipping = calculateShipping(rates, parsed.value.wilayaCode, parsed.value.deliveryType, subtotal);

  const order: Order = {
    id: createId("ord"),
    reference: createOrderReference(),
    createdAt: new Date().toISOString(),
    status: "pending",
    customerName: parsed.value.customerName,
    phone: parsed.value.phone,
    wilayaCode: parsed.value.wilayaCode,
    wilayaName: wilayaName(parsed.value.wilayaCode),
    commune: parsed.value.commune,
    deliveryType: parsed.value.deliveryType,
    shippingPrice: shipping.price,
    items: [
      {
        productId: product.id,
        productTitle: product.title,
        productImage: product.images[0],
        size: parsed.value.size,
        unitPrice: product.price,
        quantity: parsed.value.quantity,
      },
    ],
    subtotal,
    total: subtotal + shipping.price,
    note: parsed.value.note,
  };

  try {
    const shop = local.readSync();
    local.writeSync({ ...shop, orders: [order, ...shop.orders] });
    return { ok: true, order };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "Commande non enregistrée.",
    };
  }
}

export async function updateOrderStatus(id: string, status: Order["status"]): Promise<void> {
  if (IS_SUPABASE) {
    const response = await fetch(`/api/orders/${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    if (!response.ok) throw new Error((await response.json()).error ?? "Mise à jour impossible.");
    return;
  }
  const shop = local.readSync();
  local.writeSync({
    ...shop,
    orders: shop.orders.map((o) => (o.id === id ? { ...o, status } : o)),
  });
}

export async function removeOrder(id: string): Promise<void> {
  if (IS_SUPABASE) {
    const response = await fetch(`/api/orders/${encodeURIComponent(id)}`, { method: "DELETE" });
    if (!response.ok) throw new Error((await response.json()).error ?? "Suppression impossible.");
    return;
  }
  const shop = local.readSync();
  local.writeSync({ ...shop, orders: shop.orders.filter((o) => o.id !== id) });
}

/* ------------------------------------------------------------------ *
 * Shipping
 * ------------------------------------------------------------------ */

export async function saveShippingRates(rates: ShippingRate[]): Promise<void> {
  if (IS_SUPABASE) {
    const response = await fetch("/api/shipping", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rates }),
    });
    if (!response.ok) throw new Error((await response.json()).error ?? "Enregistrement impossible.");
    return;
  }
  const shop = local.readSync();
  local.writeSync({ ...shop, shipping: rates });
}

/**
 * `priceFor(rates, code, type, subtotal)` — exposed so the product card can show
 * "livraison dès X DA" without duplicating the calculation.
 */
export { calculateShipping };
