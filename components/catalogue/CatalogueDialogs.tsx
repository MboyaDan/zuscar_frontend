"use client";

import { useEffect, useState } from "react";
import { SelectField } from "@/components/catalogue/SelectField";
import { FormDialog } from "@/components/FormDialog";
import { Alert, TextField } from "@/components/ui";
import { api, errorMessage } from "@/lib/api";
import { formatWhen } from "@/lib/format";
import { centsToInput, formatKes, parseKes } from "@/lib/money";
import type { CatalogueData, Category, Modifier, Module, PriceHistoryItem, Product, TaxRate } from "@/lib/types";

type Common = { onClose: () => void; onDone: (message: string) => void };

export const MODULE_LABEL: Record<Module, string> = { restaurant: "Restaurant", bar: "Bar" };
export const TREATMENT_LABEL: Record<TaxRate["treatment"], string> = { standard: "standard rate", zero_rated: "zero-rated", exempt: "exempt" };

export function taxLabel(r: { name: string; rate_bp: number; treatment: TaxRate["treatment"] }): string {
  return `${r.name} (${TREATMENT_LABEL[r.treatment]}, ${(r.rate_bp / 100).toFixed(2)}%)`;
}

// ---- categories ----

export function CategoryDialog({ category, onClose, onDone }: Common & { category?: Category }) {
  const [module, setModule] = useState<string>(category?.module ?? "");
  const [name, setName] = useState(category?.name ?? "");
  const [sort, setSort] = useState(String(category?.sort_order ?? 0));
  const [active, setActive] = useState(category?.active ?? true);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const sortNum = Number(sort);
  const sortOk = sort.trim() !== "" && Number.isInteger(sortNum);
  return (
    <FormDialog
      open
      title={category ? `Edit ${category.name}` : "Add a category"}
      submitLabel={category ? "Save" : "Add category"}
      onClose={onClose}
      onFieldErrors={setErrors}
      disabled={!name.trim() || !sortOk || (!category && !module)}
      onSubmit={async () => {
        if (category) await api(`/categories/${category.id}`, { method: "PATCH", body: { name: name.trim(), sort_order: sortNum, active } });
        else await api("/categories", { method: "POST", body: { module, name: name.trim(), sort_order: sortNum } });
        onDone(category ? `${name.trim()} was saved.` : `${name.trim()} was added.`);
      }}
    >
      {category ? (
        <p className="text-sm">Module: <strong>{MODULE_LABEL[category.module]}</strong> (cannot be changed)</p>
      ) : (
        <SelectField label="Module" value={module} onChange={(e) => setModule(e.target.value)} error={errors.module} required>
          <option value="">Choose a module</option>
          <option value="restaurant">Restaurant</option>
          <option value="bar">Bar</option>
        </SelectField>
      )}
      <TextField label="Name" value={name} onChange={(e) => setName(e.target.value)} error={errors.name} required autoFocus />
      <TextField label="Order on the menu" inputMode="numeric" value={sort} onChange={(e) => setSort(e.target.value)} error={errors.sort_order ?? (sortOk ? undefined : "Enter a whole number.")} hint="Smaller numbers come first." />
      {category && (
        <label className="target flex items-center gap-3">
          <input type="checkbox" className="size-4" checked={active} onChange={(e) => setActive(e.target.checked)} />
          <span>Active. An inactive category and its products are hidden from the menu.</span>
        </label>
      )}
    </FormDialog>
  );
}

// ---- modifiers ----

export function ModifierDialog({ modifier, onClose, onDone }: Common & { modifier?: Modifier }) {
  const [name, setName] = useState(modifier?.name ?? "");
  const [delta, setDelta] = useState(modifier ? centsToInput(modifier.price_delta_cents) : "0.00");
  const [active, setActive] = useState(modifier?.active ?? true);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const cents = parseKes(delta, { allowNegative: true });
  return (
    <FormDialog
      open
      title={modifier ? `Edit ${modifier.name}` : "Add a modifier"}
      submitLabel={modifier ? "Save" : "Add modifier"}
      onClose={onClose}
      onFieldErrors={setErrors}
      disabled={!name.trim() || cents === null}
      onSubmit={async () => {
        if (cents === null) return;
        if (modifier) await api(`/modifiers/${modifier.id}`, { method: "PATCH", body: { name: name.trim(), price_delta_cents: cents, active } });
        else await api("/modifiers", { method: "POST", body: { name: name.trim(), price_delta_cents: cents } });
        onDone(modifier ? `${name.trim()} was saved.` : `${name.trim()} was added.`);
      }}
    >
      <TextField label="Name" value={name} onChange={(e) => setName(e.target.value)} error={errors.name} required autoFocus />
      <TextField
        label="Price change (KES)"
        inputMode="decimal"
        value={delta}
        onChange={(e) => setDelta(e.target.value)}
        error={errors.price_delta_cents ?? (cents === null ? "Enter an amount such as 50 or -20.50." : undefined)}
        hint="Added to the product price. Use 0 for no charge, or a minus sign for a discount."
      />
      {modifier && (
        <label className="target flex items-center gap-3">
          <input type="checkbox" className="size-4" checked={active} onChange={(e) => setActive(e.target.checked)} />
          <span>Active. An inactive modifier is hidden from the menu.</span>
        </label>
      )}
    </FormDialog>
  );
}

// ---- products ----

export function ProductDialog({ product, data, onClose, onDone }: Common & { product?: Product; data: CatalogueData }) {
  const [name, setName] = useState(product?.name ?? "");
  const [sku, setSku] = useState(product?.sku ?? "");
  const [categoryId, setCategoryId] = useState(product ? String(product.category_id) : "");
  // The tax category and the kitchen decision start empty on purpose: neither has a safe default.
  const [taxId, setTaxId] = useState(product ? String(product.tax_rate.id) : "");
  const [kitchen, setKitchen] = useState<string>(product ? (product.kitchen_routed ? "yes" : "no") : "");
  const [price, setPrice] = useState("");
  const [mods, setMods] = useState<number[]>(product?.modifier_ids ?? []);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const cents = parseKes(price);
  const categories = data.categories.filter((c) => (c.active || c.id === product?.category_id) && (!product || c.module === product.module));
  const rates = data.rates.filter((r) => r.active || r.id === product?.tax_rate.id);
  const ready = name.trim() && categoryId && taxId && kitchen && (product || cents !== null);

  return (
    <FormDialog
      open
      title={product ? `Edit ${product.name}` : "Add a product"}
      submitLabel={product ? "Save" : "Add product"}
      onClose={onClose}
      onFieldErrors={setErrors}
      disabled={!ready}
      onSubmit={async () => {
        const common = { category_id: Number(categoryId), name: name.trim(), sku: sku.trim(), tax_rate_id: Number(taxId), kitchen_routed: kitchen === "yes", modifier_ids: mods };
        if (product) await api(`/products/${product.id}`, { method: "PATCH", body: common });
        else await api("/products", { method: "POST", body: { ...common, price_cents: cents } });
        onDone(product ? `${name.trim()} was saved.` : `${name.trim()} was added.`);
      }}
    >
      <TextField label="Name" value={name} onChange={(e) => setName(e.target.value)} error={errors.name} required autoFocus />
      <SelectField label="Category" value={categoryId} onChange={(e) => setCategoryId(e.target.value)} error={errors.category_id} required hint={product ? "A product can only move to a category in the same module." : undefined}>
        <option value="">Choose a category</option>
        {(["restaurant", "bar"] as Module[]).map((m) => {
          const list = categories.filter((c) => c.module === m);
          return list.length ? (
            <optgroup key={m} label={MODULE_LABEL[m]}>
              {list.map((c) => <option key={c.id} value={c.id}>{c.name}{c.active ? "" : " (inactive)"}</option>)}
            </optgroup>
          ) : null;
        })}
      </SelectField>
      <SelectField label="Tax category" value={taxId} onChange={(e) => setTaxId(e.target.value)} error={errors.tax_rate_id} required hint="There is no default: choose the treatment this product really has. Rates are provisional until the tax configuration is verified in Settings.">
        <option value="">Choose a tax category</option>
        {rates.map((r) => <option key={r.id} value={r.id}>{taxLabel(r)}{r.active ? "" : " (switched off)"}</option>)}
      </SelectField>
      <SelectField label="Sent to the kitchen?" value={kitchen} onChange={(e) => setKitchen(e.target.value)} error={errors.kitchen_routed} required>
        <option value="">Choose</option>
        <option value="yes">Yes, it is prepared in the kitchen</option>
        <option value="no">No, it is served without kitchen preparation</option>
      </SelectField>
      {!product && (
        <TextField label="Price (KES)" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} error={errors.price_cents ?? (price && cents === null ? "Enter an amount such as 850 or 850.50." : undefined)} required />
      )}
      <TextField label="SKU (optional)" value={sku} onChange={(e) => setSku(e.target.value)} error={errors.sku} hint="Letters, digits, dot, dash or underscore. Must be unique." />
      {data.modifiers.length > 0 && (
        <fieldset className="space-y-1">
          <legend className="text-sm font-medium">Modifiers offered with this product</legend>
          {errors.modifier_ids && <p className="text-sm text-danger">{errors.modifier_ids}</p>}
          {data.modifiers.map((m) => (
            <label key={m.id} className="target flex items-center gap-3">
              <input type="checkbox" className="size-4" checked={mods.includes(m.id)} onChange={() => setMods((cur) => (cur.includes(m.id) ? cur.filter((x) => x !== m.id) : [...cur, m.id]))} />
              <span>{m.name} <span className="text-slate-brand/80">({formatKes(m.price_delta_cents)}{m.active ? "" : ", inactive"})</span></span>
            </label>
          ))}
        </fieldset>
      )}
      {product && <Alert tone="info">To change the price or mark the product sold out, use the Price and Available buttons in the table.</Alert>}
    </FormDialog>
  );
}

export function PriceDialog({ product, onClose, onDone }: Common & { product: Product }) {
  const [price, setPrice] = useState(centsToInput(product.price_cents));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [history, setHistory] = useState<{ status: "loading" } | { status: "error"; message: string } | { status: "ready"; items: PriceHistoryItem[] }>({ status: "loading" });
  const cents = parseKes(price);

  useEffect(() => {
    let alive = true;
    api<{ items: PriceHistoryItem[] }>(`/products/${product.id}/price-history`)
      .then((r) => alive && setHistory({ status: "ready", items: r.items }))
      .catch((err) => alive && setHistory({ status: "error", message: errorMessage(err) }));
    return () => {
      alive = false;
    };
  }, [product.id]);

  return (
    <FormDialog
      open
      title={`Price of ${product.name}`}
      submitLabel="Change price"
      onClose={onClose}
      onFieldErrors={setErrors}
      disabled={cents === null || cents === product.price_cents}
      onSubmit={async () => {
        if (cents === null) return;
        await api(`/products/${product.id}/price`, { method: "PUT", body: { price_cents: cents } });
        onDone(`The price of ${product.name} is now ${formatKes(cents)}. The old price stays in the history.`);
      }}
    >
      <p>Current price: <strong>{formatKes(product.price_cents)}</strong>. Prices already on open orders and past sales do not change.</p>
      <TextField label="New price (KES)" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} error={errors.price_cents ?? (cents === null ? "Enter an amount such as 850 or 850.50." : undefined)} autoFocus />
      <div>
        <h3 className="text-sm font-medium">Earlier prices</h3>
        {history.status === "loading" && <p className="text-sm text-slate-brand/80">Loading…</p>}
        {history.status === "error" && <p className="text-sm text-danger">{history.message}</p>}
        {history.status === "ready" && (
          <ul className="max-h-40 overflow-y-auto text-sm">
            {history.items.map((h, i) => (
              <li key={`${h.effective_from}-${i}`} className="flex justify-between border-b border-stone-brand py-1 last:border-0">
                <span>{formatWhen(h.effective_from)}</span>
                <span className="money">{formatKes(h.price_cents)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </FormDialog>
  );
}
