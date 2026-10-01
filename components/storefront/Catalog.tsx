"use client";

import { useMemo, useState } from "react";
import { ProductCard } from "@/components/storefront/ProductCard";
import type { Product, Size } from "@/lib/types";

/**
 * Product catalogue.
 *
 * Filters are intentionally minimal. A dress shop sells a handful of pieces, so
 * an over-built faceted search adds friction without helping anyone find
 * anything. What matters is: see everything, see the sizes, see the price.
 */
export function Catalog({
  products,
  onSelect,
  hydrated,
}: {
  products: Product[];
  onSelect: (product: Product) => void;
  /** False until the client store has been read, so we can avoid a flash. */
  hydrated: boolean;
}) {
  const [sizeFilter, setSizeFilter] = useState<Size | "ALL">("ALL");
  const [sort, setSort] = useState<"featured" | "price-asc" | "price-desc">("featured");

  const availableSizes = useMemo(() => {
    const set = new Set<Size>();
    products.forEach((p) => p.sizes.forEach((s) => set.add(s)));
    // Keep the canonical order, drop anything empty.
    return (["S", "M", "L", "XL", "CUSTOM"] as Size[]).filter((s) => set.has(s));
  }, [products]);

  const visible = useMemo(() => {
    const filtered =
      sizeFilter === "ALL" ? products : products.filter((p) => p.sizes.includes(sizeFilter));

    const sorted = [...filtered];
    if (sort === "price-asc") sorted.sort((a, b) => a.price - b.price);
    if (sort === "price-desc") sorted.sort((a, b) => b.price - a.price);
    if (sort === "featured") {
      sorted.sort((a, b) => Number(b.featured) - Number(a.featured));
    }
    return sorted;
  }, [products, sizeFilter, sort]);

  return (
    <section id="catalogue" className="mx-auto max-w-7xl scroll-mt-28 px-4 py-14 sm:px-6 lg:px-8 lg:py-20">
      <header className="text-center">
        <p className="eyebrow">La collection</p>
        <h2 className="mt-3 font-display text-4xl font-semibold text-cream-50 sm:text-5xl">
          Nos robes kabyles
        </h2>
        <p className="ar mt-2 text-base text-cream-300/70" lang="ar">
          الأثواب القبلية
        </p>
        <div className="rule-gold mx-auto mt-5 w-40" />
      </header>

      {/* Filter bar */}
      <div className="mt-8 flex flex-col items-center gap-4">
        <div className="flex flex-wrap justify-center gap-2" role="group" aria-label="Filtrer par taille">
          <FilterChip active={sizeFilter === "ALL"} onClick={() => setSizeFilter("ALL")}>
            Toutes
          </FilterChip>
          {availableSizes.map((size) => (
            <FilterChip
              key={size}
              active={sizeFilter === size}
              onClick={() => setSizeFilter(size)}
            >
              {size === "CUSTOM" ? "Sur mesure" : size}
            </FilterChip>
          ))}
        </div>

        <label className="flex items-center gap-2 text-sm text-cream-300/70">
          Trier
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as typeof sort)}
            className="rounded-lg border border-ink-600 bg-ink-800 px-3 py-1.5 text-sm text-cream-100 outline-none focus:border-gold-500"
          >
            <option value="featured">Nos vedettes</option>
            <option value="price-asc">Prix croissant</option>
            <option value="price-desc">Prix décroissant</option>
          </select>
        </label>
      </div>

      {/* Grid */}
      {visible.length > 0 ? (
        <div className="mt-10 grid grid-cols-2 gap-3 sm:gap-5 lg:grid-cols-4">
          {visible.map((product) => (
            <ProductCard key={product.id} product={product} onSelect={onSelect} />
          ))}
        </div>
      ) : (
        <p className="mt-16 text-center text-cream-300/60">
          Aucune robe ne correspond à cette taille pour le moment.
        </p>
      )}

      {hydrated ? null : (
        <p className="mt-6 text-center text-xs text-cream-300/40" aria-live="polite">
          Chargement de la collection…
        </p>
      )}
    </section>
  );
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-full border px-4 py-2 text-sm font-medium transition ${
        active
          ? "border-gold-500 bg-gold-500/15 text-gold-200"
          : "border-ink-600 bg-ink-800/60 text-cream-200/80 hover:border-gold-600/60 hover:text-cream-50"
      }`}
    >
      {children}
    </button>
  );
}
