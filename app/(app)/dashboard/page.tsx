"use client";

import Link from "next/link";
import { EmptyState } from "@/components/ui";
import { NAV } from "@/lib/nav";
import { useSession } from "@/lib/session";

export default function DashboardPage() {
  const { state, can } = useSession();
  if (state.status !== "authenticated") return null;
  const { me } = state;
  const sections = NAV.filter((n) => n.href !== "/dashboard" && (!n.permission || can(n.permission)));

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <h1 className="text-3xl font-semibold">Hello, {me.user.display_name}</h1>
        <p className="mt-1 text-slate-brand/80">Signed in as {me.user.username}.</p>
        {me.roles.length > 0 && (
          <ul className="mt-3 flex flex-wrap gap-2" aria-label="Your roles">
            {me.roles.map((r) => (
              <li key={r} className="rounded-full bg-saffron px-3 py-1 text-sm font-medium text-midnight">{r.replaceAll("_", " ")}</li>
            ))}
          </ul>
        )}
      </div>
      {me.roles.length === 0 ? (
        <EmptyState title="No role assigned yet">Ask an administrator to give your account a role. Until then there is nothing for you to open.</EmptyState>
      ) : sections.length === 0 ? (
        <EmptyState title="Nothing to open here yet">The screens for your role are added as the system is built.</EmptyState>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2">
          {sections.map(({ href, label, icon: Icon, description }) => (
            <li key={href}>
              <Link href={href} className="block h-full rounded-lg border border-stone-brand border-l-8 border-l-teal-brand bg-white p-4 hover:bg-stone-brand/30">
                <span className="flex items-center gap-2 font-semibold"><Icon aria-hidden className="size-5" /> {label}</span>
                <span className="mt-1 block text-slate-brand/80">{description}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
