import { ASSETS } from "@/lib/brand";
import type { Product } from "@/lib/types";

/**
 * Catalogue shipped with a fresh install.
 *
 * The first two dresses map 1:1 to the photos in `public/images/`
 * (`dress-1.jpg`, `dress-2.jpg`). The two extras reuse those covers as
 * placeholders so the grid is not empty on first run — replace their images
 * from `/admin/products` as soon as you have real photos.
 *
 * These records are only used to *seed* an empty store. Once the admin edits or
 * deletes them, the persisted state wins and these defaults are never
 * re-applied (see `lib/db/local.ts`).
 */
export function seedProducts(): Product[] {
  const now = "2026-01-05T09:00:00.000Z";

  return [
    {
      id: "seed_robe_iferhounen",
      title: "Robe Kablye Iferhounen",
      subtitle: "Brodé main — noir & or",
      description: [
        "Robe kabyle traditionnelle en velours noir, brodée à la main aux fils dorés.",
        "Taille cintrée, jupe ample, doublure intérieure douce. Parfaite pour les fêtes et les cérémonies.",
        "Fabriquée sur commande dans notre atelier de Tizi Ouzou.",
      ].join("\n"),
      price: 12500,
      compareAtPrice: 15000,
      images: [ASSETS.dress1],
      sizes: ["S", "M", "L", "XL", "CUSTOM"],
      featured: true,
      inStock: true,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: "seed_robe_atlas",
      title: "Robe Kablye Atlas",
      subtitle: "Tissus Amazigh — rouge & bronze",
      description: [
        "Robe kabyle moderne en tissues amazighs, coupe droite et manches longues.",
        "Tissu résistant, motifs géométriques traditionnels brodés au fil de bronze.",
        "Idéale au quotidien comme pour une sortie habillée.",
      ].join("\n"),
      price: 9800,
      compareAtPrice: null,
      images: [ASSETS.dress2],
      sizes: ["S", "M", "L", "XL"],
      featured: true,
      inStock: true,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: "seed_robe_djurdjura",
      title: "Robe Djurdjura Perles",
      subtitle: "Blanc nacré — broderie fine",
      description: [
        "Robe d'inspiration djurdjura, base crème et broderie nacrée sur le plastron.",
        "Coupe fluide, très confortable à porter au quotidien.",
        "Taille sur mesure disponible sur demande.",
      ].join("\n"),
      price: 11500,
      compareAtPrice: 13500,
      images: [ASSETS.dress1],
      sizes: ["M", "L", "XL", "CUSTOM"],
      featured: false,
      inStock: true,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: "seed_robe_tizi",
      title: "Robe Tizi Ouzou Broderie",
      subtitle: "Vert profond — fil d'argent",
      description: [
        "Robe longue en velours vert avec broderie au fil d'argent, signée de notre atelier.",
        "Idéale pour le mariage et les fêtes de l'Aïd.",
        "Livraison partout en Algérie, paiement à la livraison.",
      ].join("\n"),
      price: 16900,
      compareAtPrice: null,
      images: [ASSETS.dress2],
      sizes: ["S", "M", "L", "XL", "CUSTOM"],
      featured: false,
      inStock: true,
      createdAt: now,
      updatedAt: now,
    },
  ];
}
