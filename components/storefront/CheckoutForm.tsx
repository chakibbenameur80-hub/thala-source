"use client";

import { useMemo, useState } from "react";
import { Button, Spinner } from "@/components/ui/Button";
import { ChoiceCard, ChipGroup, SelectField, TextArea, TextField } from "@/components/ui/Field";
import { ProductImage } from "@/components/ui/ProductImage";
import { formatDZD } from "@/lib/format";
import { calculateShipping, FREE_SHIPPING_THRESHOLD } from "@/lib/shipping";
import { WILAYAS } from "@/lib/wilayas";
import { validateCheckout, type FieldErrors } from "@/lib/validation";
import type { PlaceOrderResult } from "@/lib/services/shop";
import { DELIVERY_LABELS, SIZE_LABELS } from "@/lib/types";
import type { CheckoutInput, DeliveryType, Product, ShippingRate, Size } from "@/lib/types";

/**
 * Algerian checkout form.
 *
 * Conversion decisions baked in:
 *   - **Cash on delivery** ("paiement à la livraison") is stated in the CTA and
 *     repeated in the reassurance row. It is the single biggest trust factor for
 *     online clothing in Algeria, so it is never hidden behind a link.
 *   - Wilaya is a **searchable-by-nature** dropdown of all 58 entries, grouped
 *     and bilingual so it is usable in Latin *or* Arabic script.
 *   - Delivery method is two big radio cards with the **price shown on each**,
 *     because "is the desk cheaper?" is the first question every customer asks.
 *   - The total is recomputed live, and the free-delivery threshold is used as a
 *     progress nudge rather than a surprise.
 *   - Only 4 required fields. Commune and note stay optional.
 */
export function CheckoutForm({
  product,
  rates,
  initialSize,
  initialQuantity,
  onSubmit,
  onBack,
  onCancel,
}: {
  product: Product;
  rates: ShippingRate[];
  initialSize: Size;
  initialQuantity: number;
  onSubmit: (input: CheckoutInput) => Promise<PlaceOrderResult>;
  onBack: () => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [wilayaCode, setWilayaCode] = useState<string>("");
  const [commune, setCommune] = useState("");
  const [deliveryType, setDeliveryType] = useState<DeliveryType>("home");
  const [size, setSize] = useState<Size>(initialSize);
  const [quantity, setQuantity] = useState(initialQuantity);
  const [note, setNote] = useState("");

  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // ---- live totals -------------------------------------------------------
  const subtotal = product.price * quantity;
  const wilaya = Number(wilayaCode) || null;
  const shipping = useMemo(
    () => (wilaya ? calculateShipping(rates, wilaya, deliveryType, subtotal) : null),
    [rates, wilaya, deliveryType, subtotal],
  );
  const total = subtotal + (shipping?.price ?? 0);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setFormError(null);

    const input: CheckoutInput = {
      customerName: name,
      phone,
      wilayaCode: Number(wilayaCode),
      commune: commune || undefined,
      deliveryType,
      size,
      quantity,
      note: note || undefined,
    };

    // Client-side pass first: instant, specific messages under each field.
    const parsed = validateCheckout(input);
    if (!parsed.ok) {
      setErrors(parsed.errors);
      // Move the keyboard/eye to the first problem.
      const firstKey = Object.keys(parsed.errors)[0];
      document.getElementById(`field-${firstKey}`)?.scrollIntoView({ block: "center" });
      return;
    }
    setErrors({});
    setSubmitting(true);

    try {
      const result = await onSubmit(parsed.value);
      if (!result.ok) {
        if (result.fields) setErrors(result.fields);
        setFormError(result.message);
      }
    } catch {
      setFormError("Une erreur est survenue. Merci de réessayer.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="grid gap-8 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
      <div className="space-y-5">
        {/* ---------- 1. Identity ---------- */}
        <fieldset className="space-y-4">
          <legend className="eyebrow">1 · Vos coordonnées</legend>

          <div id="field-customerName">
            <TextField
              label="Nom et prénom"
              labelAr="الاسم واللقب"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              error={errors.customerName}
              placeholder="Ex : Amina Belkacem"
              autoComplete="name"
              inputMode="text"
              // The submit button moves focus back to the first invalid field.
              name="customerName"
            />
          </div>

          <div id="field-phone">
            <TextField
              label="Numéro de téléphone"
              labelAr="رقم الهاتف"
              required
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              error={errors.phone}
              placeholder="0555 12 34 56"
              autoComplete="tel"
              inputMode="tel"
              name="phone"
              hint="Nous vous appelons pour confirmer avant l'expédition."
            />
          </div>
        </fieldset>

        {/* ---------- 2. Destination ---------- */}
        <fieldset className="space-y-4">
          <legend className="eyebrow">2 · Livraison</legend>

          <div id="field-wilayaCode">
            <SelectField
              label="Wilaya"
              labelAr="الولاية"
              required
              value={wilayaCode}
              onChange={(e) => setWilayaCode(e.target.value)}
              error={errors.wilayaCode}
              name="wilayaCode"
            >
              <option value="">— Choisissez votre wilaya —</option>
              {WILAYAS.map((w) => (
                <option key={w.code} value={w.code}>
                  {String(w.code).padStart(2, "0")} · {w.fr} · {w.ar}
                </option>
              ))}
            </SelectField>
          </div>

          <TextField
            label="Commune (facultatif)"
            labelAr="البلدية"
            value={commune}
            onChange={(e) => setCommune(e.target.value)}
            placeholder="Ex : Bab El Oued"
            autoComplete="address-level2"
            name="commune"
            hint="Aide le livreur à vous trouver plus vite."
          />

          {/* Delivery method with the price on each card. */}
          <div id="field-deliveryType" className="space-y-2">
            <p className="flex items-baseline gap-2 text-sm font-medium text-cream-100">
              <span>Mode de livraison</span>
              <span className="ar text-xs text-cream-300/60">طريقة التوصيل</span>
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              <ChoiceCard
                name="deliveryType"
                value="home"
                checked={deliveryType === "home"}
                onChange={(v) => setDeliveryType(v as DeliveryType)}
                title={DELIVERY_LABELS.home.fr}
                titleAr={DELIVERY_LABELS.home.ar}
                description="Livrée à votre adresse"
                price={
                  wilaya
                    ? subtotal >= FREE_SHIPPING_THRESHOLD
                      ? "Gratuit"
                      : formatDZD(calculateShipping(rates, wilaya, "home", subtotal).base)
                    : undefined
                }
              />
              <ChoiceCard
                name="deliveryType"
                value="office"
                checked={deliveryType === "office"}
                onChange={(v) => setDeliveryType(v as DeliveryType)}
                title={DELIVERY_LABELS.office.fr}
                titleAr={DELIVERY_LABELS.office.ar}
                description="Retrait au bureau de la société"
                price={
                  wilaya ? formatDZD(calculateShipping(rates, wilaya, "office", subtotal).base) : undefined
                }
              />
            </div>
            {errors.deliveryType ? (
              <p role="alert" className="text-xs text-danger">
                {errors.deliveryType}
              </p>
            ) : null}
          </div>
        </fieldset>

        {/* ---------- 3. Options ---------- */}
        <fieldset className="space-y-4">
          <legend className="eyebrow">3 · Article</legend>

          <div id="field-size">
            <ChipGroup
              label="Taille"
              labelAr="المقاس"
              value={size}
              onChange={setSize}
              error={errors.size}
              options={product.sizes.map((s) => ({
                value: s,
                label: SIZE_LABELS[s].fr,
                hint: SIZE_LABELS[s].ar !== SIZE_LABELS[s].fr ? SIZE_LABELS[s].ar : undefined,
              }))}
              hint={size === "CUSTOM" ? "Indiquez vos mesures dans la note ci-dessous." : undefined}
            />
          </div>

          <div className="flex items-center gap-3">
            <span className="text-sm font-medium text-cream-100">Quantité</span>
            <div className="inline-flex items-center gap-1 rounded-full border border-ink-600 bg-ink-800/60 px-1.5 py-1">
              <button
                type="button"
                aria-label="Réduire la quantité"
                className="flex h-8 w-8 items-center justify-center rounded-full text-cream-200 transition hover:bg-ink-700"
                onClick={() => setQuantity((q) => Math.max(1, q - 1))}
              >
                -
              </button>
              <span className="w-8 text-center text-sm tabular-nums">{quantity}</span>
              <button
                type="button"
                aria-label="Augmenter la quantité"
                className="flex h-8 w-8 items-center justify-center rounded-full text-cream-200 transition hover:bg-ink-700"
                onClick={() => setQuantity((q) => Math.min(10, q + 1))}
              >
                +
              </button>
            </div>
          </div>

          <TextArea
            label="Note (facultatif)"
            labelAr="ملاحظة"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={
              size === "CUSTOM"
                ? "Vos mensurations : tour de poitrine, taille, longueur…"
                : "Couleur préférée, heure de livraison préférée…"
            }
            maxLength={500}
            name="note"
          />
        </fieldset>
      </div>

      {/* ---------- Summary (sticky on desktop) ---------- */}
      <aside className="lg:sticky lg:top-24 lg:self-start">
        <div className="panel-cream p-5 shadow-xl sm:p-6">
          <h3 className="font-display text-xl font-semibold text-ink-900">Récapitulatif</h3>

          <div className="mt-4 flex gap-3">
            <ProductImage
              src={product.images[0]}
              alt={product.title}
              className="h-24 w-20 shrink-0 rounded-xl"
            />
            <div className="min-w-0">
              <p className="truncate font-medium text-ink-900">{product.title}</p>
              <p className="text-sm text-ink-500">
                Taille {SIZE_LABELS[size].fr} · Qté {quantity}
              </p>
              <p className="mt-1 text-sm font-semibold text-ink-900">
                {formatDZD(product.price)} × {quantity}
              </p>
            </div>
          </div>

          <dl className="mt-5 space-y-2 border-t border-cream-300 pt-4 text-sm">
            <div className="flex justify-between">
              <dt className="text-ink-500">Sous-total</dt>
              <dd className="font-medium text-ink-900">{formatDZD(subtotal)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-ink-500">
                Livraison
                {wilaya ? ` (${DELIVERY_LABELS[deliveryType].fr.toLowerCase()})` : ""}
              </dt>
              <dd className="font-medium text-ink-900">
                {!wilaya ? (
                  <span className="text-ink-500/60">—</span>
                ) : shipping?.isFree ? (
                  <span className="text-emerald-600">Gratuit</span>
                ) : (
                  formatDZD(shipping?.price ?? 0)
                )}
              </dd>
            </div>
            <div className="flex justify-between border-t border-cream-300 pt-3 text-base">
              <dt className="font-semibold text-ink-900">Total</dt>
              <dd className="font-display text-xl font-semibold text-ink-900">
                {formatDZD(total)}
              </dd>
            </div>
          </dl>

          {/* Free-shipping nudge */}
          {shipping && shipping.remainingForFree > 0 ? (
            <div className="mt-4 rounded-xl bg-gold-500/12 p-3">
              <p className="text-xs text-ink-700">
                Ajoutez{" "}
                <span className="font-semibold">{formatDZD(shipping.remainingForFree)}</span> pour
                la livraison à domicile gratuite (seuil {formatDZD(FREE_SHIPPING_THRESHOLD)}).
              </p>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-cream-300">
                <div
                  className="h-full rounded-full bg-gold-500 transition-all"
                  style={{ width: `${Math.min(100, (subtotal / FREE_SHIPPING_THRESHOLD) * 100)}%` }}
                />
              </div>
            </div>
          ) : shipping?.isFree ? (
            <p className="mt-4 rounded-xl bg-emerald-100 p-3 text-xs text-emerald-800">
              Livraison à domicile offerte.
            </p>
          ) : null}

          {formError ? (
            <p role="alert" className="mt-4 rounded-xl bg-danger/10 p-3 text-xs text-danger">
              {formError}
            </p>
          ) : null}

          <Button type="submit" size="block" disabled={submitting} className="mt-5">
            {submitting ? (
              <>
                <Spinner />
                Envoi en cours…
              </>
            ) : (
              <>Confirmer la commande — {formatDZD(total)}</>
            )}
          </Button>

          <p className="mt-3 text-center text-[0.7rem] text-ink-500">
            Paiement à la livraison. Aucun paiement en ligne requis.
          </p>

          <div className="mt-4 flex items-center justify-between border-t border-cream-300 pt-4">
            <button
              type="button"
              onClick={onBack}
              className="text-xs text-ink-500 underline underline-offset-2 hover:text-ink-900"
            >
              ← Retour à l&apos;article
            </button>
            <button
              type="button"
              onClick={onCancel}
              className="text-xs text-ink-500 underline underline-offset-2 hover:text-ink-900"
            >
              Annuler
            </button>
          </div>
        </div>
      </aside>
    </form>
  );
}
