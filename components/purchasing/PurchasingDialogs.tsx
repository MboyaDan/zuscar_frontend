"use client";

import { useEffect, useRef, useState } from "react";
import { SelectField } from "@/components/catalogue/SelectField";
import { FormDialog } from "@/components/FormDialog";
import { Alert, Button, LoadingState, TextField } from "@/components/ui";
import { api, errorMessage, newIdempotencyKey } from "@/lib/api";
import { parseWhole, unitChoices } from "@/lib/inventory";
import { centsToInput, formatKes, parseKes } from "@/lib/money";
import type { InventoryItem, Purchase, PurchaseLine, StockLocation, Supplier } from "@/lib/types";

type Common = { onClose: () => void; onDone: (message: string) => void };

const MAX_UNIT_COST_CENTS = 10_000_000; // KES 100,000 a unit, the same limit the API applies

/** One key per distinct request body, so a retry of the same action is replayed and a changed action is a new one. */
function useAttempt() {
  const ref = useRef<{ payload: string; key: string } | null>(null);
  return (body: unknown) => {
    const payload = JSON.stringify(body);
    if (ref.current?.payload !== payload) ref.current = { payload, key: newIdempotencyKey() };
    return ref.current.key;
  };
}

// ---- supplier ----

export function SupplierDialog({ supplier, onClose, onDone }: Common & { supplier?: Supplier }) {
  const [name, setName] = useState(supplier?.name ?? "");
  const [contact, setContact] = useState(supplier?.contact ?? "");
  const [active, setActive] = useState(supplier?.active ?? true);
  const [errors, setErrors] = useState<Record<string, string>>({});
  return (
    <FormDialog
      open
      title={supplier ? `Edit ${supplier.name}` : "Add a supplier"}
      submitLabel={supplier ? "Save" : "Add supplier"}
      onClose={onClose}
      onFieldErrors={setErrors}
      disabled={!name.trim()}
      onSubmit={async () => {
        const body = { name: name.trim(), contact: contact.trim() };
        if (supplier) await api(`/suppliers/${supplier.id}`, { method: "PATCH", body: { ...body, active } });
        else await api("/suppliers", { method: "POST", body });
        onDone(`${name.trim()} was ${supplier ? "saved" : "added"}.`);
      }}
    >
      <TextField label="Name" value={name} onChange={(e) => setName(e.target.value)} error={errors.name} required autoFocus />
      <TextField label="Phone or email (optional)" value={contact} maxLength={200} onChange={(e) => setContact(e.target.value)} error={errors.contact} />
      {supplier && (
        <label className="target flex items-center gap-3">
          <input type="checkbox" className="h-5 w-5" checked={active} onChange={(e) => setActive(e.target.checked)} />
          <span>Active (you can write deliveries from them)</span>
        </label>
      )}
    </FormDialog>
  );
}

// ---- a delivery (purchase draft) ----

type Row = { id: number; item: string; qty: string; unit: string; cost: string };

export function PurchaseDialog({ suppliers, items, onClose, onDone }: Common & { suppliers: Supplier[]; items: InventoryItem[] }) {
  const nextId = useRef(1);
  const [supplier, setSupplier] = useState("");
  const [invoice, setInvoice] = useState("");
  const [note, setNote] = useState("");
  const [rows, setRows] = useState<Row[]>([{ id: 0, item: "", qty: "", unit: "", cost: "" }]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const attempt = useAttempt();
  const live = items.filter((i) => i.active);
  const parsed = rows.map((r) => {
    const item = live.find((i) => String(i.id) === r.item);
    const qty = parseWhole(r.qty);
    const cost = parseKes(r.cost);
    const costBad = r.cost.trim() !== "" && (cost === null || cost > MAX_UNIT_COST_CENTS);
    return { r, item, qty, cost, costBad, ok: !!item && qty !== null && qty >= 1 && cost !== null && !costBad };
  });
  const total = parsed.reduce((sum, p) => (p.ok ? sum + (p.qty ?? 0) * (p.cost ?? 0) : sum), 0);
  const taken = new Set(parsed.map((p) => p.r.item).filter(Boolean));
  const duplicate = taken.size !== parsed.filter((p) => p.r.item).length;

  function patch(id: number, change: Partial<Row>) {
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...change } : r)));
  }

  return (
    <FormDialog
      open
      title="Write down a delivery"
      submitLabel="Save delivery"
      onClose={onClose}
      onFieldErrors={setErrors}
      disabled={!supplier || parsed.length === 0 || parsed.some((p) => !p.ok) || duplicate}
      onSubmit={async () => {
        const body = {
          supplier_id: Number(supplier),
          invoice_ref: invoice.trim(),
          note: note.trim(),
          lines: parsed.map((p) => ({ item_id: p.item!.id, qty: p.qty!, unit_id: p.r.unit ? Number(p.r.unit) : undefined, unit_cost_cents: p.cost! })),
        };
        await api("/purchases", { method: "POST", body, idempotencyKey: attempt(body) });
        onDone("The delivery was saved. Receive it when the goods arrive.");
      }}
    >
      <SelectField label="Supplier" value={supplier} onChange={(e) => setSupplier(e.target.value)} error={errors.supplier_id} required>
        <option value="">Choose a supplier</option>
        {suppliers.filter((s) => s.active).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
      </SelectField>
      <div className="grid gap-3 sm:grid-cols-2">
        <TextField label="Invoice number (optional)" value={invoice} maxLength={60} onChange={(e) => setInvoice(e.target.value)} error={errors.invoice_ref} />
        <TextField label="Note (optional)" value={note} maxLength={200} onChange={(e) => setNote(e.target.value)} error={errors.note} />
      </div>
      <p className="text-sm text-slate-brand/80">Writing the delivery down does not add any stock. It is added when you receive it.</p>
      <ul className="space-y-3">
        {parsed.map((p, idx) => (
          <li key={p.r.id} className="space-y-2 rounded-md border border-stone-brand p-3">
            <SelectField label={`Item ${idx + 1}`} value={p.r.item} onChange={(e) => patch(p.r.id, { item: e.target.value, unit: "" })} error={idx === 0 ? errors.item_id : undefined} required>
              <option value="">Choose an item</option>
              {live.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
            </SelectField>
            <div className="grid grid-cols-2 gap-3">
              <TextField label="Quantity" inputMode="numeric" value={p.r.qty} onChange={(e) => patch(p.r.id, { qty: e.target.value })} error={p.r.qty && (p.qty === null || p.qty < 1) ? "Enter a whole number above 0." : undefined} />
              <SelectField label="In" value={p.r.unit} onChange={(e) => patch(p.r.id, { unit: e.target.value })} disabled={!p.item}>
                {p.item ? unitChoices(p.item).map((u, n) => <option key={u.id} value={n === 0 ? "" : u.id}>{u.label}</option>) : <option value="">Choose an item first</option>}
              </SelectField>
            </div>
            <TextField label="Price of one unit (KES)" inputMode="decimal" value={p.r.cost} onChange={(e) => patch(p.r.id, { cost: e.target.value })} error={p.costBad ? "Enter an amount up to 100,000.00." : undefined} hint="What it costs you, as on the supplier's invoice, for the unit chosen above. If you are VAT-registered and claim input VAT, enter the price before VAT." />
            {rows.length > 1 && <Button variant="secondary" onClick={() => setRows((rs) => rs.filter((r) => r.id !== p.r.id))}>Remove this item</Button>}
          </li>
        ))}
      </ul>
      {duplicate && <Alert tone="error">An item appears twice. Put the total in one line.</Alert>}
      {errors.lines && <Alert tone="error">{errors.lines}</Alert>}
      <Button variant="secondary" onClick={() => setRows((rs) => [...rs, { id: nextId.current++, item: "", qty: "", unit: "", cost: "" }])}>Add another item</Button>
      <p className="money text-right text-lg font-semibold">Total {formatKes(total)}</p>
    </FormDialog>
  );
}

// ---- receive ----

type Arrival = { qty: string; cost: string };

export function ReceiveDialog({ purchase, locations, onClose, onDone }: Common & { purchase: Purchase; locations: StockLocation[] }) {
  const places = locations.filter((l) => l.active);
  const [loc, setLoc] = useState(String(places.find((l) => l.code === "main_store")?.id ?? ""));
  const [invoice, setInvoice] = useState(purchase.invoice_ref ?? "");
  const [lines, setLines] = useState<PurchaseLine[]>();
  const [loadError, setLoadError] = useState<string>();
  const [arrived, setArrived] = useState<Record<number, Arrival>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const attempt = useAttempt();

  useEffect(() => {
    let alive = true;
    api<{ purchase: Purchase }>(`/purchases/${purchase.id}`)
      .then((r) => {
        if (!alive) return;
        const ls = r.purchase.lines ?? [];
        setLines(ls);
        setArrived(Object.fromEntries(ls.map((l) => [l.item_id, { qty: String(l.entered_qty), cost: centsToInput(l.unit_cost_cents) }])));
      })
      .catch((err) => alive && setLoadError(errorMessage(err)));
    return () => {
      alive = false;
    };
  }, [purchase.id]);

  const parsed = (lines ?? []).map((l) => {
    const a = arrived[l.item_id] ?? { qty: "", cost: "" };
    const qty = parseWhole(a.qty);
    const cost = parseKes(a.cost);
    const qtyBad = qty === null || qty < 0;
    const costBad = cost === null || cost > MAX_UNIT_COST_CENTS;
    return { l, a, qty, cost, qtyBad, costBad };
  });
  const bad = parsed.some((p) => p.qtyBad || p.costBad);
  const anyArrived = parsed.some((p) => (p.qty ?? 0) > 0);
  const total = parsed.reduce((sum, p) => (p.qtyBad || p.costBad ? sum : sum + (p.qty ?? 0) * (p.cost ?? 0)), 0);

  function patch(id: number, change: Partial<Arrival>) {
    setArrived((m) => ({ ...m, [id]: { qty: m[id]?.qty ?? "", cost: m[id]?.cost ?? "", ...change } }));
  }

  return (
    <FormDialog
      open
      title={`Receive delivery #${purchase.purchase_no}`}
      submitLabel="Receive stock"
      onClose={onClose}
      onFieldErrors={setErrors}
      disabled={!loc || !lines || bad || !anyArrived}
      onSubmit={async () => {
        const body = {
          location_id: Number(loc),
          invoice_ref: invoice.trim(),
          lines: parsed.map((p) => ({ item_id: p.l.item_id, qty: p.qty!, unit_cost_cents: p.cost! })),
        };
        await api(`/purchases/${purchase.id}/receive`, { method: "POST", body, idempotencyKey: attempt(body) });
        onDone(`Delivery #${purchase.purchase_no} was received. The stock is in.`);
      }}
    >
      <p>{purchase.supplier_name} · ordered <span className="money font-medium">{formatKes(purchase.ordered_cents)}</span></p>
      <p className="text-sm text-slate-brand/80">Check what really arrived. Change a quantity if it was short (put 0 if it did not come) and the price if it was different. The stock is added with what you enter here. A delivery cannot be received twice. If you receive something wrong, reverse it from the Stock page.</p>
      {loadError && <Alert tone="error">{loadError}</Alert>}
      {!lines && !loadError && <LoadingState label="Loading the items" />}
      {lines && (
        <ul className="space-y-3">
          {parsed.map((p) => (
            <li key={p.l.item_id} className="space-y-2 rounded-md border border-stone-brand p-3">
              <p className="font-medium">{p.l.item_name}</p>
              <p className="text-sm text-slate-brand/80">Ordered: {p.l.entered_qty.toLocaleString("en-KE")} {p.l.entered_unit_code} at <span className="money">{formatKes(p.l.unit_cost_cents)}</span></p>
              <div className="grid grid-cols-2 gap-3">
                <TextField label={`Arrived (${p.l.entered_unit_code})`} inputMode="numeric" value={p.a.qty} onChange={(e) => patch(p.l.item_id, { qty: e.target.value })} error={p.qtyBad ? "Enter a whole number, 0 or more." : undefined} />
                <TextField label="Price of one (KES)" inputMode="decimal" value={p.a.cost} onChange={(e) => patch(p.l.item_id, { cost: e.target.value })} error={p.costBad ? "Enter an amount up to 100,000.00." : undefined} />
              </div>
              {!p.qtyBad && p.qty !== p.l.entered_qty && <p className="text-sm font-medium text-ember">{p.qty === 0 ? "Did not arrive." : `${p.qty! < p.l.entered_qty ? "Short" : "More than ordered"}: ${p.qty!.toLocaleString("en-KE")} instead of ${p.l.entered_qty.toLocaleString("en-KE")}.`}</p>}
            </li>
          ))}
        </ul>
      )}
      {errors.lines && <Alert tone="error">{errors.lines}</Alert>}
      <p className="money text-right text-lg font-semibold">Arrived {formatKes(total)}</p>
      <SelectField label="Where did it arrive?" value={loc} onChange={(e) => setLoc(e.target.value)} error={errors.location_id} required>
        <option value="">Choose a place</option>
        {places.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
      </SelectField>
      <TextField label="Invoice number (optional)" value={invoice} maxLength={60} onChange={(e) => setInvoice(e.target.value)} error={errors.invoice_ref} />
    </FormDialog>
  );
}

// ---- cancel ----

export function CancelPurchaseDialog({ purchase, onClose, onDone }: Common & { purchase: Purchase }) {
  return (
    <FormDialog
      open
      title={`Cancel delivery #${purchase.purchase_no}`}
      submitLabel="Cancel delivery"
      danger
      onClose={onClose}
      onSubmit={async () => {
        await api(`/purchases/${purchase.id}/cancel`, { method: "POST" });
        onDone(`Delivery #${purchase.purchase_no} was cancelled. No stock changed.`);
      }}
    >
      <p>Cancel the delivery from {purchase.supplier_name}? Nothing was added to stock, so nothing needs undoing. A cancelled delivery stays in the list but cannot be received.</p>
    </FormDialog>
  );
}
