"use client";

import { Check, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { ReasonDialog } from "@/components/pos/OrderDialogs";
import { Alert, Button, EmptyState, ErrorState, LoadingState } from "@/components/ui";
import { api, errorMessage, newIdempotencyKey } from "@/lib/api";
import { formatWhen } from "@/lib/format";
import { formatKes } from "@/lib/money";
import { methodLabel } from "@/lib/payments";
import { useSession } from "@/lib/session";
import type { PaymentRecord } from "@/lib/types";

type Load = { status: "loading" } | { status: "error"; message: string } | { status: "ready"; items: PaymentRecord[]; next: string };

export default function PaymentsQueuePage() {
  const { state, can } = useSession();
  const [load, setLoad] = useState<Load>({ status: "loading" });
  const [tick, setTick] = useState(0);
  const [more, setMore] = useState(false);
  const [busy, setBusy] = useState<number | null>(null);
  const [failing, setFailing] = useState<PaymentRecord | null>(null);
  const [notice, setNotice] = useState<{ tone: "success" | "error"; text: string }>();
  const allowed = can("payments.reconcile");

  useEffect(() => {
    if (!allowed) return;
    let alive = true;
    api<{ payments: PaymentRecord[]; next_cursor?: string }>("/payments", { query: { status: "pending_confirmation", limit: 50 } })
      .then((r) => alive && setLoad({ status: "ready", items: r.payments, next: r.next_cursor ?? "" }))
      .catch((err) => alive && setLoad({ status: "error", message: errorMessage(err) }));
    return () => {
      alive = false;
    };
  }, [allowed, tick]);

  if (state.status !== "authenticated") return null;
  if (!allowed) return <EmptyState title="No access">Your role does not include confirming payments.</EmptyState>;

  const reload = () => setTick((t) => t + 1);

  async function loadMore() {
    if (load.status !== "ready" || !load.next) return;
    setMore(true);
    try {
      const r = await api<{ payments: PaymentRecord[]; next_cursor?: string }>("/payments", { query: { status: "pending_confirmation", limit: 50, cursor: load.next } });
      setLoad({ status: "ready", items: [...load.items, ...r.payments], next: r.next_cursor ?? "" });
    } catch (err) {
      setLoad({ status: "error", message: errorMessage(err) });
    } finally {
      setMore(false);
    }
  }

  async function confirm(p: PaymentRecord) {
    setBusy(p.id);
    setNotice(undefined);
    try {
      await api(`/payments/${p.id}/confirm`, { method: "POST", body: {}, idempotencyKey: newIdempotencyKey() });
      setNotice({ tone: "success", text: `${methodLabel(p.method)} ${formatKes(p.amount_cents)} confirmed.` });
      reload();
    } catch (err) {
      setNotice({ tone: "error", text: errorMessage(err) });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Payments to confirm</h1>
      <p className="text-slate-brand/80">M-Pesa, card and bank payments count as paid only after you check them against the statement and confirm.</p>
      {notice && <Alert tone={notice.tone}>{notice.text}</Alert>}
      {load.status === "loading" && <LoadingState label="Loading payments" />}
      {load.status === "error" && <ErrorState message={load.message} onRetry={reload} />}
      {load.status === "ready" && (load.items.length === 0 ? <EmptyState title="Nothing waiting">Every recorded payment has been confirmed or marked as failed.</EmptyState> : (
        <>
          <div className="overflow-x-auto rounded-lg border border-stone-brand bg-white">
            <table className="w-full text-left">
              <thead className="border-b border-stone-brand text-sm"><tr><th className="p-3">Receipt</th><th className="p-3">Method</th><th className="p-3">Code</th><th className="p-3">Taken by</th><th className="p-3">When</th><th className="p-3 text-right">Amount</th><th className="p-3"><span className="sr-only">Actions</span></th></tr></thead>
              <tbody>
                {load.items.map((p) => (
                  <tr key={p.id} className="border-b border-stone-brand last:border-0">
                    <td className="p-3">{p.sale_id ? <Link className="target inline-flex items-center font-semibold underline" href={`/sales/${p.sale_id}`}>{p.receipt_no ?? p.sale_id}</Link> : "-"}</td>
                    <td className="p-3">{methodLabel(p.method)}</td>
                    <td className="p-3">{p.reference ?? "-"}</td>
                    <td className="p-3">{p.created_by_name}</td>
                    <td className="p-3">{formatWhen(p.created_at)}</td>
                    <td className="money p-3 text-right">{formatKes(p.amount_cents)}</td>
                    <td className="p-3">
                      <div className="flex gap-2">
                        <Button onClick={() => void confirm(p)} busy={busy === p.id}><Check aria-hidden className="size-4" /> Confirm</Button>
                        <Button variant="secondary" onClick={() => setFailing(p)}><X aria-hidden className="size-4" /> Did not arrive</Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {load.next && <Button variant="secondary" onClick={() => void loadMore()} busy={more}>Load more</Button>}
        </>
      ))}
      <ReasonDialog
        open={failing !== null}
        title={failing ? `Payment did not arrive: ${methodLabel(failing.method)} ${formatKes(failing.amount_cents)}` : "Payment did not arrive"}
        submitLabel="Mark as failed"
        hint="Say why, for example: not on the statement. The code can then be used again."
        onClose={() => setFailing(null)}
        onSubmit={async (reason) => {
          if (!failing) return;
          await api(`/payments/${failing.id}/fail`, { method: "POST", body: { note: reason } });
          setNotice({ tone: "success", text: "Payment marked as failed. The balance can be paid again." });
          reload();
        }}
      />
    </div>
  );
}
