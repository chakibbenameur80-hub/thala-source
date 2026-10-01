"use client";

import { useState } from "react";
import Image from "next/image";
import { ASSETS, BRAND } from "@/lib/brand";
import { cx } from "@/lib/cx";

/**
 * The brand logo.
 *
 * Uses `public/images/logo.png` when it exists. If that file is missing (fresh
 * clone, or the image was never dropped in) the component falls back to a
 * typeset wordmark built from the brand colours, so the header is never broken.
 *
 * The state flip happens in `onError`, i.e. only in the browser, which is why
 * this file is a Client Component.
 */
export function BrandLogo({
  variant = "full",
  className,
  priority = false,
}: {
  /** `full` = mark + wordmark, `mark` = square emblem only. */
  variant?: "full" | "mark";
  className?: string;
  priority?: boolean;
}) {
  const [failed, setFailed] = useState(false);

  if (failed) {
    if (variant === "mark") return <Emblem className={className} />;
    return <Wordmark className={className} />;
  }

  return (
    <span className={cx("inline-flex items-center", className)}>
      <span className="relative block shrink-0 overflow-hidden rounded-xl ring-1 ring-gold-500/30">
        <Image
          src={ASSETS.logo}
          alt={`${BRAND.name} — ${BRAND.taglineFr}`}
          width={variant === "mark" ? 48 : 44}
          height={variant === "mark" ? 48 : 44}
          priority={priority}
          onError={() => setFailed(true)}
          className="h-11 w-11 object-contain sm:h-12 sm:w-12"
          unoptimized
        />
      </span>
      {variant === "full" && (
        <span className="sr-only">
          {BRAND.name} — {BRAND.taglineFr}
        </span>
      )}
    </span>
  );
}

/** Typeset fallback wordmark. */
function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cx("inline-flex flex-col leading-none", className)}>
      <span className="font-display text-2xl font-semibold tracking-[0.18em] text-gold-300 sm:text-[1.7rem]">
        {BRAND.name}
      </span>
      <span className="mt-0.5 text-[0.6rem] font-light tracking-[0.32em] text-cream-300/70 uppercase">
        {BRAND.taglineFr}
      </span>
    </span>
  );
}

/** Geometric emblem fallback: a stylised kabyle motif (diamond + zellige dot). */
function Emblem({ className }: { className?: string }) {
  return (
    <span
      className={cx(
        "flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-ink-700 to-ink-900 ring-1 ring-gold-500/40 sm:h-12 sm:w-12",
        className,
      )}
      aria-hidden="true"
    >
      <svg viewBox="0 0 32 32" className="h-7 w-7 text-gold-400">
        <path
          d="M16 3 27 16 16 29 5 16Z"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinejoin="round"
        />
        <path d="M16 9 23 16 16 23 9 16Z" fill="currentColor" opacity="0.85" />
        <circle cx="16" cy="16" r="2.4" fill="var(--color-ink-900)" />
      </svg>
    </span>
  );
}
