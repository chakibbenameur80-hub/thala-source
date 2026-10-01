import { loadStorefrontData } from "@/lib/db";
import { DashboardShell } from "@/components/admin/DashboardShell";
import { ShippingPanel } from "@/components/admin/ShippingPanel";

export const metadata = {
  title: "Livraison",
  robots: { index: false, follow: false },
};

/** `force-dynamic` so tariff edits are picked up immediately. */
export const dynamic = "force-dynamic";

export default async function AdminShippingPage() {
  const initial = await loadStorefrontData();

  return (
    <DashboardShell>
      <header className="mb-6">
        <h1 className="font-display text-3xl font-semibold text-cream-50 sm:text-4xl">Livraison</h1>
        <p className="mt-1 text-sm text-cream-300/60">
          Ajustez les tarifs de livraison pour chacune des 58 wilayas, en dinars.
        </p>
      </header>
      <ShippingPanel initial={initial} />
    </DashboardShell>
  );
}