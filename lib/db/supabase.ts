import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { defaultShippingRates } from "@/lib/shipping";
import { normalizeShopData, type StoreDriver } from "@/lib/db/schema";
import type { ShopData } from "@/lib/types";

/**
 * Production driver: Supabase (Postgres + Storage).
 *
 * Enable it by setting both public env vars in `.env.local` (or in the Vercel
 * project settings) and running `supabase/schema.sql` in the SQL editor:
 *
 *   NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
 *   NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
 *
 * The RLS policies shipped in `supabase/schema.sql` are what make this safe:
 * anyone may read the catalogue and insert an order, but only the holder of the
 * `ADMIN_TOKEN` secret may update products, orders or shipping rates.
 */

const ORDERS_TABLE = "orders";
const PRODUCTS_TABLE = "products";
const SHIPPING_TABLE = "shipping_rates";

export function isSupabaseConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
}

let cachedAnon: SupabaseClient | null = null;
let cachedAdmin: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (cachedAnon) return cachedAnon;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error(
      "Supabase n'est pas configuré. Renseignez NEXT_PUBLIC_SUPABASE_URL et NEXT_PUBLIC_SUPABASE_ANON_KEY.",
    );
  }
  cachedAnon = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cachedAnon;
}

/**
 * Client used for every write.
 *
 * `ADMIN_TOKEN` is the project's **service-role** key (server settings only —
 * never `NEXT_PUBLIC_`, or it would be readable by any visitor). It bypasses RLS,
 * which is what lets the admin edit the catalogue. When it is absent we fall back
 * to the anon key, and the writes simply fail if the policies do not allow them —
 * a loud failure is better than a silently unauthenticated admin.
 */
export function getAdminSupabase(): SupabaseClient {
  if (!process.env.ADMIN_TOKEN) return getSupabase();
  if (cachedAdmin) return cachedAdmin;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) throw new Error("NEXT_PUBLIC_SUPABASE_URL est manquant.");
  cachedAdmin = createClient(url, process.env.ADMIN_TOKEN, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cachedAdmin;
}

export class SupabaseStoreDriver implements StoreDriver {
  readonly mode = "supabase" as const;

  async read(): Promise<ShopData> {
    const supabase = getSupabase();

    const [products, orders, shipping] = await Promise.all([
      supabase.from(PRODUCTS_TABLE).select("*").order("created_at", { ascending: false }),
      supabase.from(ORDERS_TABLE).select("*").order("created_at", { ascending: false }),
      supabase.from(SHIPPING_TABLE).select("*").order("wilaya_code", { ascending: true }),
    ]);

    // A failure here (missing table, bad key, RLS) should surface loudly rather
    // than silently show an empty shop.
    for (const [name, result] of [
      ["products", products],
      ["orders", orders],
      ["shipping_rates", shipping],
    ] as const) {
      if (result.error) {
        throw new Error(
          `Lecture Supabase impossible (${name}): ${result.error.message}. Avez-vous exécuté supabase/schema.sql ?`,
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
      throw new Error(`Écriture Supabase impossible : ${failed.error.message}`);
    }
  }

  async insertOrder(order: ShopData["orders"][number]): Promise<void> {
    const supabase = getAdminSupabase();
    const { error } = await supabase.from(ORDERS_TABLE).insert(orderToRow(order));
    if (error) throw new Error(`Commande non enregistrée : ${error.message}`);
  }

  async updateOrderStatus(id: string, status: string): Promise<void> {
    const supabase = getAdminSupabase();
    const { error } = await supabase.from(ORDERS_TABLE).update({ status }).eq("id", id);
    if (error) throw new Error(`Mise à jour impossible : ${error.message}`);
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
    const { error } = await supabase.from(SHIPPING_TABLE).upsert(
      rates.map((r) => ({ wilaya_code: r.wilayaCode, home: r.home, office: r.office })),
      { onConflict: "wilaya_code" },
    );
    if (error) throw new Error(`Enregistrement des tarifs impossible : ${error.message}`);
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

function productToRow(p: ShopData["products"][number]): Row {
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

function rowToProduct(row: Row): Row {
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
