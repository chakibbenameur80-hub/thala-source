import { NextResponse } from "next/server";
import { wilayaName } from "@/lib/wilayas";
import { calculateShipping, defaultShippingRates } from "@/lib/shipping";
import { createId, createOrderReference } from "@/lib/id";
import { isSupabaseConfigured, SupabaseStoreDriver } from "@/lib/db/supabase";
import { seedProducts } from "@/lib/seed";
import { validateCheckout } from "@/lib/validation";
import type { Order, Product, ShippingRate } from "@/lib/types";

/**
 * `POST /api/orders` — public order placement.
 *
 * Two jobs:
 *   1. Validate the payload server-side (never trust the browser).
 *   2. **Recompute the money server-side.** The unit price comes from the
 *      catalogue and the shipping fee from the wilaya rate table, never from the
 *      request body — otherwise anyone could POST `unitPrice: 1`.
 *
 * Behaviour depends on the configured backend:
 *   - Supabase configured: the order is inserted server-side and returned.
 *   - Local mode (default): the route only validates and returns the order; the
 *     browser persists it in `localStorage` (see `lib/services/shop.ts`).
 */

export const dynamic = "force-dynamic";

/** Small in-memory guard against a single client spamming the endpoint. */
const recent = new Map<string, number>();
const RATE_LIMIT = 5;
const RATE_WINDOW_MS = 60_000;

function throttled(key: string): boolean {
  const now = Date.now();
  const count = (recent.get(key) ?? 0) + 1;
  recent.set(key, count);
  if (count > RATE_LIMIT) return true;
  // Opportunistic cleanup so the Map cannot grow without bound on a long-lived
  // (self-hosted) instance.
  if (recent.size > 500) {
    for (const [k, at] of recent) {
      if (now - at > RATE_WINDOW_MS) recent.delete(k);
    }
  }
  return false;
}

export async function POST(request: Request) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (throttled(ip)) {
    return NextResponse.json(
      { error: "Trop de demandes. Merci de réessayer dans une minute." },
      { status: 429 },
    );
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  }

  const parsed = validateCheckout(body);
  if (!parsed.ok) {
    return NextResponse.json({ error: "Données invalides.", fields: parsed.errors }, { status: 422 });
  }
  const input = parsed.value;

  const productId = typeof body.productId === "string" ? body.productId : "";
  if (!productId) {
    return NextResponse.json({ error: "Article manquant." }, { status: 422 });
  }

  // Load the catalogue + rate table from whichever backend is live, so the
  // prices used below are always the shop's real ones.
  let products: Product[];
  let shipping: ShippingRate[];
  if (isSupabaseConfigured()) {
    try {
      const data = await new SupabaseStoreDriver().read();
      products = data.products;
      shipping = data.shipping;
    } catch (error) {
      console.error("[thala] commande: lecture catalogue impossible", error);
      return NextResponse.json(
        { error: "Service momentanément indisponible. Merci de réessayer." },
        { status: 503 },
      );
    }
  } else {
    products = seedProducts();
    shipping = defaultShippingRates();
  }

  const product = products.find((p) => p.id === productId);
  if (!product) {
    return NextResponse.json({ error: "Article introuvable." }, { status: 404 });
  }
  if (!product.inStock) {
    return NextResponse.json({ error: "Cet article n'est plus disponible." }, { status: 409 });
  }
  if (!product.sizes.includes(input.size)) {
    return NextResponse.json(
      { error: `La taille ${input.size} n'est pas disponible pour cet article.` },
      { status: 409 },
    );
  }

  const unitPrice = product.price;
  const subtotal = unitPrice * input.quantity;
  const shippingQuote = calculateShipping(
    shipping,
    input.wilayaCode,
    input.deliveryType,
    subtotal,
  );
  const total = subtotal + shippingQuote.price;

  const order: Order = {
    id: createId("ord"),
    reference: createOrderReference(),
    createdAt: new Date().toISOString(),
    status: "pending",
    customerName: input.customerName,
    phone: input.phone,
    wilayaCode: input.wilayaCode,
    wilayaName: wilayaName(input.wilayaCode),
    commune: input.commune,
    deliveryType: input.deliveryType,
    shippingPrice: shippingQuote.price,
    items: [
      {
        productId: product.id,
        productTitle: product.title,
        productImage: product.images[0],
        size: input.size,
        unitPrice,
        quantity: input.quantity,
      },
    ],
    subtotal,
    total,
    note: input.note,
  };

  if (isSupabaseConfigured()) {
    try {
      await new SupabaseStoreDriver().insertOrder(order);
    } catch (error) {
      console.error("[thala] commande: insertion impossible", error);
      return NextResponse.json(
        { error: "Commande non enregistrée. Merci de réessayer." },
        { status: 503 },
      );
    }
  }

  return NextResponse.json({ order, persisted: isSupabaseConfigured() }, { status: 201 });
}
