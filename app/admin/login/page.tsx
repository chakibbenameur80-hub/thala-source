import { Suspense } from "react";
import { LoginForm } from "@/components/admin/LoginForm";

export const metadata = {
  title: "Connexion admin",
  robots: { index: false, follow: false },
};

/**
 * Login page.
 *
 * `useSearchParams` (used by `<LoginForm>` to honour the `?next=` redirect)
 * requires a Suspense boundary during prerendering, hence the wrapper.
 */
export default function AdminLoginPage() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-ink-950 px-4 py-12">
      <Suspense fallback={<div className="h-8 w-40 animate-pulse rounded bg-ink-800" />}>
        <LoginForm />
      </Suspense>
    </div>
  );
}
