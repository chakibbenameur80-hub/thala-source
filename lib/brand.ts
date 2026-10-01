/**
 * Brand configuration for THALA SOURCE.
 *
 * Everything a shop owner is likely to want to change (name, slogan, contact
 * numbers, image paths) lives here so no component hard-codes a string.
 */

export const BRAND = {
  name: "THALA SOURCE",
  /** Latin transliteration of ثالة. */
  nameLocal: "THALA",
  /**
   * The only descriptor shown anywhere in the UI.
   *
   * The client asked for plain boutique branding with no product-category or
   * regional wording ("Les robes kabyles", "Robe berbère", the Arabic subtitle).
   * Keep this a neutral boutique label: the catalogue itself communicates what is
   * sold, and pinning a category here would have to be edited again the moment the
   * range changes.
   */
  taglineFr: "Boutique Thala Source",
  descriptionFr:
    "Boutique en ligne. Livraison dans les 58 wilayas, paiement à la livraison.",
  descriptionAr: "متجر إلكتروني. التوصيل إلى 58 ولاية والدفع عند الاستلام.",
} as const;

/**
 * Contact details. Replace with the real ones before going live.
 * `phoneE164` is what the WhatsApp / call buttons dial.
 */
export const CONTACT = {
  /** Shown to customers, national format. */
  phoneDisplay: "0770 36 86 82",
  /**
   * International format, no `+` and no spaces, for `wa.me` links.
   *
   * This is the shop's real order line: WhatsApp is the confirmation channel, so
   * every order the customer places deep-links a prefilled message here.
   */
  phoneE164: "213770368682",
  email: "contact@thalasource.dz",
  /** Instagram handle without the `@`. */
  instagram: "thala.source",
} as const;

/** Wilaya the shop ships from — used in the "livraison depuis" line. */
export const DEFAULT_WILAYA_CODE = 16; // Alger

/**
 * Brand assets.
 *
 * Drop the files into `public/images/` with exactly these names. Each one
 * degrades gracefully: `BrandLogo` falls back to a typeset wordmark and product
 * cards fall back to a themed placeholder, so a missing file never breaks the page.
 *
 * The logo is a photograph, so it stays JPEG. Converting it to PNG inflated it
 * from 91 KB to 1.2 MB for no visual gain, which matters for an asset that loads
 * on every page.
 */
export const ASSETS = {
  logo: "/images/logo.jpg",
  dress1: "/images/dress-1.jpg",
  dress2: "/images/dress-2.jpg",
  /** Used for the share image / og card. */
  ogImage: "/images/logo.jpg",
} as const;

/** Link targets, defined once so the footer and the header cannot diverge. */
export const LINKS = {
  admin: "/admin",
  catalog: "#catalogue",
  delivery: "#livraison",
  /**
   * Base WhatsApp deep link. Order confirmations append `?text=<encoded message>`;
   * the generic contact link is this bare form.
   */
  whatsapp: `https://wa.me/${CONTACT.phoneE164}`,
  instagram: `https://instagram.com/${CONTACT.instagram}`,
} as const;
