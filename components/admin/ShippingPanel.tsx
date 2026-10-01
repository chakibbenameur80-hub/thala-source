"use client";

import { useMemo, useState } from "react";
import { Button, Spinner } from "@/components/ui/Button";
import { PanelError } from "@/components/admin/OrdersPanel";
import { useShop } from "@/components/admin/useShop";
import { saveShippingRates } from "@/lib/services/shop";
import { FREE_SHIPPING_THRESHOLD, defaultShippingRates } from "@/lib/shipping";
import { formatDZD } from "@/lib/format";
import { WILAYAS } from "@/lib/wilayas";
import type { ShippingRate, ShopData } from "@/lib/types";

/**
 * Shipping editor: one row per wilaya, two prices (home / office).
 *
 * Two deliberate design decisions:
 *   - **Every rate is a plain number input**, not a dropdown of presets. The shop
 *     negotiates with its courier and prices change per wilaya; a free-form field
 *     is what they actually need, and 58 free-form fields are still fast to edit
 *     thanks to "Apply to all".
 *   - Edits are held in local state and only persisted on **Enregistrer**, so a
 *     mistyped price cannot reach the storefront mid-edit.
 */
export function ShippingPanel({ initial }: { initial: ShopData }) {
  const { data, error, refresh } = useShop(initial);
  const [draft, setDraft] = useState<Map<number, ShippingRate> | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [filter, setFilter] = useState("");
  const [bulk, setBulk] = useState<{ home: string; office: string }>({ home: "", office: "" });

  // Rows in wilaya order, merging any pending edits over the persisted rates.
  const rows = useMemo(() => {
    const base = new Map<number, ShippingRate>();
    const source = data.shipping.length > 0 ? data.shipping : defaultShippingRates();
    for (const rate of source) base.set(rate.wilayaCode, rate);
    for (const [code, rate] of draft ?? []) base.set(code, rate);

    const needle = filter.trim().toLowerCase();
    return WILAYAS.filter(
      (w) =>
        !needle ||
        String(w.code).startsWith(needle) ||
        w.fr.toLowerCase().includes(needle) ||
        w.ar.includes(needle),
    ).map((w) => base.get(w.code) ?? { wilayaCode: w.code, home: 0, office: 0 });
  }, [data.shipping, draft, filter]);

  if (error) return <PanelError message={error} onRetry={refresh} />;

  const dirty = draft !== null && draft.size > 0;

  function setRate(code: number, key: "home" | "office", value: number) {
    setMessage(null);
    setDraft((current) => {
      const next = new Map(current ?? data.shipping.map((r) => [r.wilayaCode, r]));
      const existing = next.get(code) ?? { wilayaCode: code, home: 0, office: 0 };
      next.set(code, { ...existing, [key]: value });
      return next;
    });
  }

  function applyToAll() {
    const home = Number(bulk.home);
    const office = Number(bulk.office);
    if (!Number.isFinite(home) && !Number.isFinite(office)) {
      setMessage({ tone: "error", text: "Saisissez au moins un montant." });
      return;
    }
    setMessage(null);
    setDraft((current) => {
      const next = new Map(current ?? data.shipping.map((r) => [r.wilayaCode, r]));
      for (const wilaya of WILAYAS) {
        const existing = next.get(wilaya.code) ?? { wilayaCode: wilaya.code, home: 0, office: 0 };
        next.set(wilaya.code, {
          wilayaCode: wilaya.code,
          home: Number.isFinite(home) && home >= 0 ? home : existing.home,
          office: Number.isFinite(office) && office >= 0 ? office : existing.office,
        });
      }
      return next;
    });
  }

  async function save() {
    if (!draft) return;
    // Persist every wilaya, not just the filtered ones — the edit map may only
    // contain the rows the owner touched, but the storefront needs all 58.
    const complete: ShippingRate[] = WILAYAS.map((wilaya) => {
      const existing = data.shipping.find((r) => r.wilayaCode === wilaya.code);
      const pending = draft.get(wilaya.code);
      return pending ?? existing ?? { wilayaCode: wilaya.code, home: 0, office: 0 };
    });
    const invalid = complete.find((r) => r.home < 0 || r.office < 0);
    if (invalid) {
      setMessage({
        tone: "error",
        text: `Le tarif de la wilaya ${invalid.wilayaCode} est négatif.`,
      });
      return;
    }

    setBusy(true);
    setMessage(null);
    try {
      await saveShippingRates(complete);
      setDraft(null);
      setBulk({ home: "", office: "" });
      await refresh();
      setMessage({ tone: "ok", text: "Tarifs de livraison enregistrés." });
    } catch (cause) {
      setMessage({
        tone: "error",
        text: cause instanceof Error ? cause.message : "Enregistrement impossible.",
      });
    } finally {
      setBusy(false);
    }
  }

  function reset() {
    setDraft(null);
    setBulk({ home: "", office: "" });
    setMessage(null);
  }

  return (
    <div className="space-y-6">
      {/* ---- Free-shipping reminder + bulk edit ---- */}
      <div className="rounded-2xl border border-gold-500/30 bg-gold-500/5 p-4">
        <p className="text-sm text-cream-100">
          Livraison à domicile gratuite dès{" "}
          <span className="font-semibold text-gold-300">{formatDZD(FREE_SHIPPING_THRESHOLD)}</span>.
        </p>
        <p className="mt-1 text-xs text-cream-300/60">
          Ce seuil est appliqué automatiquement dans le panier et sur toutes les wilayas.
        </p>

        <div className="mt-4 flex flex-wrap items-end gap-2">
          <label className="text-xs text-cream-300/70">
            <span className="block">Appliquer à toutes les wilayas</span>
            <input
              type="number"
              inputMode="numeric"
              min={0}
              step={50}
              value={bulk.home}
              onChange={(e) => setBulk((b) => ({ ...b, home: e.target.value }))}
              placeholder="Domicile"
              className="mt-1 w-28 rounded-lg border border-ink-600 bg-ink-800 px-3 py-2 text-sm text-cream-50 outline-none focus:border-gold-500"
            />
          </label>
          <label className="text-xs text-cream-300/70">
            <span className="block">Bureau</span>
            <input
              type="number"
              inputMode="numeric"
              min={0}
              step={50}
              value={bulk.office}
              onChange={(e) => setBulk((b) => ({ ...b, office: e.target.value }))}
              placeholder="Bureau"
              className="mt-1 w-28 rounded-lg border border-ink-600 bg-ink-800 px-3 py-2 text-sm text-cream-50 outline-none focus:border-gold-500"
            />
          </label>
          <Button type="button" variant="dark" size="sm" onClick={applyToAll}>
            Appliquer
          </Button>
        </div>
      </div>

      {/* ---- Search ---- */}
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="search"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Rechercher une wilaya…"
          aria-label="Rechercher une wilaya"
          className="w-full max-w-xs rounded-full border border-ink-600 bg-ink-800 px-4 py-2 text-sm text-cream-50 outline-none placeholder:text-cream-300/40 focus:border-gold-500"
        />
        <span className="text-xs text-cream-300/50">
          {rows.length} wilaya{rows.length > 1 ? "s" : ""}
        </span>
      </div>

      {message ? (
        <p
          role={message.tone === "error" ? "alert" : "status"}
          className={
            message.tone === "error"
              ? "rounded-xl bg-danger/10 px-4 py-3 text-sm text-danger"
              : "rounded-xl bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200"
          }
        >
          {message.text}
        </p>
      ) : null}

      {/* ---- Rates ---- */}
      <div className="overflow-hidden rounded-2xl border border-ink-700">
        <ul className="divide-y divide-ink-700/80">
          {rows.map((rate) => {
            const wilaya = WILAYAS.find((w) => w.code === rate.wilayaCode)!;
            return (
              <li
                key={rate.wilayaCode}
                className="flex items-center gap-3 bg-ink-900/60 px-4 py-2.5"
              >
                <span className="w-7 shrink-0 text-center font-mono text-xs text-cream-300/45 tabular-nums">
                  {wilaya.code}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm text-cream-50">{wilaya.fr}</span>
                  <span className="ar block truncate text-xs text-cream-300/55">{wilaya.ar}</span>
                </span>

                <label className="sr-only-focusable" htmlFor={`home-${rate.wilayaCode}`}>
                  Livraison à domicile vers {wilaya.fr}, en dinars
                </label>
                <input
                  id={`home-${rate.wilayaCode}`}
                  type="number"
                  inputMode="numeric"
                  min={0}
                  step={50}
                  value={rate.home}
                  onChange={(e) => setRate(rate.wilayaCode, "home", Number(e.target.value) || 0)}
                  className="w-20 rounded-lg border border-ink-600 bg-ink-800 px-2 py-1.5 text-right text-sm text-cream-50 tabular-nums outline-none focus:border-gold-500 sm:w-24"
                />
                <span aria-hidden="true" className="text-[0.65rem] text-cream-300/40">
                  /
                </span>
                <label className="sr-only-focusable" htmlFor={`office-${rate.wilayaCode}`}>
                  Livraison au bureau vers {wilaya.fr}, en dinars
                </label>
                <input
                  id={`office-${rate.wilayaCode}`}
                  type="number"
                  inputMode="numeric"
                  min={0}
                  step={50}
                  value={rate.office}
                  onChange={(e) => setRate(rate.wilayaCode, "office", Number(e.target.value) || 0)}
                  className="w-20 rounded-lg border border-ink-600 bg-ink-800 px-2 py-1.5 text-right text-sm text-cream-50 tabular-nums outline-none focus:border-gold-500 sm:w-24"
                />
              </li>
            );
          })}
        </ul>
      </div>

      {rows.length === 0 ? (
        <p className="text-center text-sm text-cream-300/50">Aucune wilaya ne correspond.</p>
      ) : null}

      {/* ---- Save bar ---- */}
      <div className="sticky bottom-16 z-30 flex flex-wrap items-center justify-end gap-3 rounded-2xl border border-ink-700 bg-ink-900/95 px-4 py-3 backdrop-blur-xl sm:bottom-4">
        {dirty ? (
          <span className="mr-auto text-xs text-gold-300">Modifications non enregistrées.</span>
        ) : (
          <span className="mr-auto text-xs text-cream-300/50">
            Domicile / Bureau, en dinars algériens.
          </span>
        )}
        <Button type="button" variant="ghost" onClick={reset} disabled={!dirty || busy}>
          Annuler
        </Button>
        <Button type="button" onClick={save} disabled={!dirty || busy}>
          {busy ? <Spinner /> : null}
          Enregistrer
        </Button>
      </div>
    </div>
  );
}