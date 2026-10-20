"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AdjustDialog, ConversionsDialog, ItemDialog, NameCodeDialog, OpeningDialog, ReverseDialog, TransferDialog, WastageDialog } from "@/components/inventory/InventoryDialogs";
import { Alert, Button, EmptyState, ErrorState, LoadingState } from "@/components/ui";
import { api, errorMessage } from "@/lib/api";
import { formatWhen } from "@/lib/format";
import { MOVEMENT_LABEL, qtyText, REVERSIBLE } from "@/lib/inventory";
import { useSession } from "@/lib/session";
import type { InventoryItem, StockLocation, StockMovement, StockUnit } from "@/lib/types";

type Load =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; items: InventoryItem[]; units: StockUnit[]; locations: StockLocation[] };

type Dialog =
  | { kind: "item"; item?: InventoryItem }
  | { kind: "conversions"; item: InventoryItem }
  | { kind: "opening"; item: InventoryItem }
  | { kind: "adjust"; item: InventoryItem }
  | { kind: "transfer"; item: InventoryItem }
  | { kind: "wastage"; item: InventoryItem }
  | { kind: "reverse"; movement: StockMovement }
  | { kind: "unit" }
  | { kind: "location" };

export default function InventoryPage() {
  const { state, can } = useSession();
  const [tab, setTab] = useState<"stock" | "movements">("stock");
  const [load, setLoad] = useState<Load>({ status: "loading" });
  const [tick, setTick] = useState(0);
  const [dialog, setDialog] = useState<Dialog>();
  const [notice, setNotice] = useState<string>();
  const [query, setQuery] = useState("");
  const allowed = can("inventory.view");
  const manage = can("inventory.adjust");
  const override = can("inventory.override_negative");
  const transfer = can("inventory.transfer");
  const wastage = can("inventory.wastage");

  useEffect(() => {
    if (!allowed) return;
    let alive = true;
    Promise.all([
      api<{ items: InventoryItem[] }>("/inventory/items"),
      api<{ units: StockUnit[] }>("/inventory/units"),
      api<{ locations: StockLocation[] }>("/inventory/locations"),
    ])
      .then(([i, u, l]) => alive && setLoad({ status: "ready", items: i.items, units: u.units, locations: l.locations }))
      .catch((err) => alive && setLoad({ status: "error", message: errorMessage(err) }));
    return () => {
      alive = false;
    };
  }, [allowed, tick]);

  if (state.status !== "authenticated") return null;
  if (!allowed) return <EmptyState title="No access">Your role does not include viewing stock.</EmptyState>;

  function done(message: string) {
    setNotice(message);
    setTick((t) => t + 1);
  }

  const items = load.status === "ready" ? load.items.filter((i) => i.name.toLowerCase().includes(query.trim().toLowerCase()) || (i.sku ?? "").toLowerCase().includes(query.trim().toLowerCase())) : [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold">Stock</h1>
        {manage && load.status === "ready" && (
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => setDialog({ kind: "item" })}>Add item</Button>
            <Button variant="secondary" onClick={() => setDialog({ kind: "unit" })}>Add unit</Button>
            <Button variant="secondary" onClick={() => setDialog({ kind: "location" })}>Add place</Button>
          </div>
        )}
      </div>
      <p className="text-slate-brand/80">What is in stock at each place. Every change is a line in the movement list, and the numbers here are worked out from it. A sale takes stock from the products linked to an item (set the link on the product in the Catalogue).</p>
      {notice && <Alert tone="success">{notice}</Alert>}

      <div role="tablist" className="flex gap-2">
        {(["stock", "movements"] as const).map((t) => (
          <button key={t} role="tab" aria-selected={tab === t} className={`target rounded-md border px-4 py-2 font-medium ${tab === t ? "border-teal-brand bg-teal-brand text-white" : "border-stone-brand bg-white"}`} onClick={() => setTab(t)}>
            {t === "stock" ? "Stock levels" : "Movements"}
          </button>
        ))}
      </div>

      {load.status === "loading" && <LoadingState label="Loading stock" />}
      {load.status === "error" && <ErrorState message={load.message} onRetry={() => setTick((t) => t + 1)} />}

      {load.status === "ready" && tab === "stock" && (
        <>
          <label className="block max-w-sm">
            <span className="block text-sm font-medium">Find an item</span>
            <input className="target w-full rounded-md border border-stone-brand bg-white px-3 py-2" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Name or SKU" />
          </label>
          {load.items.length === 0 ? (
            <EmptyState title="No stock items yet">{manage ? "Add an item, then set its opening stock." : "Nothing has been set up yet."}</EmptyState>
          ) : items.length === 0 ? (
            <EmptyState title="No match">No item matches that search.</EmptyState>
          ) : (
            <ul className="space-y-3">
              {items.map((i) => (
                <li key={i.id} className="rounded-lg border border-stone-brand bg-white p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <h2 className="text-lg font-semibold">{i.name}{!i.active && <span className="ml-2 text-sm font-normal">(switched off)</span>}</h2>
                      <p className="text-sm text-slate-brand/80">{i.sku ? `${i.sku} · ` : ""}counted in {i.base_unit.name}</p>
                    </div>
                    <div className="text-right">
                      <p className="money text-xl font-semibold">{qtyText(i.total_base, i.base_unit.code)}</p>
                      {i.low && <p className="text-sm font-medium text-ember">Low: at or under {qtyText(i.low_stock_threshold ?? 0, i.base_unit.code)}</p>}
                      {i.total_base < 0 && <p className="text-sm font-medium text-danger">Below zero</p>}
                    </div>
                  </div>
                  {i.balances.length > 0 && (
                    <ul className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-sm">
                      {i.balances.map((b) => <li key={b.location_id}>{b.location_name}: <span className="money font-medium">{qtyText(b.qty_base, i.base_unit.code)}</span></li>)}
                    </ul>
                  )}
                  {i.conversions.length > 0 && (
                    <p className="mt-1 text-sm text-slate-brand/80">Units: {i.conversions.map((c) => `1 ${c.from_unit_name.toLowerCase()} = ${c.factor_num}${c.factor_den !== 1 ? `/${c.factor_den}` : ""} ${i.base_unit.code}`).join(", ")}</p>
                  )}
                  {(manage || transfer || wastage) && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {transfer && <Button variant="secondary" disabled={!i.active} onClick={() => setDialog({ kind: "transfer", item: i })}>Move</Button>}
                      {wastage && <Button variant="secondary" disabled={!i.active} onClick={() => setDialog({ kind: "wastage", item: i })}>Wastage</Button>}
                    </div>
                  )}
                  {manage && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      <Button variant="secondary" onClick={() => setDialog({ kind: "opening", item: i })}>Opening stock</Button>
                      <Button variant="secondary" disabled={!i.active} onClick={() => setDialog({ kind: "adjust", item: i })}>Adjust</Button>
                      <Button variant="secondary" onClick={() => setDialog({ kind: "conversions", item: i })}>Units</Button>
                      <Button variant="secondary" onClick={() => setDialog({ kind: "item", item: i })}>Edit</Button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      {load.status === "ready" && tab === "movements" && (
        <Movements items={load.items} locations={load.locations} tick={tick} manage={manage} onReverse={(m) => setDialog({ kind: "reverse", movement: m })} />
      )}

      {load.status === "ready" && dialog?.kind === "item" && <ItemDialog item={dialog.item} units={load.units} onClose={() => setDialog(undefined)} onDone={done} />}
      {load.status === "ready" && dialog?.kind === "conversions" && <ConversionsDialog item={dialog.item} units={load.units} onClose={() => setDialog(undefined)} onDone={done} />}
      {load.status === "ready" && dialog?.kind === "opening" && <OpeningDialog item={dialog.item} locations={load.locations} onClose={() => setDialog(undefined)} onDone={done} />}
      {load.status === "ready" && dialog?.kind === "adjust" && <AdjustDialog item={dialog.item} locations={load.locations} canOverride={override} onClose={() => setDialog(undefined)} onDone={done} />}
      {load.status === "ready" && dialog?.kind === "transfer" && <TransferDialog item={dialog.item} locations={load.locations} canOverride={override} onClose={() => setDialog(undefined)} onDone={done} />}
      {load.status === "ready" && dialog?.kind === "wastage" && <WastageDialog item={dialog.item} locations={load.locations} canOverride={override} onClose={() => setDialog(undefined)} onDone={done} />}
      {dialog?.kind === "reverse" && <ReverseDialog movement={dialog.movement} canOverride={override} onClose={() => setDialog(undefined)} onDone={done} />}
      {(dialog?.kind === "unit" || dialog?.kind === "location") && <NameCodeDialog kind={dialog.kind} onClose={() => setDialog(undefined)} onDone={done} />}
    </div>
  );
}

type MoveLoad = { status: "loading" } | { status: "error"; message: string } | { status: "ready"; rows: StockMovement[]; more: boolean };

function Movements({ items, locations, tick, manage, onReverse }: { items: InventoryItem[]; locations: StockLocation[]; tick: number; manage: boolean; onReverse: (m: StockMovement) => void }) {
  const [item, setItem] = useState("");
  const [loc, setLoc] = useState("");
  const [state, setState] = useState<MoveLoad>({ status: "loading" });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    api<{ movements: StockMovement[]; more: boolean }>("/inventory/movements", { query: { item_id: item, location_id: loc, limit: 50 } })
      .then((r) => alive && setState({ status: "ready", rows: r.movements, more: r.more }))
      .catch((err) => alive && setState({ status: "error", message: errorMessage(err) }));
    return () => {
      alive = false;
    };
  }, [item, loc, tick]);

  async function more() {
    if (state.status !== "ready" || state.rows.length === 0) return;
    setBusy(true);
    try {
      const r = await api<{ movements: StockMovement[]; more: boolean }>("/inventory/movements", { query: { item_id: item, location_id: loc, limit: 50, before_id: state.rows[state.rows.length - 1]?.id } });
      setState({ status: "ready", rows: [...state.rows, ...r.movements], more: r.more });
    } catch (err) {
      setState({ status: "error", message: errorMessage(err) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block"><span className="block text-sm font-medium">Item</span>
          <select className="target w-full rounded-md border border-stone-brand bg-white px-3 py-2" value={item} onChange={(e) => setItem(e.target.value)}>
            <option value="">All items</option>
            {items.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
          </select>
        </label>
        <label className="block"><span className="block text-sm font-medium">Place</span>
          <select className="target w-full rounded-md border border-stone-brand bg-white px-3 py-2" value={loc} onChange={(e) => setLoc(e.target.value)}>
            <option value="">All places</option>
            {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        </label>
      </div>
      {state.status === "loading" && <LoadingState label="Loading movements" />}
      {state.status === "error" && <ErrorState message={state.message} />}
      {state.status === "ready" && (state.rows.length === 0 ? <EmptyState title="No movements">Stock changes appear here, newest first.</EmptyState> : (
        <>
          <div className="relative overflow-x-auto rounded-lg border border-stone-brand bg-white">
            <table className="w-full text-left">
              <thead className="border-b border-stone-brand text-sm"><tr><th className="p-3">When</th><th className="p-3">Item</th><th className="p-3">What</th><th className="p-3 text-right">Change</th><th className="p-3">By</th><th className="p-3"><span className="sr-only">Actions</span></th></tr></thead>
              <tbody>
                {state.rows.map((m) => (
                  <tr key={m.id} className="border-b border-stone-brand align-top last:border-0">
                    <td className="p-3">{formatWhen(m.created_at)}</td>
                    <td className="p-3">{m.item_name}<span className="block text-sm text-slate-brand/80">{m.location_name}</span></td>
                    <td className="p-3">
                      {MOVEMENT_LABEL[m.movement_type]}
                      {m.reason && <span className="block text-sm text-slate-brand/80">{m.reason}</span>}
                      {m.override_reason && <span className="block text-sm text-ember">Below zero: {m.override_reason}</span>}
                      {m.reversed && <span className="block text-sm">Reversed</span>}
                      {m.reverses_movement_id && <span className="block text-sm">Reverses #{m.reverses_movement_id}</span>}
                      {m.ref_type === "sale" && m.ref_id && <Link className="block text-sm underline" href={`/sales/${m.ref_id}`}>Sale {m.ref_id}</Link>}
                    </td>
                    <td className={`money p-3 text-right font-semibold ${m.qty_delta < 0 ? "text-danger" : ""}`}>{qtyText(m.qty_delta, m.base_unit_code, true)}{m.entered_qty != null && m.entered_unit_code && m.entered_unit_code !== m.base_unit_code && <span className="block text-sm font-normal text-slate-brand/80">typed {m.entered_qty} {m.entered_unit_code}</span>}</td>
                    <td className="p-3">{m.created_by_name}</td>
                    <td className="p-3">{manage && !m.reversed && REVERSIBLE.includes(m.movement_type) && <Button variant="secondary" onClick={() => onReverse(m)}>Reverse</Button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {state.more && <Button variant="secondary" busy={busy} onClick={() => void more()}>Load more</Button>}
        </>
      ))}
    </div>
  );
}
