"use client";

import { Armchair, ShoppingBag } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Alert, Button, EmptyState, ErrorState, LoadingState } from "@/components/ui";
import { api, errorMessage, newIdempotencyKey } from "@/lib/api";
import { formatKes } from "@/lib/money";
import { useSession } from "@/lib/session";
import type { DiningTable, Order, OrderSummary } from "@/lib/types";

type Load = { status: "loading" } | { status: "error"; message: string } | { status: "ready"; tables: DiningTable[]; orders: OrderSummary[] };

export default function PosHomePage() {
  const { state, can } = useSession();
  const router = useRouter();
  const [load, setLoad] = useState<Load>({ status: "loading" });
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState<number | "takeaway" | null>(null);
  // One key per tap intent: a double tap on the same table reuses it, so only one order is opened (NN-05).
  const pending = useRef<{ target: number | "takeaway"; key: string } | null>(null);
  const allowed = can("orders.manage");

  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!allowed) return;
    let alive = true;
    Promise.all([api<{ items: DiningTable[] }>("/tables"), api<{ items: OrderSummary[] }>("/orders", { query: { limit: 100 } })])
      .then(([t, o]) => alive && setLoad({ status: "ready", tables: t.items.filter((x) => x.active), orders: o.items.filter((x) => x.status === "open" || x.status === "sent") }))
      .catch((err) => alive && setLoad({ status: "error", message: errorMessage(err) }));
    return () => {
      alive = false;
    };
  }, [allowed, tick]);

  // Other people open and close tables too, so the board refreshes itself.
  useEffect(() => {
    const t = window.setInterval(() => setTick((n) => n + 1), 20_000);
    return () => window.clearInterval(t);
  }, []);

  if (state.status !== "authenticated") return null;
  if (!allowed) return <EmptyState title="No access">Your role does not include taking orders.</EmptyState>;

  async function open(target: DiningTable | "takeaway") {
    if (target !== "takeaway" && target.open_order_id) {
      router.push(`/pos/${target.open_order_id}`);
      return;
    }
    const id = target === "takeaway" ? "takeaway" : target.id;
    if (pending.current?.target !== id) pending.current = { target: id, key: newIdempotencyKey() };
    setBusy(id);
    setError(undefined);
    try {
      const body = target === "takeaway" ? { order_type: "takeaway" } : { order_type: "dine_in", table_id: target.id };
      const res = await api<{ order: Order }>("/orders", { method: "POST", body, idempotencyKey: pending.current.key });
      pending.current = null;
      router.push(`/pos/${res.order.id}`);
    } catch (err) {
      setError(errorMessage(err));
      setBusy(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Sell</h1>
        <Button onClick={() => void open("takeaway")} busy={busy === "takeaway"}>
          <ShoppingBag aria-hidden className="size-5" /> New takeaway order
        </Button>
      </div>
      {error && <Alert tone="error">{error}</Alert>}
      {load.status === "loading" && <LoadingState label="Loading tables and orders" />}
      {load.status === "error" && <ErrorState message={load.message} onRetry={() => setTick((n) => n + 1)} />}
      {load.status === "ready" && (
        <>
          <section aria-labelledby="tables-h" className="space-y-3">
            <h2 id="tables-h" className="text-lg font-semibold">Tables</h2>
            {load.tables.length === 0 ? (
              <EmptyState title="No tables yet">Ask a manager to add the dining tables.</EmptyState>
            ) : (
              <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
                {load.tables.map((t) => {
                  const taken = t.open_order_id !== null;
                  return (
                    <li key={t.id}>
                      <button
                        type="button"
                        onClick={() => void open(t)}
                        disabled={busy === t.id}
                        className={`target flex h-full w-full flex-col items-start gap-1 rounded-lg border p-3 text-left disabled:opacity-60 ${taken ? "border-ember bg-white" : "border-stone-brand bg-white hover:bg-stone-brand/40"}`}
                      >
                        <span className="flex items-center gap-2 font-heading text-lg font-semibold"><Armchair aria-hidden className="size-5" /> {t.label}</span>
                        <span className="text-sm text-slate-brand/80">{t.seats} seats</span>
                        <span className={`text-sm font-medium ${taken ? "text-ember" : "text-success"}`}>{taken ? "Order open: continue" : "Free: start order"}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
          <section aria-labelledby="orders-h" className="space-y-3">
            <h2 id="orders-h" className="text-lg font-semibold">Open orders</h2>
            {load.orders.length === 0 ? (
              <EmptyState title="No open orders">Pick a table or start a takeaway order.</EmptyState>
            ) : (
              <ul className="divide-y divide-stone-brand rounded-lg border border-stone-brand bg-white">
                {load.orders.map((o) => (
                  <li key={o.id}>
                    <button type="button" onClick={() => router.push(`/pos/${o.id}`)} className="target flex w-full flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 text-left hover:bg-stone-brand/40">
                      <span className="font-semibold">Order {o.order_no}</span>
                      <span>{o.order_type === "dine_in" ? o.table_label : "Takeaway"}</span>
                      <span className="text-sm text-slate-brand/80">{o.opened_by_name} · {o.item_count} items</span>
                      <span className="rounded-full border border-stone-brand px-2 text-sm">{o.status === "sent" ? "Sent to kitchen" : "Open"}</span>
                      <span className="money ml-auto font-medium">{formatKes(o.subtotal_cents)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}
