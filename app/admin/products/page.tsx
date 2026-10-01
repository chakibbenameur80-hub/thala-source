import { loadStorefrontData } from "@/lib/db";
import { DashboardShell } from "@/components/admin/DashboardShell";
import { ProductsPanel } from "@/components/admin/ProductsPanel";

export const metadata = {
  title: "Produits",
  robots: { index: false, follow: false },
};

/** `force-dynamic` so edits made in another tab are never served from cache. */
export const dynamic = "force-dynamic";

export default async function AdminProductsPage() {
  const initial = await loadStorefrontData();

  return (
    <DashboardShell>
      <header className="mb-6">
        <h1 className="font-display text-3xl font-semibold text-cream-50 sm:text-4xl">Produits</h1>
        <p className="mt-1 text-sm text-cream-300/60">
          Ajoutez vos robes, ajustez les prix et les tailles disponibles.
        </p>
      </header>
      <ProductsPanel initial={initial} />
    </DashboardShell>
  );
}