import { ProductCard } from "@/components/storefront/ProductCard";
import { BRAND } from "@/lib/brand";
import { formatDZD } from "@/lib/format";
import type { Product } from "@/lib/types";

/**
 * Hero section.
 *
 * Shows the boutique name and the featured pieces. On a phone the products sit
 * directly under the headline (that is what converts); from `lg` upwards the
 * layout becomes a two-column editorial split.
 */

/** The shop name in Arabic script, used for the bilingual hero line. */
const BRAND_NAME_AR = "بوتيك ثالة سورس";

export function Hero({ featured }: { featured: Product[] }) {
  const showcase = featured.slice(0, 2);
  const fromPrice = featured.length ? Math.min(...featured.map((p) => p.price)) : null;

  return (
    <section className="relative overflow-hidden">
      {/* Ambient background: a faint zellige lattice + a warm bronze glow. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10 opacity-[0.07]"
        style={{
          backgroundImage:
            "repeating-linear-gradient(45deg, #c9a227 0 1px, transparent 1px 22px), repeating-linear-gradient(-45deg, #c9a227 0 1px, transparent 1px 22px)",
        }}
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-40 left-1/2 -z-10 h-130 w-[46rem] -translate-x-1/2 rounded-full bg-gold-600/10 blur-3xl"
      />

      <div className="mx-auto max-w-7xl px-4 pt-10 pb-14 sm:px-6 sm:pt-16 lg:px-8 lg:pt-20 lg:pb-20">
        <div className="grid items-center gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:gap-14">
          {/* ---- Copy ----
              The client removed the category/regional tagline and the Arabic
              subtitle, so the only descriptor here is the boutique name itself.
              The Arabic line is the same words in Arabic script rather than a
              separate slogan, so the two never drift apart. */}
          <div className="animate-fade-up text-center lg:text-left">
            <p className="eyebrow">{BRAND.taglineFr}</p>

            <h1 className="mt-4 font-display text-5xl leading-[0.95] font-semibold text-cream-50 sm:text-6xl lg:text-7xl">
              {BRAND.name}
            </h1>

            <div className="rule-gold mx-auto mt-6 w-40 lg:mx-0" />

            <p className="ar mt-6 text-lg text-cream-200/80" lang="ar">
              {BRAND_NAME_AR}
            </p>
            <p className="mt-2 max-w-xl text-base text-cream-200/75 lg:text-lg">
              {BRAND.descriptionFr}
            </p>

            <div className="mt-8 flex flex-col items-stretch gap-3 sm:flex-row sm:justify-center lg:justify-start">
              <a
                href="#catalogue"
                className="inline-flex items-center justify-center gap-2 rounded-full bg-gradient-to-b from-gold-400 to-gold-600 px-7 py-3.5 text-base font-medium text-ink-950 shadow-lg shadow-gold-600/20 transition hover:from-gold-300 hover:to-gold-500"
              >
                Découvrir la collection
                <svg
                  viewBox="0 0 24 24"
                  className="h-4 w-4"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  aria-hidden="true"
                >
                  <path d="M5 12h14m-6-7 7 7-7 7" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </a>
              <a
                href="#livraison"
                className="inline-flex items-center justify-center rounded-full border border-gold-500/50 px-7 py-3.5 text-base font-medium text-gold-200 transition hover:border-gold-400 hover:bg-gold-500/10"
              >
                Livraison &amp; prix
              </a>
            </div>

            {fromPrice !== null ? (
              <p className="mt-6 text-sm text-cream-300/60">
                À partir de{" "}
                <span className="font-semibold text-gold-300">{formatDZD(fromPrice)}</span> · paiement
                à la livraison
              </p>
            ) : null}
          </div>

          {/* ---- Featured dresses ---- */}
          <div className="grid grid-cols-2 gap-3 sm:gap-5">
            {showcase.map((product, index) => (
              <div
                key={product.id}
                className={
                  index === 0
                    ? "animate-fade-up [animation-delay:120ms]"
                    : "animate-fade-up [animation-delay:240ms]"
                }
              >
                <ProductCard product={product} eager />
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="rule-gold" />
      </div>
    </section>
  );
}
