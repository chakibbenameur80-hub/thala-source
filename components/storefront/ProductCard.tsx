import { ProductImage } from "@/components/ui/ProductImage";
import { discountPercent, formatDZD, hasRealDiscount } from "@/lib/format";
import { SIZE_LABELS } from "@/lib/types";
import { cx } from "@/lib/cx";
import type { Product } from "@/lib/types";

/**
 * Catalogue card.
 *
 * The whole card is one button so it is fully tappable on a phone (a small
 * "Order" target in the corner is a conversion killer on mobile). The visible
 * order button is decorative, marked `aria-hidden`, so screen readers announce
 * a single clear action instead of two nested controls.
 */
export function ProductCard({
  product,
  eager = false,
  onSelect,
}: {
  product: Product;
  /** Set for above-the-fold cards so the image is not lazy-loaded. */
  eager?: boolean;
  onSelect?: (product: Product) => void;
}) {
  const discount = discountPercent(product);

  return (
    <button
      type="button"
      onClick={() => onSelect?.(product)}
      aria-label={`${product.title} — ${formatDZD(product.price)}. Voir le détail`}
      className="group relative flex h-full w-full cursor-pointer flex-col overflow-hidden rounded-3xl bg-ink-850 text-left ring-1 ring-ink-600/70 transition duration-300 hover:-translate-y-1 hover:ring-gold-500/60 hover:shadow-2xl hover:shadow-gold-900/30 focus-visible:-translate-y-1"
    >
      {/* Cover image, 4:5 portrait — the standard fashion aspect ratio. */}
      <div className="relative">
        <ProductImage
          src={product.images[0]}
          alt={product.title}
          className={cx("aspect-[4/5] w-full", "transition duration-500 group-hover:scale-105")}
          imgClassName="transition duration-500 group-hover:scale-105"
          sizes="(min-width: 1024px) 22vw, (min-width: 640px) 30vw, 45vw"
          eager={eager}
        />

        {/* Badges */}
        <div className="absolute top-3 left-3 flex flex-col items-start gap-1.5">
          {product.featured ? (
            <span className="rounded-full bg-gold-500 px-2.5 py-1 text-[0.6rem] font-semibold tracking-wider text-ink-950 uppercase">
              Vedette
            </span>
          ) : null}
          {discount !== null ? (
            <span className="rounded-full bg-danger px-2.5 py-1 text-[0.6rem] font-semibold tracking-wider text-white uppercase">
              -{discount}%
            </span>
          ) : null}
          {!product.inStock ? (
            <span className="rounded-full bg-ink-800 px-2.5 py-1 text-[0.6rem] font-semibold tracking-wider text-cream-200 uppercase">
              Épuisé
            </span>
          ) : null}
        </div>
      </div>

      {/* Body */}
      <div className="flex flex-1 flex-col p-4 sm:p-5">
        <h3 className="font-display text-lg leading-tight font-semibold text-cream-50 sm:text-xl">
          {product.title}
        </h3>
        {product.subtitle ? (
          <p className="mt-1 line-clamp-1 text-xs text-cream-300/60">{product.subtitle}</p>
        ) : null}

        {/* Price block */}
        <div className="mt-3 flex items-baseline gap-2">
          <span className="text-lg font-semibold text-gold-300 sm:text-xl">
            {formatDZD(product.price)}
          </span>
          {hasRealDiscount(product) && product.compareAtPrice ? (
            <span className="text-xs text-cream-300/45 line-through">
              {formatDZD(product.compareAtPrice)}
            </span>
          ) : null}
        </div>

        {/* Available sizes */}
        <ul className="mt-3 flex flex-wrap gap-1" aria-label="Tailles disponibles">
          {product.sizes.map((size) => (
            <li
              key={size}
              className="rounded-md border border-ink-500/70 px-1.5 py-0.5 text-[0.6rem] text-cream-300/75"
            >
              {SIZE_LABELS[size].fr}
            </li>
          ))}
        </ul>

        {/* Decorative CTA; the card itself is the real control. */}
        <span
          aria-hidden="true"
          className="mt-4 inline-flex items-center justify-center gap-1.5 rounded-full bg-gold-500/12 px-4 py-2 text-xs font-semibold text-gold-300 transition group-hover:bg-gold-500 group-hover:text-ink-950"
        >
          Commander maintenant
        </span>
      </div>
    </button>
  );
}
