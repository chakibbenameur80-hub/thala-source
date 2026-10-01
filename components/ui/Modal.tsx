"use client";

import { useCallback, useEffect, useRef } from "react";
import { cx } from "@/lib/cx";

/**
 * Accessible modal dialog.
 *
 * Hand-rolled rather than pulled from a library because the requirements are
 * small and specific:
 *   - `role="dialog"` + `aria-modal` + a labelled title
 *   - Escape closes, backdrop click closes
 *   - the page behind cannot scroll (body lock) — critical on mobile, where the
 *     background otherwise scrolls under the sheet
 *   - focus moves into the dialog on open and returns to the trigger on close
 *   - Tab is trapped inside the dialog
 *   - `overflow-y: auto` on the panel so a tall checkout form stays reachable on
 *     a small phone
 */
export function Modal({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
  size = "lg",
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  size?: "md" | "lg" | "xl";
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);

  // Remember what had focus, then move focus into the dialog.
  useEffect(() => {
    if (!open) return;
    previouslyFocused.current = document.activeElement as HTMLElement | null;
    const panel = panelRef.current;
    // The close button is the first focusable, which is the expected behaviour
    // for a dialog whose main action is at the bottom.
    const target = panel?.querySelector<HTMLElement>("[data-autofocus]") ?? panel;
    target?.focus?.();

    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = overflow;
      previouslyFocused.current?.focus?.();
    };
  }, [open]);

  const onKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose();
        return;
      }
      if (event.key !== "Tab") return;

      // Focus trap: cycle within the dialog.
      const panel = panelRef.current;
      if (!panel) return;
      const focusables = panel.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      if (focusables.length === 0) return;
      const first = focusables[0]!;
      const last = focusables[focusables.length - 1]!;
      const active = document.activeElement;

      if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    },
    [onClose],
  );

  if (!open) return null;

  const width = { md: "max-w-md", lg: "max-w-2xl", xl: "max-w-4xl" }[size];

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6"
      onKeyDown={onKeyDown}
    >
      {/* Backdrop */}
      <button
        type="button"
        aria-label="Fermer"
        onClick={onClose}
        className="absolute inset-0 animate-fade-in cursor-default bg-ink-950/80 backdrop-blur-sm"
      />

      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className={cx(
          "relative flex max-h-[92dvh] w-full flex-col overflow-hidden bg-ink-850 shadow-2xl",
          "animate-scale-in rounded-t-4xl sm:rounded-4xl",
          "ring-1 ring-gold-500/25",
          width,
        )}
      >
        {/* Drag handle affordance on mobile */}
        <div className="flex justify-center pt-3 sm:hidden" aria-hidden="true">
          <div className="h-1 w-12 rounded-full bg-ink-500" />
        </div>

        <header className="flex items-start justify-between gap-4 px-5 pt-4 pb-3 sm:px-7 sm:pt-6">
          <div className="min-w-0">
            <h2 className="font-display text-2xl leading-tight font-semibold text-cream-50 sm:text-3xl">
              {title}
            </h2>
            {subtitle ? (
              <p className="mt-1 text-sm text-cream-300/70">{subtitle}</p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer la fenêtre"
            className="-mt-1 -mr-1 shrink-0 rounded-full p-2 text-cream-300/70 transition hover:bg-ink-700 hover:text-cream-50"
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
            </svg>
          </button>
        </header>

        <div className="rule-gold mx-5 sm:mx-7" />

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-5 sm:px-7">
          {children}
        </div>

        {footer ? (
          <>
            <div className="rule-gold mx-5 sm:mx-7" />
            <div className="bg-ink-900/60 px-5 pt-4 pb-5 sm:px-7 sm:pb-6">{footer}</div>
          </>
        ) : null}
      </div>
    </div>
  );
}
