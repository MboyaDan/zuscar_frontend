"use client";

import { useRef, useState } from "react";
import { SelectField } from "@/components/catalogue/SelectField";
import { FormDialog } from "@/components/FormDialog";
import { Alert, TextField } from "@/components/ui";
import { api, ApiError, newIdempotencyKey } from "@/lib/api";
import { MOVEMENT_LABEL, parseWhole, qtyText, unitChoices } from "@/lib/inventory";
import type { InventoryItem, StockLocation, StockMovement, StockUnit } from "@/lib/types";

type Common = { onClose: () => void; onDone: (message: string) => void };

/** One key per distinct request body, so a retry of the same action is replayed and a changed action is a new one. */
function useAttempt() {
  const ref = useRef<{ payload: string; key: string } | null>(null);
  return (body: unknown) => {
    const payload = JSON.stringify(body);
    if (ref.current?.payload !== payload) ref.current = { payload, key: newIdempotencyKey() };
    return ref.current.key;
  };
}

// ---- item ----

export function ItemDialog({ item, units, onClose, onDone }: Common & { item?: InventoryItem; units: StockUnit[] }) {
  const [name, setName] = useState(item?.name ?? "");
  const [sku, setSku] = useState(item?.sku ?? "");
  const [unitId, setUnitId] = useState(item ? String(item.base_unit.id) : "");
  const [low, setLow] = useState(item?.low_stock_threshold != null ? String(item.low_stock_threshold) : "");
  const [active, setActive] = useState(item?.active ?? true);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const lowNum = low.trim() === "" ? null : parseWhole(low);
  const lowBad = low.trim() !== "" && (lowNum === null || lowNum < 0);
  return (
    <FormDialog
      open
      title={item ? `Edit ${item.name}` : "Add a stock item"}
      submitLabel={item ? "Save" : "Add item"}
      onClose={onClose}
      onFieldErrors={setErrors}
      disabled={!name.trim() || lowBad || (!item && !unitId)}
      onSubmit={async () => {
        if (item) await api(`/inventory/items/${item.id}`, { method: "PATCH", body: { name: name.trim(), sku: sku.trim(), low_stock_threshold: lowNum, active } });
        else await api("/inventory/items", { method: "POST", body: { name: name.trim(), sku: sku.trim(), base_unit_id: Number(unitId), low_stock_threshold: lowNum } });
        onDone(item ? `${name.trim()} was saved.` : `${name.trim()} was added. Set its opening stock next.`);
      }}
    >
      <TextField label="Name" value={name} onChange={(e) => setName(e.target.value)} error={errors.name} required autoFocus />
      {item ? (
        <p className="text-sm">Counted in: <strong>{item.base_unit.name}</strong> (cannot be changed, because every movement is counted in it)</p>
      ) : (
        <SelectField label="Counted in" value={unitId} onChange={(e) => setUnitId(e.target.value)} error={errors.base_unit_id} required hint="Stock is counted in whole numbers of this unit. A bottle of whisky is counted in millilitres; bottles and shots are set up as conversions afterwards.">
          <option value="">Choose a unit</option>
          {units.map((u) => <option key={u.id} value={u.id}>{u.name} ({u.code})</option>)}
        </SelectField>
      )}
      <TextField label="SKU (optional)" value={sku} onChange={(e) => setSku(e.target.value)} error={errors.sku} />
      <TextField label={`Low-stock level${item ? ` (${item.base_unit.code})` : ""} (optional)`} inputMode="numeric" value={low} onChange={(e) => setLow(e.target.value)} error={errors.low_stock_threshold ?? (lowBad ? "Enter a whole number, or leave it empty." : undefined)} hint="The item is marked low when its total over all places is at or under this." />
      {item && (
        <label className="target flex items-center gap-3">
          <input type="checkbox" className="size-4" checked={active} onChange={(e) => setActive(e.target.checked)} />
          <span>Active. A switched-off item cannot be adjusted.</span>
        </label>
      )}
    </FormDialog>
  );
}

// ---- conversions ----

type Row = { unitId: string; num: string; den: string };

export function ConversionsDialog({ item, units, onClose, onDone }: Common & { item: InventoryItem; units: StockUnit[] }) {
  const [rows, setRows] = useState<Row[]>(item.conversions.map((c) => ({ unitId: String(c.from_unit_id), num: String(c.factor_num), den: String(c.factor_den) })));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const others = units.filter((u) => u.id !== item.base_unit.id);
  const parsed = rows.map((r) => ({ unit_id: Number(r.unitId), chosen: r.unitId !== "", factor_num: parseWhole(r.num), factor_den: parseWhole(r.den || "1") }));
  const bad = parsed.some((p) => !p.chosen || !p.factor_num || p.factor_num < 1 || !p.factor_den || p.factor_den < 1) || new Set(rows.map((r) => r.unitId)).size !== rows.length;
  function set(i: number, patch: Partial<Row>) {
    setRows(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  }
  return (
    <FormDialog
      open
      title={`Units for ${item.name}`}
      submitLabel="Save units"
      onClose={onClose}
      onFieldErrors={setErrors}
      disabled={bad}
      onSubmit={async () => {
        await api(`/inventory/items/${item.id}/conversions`, { method: "PUT", body: { conversions: parsed.map((p) => ({ unit_id: p.unit_id, factor_num: p.factor_num, factor_den: p.factor_den })) } });
        onDone(`Units for ${item.name} were saved.`);
      }}
    >
      <p className="text-sm">Stock is counted in <strong>{item.base_unit.name}</strong>. Say how many of those one bottle, crate or shot is, so people can type stock in the unit they handle. A quantity that does not come to a whole number is refused, never rounded.</p>
      {errors.conversions && <p className="text-sm text-danger">{errors.conversions}</p>}
      <ul className="space-y-3">
        {rows.map((r, i) => (
          <li key={i} className="grid grid-cols-[1fr_5.5rem_5.5rem_auto] items-end gap-2">
            <SelectField label="Unit" value={r.unitId} onChange={(e) => set(i, { unitId: e.target.value })}>
              <option value="">Choose</option>
              {others.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </SelectField>
            <TextField label={`${item.base_unit.code} per unit`} inputMode="numeric" value={r.num} onChange={(e) => set(i, { num: e.target.value })} />
            <TextField label="divided by" inputMode="numeric" value={r.den} onChange={(e) => set(i, { den: e.target.value })} />
            <button type="button" className="target rounded-md border border-stone-brand px-3 py-2" onClick={() => setRows(rows.filter((_, j) => j !== i))}>Remove</button>
          </li>
        ))}
      </ul>
      <button type="button" className="target rounded-md border border-stone-brand px-3 py-2" onClick={() => setRows([...rows, { unitId: "", num: "", den: "1" }])}>Add a unit</button>
      {others.length === 0 && <Alert tone="info">No other units exist yet. Add one from the Stock page (for example bottle or crate).</Alert>}
    </FormDialog>
  );
}

// ---- unit and location ----

export function NameCodeDialog({ kind, onClose, onDone }: Common & { kind: "unit" | "location" }) {
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const word = kind === "unit" ? "unit" : "stock place";
  return (
    <FormDialog
      open
      title={`Add a ${word}`}
      submitLabel={`Add ${word}`}
      onClose={onClose}
      onFieldErrors={setErrors}
      disabled={!code.trim() || !name.trim()}
      onSubmit={async () => {
        await api(kind === "unit" ? "/inventory/units" : "/inventory/locations", { method: "POST", body: { code: code.trim().toLowerCase(), name: name.trim() } });
        onDone(`${name.trim()} was added.`);
      }}
    >
      <TextField label="Name" value={name} onChange={(e) => setName(e.target.value)} error={errors.name} required autoFocus hint={kind === "unit" ? "For example Bottle, Crate, Shot." : "For example Cold room."} />
      <TextField label="Short code" value={code} onChange={(e) => setCode(e.target.value)} error={errors.code} required hint="Lower case letters, digits and underscore, such as bottle or cold_room." />
    </FormDialog>
  );
}

// ---- opening stock ----

export function OpeningDialog({ item, locations, onClose, onDone }: Common & { item: InventoryItem; locations: StockLocation[] }) {
  const have = new Set(item.balances.map((b) => b.location_id));
  const open = locations.filter((l) => l.active);
  const [loc, setLoc] = useState("");
  const [qty, setQty] = useState("");
  const [unit, setUnit] = useState(String(item.base_unit.id));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const attempt = useAttempt();
  const n = parseWhole(qty);
  return (
    <FormDialog
      open
      title={`Opening stock of ${item.name}`}
      submitLabel="Set opening stock"
      onClose={onClose}
      onFieldErrors={setErrors}
      disabled={!loc || n === null || n < 1}
      onSubmit={async () => {
        if (n === null) return;
        const body = { location_id: Number(loc), lines: [{ item_id: item.id, qty: n, unit_id: Number(unit) }] };
        await api("/inventory/opening-balances", { method: "POST", body, idempotencyKey: attempt(body) });
        onDone(`Opening stock of ${item.name} was set.`);
      }}
    >
      <p className="text-sm">An opening balance is set once for each place. Afterwards use an adjustment, a stock count or a delivery.</p>
      <SelectField label="Place" value={loc} onChange={(e) => setLoc(e.target.value)} error={errors.location_id} required>
        <option value="">Choose a place</option>
        {open.map((l) => <option key={l.id} value={l.id}>{l.name}{have.has(l.id) ? " (has stock already)" : ""}</option>)}
      </SelectField>
      <div className="grid grid-cols-2 gap-3">
        <TextField label="Quantity" inputMode="numeric" value={qty} onChange={(e) => setQty(e.target.value)} error={errors.qty ?? errors.lines ?? (qty && (n === null || n < 1) ? "Enter a whole number above 0." : undefined)} />
        <SelectField label="In" value={unit} onChange={(e) => setUnit(e.target.value)}>
          {unitChoices(item).map((u) => <option key={u.id} value={u.id}>{u.label}</option>)}
        </SelectField>
      </div>
    </FormDialog>
  );
}

// ---- adjustment ----

export function AdjustDialog({ item, locations, canOverride, onClose, onDone }: Common & { item: InventoryItem; locations: StockLocation[]; canOverride: boolean }) {
  const [loc, setLoc] = useState("");
  const [dir, setDir] = useState<"add" | "remove">("add");
  const [qty, setQty] = useState("");
  const [unit, setUnit] = useState(String(item.base_unit.id));
  const [reason, setReason] = useState("");
  const [override, setOverride] = useState(false);
  const [overrideReason, setOverrideReason] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const attempt = useAttempt();
  const n = parseWhole(qty);
  const here = item.balances.find((b) => String(b.location_id) === loc)?.qty_base ?? 0;
  return (
    <FormDialog
      open
      title={`Adjust ${item.name}`}
      submitLabel={dir === "add" ? "Add stock" : "Take stock away"}
      danger={dir === "remove"}
      onClose={onClose}
      onFieldErrors={setErrors}
      disabled={!loc || n === null || n < 1 || !reason.trim() || (override && !overrideReason.trim())}
      onSubmit={async () => {
        if (n === null) return;
        const body: Record<string, unknown> = { item_id: item.id, location_id: Number(loc), qty: dir === "add" ? n : -n, unit_id: Number(unit), reason: reason.trim() };
        if (override) {
          body.override_negative = true;
          body.override_reason = overrideReason.trim();
        }
        try {
          await api("/inventory/adjustments", { method: "POST", body, idempotencyKey: attempt(body) });
        } catch (err) {
          if (err instanceof ApiError && err.code === "negative_stock" && canOverride) setOverride(true);
          throw err;
        }
        onDone(`${item.name} was adjusted.`);
      }}
    >
      <SelectField label="Place" value={loc} onChange={(e) => setLoc(e.target.value)} error={errors.location_id} required hint={loc ? `Now: ${qtyText(here, item.base_unit.code)}` : undefined}>
        <option value="">Choose a place</option>
        {locations.filter((l) => l.active).map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
      </SelectField>
      <SelectField label="What happened" value={dir} onChange={(e) => setDir(e.target.value as "add" | "remove")}>
        <option value="add">More is there than the books say</option>
        <option value="remove">Less is there than the books say</option>
      </SelectField>
      <div className="grid grid-cols-2 gap-3">
        <TextField label="Quantity" inputMode="numeric" value={qty} onChange={(e) => setQty(e.target.value)} error={errors.qty ?? (qty && (n === null || n < 1) ? "Enter a whole number above 0." : undefined)} />
        <SelectField label="In" value={unit} onChange={(e) => setUnit(e.target.value)}>
          {unitChoices(item).map((u) => <option key={u.id} value={u.id}>{u.label}</option>)}
        </SelectField>
      </div>
      <TextField label="Reason" value={reason} maxLength={200} onChange={(e) => setReason(e.target.value)} error={errors.reason} hint="For example: found a case behind the shelf." />
      {override && (
        <div className="space-y-2">
          <Alert tone="info">This would take {item.name} below zero. You can allow it with a reason; it is recorded against your name.</Alert>
          <TextField label="Why below zero" value={overrideReason} maxLength={200} onChange={(e) => setOverrideReason(e.target.value)} error={errors.override_reason} />
        </div>
      )}
    </FormDialog>
  );
}

// ---- reverse ----

export function ReverseDialog({ movement, canOverride, onClose, onDone }: Common & { movement: StockMovement; canOverride: boolean }) {
  const [reason, setReason] = useState("");
  const [override, setOverride] = useState(false);
  const [overrideReason, setOverrideReason] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const attempt = useAttempt();
  return (
    <FormDialog
      open
      title="Reverse this movement"
      submitLabel="Reverse"
      danger
      onClose={onClose}
      onFieldErrors={setErrors}
      disabled={!reason.trim() || (override && !overrideReason.trim())}
      onSubmit={async () => {
        const body: Record<string, unknown> = { reason: reason.trim() };
        if (override) {
          body.override_negative = true;
          body.override_reason = overrideReason.trim();
        }
        try {
          await api(`/inventory/movements/${movement.id}/reverse`, { method: "POST", body, idempotencyKey: attempt(body) });
        } catch (err) {
          if (err instanceof ApiError && err.code === "negative_stock" && canOverride) setOverride(true);
          throw err;
        }
        onDone("The movement was reversed. The original stays in the list.");
      }}
    >
      <p>{MOVEMENT_LABEL[movement.movement_type]}: <strong>{qtyText(movement.qty_delta, movement.base_unit_code, true)}</strong> of {movement.item_name} at {movement.location_name}. A new movement of {qtyText(-movement.qty_delta, movement.base_unit_code, true)} is added; nothing is deleted.</p>
      <TextField label="Reason" value={reason} maxLength={200} onChange={(e) => setReason(e.target.value)} error={errors.reason} autoFocus />
      {override && (
        <div className="space-y-2">
          <Alert tone="info">Reversing this would take the item below zero. You can allow it with a reason.</Alert>
          <TextField label="Why below zero" value={overrideReason} maxLength={200} onChange={(e) => setOverrideReason(e.target.value)} error={errors.override_reason} />
        </div>
      )}
    </FormDialog>
  );
}

// ---- transfer ----

export function TransferDialog({ item, locations, canOverride, onClose, onDone }: Common & { item: InventoryItem; locations: StockLocation[]; canOverride: boolean }) {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [qty, setQty] = useState("");
  const [unit, setUnit] = useState(String(item.base_unit.id));
  const [note, setNote] = useState("");
  const [override, setOverride] = useState(false);
  const [overrideReason, setOverrideReason] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const attempt = useAttempt();
  const n = parseWhole(qty);
  const places = locations.filter((l) => l.active);
  const here = item.balances.find((b) => String(b.location_id) === from)?.qty_base ?? 0;
  return (
    <FormDialog
      open
      title={`Move ${item.name}`}
      submitLabel="Move stock"
      onClose={onClose}
      onFieldErrors={setErrors}
      disabled={!from || !to || from === to || n === null || n < 1 || (override && !overrideReason.trim())}
      onSubmit={async () => {
        if (n === null) return;
        const body: Record<string, unknown> = { item_id: item.id, from_location_id: Number(from), to_location_id: Number(to), qty: n, unit_id: Number(unit), note: note.trim() };
        if (override) {
          body.override_negative = true;
          body.override_reason = overrideReason.trim();
        }
        try {
          await api("/inventory/transfers", { method: "POST", body, idempotencyKey: attempt(body) });
        } catch (err) {
          if (err instanceof ApiError && err.code === "negative_stock" && canOverride) setOverride(true);
          throw err;
        }
        onDone(`${item.name} was moved.`);
      }}
    >
      <SelectField label="From" value={from} onChange={(e) => setFrom(e.target.value)} error={errors.from_location_id} required hint={from ? `Now: ${qtyText(here, item.base_unit.code)}` : undefined}>
        <option value="">Choose a place</option>
        {places.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
      </SelectField>
      <SelectField label="To" value={to} onChange={(e) => setTo(e.target.value)} error={errors.to_location_id ?? (from && to && from === to ? "Choose a different place." : undefined)} required>
        <option value="">Choose a place</option>
        {places.filter((l) => String(l.id) !== from).map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
      </SelectField>
      <div className="grid grid-cols-2 gap-3">
        <TextField label="Quantity" inputMode="numeric" value={qty} onChange={(e) => setQty(e.target.value)} error={errors.qty ?? (qty && (n === null || n < 1) ? "Enter a whole number above 0." : undefined)} />
        <SelectField label="In" value={unit} onChange={(e) => setUnit(e.target.value)}>
          {unitChoices(item).map((u) => <option key={u.id} value={u.id}>{u.label}</option>)}
        </SelectField>
      </div>
      <TextField label="Note (optional)" value={note} maxLength={200} onChange={(e) => setNote(e.target.value)} error={errors.note} />
      {override && (
        <div className="space-y-2">
          <Alert tone="info">This would take the source place below zero. You can allow it with a reason.</Alert>
          <TextField label="Why below zero" value={overrideReason} maxLength={200} onChange={(e) => setOverrideReason(e.target.value)} error={errors.override_reason} />
        </div>
      )}
    </FormDialog>
  );
}

// ---- wastage, breakage, complimentary ----

const KIND_LABEL = { wastage: "Wastage (spoiled or thrown away)", breakage: "Breakage (dropped or broken)", complimentary: "Complimentary (given away)" } as const;

export function WastageDialog({ item, locations, canOverride, onClose, onDone }: Common & { item: InventoryItem; locations: StockLocation[]; canOverride: boolean }) {
  const [loc, setLoc] = useState("");
  const [kind, setKind] = useState<keyof typeof KIND_LABEL>("wastage");
  const [qty, setQty] = useState("");
  const [unit, setUnit] = useState(String(item.base_unit.id));
  const [reason, setReason] = useState("");
  const [override, setOverride] = useState(false);
  const [overrideReason, setOverrideReason] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const attempt = useAttempt();
  const n = parseWhole(qty);
  const here = item.balances.find((b) => String(b.location_id) === loc)?.qty_base ?? 0;
  return (
    <FormDialog
      open
      title={`Take ${item.name} out of stock`}
      submitLabel="Record"
      danger
      onClose={onClose}
      onFieldErrors={setErrors}
      disabled={!loc || n === null || n < 1 || !reason.trim() || (override && !overrideReason.trim())}
      onSubmit={async () => {
        if (n === null) return;
        const body: Record<string, unknown> = { item_id: item.id, location_id: Number(loc), kind, qty: n, unit_id: Number(unit), reason: reason.trim() };
        if (override) {
          body.override_negative = true;
          body.override_reason = overrideReason.trim();
        }
        try {
          await api("/inventory/wastage", { method: "POST", body, idempotencyKey: attempt(body) });
        } catch (err) {
          if (err instanceof ApiError && err.code === "negative_stock" && canOverride) setOverride(true);
          throw err;
        }
        onDone(`${MOVEMENT_LABEL[kind]} of ${item.name} was recorded.`);
      }}
    >
      <SelectField label="What happened" value={kind} onChange={(e) => setKind(e.target.value as keyof typeof KIND_LABEL)}>
        {(Object.keys(KIND_LABEL) as (keyof typeof KIND_LABEL)[]).map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
      </SelectField>
      <SelectField label="Place" value={loc} onChange={(e) => setLoc(e.target.value)} error={errors.location_id} required hint={loc ? `Now: ${qtyText(here, item.base_unit.code)}` : undefined}>
        <option value="">Choose a place</option>
        {locations.filter((l) => l.active).map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
      </SelectField>
      <div className="grid grid-cols-2 gap-3">
        <TextField label="Quantity" inputMode="numeric" value={qty} onChange={(e) => setQty(e.target.value)} error={errors.qty ?? (qty && (n === null || n < 1) ? "Enter a whole number above 0." : undefined)} />
        <SelectField label="In" value={unit} onChange={(e) => setUnit(e.target.value)}>
          {unitChoices(item).map((u) => <option key={u.id} value={u.id}>{u.label}</option>)}
        </SelectField>
      </div>
      <TextField label="Reason" value={reason} maxLength={200} onChange={(e) => setReason(e.target.value)} error={errors.reason} hint="For example: milk went off, glass dropped, drink for a guest." />
      {override && (
        <div className="space-y-2">
          <Alert tone="info">This would take the place below zero. You can allow it with a reason.</Alert>
          <TextField label="Why below zero" value={overrideReason} maxLength={200} onChange={(e) => setOverrideReason(e.target.value)} error={errors.override_reason} />
        </div>
      )}
    </FormDialog>
  );
}
