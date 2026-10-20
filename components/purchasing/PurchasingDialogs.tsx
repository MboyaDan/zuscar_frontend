"use client";

import { useRef, useState } from "react";
import { SelectField } from "@/components/catalogue/SelectField";
import { FormDialog } from "@/components/FormDialog";
import { Alert, Button, TextField } from "@/components/ui";
import { api, newIdempotencyKey } from "@/lib/api";
import { parseWhole, unitChoices } from "@/lib/inventory";
import { formatKes, parseKes } from "@/lib/money";
import type { InventoryItem, Purchase, StockLocation, Supplier } from "@/lib/types";

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
            <TextField label="Price of one unit (KES)" inputMode="decimal" value={p.r.cost} onChange={(e) => patch(p.r.id, { cost: e.target.value })} error={p.costBad ? "Enter an amount up to 100,000.00." : undefined} hint="As on the supplier's invoice, for the unit chosen above." />
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

export function ReceiveDialog({ purchase, locations, onClose, onDone }: Common & { purchase: Purchase; locations: StockLocation[] }) {
  const places = locations.filter((l) => l.active);
  const [loc, setLoc] = useState(String(places.find((l) => l.code === "main_store")?.id ?? ""));
  const [invoice, setInvoice] = useState(purchase.invoice_ref ?? "");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const attempt = useAttempt();
  return (
    <FormDialog
      open
      title={`Receive delivery #${purchase.purchase_no}`}
      submitLabel="Receive stock"
      onClose={onClose}
      onFieldErrors={setErrors}
      disabled={!loc}
      onSubmit={async () => {
        const body = { location_id: Number(loc), invoice_ref: invoice.trim() };
        await api(`/purchases/${purchase.id}/receive`, { method: "POST", body, idempotencyKey: attempt(body) });
        onDone(`Delivery #${purchase.purchase_no} was received. The stock is in.`);
      }}
    >
      <p>{purchase.supplier_name} · {purchase.line_count} {purchase.line_count === 1 ? "item" : "items"} · <span className="money font-medium">{formatKes(purchase.total_cents)}</span></p>
      <p className="text-sm text-slate-brand/80">This adds the stock now, with the prices on the delivery. A delivery cannot be received twice. If you receive something wrong, reverse it from the Stock page.</p>
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
