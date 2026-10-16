"use client";

import { Ban, CircleCheck, Pencil, Tag } from "lucide-react";
import { useMemo, useState } from "react";
import { MODULE_LABEL, taxLabel } from "@/components/catalogue/CatalogueDialogs";
import { SelectField } from "@/components/catalogue/SelectField";
import { Button, EmptyState, TextField } from "@/components/ui";
import { formatKes } from "@/lib/money";
import type { CatalogueData, Category, Modifier, Product } from "@/lib/types";

const wrap = "overflow-x-auto rounded-lg border border-stone-brand bg-white";
const head = "border-b border-stone-brand bg-stone-brand/30 text-sm";

function Active({ on }: { on: boolean }) {
  return on ? (
    <span className="inline-flex items-center gap-1 text-success"><CircleCheck aria-hidden className="size-4" /> Active</span>
  ) : (
    <span className="inline-flex items-center gap-1 text-danger"><Ban aria-hidden className="size-4" /> Inactive</span>
  );
}

export function ProductsTab({ data, onEdit, onPrice, onToggle }: { data: CatalogueData; onEdit: (p: Product) => void; onPrice: (p: Product) => void; onToggle: (p: Product) => void }) {
  const [module, setModule] = useState("");
  const [category, setCategory] = useState("");
  const [stock, setStock] = useState("");
  const [q, setQ] = useState("");

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return data.products.filter(
      (p) =>
        (!module || p.module === module) &&
        (!category || String(p.category_id) === category) &&
        (!stock || (stock === "sold_out" ? !p.is_available : p.is_available)) &&
        (!needle || p.name.toLowerCase().includes(needle) || (p.sku ?? "").toLowerCase().includes(needle)),
    );
  }, [data.products, module, category, stock, q]);

  if (data.products.length === 0) return <EmptyState title="No products yet">Add a category first, then add the first product.</EmptyState>;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-3" role="search">
        <div className="min-w-48 flex-1"><TextField label="Search name or SKU" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <SelectField label="Module" value={module} onChange={(e) => { setModule(e.target.value); setCategory(""); }}>
          <option value="">All</option>
          <option value="restaurant">Restaurant</option>
          <option value="bar">Bar</option>
        </SelectField>
        <SelectField label="Category" value={category} onChange={(e) => setCategory(e.target.value)}>
          <option value="">All</option>
          {data.categories.filter((c) => !module || c.module === module).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </SelectField>
        <SelectField label="Availability" value={stock} onChange={(e) => setStock(e.target.value)}>
          <option value="">All</option>
          <option value="available">Available</option>
          <option value="sold_out">Sold out</option>
        </SelectField>
      </div>
      {shown.length === 0 ? (
        <EmptyState title="Nothing matches">Try fewer filters.</EmptyState>
      ) : (
        <div className={wrap}>
          <table className="w-full min-w-[56rem] text-left">
            <caption className="sr-only">Products</caption>
            <thead className={head}>
              <tr>
                <th scope="col" className="px-4 py-2">Product</th>
                <th scope="col" className="px-4 py-2">Category</th>
                <th scope="col" className="px-4 py-2 text-right">Price</th>
                <th scope="col" className="px-4 py-2">Tax category</th>
                <th scope="col" className="px-4 py-2">Availability</th>
                <th scope="col" className="px-4 py-2"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {shown.map((p) => (
                <tr key={p.id} className="border-b border-stone-brand align-top last:border-0">
                  <td className="px-4 py-3">
                    {p.name}
                    <span className="block font-mono text-xs text-slate-brand/80">{p.sku ?? "no SKU"}{p.kitchen_routed ? " · kitchen" : ""}</span>
                  </td>
                  <td className="px-4 py-3">{p.category_name}<span className="block text-sm text-slate-brand/80">{MODULE_LABEL[p.module]}</span></td>
                  <td className="money px-4 py-3 text-right">{formatKes(p.price_cents)}</td>
                  <td className="px-4 py-3 text-sm">{taxLabel(p.tax_rate)}</td>
                  <td className="px-4 py-3">
                    <Button variant="secondary" aria-pressed={p.is_available} onClick={() => onToggle(p)} aria-label={`${p.name}: ${p.is_available ? "available, press to mark sold out" : "sold out, press to mark available"}`}>
                      {p.is_available ? <><CircleCheck aria-hidden className="size-4 text-success" /> Available</> : <><Ban aria-hidden className="size-4 text-danger" /> Sold out</>}
                    </Button>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2">
                      <Button variant="secondary" onClick={() => onPrice(p)} aria-label={`Change the price of ${p.name}`}><Tag aria-hidden className="size-4" /> Price</Button>
                      <Button variant="secondary" onClick={() => onEdit(p)} aria-label={`Edit ${p.name}`}><Pencil aria-hidden className="size-4" /> Edit</Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export function CategoriesTab({ data, onEdit }: { data: CatalogueData; onEdit: (c: Category) => void }) {
  if (data.categories.length === 0) return <EmptyState title="No categories yet">Add the first category with the button above.</EmptyState>;
  const count = (id: number) => data.products.filter((p) => p.category_id === id).length;
  return (
    <div className={wrap}>
      <table className="w-full min-w-[32rem] text-left">
        <caption className="sr-only">Categories</caption>
        <thead className={head}>
          <tr>
            <th scope="col" className="px-4 py-2">Category</th>
            <th scope="col" className="px-4 py-2">Module</th>
            <th scope="col" className="px-4 py-2 text-right">Order</th>
            <th scope="col" className="px-4 py-2 text-right">Products</th>
            <th scope="col" className="px-4 py-2">Status</th>
            <th scope="col" className="px-4 py-2"><span className="sr-only">Actions</span></th>
          </tr>
        </thead>
        <tbody>
          {data.categories.map((c) => (
            <tr key={c.id} className="border-b border-stone-brand last:border-0">
              <td className="px-4 py-3">{c.name}</td>
              <td className="px-4 py-3">{MODULE_LABEL[c.module]}</td>
              <td className="px-4 py-3 text-right">{c.sort_order}</td>
              <td className="px-4 py-3 text-right">{count(c.id)}</td>
              <td className="px-4 py-3"><Active on={c.active} /></td>
              <td className="px-4 py-3"><Button variant="secondary" onClick={() => onEdit(c)} aria-label={`Edit ${c.name}`}><Pencil aria-hidden className="size-4" /> Edit</Button></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function ModifiersTab({ data, onEdit }: { data: CatalogueData; onEdit: (m: Modifier) => void }) {
  if (data.modifiers.length === 0) return <EmptyState title="No modifiers yet">Modifiers are options such as &ldquo;No onions&rdquo; or &ldquo;Double tot&rdquo;. Add one with the button above.</EmptyState>;
  const count = (id: number) => data.products.filter((p) => p.modifier_ids.includes(id)).length;
  return (
    <div className={wrap}>
      <table className="w-full min-w-[32rem] text-left">
        <caption className="sr-only">Modifiers</caption>
        <thead className={head}>
          <tr>
            <th scope="col" className="px-4 py-2">Modifier</th>
            <th scope="col" className="px-4 py-2 text-right">Price change</th>
            <th scope="col" className="px-4 py-2 text-right">Products</th>
            <th scope="col" className="px-4 py-2">Status</th>
            <th scope="col" className="px-4 py-2"><span className="sr-only">Actions</span></th>
          </tr>
        </thead>
        <tbody>
          {data.modifiers.map((m) => (
            <tr key={m.id} className="border-b border-stone-brand last:border-0">
              <td className="px-4 py-3">{m.name}</td>
              <td className="money px-4 py-3 text-right">{formatKes(m.price_delta_cents)}</td>
              <td className="px-4 py-3 text-right">{count(m.id)}</td>
              <td className="px-4 py-3"><Active on={m.active} /></td>
              <td className="px-4 py-3"><Button variant="secondary" onClick={() => onEdit(m)} aria-label={`Edit ${m.name}`}><Pencil aria-hidden className="size-4" /> Edit</Button></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
