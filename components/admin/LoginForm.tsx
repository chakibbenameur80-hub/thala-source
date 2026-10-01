"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { Button, Spinner } from "@/components/ui/Button";
import { BrandLogo } from "@/components/ui/BrandLogo";
import { BRAND } from "@/lib/brand";

/**
 * Admin login form.
 *
 * The password is checked in `/api/auth/login` against `ADMIN_PASSWORD` on the
 * server; the browser only ever holds the resulting httpOnly cookie. On success
 * the user is sent back to wherever `proxy.ts` interrupted them.
 */
export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [defaultPassword, setDefaultPassword] = useState(false);

  // Only ever redirect to a path inside this app — never to an arbitrary URL.
  const next = searchParams.get("next") ?? "/admin";
  const safeNext = next.startsWith("/admin") ? next : "/admin";

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const data = await response.json();

      if (!response.ok) {
        setError(data.error ?? "Connexion impossible.");
        return;
      }
      // The login response tells us whether the shop is still on the built-in
      // password, so we can warn the owner on this very screen.
      if (data.usingDefaultPassword) setDefaultPassword(true);
      // `router.refresh()` re-runs the server components so the layout's
      // session check sees the new cookie.
      router.push(safeNext);
      router.refresh();
    } catch {
      setError("Connexion impossible. Vérifiez votre réseau.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="w-full max-w-sm space-y-5">
      <div className="text-center">
        <div className="flex justify-center">
          <BrandLogo variant="mark" priority />
        </div>
        <h1 className="mt-4 font-display text-3xl font-semibold text-cream-50">
          {BRAND.name}
        </h1>
        <p className="mt-1 text-xs font-light tracking-[0.24em] text-cream-300/60 uppercase">
          Tableau de bord
        </p>
      </div>

      <div>
        <label htmlFor="admin-password" className="block text-sm font-medium text-cream-100">
          Mot de passe administrateur
        </label>
        <input
          id="admin-password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
          autoFocus
          required
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? "login-error" : undefined}
          className="mt-2 w-full rounded-xl border border-ink-600 bg-cream-50 px-4 py-3 text-ink-900 outline-none transition focus:border-gold-500 focus:ring-2 focus:ring-gold-500/30"
        />
        {error ? (
          <p id="login-error" role="alert" className="mt-2 text-xs text-danger">
            {error}
          </p>
        ) : null}
      </div>

      {defaultPassword ? (
        <p className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-xs text-amber-200">
          Vous utilisez encore le mot de passe par défaut. Définissez{" "}
          <code className="rounded bg-ink-900/60 px-1 py-0.5 font-mono">ADMIN_PASSWORD</code> dans{" "}
          <code className="rounded bg-ink-900/60 px-1 py-0.5 font-mono">.env.local</code>, puis sur
          Vercel, avant de mettre la boutique en ligne.
        </p>
      ) : null}

      <Button type="submit" size="block" disabled={submitting}>
        {submitting ? (
          <>
            <Spinner />
            Connexion…
          </>
        ) : (
          "Se connecter"
        )}
      </Button>

      <p className="text-center text-xs text-cream-300/45">
        Accès réservé. Après 8 tentatives, l&apos;accès est bloqué 10 minutes.
      </p>
    </form>
  );
}
