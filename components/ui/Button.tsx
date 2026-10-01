"use client";

import { cx } from "@/lib/cx";

/**
 * Buttons.
 *
 * `primary` is the gold-filled CTA used for "Order Now" / "Confirmer" — the one
 * action per screen that must be impossible to miss. `secondary` and `ghost` are
 * progressively quieter, so a screen can only have one visually dominant call
 * to action.
 */

const BASE =
  "inline-flex items-center justify-center gap-2 rounded-full font-medium " +
  "transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-55 " +
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold-400";

const VARIANTS = {
  primary:
    "bg-gradient-to-b from-gold-400 to-gold-600 text-ink-950 shadow-lg shadow-gold-600/20 " +
    "hover:from-gold-300 hover:to-gold-500 hover:shadow-gold-500/30",
  secondary:
    "border border-gold-500/50 bg-gold-500/5 text-gold-200 hover:border-gold-400 hover:bg-gold-500/15",
  dark: "bg-ink-700 text-cream-100 ring-1 ring-ink-500/60 hover:bg-ink-600",
  ghost: "text-cream-200/80 hover:bg-ink-800 hover:text-cream-50",
  danger: "bg-danger/15 text-danger ring-1 ring-danger/40 hover:bg-danger/25",
} as const;

const SIZES = {
  sm: "px-3.5 py-2 text-xs",
  md: "px-5 py-2.5 text-sm",
  lg: "px-7 py-3.5 text-base",
  /** Full-width block, the default for mobile CTAs. */
  block: "w-full px-6 py-4 text-base",
} as const;

export function Button({
  variant = "primary",
  size = "md",
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: keyof typeof VARIANTS;
  size?: keyof typeof SIZES;
}) {
  return <button className={cx(BASE, VARIANTS[variant], SIZES[size], className)} {...props} />;
}

/** WhatsApp / call action with its own icon, used in the header and the footer. */
export function WhatsAppButton({
  href,
  label,
  className,
  size = "md",
}: {
  href: string;
  label: string;
  className?: string;
  size?: keyof typeof SIZES;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={cx(BASE, VARIANTS.secondary, SIZES[size], className)}
    >
      <WhatsAppIcon className="h-4 w-4" />
      {label}
    </a>
  );
}

export function WhatsAppIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
      <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2 22l5.25-1.38a9.9 9.9 0 0 0 4.79 1.22h.01c5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.82 9.82 0 0 0 12.04 2Zm0 1.67c2.2 0 4.27.86 5.83 2.42a8.2 8.2 0 0 1 2.41 5.82c0 4.54-3.7 8.24-8.25 8.24a8.2 8.2 0 0 1-4.19-1.15l-.3-.18-3.12.82.83-3.04-.2-.31a8.19 8.19 0 0 1-1.26-4.38c0-4.54 3.7-8.24 8.25-8.24Zm-3.1 4.1c-.15 0-.4.06-.61.28-.21.22-.8.79-.8 1.92 0 1.13.82 2.23.94 2.38.11.15 1.6 2.55 3.98 3.48 1.98.78 2.38.63 2.81.59.43-.04 1.39-.57 1.58-1.11.2-.55.2-1.01.14-1.11-.06-.09-.2-.15-.43-.26-.22-.11-1.39-.69-1.6-.76-.22-.08-.38-.11-.54.11-.15.22-.6.76-.73.92-.13.15-.26.17-.48.06-.22-.11-.95-.35-1.8-1.12-.67-.59-1.11-1.33-1.24-1.55-.13-.22-.02-.34.09-.45.1-.1.22-.26.33-.39.11-.13.15-.22.22-.37.08-.15.04-.28-.02-.39-.06-.11-.53-1.3-.73-1.78-.19-.45-.38-.39-.52-.4h-.45Z" />
    </svg>
  );
}

/** Inline spinner for submitting buttons. */
export function Spinner({ className }: { className?: string }) {
  return (
    <svg
      className={cx("h-4 w-4 animate-spin", className)}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.3" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}
