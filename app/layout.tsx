import type { Metadata, Viewport } from "next";
import { Cormorant_Garamond, Jost, Cairo } from "next/font/google";
import { BRAND, CONTACT } from "@/lib/brand";
import "./globals.css";

/**
 * Fonts
 * -----
 * `next/font` downloads the CSS at build time and self-hosts the files, so there
 * is no request to Google at runtime and no layout shift. The three faces match
 * the brand: a high-contrast serif for the display type, a geometric sans for
 * UI, and a dedicated Arabic face so the Darija/Latin mix renders properly.
 */
const cormorant = Cormorant_Garamond({
  variable: "--font-cormorant",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  style: ["normal", "italic"],
  display: "swap",
});

const jost = Jost({
  variable: "--font-jost",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600"],
  display: "swap",
});

const cairo = Cairo({
  variable: "--font-cairo",
  subsets: ["arabic", "latin"],
  weight: ["300", "400", "600", "700"],
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL("https://thala-source.vercel.app"),
  title: {
    default: `${BRAND.name} — ${BRAND.taglineFr}`,
    template: `%s — ${BRAND.name}`,
  },
  description: BRAND.descriptionFr,
  applicationName: BRAND.name,
  keywords: [
    "robe kabyle",
    "vêtement kabyle",
    "tradition algérienne",
    "robe amazighe",
    "achat en ligne Algérie",
    "THALA SOURCE",
    "ملابس أمازيغية",
    "ثوب قبلي",
  ],
  authors: [{ name: BRAND.name }],
  openGraph: {
    type: "website",
    locale: "fr_DZ",
    alternateLocale: ["ar_DZ"],
    title: `${BRAND.name} — ${BRAND.taglineFr}`,
    description: BRAND.descriptionFr,
    siteName: BRAND.name,
  },
  twitter: {
    card: "summary_large_image",
    title: `${BRAND.name} — ${BRAND.taglineFr}`,
    description: BRAND.descriptionFr,
  },
  robots: {
    // The admin dashboard must never be indexed.
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, "max-image-preview": "large" },
  },
  formatDetection: { telephone: true },
};

export const viewport: Viewport = {
  themeColor: "#1a1210",
  colorScheme: "dark",
  width: "device-width",
  initialScale: 1,
  // Most Algerian shoppers use a phone; never disable zoom (accessibility).
  maximumScale: 5,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="fr"
      // Next 16 no longer overrides `scroll-behavior: smooth` on navigation
      // unless this attribute is present — and we do want it for the in-page
      // anchors of the storefront.
      data-scroll-behavior="smooth"
      className={`${cormorant.variable} ${jost.variable} ${cairo.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">
        {/* Keyboard users land here first, then jump past the header/hero. */}
        <a
          href="#contenu"
          className="sr-only-focusable focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[100] focus:rounded-full focus:bg-gold-500 focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-ink-950"
        >
          Aller au contenu principal
        </a>
        {children}
        <noscript>
          <div className="mx-auto max-w-2xl px-4 py-10 text-center">
            <p className="text-cream-100">
              Ce site nécessite JavaScript pour afficher le catalogue. Vous pouvez aussi commander
              au {CONTACT.phoneDisplay}.
            </p>
          </div>
        </noscript>
      </body>
    </html>
  );
}
