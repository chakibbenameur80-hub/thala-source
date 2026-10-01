"use client";

import { useEffect, useState } from "react";
import { WhatsAppIcon } from "@/components/ui/Button";
import { LINKS } from "@/lib/brand";
import { cx } from "@/lib/cx";

/**
 * Floating WhatsApp button.
 *
 * WhatsApp is how the large majority of Algerian shops close a sale, so it gets
 * a persistent floating action button on mobile. It hides itself once the
 * customer scrolls down to the footer to avoid covering the checkout trigger,
 * and is never shown to screen-reader users as an unlabelled blob.
 */
export function WhatsAppFab() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const onScroll = () => {
      // Appear after a short scroll, disappear near the very bottom.
      const y = window.scrollY;
      const atBottom =
        window.innerHeight + y >= document.body.offsetHeight - 260;
      setVisible(y > 320 && !atBottom);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <a
      href={LINKS.whatsapp}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Discuter sur WhatsApp"
      className={cx(
        "fixed right-4 bottom-4 z-30 flex h-14 w-14 items-center justify-center rounded-full",
        "bg-[#25D366] text-white shadow-xl shadow-black/40 transition-all duration-300",
        "hover:scale-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold-400",
        visible ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-4 opacity-0",
      )}
    >
      <WhatsAppIcon className="h-7 w-7" />
    </a>
  );
}
