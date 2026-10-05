import { NextResponse } from "next/server";
import { wilayaName } from "@/lib/wilayas";
import { calculateShipping, defaultShippingRates } from "@/lib/shipping";
import { createId, createOrderReference } from "@/lib/id";
import { isSupabaseConfigured, ReferenceCollisionError, SupabaseStoreDriver } from "@/lib/db/supabase";
import { seedProducts } from "@/lib/seed";
import { createRateLimiter } from "@/lib/rate-limit";
import { MAX_QUANTITY, validateCheckout } from "@/lib/validation";
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

/** Redraws allowed on a UNIQUE `orders.reference` clash before giving up. */
const REFERENCE_ATTEMPTS = 3;

/**
 * In-memory guard against one client spamming checkout: 5 orders per minute per IP.
 *
 * The window is per serverless instance, not global, so it is a courtesy brake
 * against a runaway script rather than a hard guarantee — a determined attacker
 * spreads load across instances. What it does buy is that the limiter itself
 * cannot become an outage: `createRateLimiter` is a sliding window, so a real
 * customer who places six orders is throttled for a few seconds, not forever.
 */
const rateLimiter = createRateLimiter({ limit: 5, windowMs: 60_000 });

export async function POST(request: Request) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const limit = rateLimiter.hit(ip);
  if (limit.limited) {
    return NextResponse.json(
      { error: "Trop de commandes envoyées d'affilée. Réessayez dans un instant." },
      {
        status: 429,
        headers: { "Retry-After": String(limit.retryAfterSeconds) },
      },
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

  // Quantity is clamped by the validator rather than rejected, so an absurd value
  // becomes a sane order instead of an error. A quantity above the cap means the
  // client is not a real storefront, so refuse it outright instead of silently
  // turning a 999-unit request into a 10-unit order.
  if (Number(body.quantity) > MAX_QUANTITY) {
    return NextResponse.json(
      { error: `Quantité maximale : ${MAX_QUANTITY} par commande.`, fields: { quantity: "Quantité trop élevée." } },
      { status: 422 },
    );
  }

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
      const data = await new SupabaseStoreDriver().readPublic();
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
    // Local mode. The server has no access to the browser's catalogue, so the best
    // it can do is the seed list — which is what a first-run visitor sees anyway.
    // Flagged in the response so a caller that cares can tell.
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

  let order: Order = {
    id: createId("ord"),
    reference: "",
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

  const persisted = isSupabaseConfigured();
  if (persisted) {
    // `orders.reference` is UNIQUE. Drawing one that is already taken is a
    // coin-flip, not a failure worth showing the customer, so redraw with a
    // longer reference and try again. Anything else (missing ADMIN_TOKEN, RLS,
    // network) is a real failure and must surface as a 503.
    const driver = new SupabaseStoreDriver();
    let reference: string | undefined;
    for (let attempt = 0; attempt < REFERENCE_ATTEMPTS; attempt += 1) {
      const candidate = createOrderReference(attempt);
      try {
        await driver.insertOrder({ ...order, reference: candidate });
        reference = candidate;
        break;
      } catch (cause) {
        if (cause instanceof ReferenceCollisionError && attempt < REFERENCE_ATTEMPTS - 1) {
          continue;
        }
        console.error("[thala] commande: insertion impossible", cause);
        return NextResponse.json(
          {
            error:
              "Commande non enregistrée. Vérifiez que ADMIN_TOKEN est défini dans les variables Vercel, puis réessayez.",
          },
          { status: 503 },
        );
      }
    }
    if (!reference) {
      return NextResponse.json(
        { error: "Commande non enregistrée. Réessayez dans un instant." },
        { status: 503 },
      );
    }
    // Report the reference that was actually stored, not the first one drawn.
    order = { ...order, reference };
  } else {
    // Nothing is inserted server-side in local mode; the browser stores the order.
    order = { ...order, reference: createOrderReference() };
  }

  // 201 means "created something". In local mode nothing was created here — the
  // browser is what stores it — so answering 201 to a non-browser caller would
  // claim a record that exists nowhere. 200 plus `persisted: false` says the order
  // was priced and validated, and left for the client to keep.
  return NextResponse.json({ order, persisted }, { status: persisted ? 201 : 200 });
}
