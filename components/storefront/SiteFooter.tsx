import Link from "next/link";
import { BrandLogo } from "@/components/ui/BrandLogo";
import { WhatsAppButton } from "@/components/ui/Button";
import { BRAND, CONTACT, LINKS } from "@/lib/brand";

/**
 * Site footer: identity, contact, and the legal/trust links.
 */
export function SiteFooter() {
  return (
    <footer className="mt-auto border-t border-ink-700 bg-ink-950">
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
          {/* Identity */}
          <div className="lg:col-span-2">
            <div className="flex items-center gap-3">
              <BrandLogo />
              <span className="font-display text-xl font-semibold tracking-[0.2em] text-gold-300">
                {BRAND.name}
              </span>
            </div>
            <p className="mt-4 max-w-sm text-sm leading-relaxed text-cream-300/65">
              {BRAND.descriptionFr}
            </p>
            <p className="ar mt-2 max-w-sm text-sm text-cream-300/50" lang="ar">
              {BRAND.descriptionAr}
            </p>
          </div>

          {/* Navigation */}
          <nav aria-label="Liens de pied de page">
            <h2 className="eyebrow">Navigation</h2>
            <ul className="mt-4 space-y-2.5 text-sm text-cream-200/75">
              <li>
                <a href={LINKS.catalog} className="transition hover:text-gold-300">
                  La collection
                </a>
              </li>
              <li>
                <a href={LINKS.delivery} className="transition hover:text-gold-300">
                  Livraison &amp; paiement
                </a>
              </li>
              <li>
                <a
                  href={LINKS.instagram}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="transition hover:text-gold-300"
                >
                  Instagram
                </a>
              </li>
              <li>
                {/* Kept deliberately unobtrusive: it is the shop owner's own tool. */}
                <Link href={LINKS.admin} className="text-cream-300/40 transition hover:text-gold-300">
                  Espace admin
                </Link>
              </li>
            </ul>
          </nav>

          {/* Contact */}
          <div>
            <h2 className="eyebrow">Contact</h2>
            <ul className="mt-4 space-y-2.5 text-sm text-cream-200/75">
              <li>
                <a href={`tel:${CONTACT.phoneE164}`} className="transition hover:text-gold-300">
                  {CONTACT.phoneDisplay}
                </a>
              </li>
              <li>
                <a href={`mailto:${CONTACT.email}`} className="transition hover:text-gold-300">
                  {CONTACT.email}
                </a>
              </li>
            </ul>
            <WhatsAppButton
              href={LINKS.whatsapp}
              label="Écrire sur WhatsApp"
              size="sm"
              className="mt-4"
            />
          </div>
        </div>

        <div className="rule-gold my-8" />

        <div className="flex flex-col items-center justify-between gap-3 text-xs text-cream-300/45 sm:flex-row">
          <p>
            © {new Date().getFullYear()} {BRAND.name}. Tous droits réservés.
          </p>
          <p>Paiement à la livraison · Livraison dans les 58 wilayas</p>
        </div>
      </div>
    </footer>
  );
}
