import Link from "next/link";
import { BrandLogo } from "@/components/ui/BrandLogo";
import { Button, WhatsAppButton } from "@/components/ui/Button";
import { BRAND, CONTACT, LINKS } from "@/lib/brand";
import { cx } from "@/lib/cx";

/**
 * Sticky site header.
 *
 * Mobile-first: the brand mark and the WhatsApp CTA are the only two things on
 * screen on a phone (a phone-width header that also carries nav links becomes an
 * unusable strip), and the full navigation appears from `sm` upwards.
 */
export function SiteHeader({ onOpenCatalogue }: { onOpenCatalogue?: () => void }) {
  const nav = [
    { label: "Collection", href: LINKS.catalog },
    { label: "Livraison", href: LINKS.delivery },
  ];

  return (
    <header className="sticky top-0 z-40 border-b border-ink-700/70 bg-ink-950/85 backdrop-blur-xl">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3 sm:px-6 lg:px-8">
        <Link href="/" className="group flex items-center gap-3" aria-label={`${BRAND.name} — accueil`}>
          <BrandLogo priority />
          <span className="hidden sm:block">
            <span className="block font-display text-xl leading-none font-semibold tracking-[0.2em] text-gold-300 transition group-hover:text-gold-200">
              {BRAND.name}
            </span>
            <span className="mt-1 block text-[0.6rem] font-light tracking-[0.28em] text-cream-300/60 uppercase">
              {BRAND.taglineFr}
            </span>
          </span>
        </Link>

        {/* Desktop / tablet navigation */}
        <nav aria-label="Navigation principale" className="hidden items-center gap-8 md:flex">
          {nav.map((item) => (
            <a
              key={item.href}
              href={item.href}
              className="relative text-sm font-light text-cream-200/85 transition after:absolute after:-bottom-1.5 after:left-0 after:h-px after:w-0 after:bg-gold-400 after:transition-all hover:text-gold-200 hover:after:w-full"
            >
              {item.label}
            </a>
          ))}
          <a
            href={`tel:${CONTACT.phoneE164}`}
            className="text-sm font-light text-cream-200/85 transition hover:text-gold-200"
          >
            {CONTACT.phoneDisplay}
          </a>
        </nav>

        <div className="flex items-center gap-2">
          <Button
            variant="primary"
            size="sm"
            onClick={onOpenCatalogue}
            className="hidden sm:inline-flex"
          >
            Commander
          </Button>
          <WhatsAppButton href={LINKS.whatsapp} label="Commander" size="sm" />
        </div>
      </div>

      {/* Mobile action bar — the two things a phone shopper does. */}
      <div className="flex gap-2 px-4 pb-3 sm:hidden">
        <Button
          variant="primary"
          size="sm"
          onClick={onOpenCatalogue}
          className={cx("flex-1")}
        >
          Voir la collection
        </Button>
        <a
          href={`tel:${CONTACT.phoneE164}`}
          className="flex h-9 items-center rounded-full border border-ink-600 px-3 text-cream-200/80"
          aria-label={`Appeler le ${CONTACT.phoneDisplay}`}
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden="true">
            <path d="M6.6 10.8a15.1 15.1 0 0 0 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.2.4 2.4.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1A17 17 0 0 1 3 4c0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.4 0 .8-.2 1l-2.3 2.2Z" />
          </svg>
        </a>
      </div>
    </header>
  );
}
