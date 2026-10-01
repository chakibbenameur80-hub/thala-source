import { redirect } from "next/navigation";
import { AdminShell } from "@/components/admin/AdminShell";
import { isAuthenticated } from "@/lib/auth";
import { BRAND } from "@/lib/brand";

/**
 * Authenticated dashboard shell.
 *
 * Why a component and not `app/admin/layout.tsx`:
 *
 * A layout applies to every route beneath its URL segment. `/admin/login` sits
 * beneath `/admin`, so an auth check in `app/admin/layout.tsx` also wrapped the
 * login page and the login form redirected to itself forever —
 * `/admin/login` → `/admin/login` → … — locking the owner out of the shop.
 *
 * Moving that layout into an `app/admin/(dashboard)/layout.tsx` route group does
 * NOT help: route groups are erased from the URL, so the layout still resolves to
 * the `/admin` segment and still wraps `/admin/login`.
 *
 * The only arrangement that keeps `/admin/login` reachable is to protect the
 * dashboard *pages* rather than the `/admin` segment. That is what this component
 * is for — each dashboard page renders its content inside it.
 *
 * Two independent layers guard the admin area:
 *   - `proxy.ts`, which runs before anything renders and preserves `?next=`;
 *   - this component, which re-checks on the server during render.
 *
 * The check is per page rather than per layout so each dashboard page must opt in
 * explicitly. A new admin page added without this wrapper would be protected by
 * `proxy.ts` only — still safe (no markup is ever sent to an anonymous visitor),
 * just without the second layer.
 */
export async function DashboardShell({ children }: { children: React.ReactNode }) {
  if (!(await isAuthenticated())) {
    redirect("/admin/login");
  }

  return (
    <div className="flex min-h-dvh flex-col bg-ink-950">
      <AdminShell brand={BRAND.name} />
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6 lg:px-8">
        {children}
      </main>
    </div>
  );
}