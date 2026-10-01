import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { ProductImage } from "@/components/ui/ProductImage";
import { CheckoutForm } from "@/components/storefront/CheckoutForm";
import { OrderSuccess } from "@/components/storefront/OrderSuccess";
import { formatDZD, hasRealDiscount } from "@/lib/format";
import { calculateShipping, FREE_SHIPPING_THRESHOLD } from "@/lib/shipping";
import type { CheckoutInput, Order, Product, ShippingRate } from "@/lib/types";
import type { DialogStep } from "@/components/storefront/StoreApp";
import type { PlaceOrderResult } from "@/lib/services/shop";

/**
 * Product dialog: details → checkout → success.
 *
 * Mobile-first: the sheet appears from the bottom on a phone and as a centered
 * modal on larger screens, with `overflow-y: auto` so the whole checkout fits
 * on a small viewport.
 */
export function ProductDialog({
  product,
  rates,
  step,
  order,
  onClose,
  onCheckout,
  onSubmit,
  onBackToDetails,
}: {
  product: Product;
  rates: ShippingRate[];
  step: DialogStep;
  order: Order | null;
  onClose: () => void;
  onCheckout: () => void;
  onSubmit: (input: CheckoutInput) => Promise<PlaceOrderResult>;
  onBackToDetails: () => void;
}) {
  // Preselect the first size to avoid submitting `undefined`.
  const [size, setSize] = useState(product.sizes[0] ?? "M");
  const [quantity, setQuantity] = useState(1);

  // Estimate shipping for the initial state so the customer sees the free-shipping
  // lever before filling the checkout form.
  const preview = calculateShipping(rates, 16, "home", product.price * quantity);
  const discount = hasRealDiscount(product) && product.compareAtPrice
    ? product.compareAtPrice - product.price
    : 0;

  if (step === "success" && order) {
    return (
      <Modal open onClose={onClose} title="Commande envoyée" subtitle={`Réf. ${order.reference}`}>
        <OrderSuccess order={order} onClose={onClose} />
      </Modal>
    );
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={step === "checkout" ? "Finaliser la commande" : product.title}
      subtitle={step === "checkout" ? "Paiement à la livraison — 58 wilayas" : product.subtitle}
      size={step === "checkout" ? "xl" : "lg"}
    >
      {step === "details" ? (
        <div className="grid gap-8 md:grid-cols-2">
          {/* Gallery */}
          <div className="space-y-3">
            <ProductImage
              src={product.images[0]}
              alt={product.title}
              className="aspect-[4/5] w-full rounded-3xl"
              sizes="(min-width: 768px) 40vw, 90vw"
              eager
            />
            {product.images.slice(1).map((image) => (
              <ProductImage
                key={image}
                src={image}
                alt={product.title}
                className="aspect-[4/5] w-full rounded-3xl"
              />
            ))}
          </div>

          {/* Details */}
          <div className="flex flex-col">
            <p className="text-sm text-cream-300/70 whitespace-pre-line">
              {product.description ?? "Robe kabyle cousue main, avec soin et finition soignée."}
            </p>

            <div className="mt-6 flex flex-wrap items-baseline gap-3">
              <span className="font-display text-3xl font-semibold text-gold-300">
                {formatDZD(product.price)}
              </span>
              {product.compareAtPrice && product.compareAtPrice > product.price ? (
                <span className="text-sm text-cream-300/40 line-through">
                  {formatDZD(product.compareAtPrice)}
                </span>
              ) : null}
              {discount > 0 ? (
                <span className="rounded-full bg-danger/15 px-2.5 py-0.5 text-xs font-semibold text-danger ring-1 ring-danger/40">
                  Économie {formatDZD(discount)}
                </span>
              ) : null}
            </div>

            {/* Size selector (inline, accessible) */}
            <div className="mt-6 space-y-2">
              <p className="text-sm font-medium text-cream-100">Taille · المقاس</p>
              <div className="flex flex-wrap gap-2">
                {product.sizes.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setSize(s)}
                    aria-pressed={size === s}
                    className={`rounded-full border px-3.5 py-2 text-sm transition ${
                      size === s
                        ? "border-gold-500 bg-gold-500/15 text-gold-200 ring-1 ring-gold-500/40"
                        : "border-ink-600 bg-ink-800/60 text-cream-200 hover:border-gold-600/60 hover:text-cream-50"
                    }`}
                  >
                    {s === "CUSTOM" ? "Sur mesure · مقاس مخصص" : s}
                  </button>
                ))}
              </div>
              {size === "CUSTOM" ? (
                <p className="text-xs text-cream-300/60">
                  Précisez vos mensurations dans la note au moment de la commande.
                </p>
              ) : null}
            </div>

            {/* Quantity */}
            <div className="mt-5 flex items-center gap-3">
              <p className="text-sm font-medium text-cream-100">Quantité</p>
              <div className="inline-flex items-center gap-1 rounded-full border border-ink-600 bg-ink-800/60 px-1.5 py-1">
                <button
                  type="button"
                  aria-label="Réduire la quantité"
                  className="flex h-8 w-8 items-center justify-center rounded-full text-cream-200 transition hover:bg-ink-700"
                  onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                >
                  -
                </button>
                <span className="w-8 text-center text-sm tabular-nums">{quantity}</span>
                <button
                  type="button"
                  aria-label="Augmenter la quantité"
                  className="flex h-8 w-8 items-center justify-center rounded-full text-cream-200 transition hover:bg-ink-700"
                  onClick={() => setQuantity((q) => Math.min(10, q + 1))}
                >
                  +
                </button>
              </div>
              <span className="text-xs text-cream-300/60">Maximum 10 pièces par commande</span>
            </div>

            {/* Shipping teaser */}
            <div className="mt-6 rounded-2xl border border-gold-500/40 bg-gold-500/10 p-4">
              <p className="text-sm text-gold-200">
                Livraison à domicile estimée à{" "}
                <span className="font-semibold">{formatDZD(preview.price)}</span> vers Alger.
              </p>
              {preview.remainingForFree > 0 ? (
                <p className="mt-1 text-xs text-gold-200/80">
                  Ajoutez {formatDZD(preview.remainingForFree)} de plus pour la livraison gratuite
                  (à partir de {formatDZD(FREE_SHIPPING_THRESHOLD)}).
                </p>
              ) : (
                <p className="mt-1 text-xs text-emerald-200">
                  Vous bénéficiez de la livraison gratuite à domicile.
                </p>
              )}
              <p className="mt-1 text-xs text-cream-200/70">
                Livraison au bureau (bureau de la société de livraison) disponible à un tarif
                réduit.
              </p>
            </div>

            <div className="mt-auto pt-8">
              <button
                type="button"
                data-autofocus
                onClick={onCheckout}
                className="w-full rounded-full bg-gradient-to-b from-gold-400 to-gold-600 px-6 py-4 text-base font-medium text-ink-950 shadow-lg shadow-gold-600/20 transition hover:from-gold-300 hover:to-gold-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold-400"
              >
                Commander maintenant
              </button>
              <p className="mt-2 text-center text-xs text-cream-300/60">
                Paiement à la livraison — nous vous rappellerons pour confirmer votre commande.
              </p>
            </div>
          </div>
        </div>
      ) : (
        <CheckoutForm
          product={product}
          rates={rates}
          initialSize={size}
          initialQuantity={quantity}
          onSubmit={onSubmit}
          onBack={onBackToDetails}
          onCancel={onClose}
        />
      )}
    </Modal>
  );
}
