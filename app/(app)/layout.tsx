"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { AppShell } from "@/components/AppShell";
import { ErrorState, LoadingState } from "@/components/ui";
import { ReauthProvider } from "@/lib/reauth";
import { useSession } from "@/lib/session";

// Gate for every signed-in screen. This is a convenience for the person using the app: the API checks the
// session and the permission again on every request, so nothing here is a security boundary.
export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { state, refresh } = useSession();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (state.status === "anonymous") router.replace(`/login?next=${encodeURIComponent(pathname)}`);
    if (state.status === "authenticated" && state.me.must_change_password) router.replace("/change-password");
  }, [state, router, pathname]);

  if (state.status === "error") return <ErrorState message={state.message} onRetry={() => void refresh()} />;
  if (state.status !== "authenticated" || state.me.must_change_password) return <LoadingState label="Checking your session" />;
  return (
    <ReauthProvider>
      <AppShell>{children}</AppShell>
    </ReauthProvider>
  );
}
