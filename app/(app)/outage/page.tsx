"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ManualReceiptForm } from "@/components/outage/ManualReceiptForm";
import { Alert, Button, EmptyState, ErrorState, LoadingState } from "@/components/ui";
import { api, errorMessage } from "@/lib/api";
import { formatWhen } from "@/lib/format";
import { formatKes } from "@/lib/money";
import { SALE_STATUS_LABEL } from "@/lib/payments";
import { useSession } from "@/lib/session";
import type { ManualReceiptEntry, MenuCategory, Sale } from "@/lib/types";

type Load =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; menu: MenuCategory[]; items: ManualReceiptEntry[]; next: string };

export default function OutageEntriesPage() {
  const { state, can } = useSession();
  const [load, setLoad] = useState<Load>({ status: "loading" });
  const [tick, setTick] = useState(0);
  const [more, setMore] = useState(false);
  const [notice, setNotice] = useState<{ id: number; text: string }>();
  const allowed = can("payments.reconcile");

  useEffect(() => {
    if (!allowed) return;
    let alive = true;
    Promise.all([
      api<{ categories: MenuCategory[] }>("/menu"),
      api<{ entries: ManualReceiptEntry[]; next_cursor?: string }>("/reconciliation/manual-receipts", { query: { limit: 50 } }),
    ])
      .then(([m, e]) => alive && setLoad({ status: "ready", menu: m.categories, items: e.entries, next: e.next_cursor ?? "" }))
      .catch((err) => alive && setLoad({ status: "error", message: errorMessage(err) }));
    return () => {
      alive = false;
    };
  }, [allowed, tick]);

  if (state.status !== "authenticated") return null;
  if (!allowed) return <EmptyState title="No access">Your role does not include entering paper receipts.</EmptyState>;

  async function loadMore() {
    if (load.status !== "ready" || !load.next) return;
    setMore(true);
    try {
      const r = await api<{ entries: ManualReceiptEntry[]; next_cursor?: string }>("/reconciliation/manual-receipts", { query: { limit: 50, cursor: load.next } });
      setLoad({ ...load, items: [...load.items, ...r.entries], next: r.next_cursor ?? "" });
    } catch (err) {
      setLoad({ status: "error", message: errorMessage(err) });
    } finally {
      setMore(false);
    }
  }

  function entered(sale: Sale) {
    setNotice({ id: sale.id, text: `Paper receipt ${sale.manual_receipt?.manual_receipt_no ?? ""} entered as receipt ${sale.receipt_no}.` });
    setTick((t) => t + 1);
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Outage entries</h1>
      <p className="text-slate-brand/80">
        When the system was down and sales were written in the paper receipt book, enter each paper receipt here once. A paper receipt that was already entered is refused. The steps are in the outage procedure: <Link className="underline" href="/help/outage">open it</Link>.
      </p>
      {notice && (
        <Alert tone="success">{notice.text} <Link className="underline" href={`/sales/${notice.id}`}>Open the sale</Link></Alert>
      )}
      {load.status === "loading" && <LoadingState label="Loading" />}
      {load.status === "error" && <ErrorState message={load.status === "error" && /not allowed|permission|forbidden/i.test(load.message) ? "This screen needs a role that can also see the menu. Ask the owner to check your role." : load.message} onRetry={() => setTick((t) => t + 1)} />}
      {load.status === "ready" && (
        <>
          <ManualReceiptForm menu={load.menu} onDone={entered} />
          <h2 className="text-lg font-semibold">Entered so far</h2>
          {load.items.length === 0 ? <EmptyState title="Nothing entered yet">Paper receipts you enter appear here, newest first.</EmptyState> : (
            <>
              <div className="overflow-x-auto rounded-lg border border-stone-brand bg-white">
                <table className="w-full text-left">
                  <thead className="border-b border-stone-brand text-sm"><tr><th className="p-3">Paper no.</th><th className="p-3">Made</th><th className="p-3">Entered by</th><th className="p-3">Receipt</th><th className="p-3 text-right">Paper total</th><th className="p-3 text-right">Sale total</th></tr></thead>
                  <tbody>
                    {load.items.map((e) => (
                      <tr key={e.id} className="border-b border-stone-brand last:border-0">
                        <td className="p-3 font-semibold">{e.manual_receipt_no}</td>
                        <td className="p-3">{formatWhen(e.occurred_at)}</td>
                        <td className="p-3">{e.entered_by_name}<span className="block text-sm text-slate-brand/80">{formatWhen(e.entered_at)}</span></td>
                        <td className="p-3"><Link className="target inline-flex items-center font-semibold underline" href={`/sales/${e.sale_id}`}>{e.receipt_no}</Link>{e.sale_status !== "finalised" && <span className="ml-2 text-sm">{SALE_STATUS_LABEL[e.sale_status]}</span>}</td>
                        <td className="money p-3 text-right">{formatKes(e.paper_total_cents)}</td>
                        <td className="money p-3 text-right">{formatKes(e.sale_total_cents)}{e.paper_total_cents !== e.sale_total_cents && <span className="block text-sm text-ember">differs{e.discrepancy_note ? `: ${e.discrepancy_note}` : ""}</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {load.next && <Button variant="secondary" onClick={() => void loadMore()} busy={more}>Load more</Button>}
            </>
          )}
        </>
      )}
    </div>
  );
}
