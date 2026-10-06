"use client";

import { useCallback, useMemo, useState, useSyncExternalStore } from "react";
import { placeOrder, type PlaceOrderResult } from "@/lib/services/shop";
import { useStorefrontShop } from "@/components/admin/useShop";
import { SiteHeader } from "@/components/storefront/SiteHeader";
import { Hero } from "@/components/storefront/Hero";
import { ValueStrip } from "@/components/storefront/ValueStrip";
import { Catalog } from "@/components/storefront/Catalog";
import { DeliverySection } from "@/components/storefront/DeliverySection";
import { Testimonials } from "@/components/storefront/Testimonials";
import { SiteFooter } from "@/components/storefront/SiteFooter";
import { WhatsAppFab } from "@/components/storefront/WhatsAppFab";
import { ProductDialog } from "@/components/storefront/ProductDialog";
import type { CheckoutInput, Order, Product, ShopData } from "@/lib/types";

/**
 * Storefront root (Client Component).
 *
 * Why is the catalogue client-side at all?
 *
 * The page is a Server Component and renders the catalogue on the server, on
 * every request, straight from Supabase. That HTML is what search engines and the
 * first paint on a slow connection see. This component then revalidates against
 * the public API, so a product added in the admin is on sale without a redeploy
 * and without any `localStorage` being involved.
 *
 * The revalidation happens after mount, never during render: the server already
 * sent a current catalogue, so reading anything browser-only while rendering
 * would risk a hydration mismatch for no benefit.
 */

/** No-op subscription: this store never changes, only the boolean it reports does. */
function subscribeToNothing() {
  return () => {};
}

/** Which screen the product dialog is showing. */
export type DialogStep = "details" | "checkout" | "success";

export function StoreApp({ initial }: { initial: ShopData }) {
  /**
   * The live shop state.
   *
   * `initial` is the server-rendered catalogue, read from Supabase for this
   * request, so the first paint is already current. `useStorefrontShop` keeps it
   * in step with the database afterwards by refetching the public API on mount and
   * whenever the tab regains focus.
   */
  const data = useStorefrontShop(initial);

  /**
   * `false` while server-rendering, `true` from the first client render — the
   * idiomatic way to know whether hydration has happened, with no `setState`.
   */
  const hydrated = useSyncExternalStore(
    subscribeToNothing,
    () => true,
    () => false,
  );

  const [activeProduct, setActiveProduct] = useState<Product | null>(null);
  const [step, setStep] = useState<DialogStep>("details");
  const [order, setOrder] = useState<Order | null>(null);

  // ---- dialog control ---------------------------------------------------
  const openProduct = useCallback((product: Product) => {
    setActiveProduct(product);
    setOrder(null);
    setStep("details");
  }, []);

  const closeDialog = useCallback(() => {
    setActiveProduct(null);
    setOrder(null);
    setStep("details");
  }, []);

  const goToCheckout = useCallback(() => setStep("checkout"), []);

  const submitOrder = useCallback(
    async (input: CheckoutInput): Promise<PlaceOrderResult> => {
      if (!activeProduct) {
        return { ok: false, message: "Article introuvable." };
      }
      const result = await placeOrder(activeProduct, input, data.shipping);
      if (result.ok) {
        setOrder(result.order);
        setStep("success");
        // The new order is already in the local store, so `data` reflects it.
        return result;
      }
      return result;
    },
    [activeProduct, data.shipping],
  );

  // ---- derived views -----------------------------------------------------
  const products = useMemo(
    () => data.products.filter((p) => p.inStock !== false),
    [data.products],
  );
  const featured = useMemo(() => products.filter((p) => p.featured), [products]);

  return (
    <>
      <SiteHeader onOpenCatalogue={() => document.getElementById("catalogue")?.scrollIntoView()} />

      <main id="contenu">
        <Hero featured={featured.length ? featured : products.slice(0, 2)} />
        <ValueStrip />
        <Catalog products={products} onSelect={openProduct} hydrated={hydrated} />
        <DeliverySection />
        <Testimonials />
      </main>

      <SiteFooter />

      {/* Floating contact CTA — the primary mobile conversion path in Algeria. */}
      <WhatsAppFab />

      {activeProduct ? (
        <ProductDialog
          product={activeProduct}
          rates={data.shipping}
          step={step}
          order={order}
          onClose={closeDialog}
          onCheckout={goToCheckout}
          onSubmit={submitOrder}
          onBackToDetails={() => setStep("details")}
        />
      ) : null}
    </>
  );
}
