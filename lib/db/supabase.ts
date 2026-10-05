import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { defaultShippingRates } from "@/lib/shipping";
import { normalizeShopData, type StoreDriver } from "@/lib/db/schema";
import { isSupabaseAdminConfigured, supabaseUrl } from "@/lib/db/config";
import type { ShopData } from "@/lib/types";

/**
 * Production driver: Supabase (Postgres + Storage).
 *
 * ## `server-only`
 *
 * The `import "server-only"` on the first line is a build-time guard, not a
 * comment: if any client component ever imports this module, `next build` fails
 * with "This module cannot be imported from a Client Component module". That is
 * deliberate. This file reads `ADMIN_TOKEN`, the project's **service-role** key,
 * and a service-role key in the browser is a full bypass of Row Level Security â€”
 * anyone could rewrite the catalogue or read every customer's order.
 *
 * The browser reaches the database only through Route Handlers, which check the
 * admin session cookie first (see `lib/api.ts`).
 *
 * ## Enabling it
 *
 * Set the public pair so the storefront can read the catalogue, plus
 * `ADMIN_TOKEN` for anything that writes, then run `supabase/schema.sql` once in
 * the Supabase SQL editor:
 *
 *   NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
 *   NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
 *   ADMIN_TOKEN=eyJ...            <- service_role, server settings only
 *
 * The anon key is deliberately public: RLS is what protects the data, and
 * `supabase/schema.sql` grants it read-only access to the catalogue.
 */

const ORDERS_TABLE = "orders";
const PRODUCTS_TABLE = "products";
const SHIPPING_TABLE = "shipping_rates";

/**
 * Missing-admin-configuration message.
 *
 * Named separately from the read path's error because the two failures mean
 * different things to whoever has to fix them, and the fix is different: this one
 * is always `ADMIN_TOKEN`, which the read path does not need.
 */
export function adminTokenMissing(): string {
  return isSupabaseAdminConfigured()
    ? ""
    : "ADMIN_TOKEN (clأ© service_role) est manquant. Ajoutez-le dans les variables d'environnement Vercel, puis redأ©ployez.";
}

let cachedAnon: SupabaseClient | null = null;
let cachedAdmin: SupabaseClient | null = null;

/**
 * Public, read-only client.
 *
 * RLS decides what this can see: the catalogue and the shipping rates, nothing
 * else. The orders table is invisible to it by design.
 */
export function getSupabase(): SupabaseClient {
  if (cachedAnon) return cachedAnon;
  const url = supabaseUrl();
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error(
      "Supabase n'est pas configurأ©. Renseignez NEXT_PUBLIC_SUPABASE_URL et NEXT_PUBLIC_SUPABASE_ANON_KEY.",
    );
  }
  cachedAnon = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cachedAnon;
}

/**
 * Service-role client, for every write and for reading orders.
 *
 * Bypasses RLS, which is why it must never be constructed from client code. When
 * `ADMIN_TOKEN` is absent this throws rather than silently falling back to the
 * anon key: a silent fallback turns "you forgot to set a variable" into "your
 * writes are rejected by RLS", which reads like a database bug instead of a
 * missing secret.
 */
export function getAdminSupabase(): SupabaseClient {
  if (!isSupabaseAdminConfigured()) throw new Error(adminTokenMissing());
  if (cachedAdmin) return cachedAdmin;
  const url = supabaseUrl();
  if (!url) throw new Error("NEXT_PUBLIC_SUPABASE_URL est manquant.");
  cachedAdmin = createClient(url, process.env.ADMIN_TOKEN!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cachedAdmin;
}

export class SupabaseStoreDriver implements StoreDriver {
  readonly mode = "supabase" as const;

  /**
   * Public read: catalogue + shipping rates, no orders.
   *
   * Uses the anon client, so it works on the storefront without any secret
   * being involved. Deliberately does **not** read `orders` â€” the anon key cannot,
   * and asking for it would make every public request fail.
   */
  async readPublic(): Promise<ShopData> {
    const supabase = getSupabase();

    const [products, shipping] = await Promise.all([
      supabase.from(PRODUCTS_TABLE).select("*").order("created_at", { ascending: false }),
      supabase.from(SHIPPING_TABLE).select("*").order("wilaya_code", { ascending: true }),
    ]);

    // A failure here (missing table, bad key, RLS) should surface loudly rather
    // than silently showing an empty shop.
    for (const [name, result] of [
      ["products", products],
      ["shipping_rates", shipping],
    ] as const) {
      if (result.error) {
        throw new Error(
          `Lecture Supabase impossible (${name}): ${result.error.message}. Avez-vous exأ©cutأ© supabase/schema.sql ?`,
        );
      }
    }

    return normalizeShopData({
      products: (products.data ?? []).map(rowToProduct),
      // Orders are admin-only; the storefront never needs them.
      orders: [],
      shipping: shipping.data ?? defaultShippingRates(),
    });
  }

  /**
   * Full read, including orders â€” admin only.
   *
   * Uses the service-role client because RLS grants order reads to nothing but
   * `service_role`. Callers must be behind the admin session check; see
   * `GET /api/shop`, which is the only route that exposes this to a browser.
   */
  async read(): Promise<ShopData> {
    const supabase = getAdminSupabase();

    const [products, orders, shipping] = await Promise.all([
      supabase.from(PRODUCTS_TABLE).select("*").order("created_at", { ascending: false }),
      supabase.from(ORDERS_TABLE).select("*").order("created_at", { ascending: false }),
      supabase.from(SHIPPING_TABLE).select("*").order("wilaya_code", { ascending: true }),
    ]);

    for (const [name, result] of [
      ["products", products],
      ["orders", orders],
      ["shipping_rates", shipping],
    ] as const) {
      if (result.error) {
        throw new Error(
          `Lecture Supabase impossible (${name}): ${result.error.message}. Avez-vous exأ©cutأ© supabase/schema.sql ?`,
        );
      }
    }

    return normalizeShopData({
      products: (products.data ?? []).map(rowToProduct),
      orders: (orders.data ?? []).map(rowToOrder),
      shipping: shipping.data ?? defaultShippingRates(),
    });
  }

  /**
   * Full-state write.
   *
   * Used by the admin for "apply everything" style operations. Because PostgREST
   * has no multi-statement transaction, each table is written in its own batch;
   * a partial failure is reported instead of being hidden.
   */
  async write(next: ShopData): Promise<void> {
    const supabase = getAdminSupabase();

    const shippingRows = next.shipping.map((rate) => ({
      wilaya_code: rate.wilayaCode,
      home: rate.home,
      office: rate.office,
    }));

    const productUpsert = supabase.from(PRODUCTS_TABLE).upsert(
      next.products.map(productToRow),
      { onConflict: "id" },
    );
    const shippingUpsert = supabase.from(SHIPPING_TABLE).upsert(shippingRows, {
      onConflict: "wilaya_code",
    });
    const ids = next.products.map((p) => p.id);
    const productDelete = supabase
      .from(PRODUCTS_TABLE)
      .delete()
      .not("id", "in", `(${ids.length ? ids.join(",") : '""'})`);

    const results = await Promise.all([productUpsert, shippingUpsert, productDelete]);
    const failed = results.find((r) => r.error);
    if (failed?.error) {
      throw new Error(`أ‰criture Supabase impossible : ${failed.error.message}`);
    }
  }

  async insertOrder(order: ShopData["orders"][number]): Promise<void> {
    const supabase = getAdminSupabase();
    const { error } = await supabase.from(ORDERS_TABLE).insert(orderToRow(order));
    if (error) throw new Error(`Commande non enregistrأ©e : ${error.message}`);
  }

  async updateOrderStatus(id: string, status: string): Promise<void> {
    const supabase = getAdminSupabase();
    const { error } = await supabase.from(ORDERS_TABLE).update({ status }).eq("id", id);
    if (error) throw new Error(`Mise أ  jour impossible : ${error.message}`);
  }

  async deleteOrder(id: string): Promise<void> {
    const supabase = getAdminSupabase();
    const { error } = await supabase.from(ORDERS_TABLE).delete().eq("id", id);
    if (error) throw new Error(`Suppression impossible : ${error.message}`);
  }

  async upsertProduct(product: ShopData["products"][number]): Promise<void> {
    const supabase = getAdminSupabase();
    const { error } = await supabase
      .from(PRODUCTS_TABLE)
      .upsert(productToRow(product), { onConflict: "id" });
    if (error) throw new Error(`Enregistrement du produit impossible : ${error.message}`);
  }

  async deleteProduct(id: string): Promise<void> {
    const supabase = getAdminSupabase();
    const { error } = await supabase.from(PRODUCTS_TABLE).delete().eq("id", id);
    if (error) throw new Error(`Suppression du produit impossible : ${error.message}`);
  }

  async putShipping(rates: ShopData["shipping"]): Promise<void> {
    const supabase = getAdminSupabase();
    const { error } = await supabase
      .from(SHIPPING_TABLE)
      .upsert(
        rates.map((r) => ({ wilaya_code: r.wilayaCode, home: r.home, office: r.office })),
        { onConflict: "wilaya_code" },
      );
    if (error) throw new Error(`Enregistrement des tarifs impossible : ${error.message}`);
  }

  /**
   * Products whose `images` array still contains `url`.
   *
   * The check that makes image deletion safe. An image can legitimately be
   * referenced by more than one product (the seed catalogue reuses its two
   * covers), so "delete this object" has to be answered against the current
   * catalogue, not against the record the admin happened to be editing.
   */
  async productsUsingImage(url: string): Promise<{ id: string; title: string }[]> {
    const supabase = getAdminSupabase();
    const { data, error } = await supabase
      .from(PRODUCTS_TABLE)
      .select("id, title, images")
      .contains("images", JSON.stringify([url]));
    if (error) {
      // Refusing to delete is the safe failure mode: an orphaned object costs
      // storage, a deleted-but-referenced image is a broken photo on the shop.
      throw new Error(`Vérification des références impossible : ${error.message}`);
    }
    return (data ?? [])
      .map((row) => ({ id: String(row.id ?? ""), title: String(row.title ?? "") }))
      .filter((row) => row.id !== "");
  }
}

/* ------------------------------------------------------------------ *
 * Row <-> domain mappers.
 *
 * The database uses snake_case columns and proper SQL types (jsonb, uuid);
 * the app uses camelCase and plain JSON. These two functions are the only
 * place that translation lives.
 * ------------------------------------------------------------------ */

type Row = Record<string, unknown>;

export function productToRow(p: ShopData["products"][number]): Row {
  return {
    id: p.id,
    title: p.title,
    subtitle: p.subtitle ?? null,
    description: p.description ?? null,
    price: p.price,
    compare_at_price: p.compareAtPrice ?? null,
    images: p.images,
    sizes: p.sizes,
    featured: p.featured,
    in_stock: p.inStock,
    created_at: p.createdAt,
    updated_at: p.updatedAt,
  };
}

export function rowToProduct(row: Row): Row {
  return {
    id: row.id,
    title: row.title,
    subtitle: row.subtitle ?? undefined,
    description: row.description ?? undefined,
    price: row.price,
    compareAtPrice: row.compare_at_price ?? null,
    images: row.images ?? [],
    sizes: row.sizes ?? [],
    featured: row.featured === true,
    inStock: row.in_stock !== false,
    createdAt: row.created_at,
    updatedAt: row.updated_at ?? row.created_at,
  };
}

function orderToRow(o: ShopData["orders"][number]): Row {
  return {
    id: o.id,
    reference: o.reference,
    created_at: o.createdAt,
    status: o.status,
    customer_name: o.customerName,
    phone: o.phone,
    wilaya_code: o.wilayaCode,
    wilaya_name: o.wilayaName,
    commune: o.commune ?? null,
    delivery_type: o.deliveryType,
    shipping_price: o.shippingPrice,
    items: o.items,
    subtotal: o.subtotal,
    total: o.total,
    note: o.note ?? null,
  };
}

function rowToOrder(row: Row): Row {
  return {
    id: row.id,
    reference: row.reference,
    createdAt: row.created_at,
    status: row.status,
    customerName: row.customer_name,
    phone: row.phone,
    wilayaCode: row.wilaya_code,
    wilayaName: row.wilaya_name,
    commune: row.commune ?? undefined,
    deliveryType: row.delivery_type,
    shippingPrice: row.shipping_price,
    items: row.items ?? [],
    subtotal: row.subtotal,
    total: row.total,
    note: row.note ?? undefined,
  };
}

/** Re-exported so server code has one import surface for the driver. */
export { isSupabaseConfigured } from "@/lib/db/config";
