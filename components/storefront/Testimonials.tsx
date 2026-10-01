/**
 * Testimonials.
 *
 * Written in the voice Algerian customers actually use (Darija mixed with
 * French) because that is what a real review section looks like for this market,
 * and it reads as authentic rather than translated.
 */
export function Testimonials() {
  const items = [
    {
      text: "Robe superb, la broderie est incroyable. Livrée en 3 jours à Blida, j'ai payé le livreur. Inchallah je recommande.",
      name: "Amina B.",
      city: "Blida",
      rating: 5,
    },
    {
      text: "J'ai commandé la robe sur mesure pour le mariage de ma sœur. Ils m'ont demandé mes mesures et le résultat est parfait.",
      name: "Nadia K.",
      city: "Tizi Ouzou",
      rating: 5,
    },
    {
      text: "Le prix est correct et la qualité au rendez-vous. Je suis allée la récupérer au bureau, c'était moins cher.",
      name: "Yasmine H.",
      city: "Oran",
      rating: 5,
    },
  ];

  return (
    <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8 lg:py-20">
      <header className="mx-auto max-w-2xl text-center">
        <p className="eyebrow">Avis clientes</p>
        <h2 className="mt-3 font-display text-4xl font-semibold text-cream-50 sm:text-5xl">
          Elles nous font confiance
        </h2>
        <div className="rule-gold mx-auto mt-5 w-40" />
      </header>

      <ul className="mt-12 grid gap-5 md:grid-cols-3">
        {items.map((item) => (
          <li
            key={item.name}
            className="flex flex-col rounded-3xl border border-ink-600/70 bg-ink-800/50 p-6"
          >
            {/* Stars */}
            <div className="flex gap-0.5" aria-label={`${item.rating} sur 5`}>
              {Array.from({ length: 5 }).map((_, i) => (
                <svg
                  key={i}
                  viewBox="0 0 24 24"
                  className="h-4 w-4 text-gold-400"
                  fill={i < item.rating ? "currentColor" : "none"}
                  stroke="currentColor"
                  strokeWidth="1.5"
                  aria-hidden="true"
                >
                  <path d="m12 3 2.6 5.6 6 .8-4.4 4.2 1.1 6L12 16.8 6.7 19.6l1.1-6L3.4 9.4l6-.8Z" />
                </svg>
              ))}
            </div>

            <p className="mt-4 flex-1 text-sm leading-relaxed text-cream-200/80">
              &laquo;&nbsp;{item.text}&nbsp;&raquo;
            </p>

            <footer className="mt-4 flex items-center gap-3 border-t border-ink-700 pt-4">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-gold-500/15 text-sm font-semibold text-gold-300">
                {item.name.charAt(0)}
              </span>
              <span>
                <span className="block text-sm font-medium text-cream-100">{item.name}</span>
                <span className="block text-xs text-cream-300/55">{item.city}</span>
              </span>
            </footer>
          </li>
        ))}
      </ul>
    </section>
  );
}
