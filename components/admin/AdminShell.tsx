"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { BrandLogo } from "@/components/ui/BrandLogo";
import { cx } from "@/lib/cx";

/**
 * Admin chrome: brand bar, section navigation, logout.
 *
 * A mobile-first bottom tab bar is used for the three sections (orders,
 * products, shipping) — it is the pattern phone users already have in their
 * fingers, and the dashboard is very often managed from a phone.
 */
export function AdminShell({ brand }: { brand: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const [usingDefaultPassword, setUsingDefaultPassword] = useState(false);

  // Surface a warning if the shop still runs on the built-in password.
  useEffect(() => {
    let cancelled = false;
    fetch("/api/auth/session")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!cancelled && data?.usingDefaultPassword) setUsingDefaultPassword(true);
      })
      .catch(() => {
        /* non-critical: the banner simply stays hidden */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => null);
    router.push("/admin/login");
    router.refresh();
  }

  const links = [
    { href: "/admin", label: "Commandes", icon: IconBag },
    { href: "/admin/products", label: "Produits", icon: IconTag },
    { href: "/admin/shipping", label: "Livraison", icon: IconTruck },
  ];

  return (
    <>
      <header className="sticky top-0 z-40 border-b border-ink-700/70 bg-ink-900/95 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3 sm:px-6 lg:px-8">
          <Link href="/admin" className="flex items-center gap-3">
            <BrandLogo variant="mark" />
            <span>
              <span className="block font-display text-lg leading-none font-semibold tracking-[0.16em] text-gold-300">
                {brand}
              </span>
              <span className="mt-0.5 block text-[0.6rem] font-light tracking-[0.22em] text-cream-300/55 uppercase">
                Tableau de bord
              </span>
            </span>
          </Link>

          <nav aria-label="Sections du tableau de bord" className="hidden items-center gap-1 sm:flex">
            {links.map(({ href, label, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                aria-current={pathname === href ? "page" : undefined}
                className={cx(
                  "inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition",
                  pathname === href
                    ? "bg-gold-500/15 text-gold-200 ring-1 ring-gold-500/40"
                    : "text-cream-200/70 hover:bg-ink-800 hover:text-cream-50",
                )}
              >
                <Icon className="h-4 w-4" />
                {label}
              </Link>
            ))}
          </nav>

          <div className="flex items-center gap-2">
            <Link
              href="/"
              className="hidden rounded-full border border-ink-600 px-3.5 py-2 text-xs text-cream-200/80 transition hover:border-gold-500/50 hover:text-gold-200 sm:inline-flex"
            >
              Voir la boutique
            </Link>
            <button
              type="button"
              onClick={logout}
              className="rounded-full border border-ink-600 px-3.5 py-2 text-xs text-cream-200/80 transition hover:border-danger/50 hover:text-danger"
            >
              Déconnexion
            </button>
          </div>
        </div>
      </header>

      {usingDefaultPassword ? (
        <div className="border-b border-amber-500/30 bg-amber-500/10 px-4 py-2.5 text-center text-xs text-amber-200 sm:px-6">
          Mot de passe par défaut en usage. Définissez{" "}
          <code className="rounded bg-ink-900/60 px-1.5 py-0.5 font-mono">ADMIN_PASSWORD</code>{" "}
          dans <code className="rounded bg-ink-900/60 px-1.5 py-0.5 font-mono">.env.local</code> puis
          sur Vercel.
        </div>
      ) : null}

      {/* Mobile bottom navigation */}
      <nav
        aria-label="Sections du tableau de bord"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-ink-700 bg-ink-900/95 backdrop-blur-xl sm:hidden"
      >
        <ul className="flex">
          {links.map(({ href, label, icon: Icon }) => {
            const active = pathname === href;
            return (
              <li key={href} className="flex-1">
                <Link
                  href={href}
                  aria-current={active ? "page" : undefined}
                  className={cx(
                    "flex flex-col items-center gap-1 py-2.5 text-[0.65rem] font-medium transition",
                    active ? "text-gold-300" : "text-cream-300/60",
                  )}
                >
                  <Icon className="h-5 w-5" />
                  {label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </>
  );
}

function IconBag({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
      <path d="M5 8h14l-1 12H6L5 8Z" strokeLinejoin="round" />
      <path d="M9 8V6a3 3 0 0 1 6 0v2" strokeLinecap="round" />
    </svg>
  );
}

function IconTag({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
      <path d="M3 12V4h8l9 9-8 8-9-9Z" strokeLinejoin="round" />
      <circle cx="7.5" cy="7.5" r="1.4" />
    </svg>
  );
}

function IconTruck({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
      <path d="M2 7h11v10H2z" strokeLinejoin="round" />
      <path d="M13 10h5l3 3v4h-8" strokeLinejoin="round" />
      <circle cx="6.5" cy="19" r="1.6" />
      <circle cx="17" cy="19" r="1.6" />
    </svg>
  );
}
