import { FREE_SHIPPING_THRESHOLD } from "@/lib/shipping";
import { formatDZD } from "@/lib/format";
import { CONTACT } from "@/lib/brand";

/**
 * Delivery explainer.
 *
 * Answers the three questions that stop an order, in the order they are asked:
 * how much does shipping cost, how long does it take, and what is the difference
 * between desk and home delivery.
 */
export function DeliverySection() {
  const steps = [
    {
      n: "01",
      title: "Choisissez votre robe",
      ar: "اختر ثوبك",
      text: "Taille, couleur et quantité. Besoin d'une taille sur mesure ? Indiquez vos mesures dans la note.",
    },
    {
      n: "02",
      title: "Remplissez le formulaire",
      ar: "املأ الاستمارة",
      text: "Nom, numéro, wilaya et mode de livraison. Le prix de la livraison s'affiche immédiatement.",
    },
    {
      n: "03",
      title: "Nous vous appelons",
      ar: "نتصل بك",
      text: "Un appel de confirmation dans les heures qui suivent, pour valider taille et adresse.",
    },
    {
      n: "04",
      title: "Payez à la livraison",
      ar: "الدفع عند الاستلام",
      text: "Vous réglez le livreur en espèces. Aucun paiement en ligne, aucun risque.",
    },
  ];

  return (
    <section id="livraison" className="scroll-mt-28 border-y border-ink-700/60 bg-ink-850/40">
      <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8 lg:py-20">
        <header className="mx-auto max-w-2xl text-center">
          <p className="eyebrow">Livraison &amp; paiement</p>
          <h2 className="mt-3 font-display text-4xl font-semibold text-cream-50 sm:text-5xl">
            Commander, c&apos;est simple
          </h2>
          <div className="rule-gold mx-auto mt-5 w-40" />
        </header>

        <ol className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {steps.map((step) => (
            <li key={step.n} className="relative rounded-3xl border border-ink-600/70 bg-ink-800/50 p-6">
              <span className="font-display text-3xl font-semibold text-gold-500/40">{step.n}</span>
              <h3 className="mt-2 text-base font-semibold text-cream-50">{step.title}</h3>
              <p className="ar mt-0.5 text-sm text-gold-400/80" lang="ar">
                {step.ar}
              </p>
              <p className="mt-2 text-sm leading-relaxed text-cream-300/65">{step.text}</p>
            </li>
          ))}
        </ol>

        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <InfoCard
            title="Livraison à domicile"
            ar="التوصيل للمنزل"
            body={`Le livreur vient chez vous. Tarif selon la wilaya, à partir de 400 DA pour Alger. Gratuite dès ${formatDZD(
              FREE_SHIPPING_THRESHOLD,
            )} d'achat.`}
          />
          <InfoCard
            title="Livraison au bureau"
            ar="التوصيل للمكتب"
            body="Vous retirez votre colis au bureau de la société de livraison le plus proche. Toujours moins cher que la livraison à domicile."
          />
          <InfoCard
            title="Délais"
            ar="مدة التوصيل"
            body="2 à 5 jours ouvrables dans le Nord, 4 à 7 jours pour le Sud. Vous recevez le numéro de suivi par téléphone."
          />
        </div>

        <p className="mt-10 text-center text-sm text-cream-300/60">
          Une question ? Appelez-nous au{" "}
          <a href={`tel:${CONTACT.phoneE164}`} className="font-semibold text-gold-300 hover:underline">
            {CONTACT.phoneDisplay}
          </a>
        </p>
      </div>
    </section>
  );
}

function InfoCard({ title, ar, body }: { title: string; ar: string; body: string }) {
  return (
    <div className="rounded-3xl border border-gold-500/25 bg-gold-500/6 p-6">
      <h3 className="text-base font-semibold text-cream-50">{title}</h3>
      <p className="ar mt-0.5 text-sm text-gold-400/80" lang="ar">
        {ar}
      </p>
      <p className="mt-2 text-sm leading-relaxed text-cream-300/70">{body}</p>
    </div>
  );
}
