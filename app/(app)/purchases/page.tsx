"use client";

import { useEffect, useState } from "react";
import { CancelPurchaseDialog, PurchaseDialog, ReceiveDialog, SupplierDialog } from "@/components/purchasing/PurchasingDialogs";
import { Alert, Button, EmptyState, ErrorState, LoadingState } from "@/components/ui";
import { api, errorMessage } from "@/lib/api";
import { formatWhen } from "@/lib/format";
import { qtyText } from "@/lib/inventory";
import { formatKes } from "@/lib/money";
import { useSession } from "@/lib/session";
import type { InventoryItem, Purchase, PurchaseStatus, StockLocation, Supplier } from "@/lib/types";

type Load =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; purchases: Purchase[]; suppliers: Supplier[]; items: InventoryItem[]; locations: StockLocation[] };

type Dialog =
  | { kind: "supplier"; supplier?: Supplier }
  | { kind: "purchase" }
  | { kind: "receive"; purchase: Purchase }
  | { kind: "cancel"; purchase: Purchase };

const STATUS_LABEL: Record<PurchaseStatus, string> = { draft: "Waiting to be received", received: "Received", cancelled: "Cancelled" };

export default function PurchasesPage() {
  const { state, can } = useSession();
  const [tab, setTab] = useState<"deliveries" | "suppliers">("deliveries");
  const [filter, setFilter] = useState<"" | PurchaseStatus>("");
  const [load, setLoad] = useState<Load>({ status: "loading" });
  const [tick, setTick] = useState(0);
  const [dialog, setDialog] = useState<Dialog>();
  const [notice, setNotice] = useState<string>();
  const [open, setOpen] = useState<number>();
  const [detail, setDetail] = useState<Purchase>();
  const allowed = can("purchasing.manage");

  useEffect(() => {
    if (!allowed) return;
    let alive = true;
    Promise.all([
      api<{ purchases: Purchase[] }>("/purchases", { query: { limit: 100 } }),
      api<{ suppliers: Supplier[] }>("/suppliers"),
      api<{ items: InventoryItem[] }>("/inventory/items"),
      api<{ locations: StockLocation[] }>("/inventory/locations"),
    ])
      .then(([p, s, i, l]) => alive && setLoad({ status: "ready", purchases: p.purchases, suppliers: s.suppliers, items: i.items, locations: l.locations }))
      .catch((err) => alive && setLoad({ status: "error", message: errorMessage(err) }));
    return () => {
      alive = false;
    };
  }, [allowed, tick]);

  useEffect(() => {
    if (open === undefined) return;
    let alive = true;
    api<{ purchase: Purchase }>(`/purchases/${open}`)
      .then((r) => alive && setDetail(r.purchase))
      .catch(() => alive && setDetail(undefined));
    return () => {
      alive = false;
    };
  }, [open, tick]);

  if (state.status !== "authenticated") return null;
  if (!allowed) return <EmptyState title="No access">Your role does not include deliveries and suppliers.</EmptyState>;

  function done(message: string) {
    setNotice(message);
    setTick((t) => t + 1);
  }

  const rows = load.status === "ready" ? load.purchases.filter((p) => !filter || p.status === filter) : [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold">Deliveries</h1>
        {load.status === "ready" && (
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => setDialog({ kind: "purchase" })} disabled={load.suppliers.filter((s) => s.active).length === 0 || load.items.filter((i) => i.active).length === 0}>Write down a delivery</Button>
            <Button variant="secondary" onClick={() => setDialog({ kind: "supplier" })}>Add supplier</Button>
          </div>
        )}
      </div>
      <p className="text-slate-brand/80">Write a delivery down from the supplier&apos;s invoice, then receive it into a place when the goods arrive. Receiving adds the stock with its price. Nothing is added before that.</p>
      {notice && <Alert tone="success">{notice}</Alert>}

      <div role="tablist" className="flex gap-2">
        {(["deliveries", "suppliers"] as const).map((t) => (
          <button key={t} role="tab" aria-selected={tab === t} className={`target rounded-md border px-4 py-2 font-medium ${tab === t ? "border-teal-brand bg-teal-brand text-white" : "border-stone-brand bg-white"}`} onClick={() => setTab(t)}>
            {t === "deliveries" ? "Deliveries" : "Suppliers"}
          </button>
        ))}
      </div>

      {load.status === "loading" && <LoadingState label="Loading deliveries" />}
      {load.status === "error" && <ErrorState message={load.message} onRetry={() => setTick((t) => t + 1)} />}

      {load.status === "ready" && tab === "deliveries" && (
        <>
          <label className="block max-w-xs">
            <span className="block text-sm font-medium">Show</span>
            <select className="target w-full rounded-md border border-stone-brand bg-white px-3 py-2" value={filter} onChange={(e) => setFilter(e.target.value as "" | PurchaseStatus)}>
              <option value="">All deliveries</option>
              <option value="draft">Waiting to be received</option>
              <option value="received">Received</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </label>
          {load.suppliers.length === 0 && <Alert tone="info">Add a supplier first, then write down a delivery from them.</Alert>}
          {rows.length === 0 ? (
            <EmptyState title="No deliveries">{filter ? "None match that filter." : "Nothing has been written down yet."}</EmptyState>
          ) : (
            <ul className="space-y-3">
              {rows.map((p) => (
                <li key={p.id} className="rounded-lg border border-stone-brand bg-white p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <h2 className="text-lg font-semibold">#{p.purchase_no} · {p.supplier_name}</h2>
                      <p className="text-sm text-slate-brand/80">
                        {STATUS_LABEL[p.status]}
                        {p.status === "received" && p.received_at ? ` · ${formatWhen(p.received_at)} into ${p.location_name}` : ` · written ${formatWhen(p.created_at)}`}
                        {p.invoice_ref ? ` · invoice ${p.invoice_ref}` : ""}
                      </p>
                    </div>
                    <p className="money text-xl font-semibold">{formatKes(p.total_cents)}</p>
                  </div>
                  {p.note && <p className="mt-1 text-sm">{p.note}</p>}
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button variant="secondary" onClick={() => setOpen(open === p.id ? undefined : p.id)}>{open === p.id ? "Hide items" : `Items (${p.line_count})`}</Button>
                    {p.status === "draft" && <Button onClick={() => setDialog({ kind: "receive", purchase: p })}>Receive</Button>}
                    {p.status === "draft" && <Button variant="secondary" onClick={() => setDialog({ kind: "cancel", purchase: p })}>Cancel</Button>}
                  </div>
                  {open === p.id && (
                    <div className="relative mt-3 overflow-x-auto">
                      {detail?.id !== p.id ? (
                        <LoadingState label="Loading items" />
                      ) : (
                        <table className="w-full min-w-[28rem] text-left text-sm">
                          <caption className="sr-only">Items on delivery #{p.purchase_no}</caption>
                          <thead>
                            <tr className="border-b border-stone-brand">
                              <th scope="col" className="py-1 pr-3 font-medium">Item</th>
                              <th scope="col" className="py-1 pr-3 font-medium">Quantity</th>
                              <th scope="col" className="py-1 pr-3 text-right font-medium">One unit</th>
                              <th scope="col" className="py-1 text-right font-medium">Line total</th>
                            </tr>
                          </thead>
                          <tbody>
                            {detail.lines?.map((l) => (
                              <tr key={l.item_id} className="border-b border-stone-brand/60">
                                <td className="py-1 pr-3">{l.item_name}</td>
                                <td className="py-1 pr-3">{l.entered_qty.toLocaleString("en-KE")} {l.entered_unit_code}{l.entered_unit_code !== l.base_unit_code ? ` (${qtyText(l.qty_base, l.base_unit_code)})` : ""}</td>
                                <td className="money py-1 pr-3 text-right">{formatKes(l.unit_cost_cents)}</td>
                                <td className="money py-1 text-right">{formatKes(l.line_cents)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      {load.status === "ready" && tab === "suppliers" && (
        load.suppliers.length === 0 ? (
          <EmptyState title="No suppliers yet">Add the people you buy from, then write their deliveries down.</EmptyState>
        ) : (
          <ul className="space-y-3">
            {load.suppliers.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-stone-brand bg-white p-4">
                <div>
                  <h2 className="text-lg font-semibold">{s.name}{!s.active && <span className="ml-2 text-sm font-normal">(switched off)</span>}</h2>
                  {s.contact && <p className="text-sm text-slate-brand/80">{s.contact}</p>}
                </div>
                <Button variant="secondary" onClick={() => setDialog({ kind: "supplier", supplier: s })}>Edit</Button>
              </li>
            ))}
          </ul>
        )
      )}

      {dialog?.kind === "supplier" && <SupplierDialog supplier={dialog.supplier} onClose={() => setDialog(undefined)} onDone={done} />}
      {load.status === "ready" && dialog?.kind === "purchase" && <PurchaseDialog suppliers={load.suppliers} items={load.items} onClose={() => setDialog(undefined)} onDone={done} />}
      {load.status === "ready" && dialog?.kind === "receive" && <ReceiveDialog purchase={dialog.purchase} locations={load.locations} onClose={() => setDialog(undefined)} onDone={done} />}
      {dialog?.kind === "cancel" && <CancelPurchaseDialog purchase={dialog.purchase} onClose={() => setDialog(undefined)} onDone={done} />}
    </div>
  );
}
