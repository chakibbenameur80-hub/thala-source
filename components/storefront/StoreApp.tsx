"use client";

import { useCallback, useMemo, useState, useSyncExternalStore } from "react";
import { placeOrder, type PlaceOrderResult } from "@/lib/services/shop";
import { useLocalShop } from "@/components/admin/useShop";
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
 * The page itself is a Server Component and renders the *seed* catalogue, which
 * is what search engines and the first paint on a slow connection see. This
 * component then hydrates from the browser's own store (`localStorage`, or
 * Supabase), so whatever the admin has added or changed is reflected immediately
 * — without giving up server-rendered HTML.
 *
 * The read happens after mount, never during render: reading `localStorage`
 * while rendering would produce different HTML on the server and the client and
 * trigger a hydration mismatch.
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
   * `localStorage` is read through `useSyncExternalStore`, which React compares
   * by snapshot: the server renders `initial`, the client renders the stored shop
   * immediately, and there is no extra render pass, no hydration mismatch (the
   * markup React hydrates is the one it already produced) and no effect.
   */
  const data = useLocalShop(initial);

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
