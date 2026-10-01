"use client";

import { useRef, useState } from "react";
import { Button, Spinner } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { MultiChipGroup, TextArea, TextField } from "@/components/ui/Field";
import { ProductImage } from "@/components/ui/ProductImage";
import { EmptyState, PanelError } from "@/components/admin/OrdersPanel";
import { useShop } from "@/components/admin/useShop";
import { createProduct, deleteProduct, updateProduct } from "@/lib/services/shop";
import { discountPercent, formatDZD, hasRealDiscount } from "@/lib/format";
import { SIZES, SIZE_LABELS } from "@/lib/types";
import type { Product, ShopData, Size } from "@/lib/types";

/** Editable fields of a product — id and timestamps are owned by the service. */
type ProductDraft = Omit<Product, "id" | "createdAt" | "updatedAt">;

/** Blank draft used when the "add" form is opened. */
function blankDraft(): ProductDraft {
  return {
    title: "",
    subtitle: "",
    description: "",
    price: 0,
    compareAtPrice: null,
    images: [],
    sizes: ["S", "M", "L", "XL"],
    featured: false,
    inStock: true,
  };
}

/**
 * Product management: list, add, edit, delete.
 *
 * Photos can be provided two ways, because neither approach works everywhere on
 * its own:
 *   - a **URL** — works in every deployment, recommended for production;
 *   - a **file upload** — written to `public/uploads` in local dev, and to
 *     Supabase Storage once Supabase is configured.
 */
export function ProductsPanel({ initial }: { initial: ShopData }) {
  const { data, error, refresh } = useShop(initial);
  // `null` = no editor open. An object = editing an existing product; the
  // `isNew` flag distinguishes the two so the form knows which service call to
  // make instead of guessing from the title.
  const [editor, setEditor] = useState<{ draft: ProductDraft; isNew: boolean; id?: string } | null>(
    null,
  );
  const [pendingDelete, setPendingDelete] = useState<Product | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  if (error) return <PanelError message={error} onRetry={refresh} />;

  async function handleDelete(product: Product) {
    setBusy(true);
    setActionError(null);
    try {
      await deleteProduct(product.id);
      setPendingDelete(null);
      await refresh();
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : "Suppression impossible.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-cream-300/60">
          {data.products.length} produit{data.products.length > 1 ? "s" : ""} au catalogue.
        </p>
        <Button onClick={() => setEditor({ draft: blankDraft(), isNew: true })}>
          <svg
            viewBox="0 0 24 24"
            className="h-4 w-4"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            aria-hidden="true"
          >
            <path d="M12 5v14m-7-7h14" strokeLinecap="round" />
          </svg>
          Ajouter une robe
        </Button>
      </div>

      {actionError ? (
        <p role="alert" className="rounded-xl bg-danger/10 px-4 py-3 text-sm text-danger">
          {actionError}
        </p>
      ) : null}

      {data.products.length === 0 ? (
        <EmptyState
          title="Catalogue vide"
          body="Ajoutez votre première robe pour qu'elle apparaisse sur la boutique."
        />
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {data.products.map((product) => (
            <li
              key={product.id}
              className="flex gap-4 rounded-2xl border border-ink-700 bg-ink-900/70 p-4"
            >
              <ProductImage
                src={product.images[0]}
                alt={product.title}
                className="h-24 w-20 shrink-0 rounded-xl"
              />

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  {product.featured ? (
                    <span className="rounded-full bg-gold-500/15 px-2 py-0.5 text-[0.6rem] text-gold-300">
                      Vedette
                    </span>
                  ) : null}
                  {!product.inStock ? (
                    <span className="rounded-full bg-rose-500/15 px-2 py-0.5 text-[0.6rem] text-rose-300">
                      Épuisé
                    </span>
                  ) : null}
                </div>

                <p className="mt-1 truncate text-sm font-medium text-cream-50">{product.title}</p>
                <p className="text-sm font-semibold text-gold-300">{formatDZD(product.price)}</p>
                <p className="mt-1 line-clamp-1 text-xs text-cream-300/50">
                  {product.sizes.map((s) => SIZE_LABELS[s].fr).join(" · ")}
                </p>

                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    onClick={() => setEditor({ draft: { ...toDraft(product) }, isNew: false, id: product.id })}
                    className="rounded-lg border border-ink-600 px-3 py-1.5 text-xs text-cream-200/85 transition hover:border-gold-500/60 hover:text-gold-200"
                  >
                    Modifier
                  </button>
                  <button
                    type="button"
                    onClick={() => setPendingDelete(product)}
                    className="rounded-lg px-2 py-1.5 text-xs text-cream-300/50 transition hover:text-danger"
                  >
                    Supprimer
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      {editor ? (
        <ProductForm
          key={editor.isNew ? "new" : editor.id}
          draft={editor.draft}
          isNew={editor.isNew}
          productId={editor.id}
          onClose={() => setEditor(null)}
          onSaved={async () => {
            setEditor(null);
            await refresh();
          }}
        />
      ) : null}

      {pendingDelete ? (
        <Modal open onClose={() => setPendingDelete(null)} title="Supprimer ce produit ?" size="md">
          <p className="text-sm text-cream-200/80">
            <span className="font-medium text-cream-50">{pendingDelete.title}</span> sera retiré du
            catalogue. Les commandes déjà passées conservent leur historique.
          </p>
          <div className="mt-6 flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setPendingDelete(null)}>
              Annuler
            </Button>
            <Button variant="danger" disabled={busy} onClick={() => handleDelete(pendingDelete)}>
              {busy ? <Spinner /> : null}
              Supprimer définitivement
            </Button>
          </div>
        </Modal>
      ) : null}
    </div>
  );
}

/** Strips the server-owned fields so a product can be edited as a plain draft. */
function toDraft(product: Product): ProductDraft {
  return {
    title: product.title,
    subtitle: product.subtitle,
    description: product.description,
    price: product.price,
    compareAtPrice: product.compareAtPrice,
    images: [...product.images],
    sizes: [...product.sizes],
    featured: product.featured,
    inStock: product.inStock,
  };
}

/* ------------------------------------------------------------------ *
 * Add / edit form
 * ------------------------------------------------------------------ */

function ProductForm({
  draft: initial,
  isNew,
  productId,
  onClose,
  onSaved,
}: {
  draft: ProductDraft;
  isNew: boolean;
  productId?: string;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [draft, setDraft] = useState<ProductDraft>(initial);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [urlDraft, setUrlDraft] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);

  function patch<K extends keyof ProductDraft>(key: K, value: ProductDraft[K]) {
    setDraft((d) => ({ ...d, [key]: value }));
  }

  function addImage(url: string) {
    const clean = url.trim();
    if (!clean) return;
    if (draft.images.length >= 6) {
      setError("Six photos maximum par robe.");
      return;
    }
    if (draft.images.includes(clean)) {
      setError("Cette photo est déjà dans la liste.");
      return;
    }
    patch("images", [...draft.images, clean]);
    setUrlDraft("");
    setError(null);
  }

  async function handleUpload(file: File) {
    setUploading(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const response = await fetch("/api/upload", { method: "POST", body: form });
      const data = await response.json();
      if (!response.ok) {
        setError(data.error ?? "Envoi impossible.");
        return;
      }
      addImage(data.url as string);
    } catch {
      setError("Envoi impossible. Collez plutôt l'URL de l'image.");
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    if (!draft.title.trim()) {
      setError("Le titre est obligatoire.");
      return;
    }
    if (!Number.isFinite(draft.price) || draft.price <= 0) {
      setError("Le prix doit être supérieur à 0.");
      return;
    }
    if (draft.sizes.length === 0) {
      setError("Sélectionnez au moins une taille.");
      return;
    }
    const compareAt = draft.compareAtPrice ?? null;
    if (compareAt !== null && compareAt > 0 && compareAt <= draft.price) {
      setError("L'ancien prix doit être supérieur au prix de vente.");
      return;
    }

    setBusy(true);
    try {
      const clean: ProductDraft = { ...draft, title: draft.title.trim() };
      if (isNew) {
        await createProduct(clean);
      } else {
        // `productId` is guaranteed for an existing product: the panel only sets
        // `isNew: false` alongside an id.
        await updateProduct(productId!, clean);
      }
      await onSaved();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Enregistrement impossible.");
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={isNew ? "Nouvelle robe" : "Modifier la robe"}
      subtitle="Le titre et le prix sont visibles sur la boutique."
      size="xl"
    >
      <form
        onSubmit={handleSubmit}
        className="grid gap-6 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]"
      >
        {/* ---- Photos ---- */}
        <div className="space-y-3">
          <p className="eyebrow">Photos</p>

          {draft.images.length > 0 ? (
            <ul className="grid grid-cols-3 gap-2">
              {draft.images.map((image) => (
                <li key={image} className="relative">
                  <ProductImage src={image} alt="" className="aspect-4/5 w-full rounded-xl" />
                  <button
                    type="button"
                    onClick={() => patch("images", draft.images.filter((i) => i !== image))}
                    aria-label="Supprimer cette photo"
                    className="absolute top-1.5 right-1.5 rounded-full bg-ink-950/80 p-1.5 text-cream-200 transition hover:bg-danger hover:text-white"
                  >
                    <svg
                      viewBox="0 0 24 24"
                      className="h-3.5 w-3.5"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.5"
                      aria-hidden="true"
                    >
                      <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
                    </svg>
                  </button>
                  {image === draft.images[0] ? (
                    <span className="absolute bottom-1.5 left-1.5 rounded-full bg-gold-500 px-2 py-0.5 text-[0.55rem] font-semibold text-ink-950">
                      Couverture
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : (
            <p className="rounded-xl border border-dashed border-ink-600 p-6 text-center text-xs text-cream-300/50">
              Aucune photo. Sans photo, la boutique affiche un motif de remplacement.
            </p>
          )}

          <div className="flex gap-2">
            <TextField
              label="Ajouter par URL"
              className="flex-1"
              value={urlDraft}
              onChange={(e) => setUrlDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addImage(urlDraft);
                }
              }}
              placeholder="https://… ou /images/robe.jpg"
            />
            <Button
              type="button"
              variant="dark"
              className="mt-6 shrink-0"
              onClick={() => addImage(urlDraft)}
              disabled={!urlDraft.trim()}
            >
              Ajouter
            </Button>
          </div>

          <label className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-full border border-ink-600 px-4 py-2 text-xs text-cream-200/80 transition hover:border-gold-500/60 hover:text-gold-200">
            {uploading ? <Spinner className="h-3.5 w-3.5" /> : null}
            {uploading ? "Envoi…" : "Envoyer un fichier"}
            <input
              ref={fileInput}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/avif"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void handleUpload(file);
              }}
            />
          </label>
        </div>

        {/* ---- Champs ---- */}
        <div className="space-y-4">
          <TextField
            label="Titre"
            required
            value={draft.title}
            onChange={(e) => patch("title", e.target.value)}
            placeholder="Robe Kablye Iferhounen"
          />

          <TextField
            label="Sous-titre"
            value={draft.subtitle ?? ""}
            onChange={(e) => patch("subtitle", e.target.value)}
            placeholder="Brodé main — noir & or"
          />

          <div className="grid grid-cols-2 gap-3">
            <TextField
              label="Prix (DA)"
              required
              type="number"
              inputMode="numeric"
              min={0}
              step={50}
              value={draft.price || ""}
              onChange={(e) => patch("price", Number(e.target.value) || 0)}
            />
            <TextField
              label="Ancien prix (DA)"
              type="number"
              inputMode="numeric"
              min={0}
              step={50}
              value={draft.compareAtPrice ?? ""}
              onChange={(e) =>
                patch("compareAtPrice", e.target.value ? Number(e.target.value) : null)
              }
              hint="Optionnel."
            />
          </div>

          <TextArea
            label="Description"
            value={draft.description ?? ""}
            onChange={(e) => patch("description", e.target.value)}
            rows={5}
            placeholder="Matière, coupe, entretien, délai de fabrication…"
          />

          <MultiChipGroup
            label="Tailles disponibles"
            options={SIZES.map((s) => ({ value: s, label: SIZE_LABELS[s].fr }))}
            values={draft.sizes}
            onChange={(values) => patch("sizes", values as Size[])}
            error={draft.sizes.length === 0 ? "Au moins une taille." : undefined}
            columns="3"
          />

          <div className="flex flex-wrap gap-5 pt-1">
            <label className="flex cursor-pointer items-center gap-2 text-sm text-cream-100">
              <input
                type="checkbox"
                checked={draft.featured}
                onChange={(e) => patch("featured", e.target.checked)}
                className="h-4 w-4 accent-gold-500"
              />
              Mettre en vedette
            </label>
            <label className="flex cursor-pointer items-center gap-2 text-sm text-cream-100">
              <input
                type="checkbox"
                checked={draft.inStock}
                onChange={(e) => patch("inStock", e.target.checked)}
                className="h-4 w-4 accent-gold-500"
              />
              En stock
            </label>
          </div>

          {hasRealDiscount(draft) ? (
            <p className="text-xs text-emerald-300">
              Badge « -
              {discountPercent(draft)}
              % » affiché automatiquement.
            </p>
          ) : null}

          {error ? (
            <p role="alert" className="rounded-xl bg-danger/10 px-4 py-3 text-sm text-danger">
              {error}
            </p>
          ) : null}

          <div className="flex justify-end gap-2 border-t border-ink-700 pt-4">
            <Button type="button" variant="ghost" onClick={onClose}>
              Annuler
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? <Spinner /> : null}
              {isNew ? "Créer la robe" : "Enregistrer"}
            </Button>
          </div>
        </div>
      </form>
    </Modal>
  );
}