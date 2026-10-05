"use client";

import { useState } from "react";
import { cx } from "@/lib/cx";

/**
 * Product image with a graceful failure state.
 *
 * Deliberately a plain `<img>` rather than `next/image`: images are served from
 * Supabase Storage, so `next/image` would need that host in `images.remotePatterns`
 * and its optimiser would re-encode photos that `lib/images.ts` has already
 * normalised to WebP at 1600px. Optimising again costs bytes and saves nothing.
 *
 * If the file is missing, a themed placeholder is shown instead of the broken
 * image icon browsers display by default.
 */
export function ProductImage({
  src,
  alt,
  className,
  imgClassName,
  sizes,
  priority = false,
  eager = false,
}: {
  src?: string;
  alt: string;
  className?: string;
  imgClassName?: string;
  sizes?: string;
  priority?: boolean;
  /** Skip lazy loading for above-the-fold cards. */
  eager?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  const showPlaceholder = !src || failed;

  return (
    <div className={cx("relative overflow-hidden bg-ink-800", className)}>
      {showPlaceholder ? (
        <Placeholder label={alt} />
      ) : (
        // eslint-disable-next-line @next/next/no-img-element -- admin-supplied arbitrary hosts
        <img
          src={src}
          alt={alt}
          sizes={sizes}
          loading={priority || eager ? "eager" : "lazy"}
          decoding="async"
          onError={() => setFailed(true)}
          className={cx("h-full w-full object-cover", imgClassName)}
        />
      )}
    </div>
  );
}

/** Themed placeholder: zellige-inspired motif on the brand background. */
function Placeholder({ label }: { label: string }) {
  return (
    <div
      role="img"
      aria-label={`${label} (image indisponible)`}
      className="flex h-full w-full items-center justify-center bg-gradient-to-br from-ink-700 via-ink-800 to-ink-900"
    >
      <svg viewBox="0 0 64 64" className="h-16 w-16 text-gold-500/25" aria-hidden="true">
        <path
          d="M32 4 60 32 32 60 4 32Z"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
        />
        <path d="M32 14 50 32 32 50 14 32Z" fill="none" stroke="currentColor" strokeWidth="1.5" />
        <path d="M32 23 41 32 32 41 23 32Z" fill="currentColor" opacity="0.5" />
      </svg>
    </div>
  );
}
