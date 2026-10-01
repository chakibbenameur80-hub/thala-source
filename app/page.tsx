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

export const metadata: Metadata = {
  title: `${BRAND.name} — ${BRAND.taglineFr}`,
  description: BRAND.descriptionFr,
  alternates: { canonical: "/" },
};

export default async function HomePage() {
  // With Supabase configured this hits the real database; otherwise it returns
  // the seed catalogue. Either way the browser hydrates from its own store, so
  // admin changes appear without a redeploy.
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
