import { loadStorefrontData } from "@/lib/db";
import { DashboardShell } from "@/components/admin/DashboardShell";
import { OrdersPanel } from "@/components/admin/OrdersPanel";

export const metadata = {
  title: "Commandes",
  // Belt and braces with the root `robots` config: never index the dashboard.
  robots: { index: false, follow: false },
};

/**
 * Orders dashboard.
 *
 * `force-dynamic` because this reads the store on every request: a cached build
 * would show stale orders and could serve one customer's data to another.
 */
export const dynamic = "force-dynamic";

export default async function AdminOrdersPage() {
  const initial = await loadStorefrontData();

  return (
    <DashboardShell>
      <header className="mb-6">
        <h1 className="font-display text-3xl font-semibold text-cream-50 sm:text-4xl">Commandes</h1>
        <p className="mt-1 text-sm text-cream-300/60">
          Suivez les commandes clients et mettez à jour leur état d&apos;expédition.
        </p>
      </header>
      <OrdersPanel initial={initial} />
    </DashboardShell>
  );
}