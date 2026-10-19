"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { SelectField } from "@/components/catalogue/SelectField";
import { Button, EmptyState, ErrorState, LoadingState } from "@/components/ui";
import { api, errorMessage } from "@/lib/api";
import { formatWhen } from "@/lib/format";
import { formatKes } from "@/lib/money";
import { SALE_PAYMENT_LABEL, SALE_STATUS_LABEL } from "@/lib/payments";
import { useSession } from "@/lib/session";
import type { SaleRow } from "@/lib/types";

type Load = { status: "loading" } | { status: "error"; message: string } | { status: "ready"; items: SaleRow[]; next: string };

export default function SalesPage() {
  const { state, can } = useSession();
  const [load, setLoad] = useState<Load>({ status: "loading" });
  const [paymentStatus, setPaymentStatus] = useState("");
  const [tick, setTick] = useState(0);
  const [more, setMore] = useState(false);
  const allowed = can("sales.view");

  useEffect(() => {
    if (!allowed) return;
    let alive = true;
    api<{ sales: SaleRow[]; next_cursor?: string }>("/sales", { query: { payment_status: paymentStatus, limit: 50 } })
      .then((r) => alive && setLoad({ status: "ready", items: r.sales, next: r.next_cursor ?? "" }))
      .catch((err) => alive && setLoad({ status: "error", message: errorMessage(err) }));
    return () => {
      alive = false;
    };
  }, [allowed, paymentStatus, tick]);

  if (state.status !== "authenticated") return null;
  if (!allowed) return <EmptyState title="No access">Your role does not include viewing sales.</EmptyState>;

  async function loadMore() {
    if (load.status !== "ready" || !load.next) return;
    setMore(true);
    try {
      const r = await api<{ sales: SaleRow[]; next_cursor?: string }>("/sales", { query: { payment_status: paymentStatus, limit: 50, cursor: load.next } });
      setLoad({ status: "ready", items: [...load.items, ...r.sales], next: r.next_cursor ?? "" });
    } catch (err) {
      setLoad({ status: "error", message: errorMessage(err) });
    } finally {
      setMore(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-2xl font-semibold">Sales</h1>
        <div className="w-56">
          <SelectField label="Show" value={paymentStatus} onChange={(e) => { setLoad({ status: "loading" }); setPaymentStatus(e.target.value); }}>
            <option value="">All sales</option>
            <option value="unpaid">Unpaid</option>
            <option value="partially_paid">Part paid</option>
            <option value="paid">Paid</option>
          </SelectField>
        </div>
      </div>
      {load.status === "loading" && <LoadingState label="Loading sales" />}
      {load.status === "error" && <ErrorState message={load.message} onRetry={() => setTick((t) => t + 1)} />}
      {load.status === "ready" && (load.items.length === 0 ? <EmptyState title="No sales">Nothing matches yet.</EmptyState> : (
        <>
          <div className="overflow-x-auto rounded-lg border border-stone-brand bg-white">
            <table className="w-full text-left">
              <thead className="border-b border-stone-brand text-sm"><tr><th className="p-3">Receipt</th><th className="p-3">When</th><th className="p-3">Taken by</th><th className="p-3">Status</th><th className="p-3 text-right">Total</th><th className="p-3 text-right">Balance due</th></tr></thead>
              <tbody>
                {load.items.map((s) => (
                  <tr key={s.id} className="border-b border-stone-brand last:border-0 hover:bg-stone-brand/30">
                    <td className="p-3"><Link className="target inline-flex items-center font-semibold underline" href={`/sales/${s.id}`}>{s.receipt_no}</Link></td>
                    <td className="p-3">{formatWhen(s.created_at)}</td>
                    <td className="p-3">{s.cashier_name}</td>
                    <td className="p-3">{SALE_PAYMENT_LABEL[s.payment_status]}{s.status !== "finalised" ? ` · ${SALE_STATUS_LABEL[s.status]}` : ""}{s.pending_cents > 0 ? " · awaiting confirmation" : ""}</td>
                    <td className="money p-3 text-right">{formatKes(s.total_cents)}</td>
                    <td className="money p-3 text-right">{formatKes(s.balance_cents)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {load.next && <Button variant="secondary" onClick={() => void loadMore()} busy={more}>Load more</Button>}
        </>
      ))}
    </div>
  );
}
