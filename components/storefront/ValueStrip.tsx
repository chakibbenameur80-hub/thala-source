import { FREE_SHIPPING_THRESHOLD } from "@/lib/shipping";
import { formatDZD } from "@/lib/format";

/**
 * Value strip: the four promises that decide whether an Algerian shopper trusts
 * the shop enough to order. Placed directly under the hero, before the
 * catalogue, so they are read before any price is compared.
 */
export function ValueStrip() {
  const items = [
    {
      title: "Paiement à la livraison",
      ar: "الدفع عند الاستلام",
      description: "Vous ne payez qu'en recevant votre robe.",
      icon: (
        <>
          <path d="M3 7h18v10H3z" />
          <path d="M3 11h18" />
          <path d="M7 15h4" />
        </>
      ),
    },
    {
      title: "58 wilayas livrées",
      ar: "التوصيل إلى 58 ولاية",
      description: "À domicile ou au bureau, dans tout le pays.",
      icon: (
        <>
          <path d="M12 21s7-5.5 7-11a7 7 0 1 0-14 0c0 5.5 7 11 7 11Z" />
          <circle cx="12" cy="10" r="2.5" />
        </>
      ),
    },
    {
      title: "Cousu main",
      ar: "خياطة يدوية",
      description: "Broderie et finitions faites à la main.",
      icon: (
        <>
          <path d="M4 20 20 4" />
          <path d="M14 4h6v6" />
          <circle cx="8" cy="16" r="2.5" />
        </>
      ),
    },
    {
      title: `Livraison offerte dès ${formatDZD(FREE_SHIPPING_THRESHOLD)}`,
      ar: "توصيل مجاني",
      description: "Pour toute commande à domicile.",
      icon: (
        <>
          <path d="M3 8h11v8H3z" />
          <path d="M14 11h4l3 3v2h-7z" />
          <circle cx="7" cy="18" r="1.6" />
          <circle cx="17" cy="18" r="1.6" />
        </>
      ),
    },
  ];

  return (
    <section aria-label="Nos engagements" className="border-y border-ink-700/60 bg-ink-850/50">
      <div className="mx-auto grid max-w-7xl grid-cols-2 gap-x-4 gap-y-8 px-4 py-10 sm:px-6 lg:grid-cols-4 lg:px-8">
        {items.map((item) => (
          <div key={item.title} className="flex flex-col items-center gap-2 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-gold-500/10 ring-1 ring-gold-500/30">
              <svg
                viewBox="0 0 24 24"
                className="h-6 w-6 text-gold-400"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                {item.icon}
              </svg>
            </span>
            <h3 className="text-sm font-medium text-cream-50">{item.title}</h3>
            <p className="ar text-xs text-cream-300/60" lang="ar">
              {item.ar}
            </p>
            <p className="text-xs leading-relaxed text-cream-300/55">{item.description}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
