import type { Metadata } from "next";
import { StoreApp } from "@/components/storefront/StoreApp";
import { loadStorefrontData } from "@/lib/db";
import { BRAND, CONTACT } from "@/lib/brand";

/**
 * Storefront — the customer-facing home page.
 *
 * This is a Server Component on purpose: the catalogue is rendered to HTML on
 * the server, which means the page is crawlable and displays something
 * meaningful on a slow mobile connection before any JavaScript runs. The
 * interactive parts (filters, dialog, checkout) live in `<StoreApp>`.
 */

/**
 * Render on every request instead of at build time.
 *
 * Without this, `/` is prerendered as a static page and the catalogue is frozen
 * into the HTML at deploy time. A product created in the admin afterwards was
 * written to Postgres correctly and read back correctly through
 * `GET /api/products`, yet never reached a customer: every visitor kept getting
 * the snapshot from the last build until the app was redeployed. The admin
 * dashboard did not have this problem because it is already dynamic and refetches
 * `/api/shop` after each mutation.
 *
 * The read is a handful of rows, so paying for it per request is the right trade
 * for a shop whose whole point is that the owner can add a dress and it is on
 * sale immediately. Do not reintroduce a static or long-revalidate page here
 * without changing that requirement.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: `${BRAND.name} — ${BRAND.taglineFr}`,
  description: BRAND.descriptionFr,
  alternates: { canonical: "/" },
};

export default async function HomePage() {
  // Server-rendered from Supabase on every request (see `dynamic` above). The
  // browser then revalidates against the public API, so a product added while the
  // tab was open shows up without a reload — and no `localStorage` is involved
  // once Supabase is configured.
  const data = await loadStorefrontData();

  // Structured data helps Google show the product rich results. Prices are in
  // DZD, which Google expects as an ISO-4217 code (DZD).
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Store",
    name: BRAND.name,
    description: BRAND.descriptionFr,
    telephone: CONTACT.phoneE164,
    areaServed: { "@type": "Country", name: "Algeria" },
    currenciesAccepted: "DZD",
    paymentAccepted: "Cash on Delivery",
    makesOffer: data.products.map((p) => ({
      "@type": "Offer",
      name: p.title,
      price: p.price,
      priceCurrency: "DZD",
      availability: p.inStock
        ? "https://schema.org/InStock"
        : "https://schema.org/OutOfStock",
      itemCondition: "https://schema.org/NewCondition",
    })),
  };

  return (
    <>
      <script
        type="application/ld+json"
        // Serialised from trusted seed data; `<` escaped to be safe inside a script tag.
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c"),
        }}
      />
      <StoreApp initial={data} />
    </>
  );
}
