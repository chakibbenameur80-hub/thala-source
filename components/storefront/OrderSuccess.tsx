import { Button, WhatsAppButton } from "@/components/ui/Button";
import { formatDZD, formatDateTime, prettyPhone } from "@/lib/format";
import { CONTACT, LINKS } from "@/lib/brand";
import { DELIVERY_LABELS, SIZE_LABELS } from "@/lib/types";
import { wilayaLabel } from "@/lib/wilayas";
import type { Order } from "@/lib/types";

/**
 * Order confirmation.
 *
 * Mirrors the confirmation the customer receives: reference, what was ordered,
 * how much, when and where it goes. Including the reference on screen is what
 * lets the customer quote it if they call the shop.
 */
export function OrderSuccess({ order, onClose }: { order: Order; onClose: () => void }) {
  return (
    <div className="space-y-6">
      {/* Checkmark */}
      <div className="flex justify-center">
        <span className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/15 ring-1 ring-emerald-400/40">
          <svg viewBox="0 0 24 24" className="h-8 w-8 text-emerald-400" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
            <path d="m5 13 4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
      </div>

      <div className="text-center">
        <p className="font-display text-2xl font-semibold text-cream-50">Merci, c&apos;est enregistré !</p>
        <p className="mt-2 text-sm text-cream-200/75">
          Nous vous appelons au{" "}
          <span className="font-medium text-gold-300">{prettyPhone(order.phone)}</span> pour confirmer
          votre commande.
        </p>
        <p className="mt-3 inline-block rounded-full bg-gold-500/12 px-4 py-1.5 font-mono text-sm font-semibold tracking-widest text-gold-300">
          {order.reference}
        </p>
      </div>

      {/* Summary */}
      <dl className="divide-y divide-ink-700 rounded-2xl border border-ink-600 bg-ink-800/60 text-sm">
        <Row label="Article">
          {order.items.map((item) => (
            <span key={item.productId} className="block">
              {item.productTitle} — Taille {SIZE_LABELS[item.size].fr} × {item.quantity}
            </span>
          ))}
        </Row>

        <Row label="Livraison">
          {DELIVERY_LABELS[order.deliveryType].fr}
          <span className="block text-cream-300/60">
            {wilayaLabel(order.wilayaCode)}
            {order.commune ? ` · ${order.commune}` : ""}
          </span>
        </Row>

        <Row label="Sous-total">{formatDZD(order.subtotal)}</Row>

        <Row label="Frais de livraison">
          {order.shippingPrice === 0 ? (
            <span className="text-emerald-300">Gratuit</span>
          ) : (
            formatDZD(order.shippingPrice)
          )}
        </Row>

        <Row label="Total" emphasis>
          {formatDZD(order.total)}
        </Row>

        <Row label="Date">{formatDateTime(order.createdAt)}</Row>

        {order.note ? <Row label="Note">{order.note}</Row> : null}
      </dl>

      <p className="rounded-2xl border border-gold-500/35 bg-gold-500/8 p-4 text-xs leading-relaxed text-gold-200/90">
        <strong className="font-semibold text-gold-200">Paiement à la livraison.</strong> Rien ne sera
        prélevé maintenant : vous réglez le livreur en espèces à la réception de votre robe.
        Comptez 2 à 5 jours ouvrables pour Alger et le Nord, 4 à 7 jours pour le Sud.
      </p>

      <div className="flex flex-col gap-2 sm:flex-row">
        <WhatsAppButton
          href={`${LINKS.whatsapp}?text=${encodeURIComponent(`Bonjour THALA SOURCE, je viens de commander (réf. ${order.reference}).`)}`}
          label="Envoyer sur WhatsApp"
          size="md"
          className="flex-1"
        />
        <a
          href={`tel:${CONTACT.phoneE164}`}
          className="inline-flex flex-1 items-center justify-center rounded-full border border-ink-500/70 px-5 py-2.5 text-sm font-medium text-cream-200 transition hover:border-gold-400 hover:text-gold-200"
        >
          Appeler la boutique
        </a>
      </div>

      <Button variant="ghost" onClick={onClose} className="w-full">
        Retour à la collection
      </Button>
    </div>
  );
}

function Row({
  label,
  children,
  emphasis,
}: {
  label: string;
  children: React.ReactNode;
  emphasis?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-4 px-4 py-3">
      <dt className="shrink-0 text-cream-300/60">{label}</dt>
      <dd
        className={
          emphasis
            ? "text-right font-display text-lg font-semibold text-gold-300"
            : "text-right font-medium text-cream-100"
        }
      >
        {children}
      </dd>
    </div>
  );
}
