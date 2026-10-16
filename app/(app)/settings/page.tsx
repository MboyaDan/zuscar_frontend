"use client";

import { useEffect, useState } from "react";
import { TaxConfiguration } from "@/components/settings/TaxConfiguration";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui";
import { api, errorMessage } from "@/lib/api";
import { useSession } from "@/lib/session";
import type { SettingsMap, TaxRate } from "@/lib/types";

type Load = { status: "loading" } | { status: "error"; message: string } | { status: "ready"; settings: SettingsMap; rates: TaxRate[] };

export default function SettingsPage() {
  const { state, can } = useSession();
  const [load, setLoad] = useState<Load>({ status: "loading" });
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let alive = true;
    Promise.all([api<{ settings: SettingsMap }>("/settings"), api<{ items: TaxRate[] }>("/tax-rates")])
      .then(([s, r]) => alive && setLoad({ status: "ready", settings: s.settings, rates: r.items }))
      .catch((err) => alive && setLoad({ status: "error", message: errorMessage(err) }));
    return () => {
      alive = false;
    };
  }, [tick]);

  if (state.status !== "authenticated") return null;
  if (!can("system.admin")) return <EmptyState title="No access">Settings are managed by the system administrator.</EmptyState>;

  function reload() {
    setLoad({ status: "loading" });
    setTick((t) => t + 1);
  }

  return (
    <div className="max-w-3xl space-y-6">
      <h1 className="text-3xl font-semibold">Settings</h1>
      {load.status === "loading" && <LoadingState label="Loading settings" />}
      {load.status === "error" && <ErrorState message={load.message} onRetry={reload} />}
      {load.status === "ready" && <TaxConfiguration settings={load.settings} rates={load.rates} onChanged={reload} />}
    </div>
  );
}
