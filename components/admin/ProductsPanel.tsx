"use client";

import { useEffect, useRef, useState } from "react";
import { Button, Spinner } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { MultiChipGroup, TextArea, TextField } from "@/components/ui/Field";
import { ProductImage } from "@/components/ui/ProductImage";
import { EmptyState, PanelError } from "@/components/admin/OrdersPanel";
import { useShop } from "@/components/admin/useShop";
import {
  createProduct,
  deleteProduct,
  importProducts,
  removeImage,
  updateProduct,
} from "@/lib/services/shop";
import { isLocalMode } from "@/lib/services/shop";
import { compressForUpload, isAllowedImageType } from "@/lib/imageClient";
import { readRawShop, parseStoredShop } from "@/lib/db/local";
import { seedProducts } from "@/lib/seed";
import { discountPercent, formatDZD, hasRealDiscount } from "@/lib/format";
import { SIZES, SIZE_LABELS } from "@/lib/types";
import type { Product, ShopData, Size } from "@/lib/types";

/** Editable fields of a product — id and timestamps are owned by the service. */
type ProductDraft = Omit<Product, "id" | "createdAt" | "updatedAt">;

/**
 * Upload limits, mirrored in `lib/images.ts` on the server.
 *
 * Duplicated rather than imported because `lib/images.ts` pulls in `sharp`, which
 * cannot be bundled into the browser. These are for instant feedback only; the
 * server is the authority.
 */
const MAX_IMAGES = 6;
const MAX_IMAGE_BYTES = 10 * 1024 * 1024; // 10 MB
const ACCEPTED_TYPES = "image/jpeg,image/png,image/webp";

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
 * Photos are picked from the device (phone camera roll, desktop file picker) and
 * stored in Supabase Storage; the form only ever handles the permanent URL that
 * comes back. There is deliberately no URL field any more: a pasted link is
 * either a broken image or an unbounded external dependency, and neither is
 * something an admin should have to think about while adding a dress.
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
  const [importing, setImporting] = useState(false);
  const [importReport, setImportReport] = useState<string | null>(null);

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

  /**
   * Moves this browser's catalogue into Postgres.
   *
   * Reads `localStorage` first because that is where the shop's history actually
   * lives; falls back to the built-in seed catalogue on a browser that never made
   * an edit, so a fresh database can still be filled. The server skips ids that
   * already exist, so pressing the button twice is harmless.
   */
  async function handleImport() {
    setImporting(true);
    setActionError(null);
    setImportReport(null);
    try {
      const stored = parseStoredShop(readRawShop());
      const source = stored?.products.length ? stored.products : seedProducts();
      const result = await importProducts(source);
      setImportReport(
        result.imported > 0
          ? `${result.imported} produit${result.imported > 1 ? "s" : ""} importé${
              result.imported > 1 ? "s" : ""
            }${result.skipped > 0 ? `, ${result.skipped} déjà présent${result.skipped > 1 ? "s" : ""}` : ""}.`
          : "Tous les produits de ce navigateur sont déjà dans la base.",
      );
      await refresh();
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : "Import impossible.");
    } finally {
      setImporting(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-cream-300/60">
          {data.products.length} produit{data.products.length > 1 ? "s" : ""} au catalogue.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          {/* One-time migration out of `localStorage`. Hidden in local mode, where
              there is no database to import into. */}
          {!isLocalMode() ? (
            <Button variant="ghost" disabled={importing} onClick={handleImport}>
              {importing ? <Spinner /> : null}
              {importing ? "Import…" : "Importer le catalogue local"}
            </Button>
          ) : null}
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
      </div>

      {importReport ? (
        <p className="rounded-xl bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
          {importReport}
        </p>
      ) : null}

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
  const [error, setError] = useState<string | null>(null);
  /**
   * One-shot status line under the picker. Kept as a distinct piece of state from
   * `error` because "Téléchargement…" and "Image téléchargée ✓" are progress,
   * not failures, and must not be styled as errors.
   */
  const [uploadStatus, setUploadStatus] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  /** Preview of the file currently in flight, before the server has a URL for it. */
  const [pending, setPending] = useState<{ preview: string; name: string } | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  /**
   * Photos this product had before the edit. The difference between this and
   * `draft.images` is exactly what the save is allowed to delete.
   */
  const originalImages = useRef<string[]>(isNew ? [] : [...initial.images]);

  /**
   * Objects uploaded during this form session.
   *
   * If the admin saves, they are referenced by the product and must stay. If they
   * walk away, nothing points at them and they are pure storage cost — so the
   * cleanup on unmount removes them. `committed` is the flag that separates the
   * two outcomes, and it has to be a ref: the cleanup runs during unmount, where
   * setting state would be pointless.
   */
  const sessionUploads = useRef<string[]>([]);
  const committed = useRef(false);

  function patch<K extends keyof ProductDraft>(key: K, value: ProductDraft[K]) {
    setDraft((d) => ({ ...d, [key]: value }));
  }

  // Photos uploaded then abandoned (the modal was closed, not saved). Best effort:
  // an orphan costs a few kilobytes, and the endpoint refuses anything still in use.
  useEffect(() => {
    // Safe to capture the array here: it is only ever `push`ed into, never
    // reassigned, so this reference sees every upload made after mount.
    const uploads = sessionUploads.current;
    return () => {
      if (committed.current) return;
      for (const url of uploads) void removeImage(url);
    };
  }, []);

  /**
   * Appends an already-uploaded image.
   *
   * The URL comes from the upload response and is trusted only to be non-empty;
   * the server has already validated the bytes. It is still de-duplicated, since
   * re-picking the same photo twice would otherwise store two copies.
   */
  function addImage(url: string) {
    const clean = url.trim();
    if (!clean) return;
    if (draft.images.length >= MAX_IMAGES) {
      setError(`Six photos maximum par robe.`);
      return;
    }
    if (draft.images.includes(clean)) {
      setError("Cette photo est déjà dans la liste.");
      return;
    }
    sessionUploads.current.push(clean);
    patch("images", [...draft.images, clean]);
    setError(null);
  }

  /**
   * Removes a photo from the draft. **Nothing is deleted yet.**
   *
   * Deleting the object here would be wrong: the product row still references it
   * until the admin saves, so a cancelled edit — or a failed save — would leave a
   * live product pointing at a photo that no longer exists. The removal is instead
   * applied after a successful write, where the server can check that nothing else
   * references the same object first.
   */
  function dropImage(url: string) {
    patch(
      "images",
      draft.images.filter((i) => i !== url),
    );
  }

  async function handleUpload(file: File) {
    // Client-side guard so an obviously wrong file fails instantly with a clear
    // message, without uploading anything. The server repeats every one of these
    // checks — this is convenience, never the security boundary.
    if (!isAllowedImageType(file.type)) {
      setError("Format d'image non pris en charge. Utilisez JPG, PNG ou WEBP.");
      setUploadStatus(null);
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      setError("Image trop volumineuse. Taille maximale : 10 MB.");
      setUploadStatus(null);
      return;
    }

    setUploading(true);
    setError(null);
    setUploadStatus("Téléchargement…");

    // Immediate preview, so the admin sees their photo before the round trip. The
    // object URL is revoked as soon as the real URL (or a failure) replaces it.
    const preview = URL.createObjectURL(file);
    setPending({ preview, name: file.name });

    try {
      // Vercel rejects request bodies over ~4.5 MB before the route handler runs,
      // so a full-resolution phone photo has to be shrunk here or it never arrives.
      // The server still decodes and re-encodes whatever it receives.
      const payload = await compressForUpload(file);

      const form = new FormData();
      form.append("file", payload, payload.name);
      const response = await fetch("/api/upload", { method: "POST", body: form });

      const data: unknown = await response.json().catch(() => null);
      const url =
        data && typeof data === "object" && "url" in data && typeof data.url === "string"
          ? data.url
          : null;

      if (!response.ok || !url) {
        const message =
          data && typeof data === "object" && "error" in data && typeof data.error === "string"
            ? data.error
            : "Échec du téléchargement de l'image.";
        setError(message);
        setUploadStatus(null);
        return;
      }

      addImage(url);
      // Replaces the progress line: the file is stored and its preview is now in
      // the grid above.
      setUploadStatus("Image téléchargée ✓");
    } catch {
      setError("Échec du téléchargement de l'image. Vérifiez votre connexion et réessayez.");
      setUploadStatus(null);
    } finally {
      URL.revokeObjectURL(preview);
      setPending(null);
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

      // The product row now holds the new list, so anything it used to reference
      // and no longer does is genuinely unreferenced — unless another product
      // shares it, which the server re-checks before removing anything. Doing this
      // only after a successful save is what keeps a failed edit from breaking a
      // live product's photo.
      committed.current = true;
      const dropped = originalImages.current.filter((url) => !clean.images.includes(url));
      for (const url of dropped) void removeImage(url);

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

          {draft.images.length > 0 || pending ? (
            <ul className="grid grid-cols-3 gap-2">
              {draft.images.map((image) => (
                <li key={image} className="relative">
                  <ProductImage src={image} alt="" className="aspect-4/5 w-full rounded-xl" />
                  <button
                    type="button"
                    onClick={() => dropImage(image)}
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

              {/* The picked file, shown while it is still being uploaded. There is no
                  URL yet, so this is a local object URL and it carries no remove
                  button — cancelling means waiting a moment. */}
              {pending ? (
                <li className="relative opacity-60">
                  <ProductImage src={pending.preview} alt="" className="aspect-4/5 w-full rounded-xl" />
                  <span className="absolute inset-x-0 bottom-0 rounded-b-xl bg-ink-950/85 py-1 text-center text-[0.55rem] text-cream-200">
                    {pending.name.slice(0, 22)}
                  </span>
                </li>
              ) : null}
            </ul>
          ) : (
            <p className="rounded-xl border border-dashed border-ink-600 p-6 text-center text-xs text-cream-300/50">
              Aucune photo. Sans photo, la boutique affiche un motif de remplacement.
            </p>
          )}

          {/* A real label wrapping a hidden file input: this is what makes the
              OS gallery open on a phone and the file picker on desktop, and it
              keeps the control keyboard- and screen-reader-accessible without
              reimplementing a <button> plus click forwarding. */}
          <label className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-full border border-ink-600 px-4 py-2 text-xs text-cream-200/80 transition hover:border-gold-500/60 hover:text-gold-200 has-disabled:cursor-not-allowed has-disabled:opacity-55">
            {uploading ? <Spinner className="h-3.5 w-3.5" /> : null}
            {uploading ? "Téléchargement…" : "+ Ajouter une photo"}
            <input
              ref={fileInput}
              type="file"
              accept={ACCEPTED_TYPES}
              className="hidden"
              disabled={uploading || draft.images.length >= MAX_IMAGES}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void handleUpload(file);
              }}
            />
          </label>

          {draft.images.length >= MAX_IMAGES ? (
            <p className="text-[0.7rem] text-cream-300/50">
              Six photos maximum par robe. Retirez-en une pour en ajouter.
            </p>
          ) : null}

          {/* Progress and confirmation live in their own line rather than in the
              shared error slot: "Image téléchargée ✓" is a success, and painting
              it red would be wrong. */}
          <p aria-live="polite" className="min-h-4 text-xs text-emerald-300/90">
            {uploadStatus}
          </p>
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