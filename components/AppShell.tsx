"use client";

import { KeyRound, LogOut, Menu, X } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { ConnectionIndicator } from "@/components/ConnectionIndicator";
import { Logo } from "@/components/Logo";
import { NAV } from "@/lib/nav";
import { useSession } from "@/lib/session";

export function AppShell({ children }: { children: React.ReactNode }) {
  const { state, can, signOut } = useSession();
  const pathname = usePathname();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  if (state.status !== "authenticated") return null;
  const { me } = state;
  const items = NAV.filter((n) => !n.permission || can(n.permission));

  async function leave() {
    await signOut();
    router.replace("/login");
  }

  const nav = (
    <nav aria-label="Main" className="space-y-1">
      {items.map(({ href, label, icon: Icon }) => {
        const active = pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            key={href}
            href={href}
            onClick={() => setMenuOpen(false)}
            aria-current={active ? "page" : undefined}
            className={`target flex items-center gap-3 rounded-md px-3 py-2 ${active ? "bg-midnight text-cream" : "hover:bg-stone-brand/60"}`}
          >
            <Icon aria-hidden className="size-5" /> {label}
          </Link>
        );
      })}
    </nav>
  );

  return (
    <div className="flex min-h-screen flex-col">
      <header className="bg-midnight text-cream">
        <div className="flex items-center gap-4 px-4 py-2">
          <button
            type="button"
            className="target -ml-2 inline-flex items-center justify-center rounded-md hover:bg-cream/10 md:hidden"
            aria-label={menuOpen ? "Close menu" : "Open menu"}
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((o) => !o)}
          >
            {menuOpen ? <X aria-hidden className="size-6" /> : <Menu aria-hidden className="size-6" />}
          </button>
          <Logo variant="reversed" className="h-9 w-auto" />
          <div className="ml-auto flex items-center gap-4">
            <ConnectionIndicator />
            <details className="relative">
              <summary className="target flex cursor-pointer list-none items-center rounded-md px-2 hover:bg-cream/10">
                <span className="font-medium">{me.user.display_name}</span>
              </summary>
              <div className="absolute right-0 z-20 mt-2 w-60 rounded-md border border-stone-brand bg-white p-2 text-slate-brand shadow-lg">
                <p className="px-3 py-2 text-sm">
                  Signed in as <strong>{me.user.username}</strong>
                  {me.auth_method === "pin" && <span className="block">Using a PIN session</span>}
                </p>
                <Link href="/change-password" className="target flex items-center gap-2 rounded-md px-3 py-2 hover:bg-stone-brand/50">
                  <KeyRound aria-hidden className="size-4" /> Change password
                </Link>
                <button type="button" onClick={leave} className="target flex w-full items-center gap-2 rounded-md px-3 py-2 text-left hover:bg-stone-brand/50">
                  <LogOut aria-hidden className="size-4" /> Sign out
                </button>
              </div>
            </details>
          </div>
        </div>
      </header>
      <div className="flex flex-1">
        <aside className="hidden w-60 shrink-0 border-r border-stone-brand bg-white p-3 md:block">{nav}</aside>
        {menuOpen && <aside className="fixed inset-x-0 top-[52px] z-10 border-b border-stone-brand bg-white p-3 md:hidden">{nav}</aside>}
        <main id="main" className="min-w-0 flex-1 p-4 sm:p-6">{children}</main>
      </div>
    </div>
  );
}
