"use client";

import { Plus } from "lucide-react";
import { useEffect, useState } from "react";
import { CategoryDialog, ModifierDialog, PriceDialog, ProductDialog } from "@/components/catalogue/CatalogueDialogs";
import { CategoriesTab, ModifiersTab, ProductsTab } from "@/components/catalogue/CatalogueTabs";
import { Alert, Button, EmptyState, ErrorState, LoadingState } from "@/components/ui";
import { api, errorMessage } from "@/lib/api";
import { useSession } from "@/lib/session";
import type { CatalogueData, Category, Modifier, Product, TaxRate } from "@/lib/types";

type Load = { status: "loading" } | { status: "error"; message: string } | { status: "ready"; data: CatalogueData };
type Tab = "products" | "categories" | "modifiers";
type Dialog =
  | { kind: "product"; product?: Product }
  | { kind: "price"; product: Product }
  | { kind: "category"; category?: Category }
  | { kind: "modifier"; modifier?: Modifier };

const TABS: { id: Tab; label: string; add: string }[] = [
  { id: "products", label: "Products", add: "Add product" },
  { id: "categories", label: "Categories", add: "Add category" },
  { id: "modifiers", label: "Modifiers", add: "Add modifier" },
];

export default function CataloguePage() {
  const { state, can } = useSession();
  const [load, setLoad] = useState<Load>({ status: "loading" });
  const [tick, setTick] = useState(0);
  const [tab, setTab] = useState<Tab>("products");
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [notice, setNotice] = useState<{ tone: "success" | "error"; text: string }>();

  const allowed = can("catalogue.manage");

  useEffect(() => {
    if (!allowed) return;
    let alive = true;
    Promise.all([
      api<{ items: Category[] }>("/categories"),
      api<{ items: Modifier[] }>("/modifiers"),
      api<{ items: TaxRate[] }>("/tax-rates"),
      api<{ items: Product[] }>("/products"),
    ])
      .then(([c, m, r, p]) => alive && setLoad({ status: "ready", data: { categories: c.items, modifiers: m.items, rates: r.items, products: p.items } }))
      .catch((err) => alive && setLoad({ status: "error", message: errorMessage(err) }));
    return () => {
      alive = false;
    };
  }, [allowed, tick]);

  if (state.status !== "authenticated") return null;
  if (!allowed) return <EmptyState title="No access">Your role does not include managing the catalogue.</EmptyState>;

  function reload() {
    setLoad({ status: "loading" });
    setTick((t) => t + 1);
  }
  const done = (text: string) => {
    setNotice({ tone: "success", text });
    reload();
  };
  const open = (d: Dialog) => {
    setNotice(undefined);
    setDialog(d);
  };

  async function toggle(p: Product) {
    setNotice(undefined);
    try {
      await api(`/products/${p.id}/availability`, { method: "PUT", body: { is_available: !p.is_available } });
      done(`${p.name} is now ${p.is_available ? "sold out" : "available"}.`);
    } catch (err) {
      setNotice({ tone: "error", text: errorMessage(err) });
    }
  }

  const add = () => open(tab === "products" ? { kind: "product" } : tab === "categories" ? { kind: "category" } : { kind: "modifier" });
  const data = load.status === "ready" ? load.data : undefined;
  const addLabel = TABS.find((t) => t.id === tab)?.add ?? "Add";

  return (
    <div className="max-w-6xl space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-semibold">Catalogue</h1>
        <Button onClick={add} disabled={!data}><Plus aria-hidden className="size-4" /> {addLabel}</Button>
      </div>
      <p className="text-slate-brand/80">What can be sold, at what price, and under which tax category. A price change is kept in the history and recorded in the audit log.</p>

      <div role="tablist" aria-label="Catalogue sections" className="flex gap-1 border-b border-stone-brand">
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            id={`tab-${t.id}`}
            aria-selected={tab === t.id}
            aria-controls="catalogue-panel"
            type="button"
            onClick={() => setTab(t.id)}
            className={`target -mb-px rounded-t-md border px-4 py-2 font-medium ${tab === t.id ? "border-stone-brand border-b-white bg-white" : "border-transparent hover:bg-stone-brand/40"}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {notice && <Alert tone={notice.tone}>{notice.text}</Alert>}
      <div role="tabpanel" id="catalogue-panel" aria-labelledby={`tab-${tab}`} className="space-y-3">
        {load.status === "loading" && <LoadingState label="Loading the catalogue" />}
        {load.status === "error" && <ErrorState message={load.message} onRetry={reload} />}
        {data && tab === "products" && <ProductsTab data={data} onEdit={(product) => open({ kind: "product", product })} onPrice={(product) => open({ kind: "price", product })} onToggle={toggle} />}
        {data && tab === "categories" && <CategoriesTab data={data} onEdit={(category) => open({ kind: "category", category })} />}
        {data && tab === "modifiers" && <ModifiersTab data={data} onEdit={(modifier) => open({ kind: "modifier", modifier })} />}
      </div>

      {data && dialog?.kind === "product" && <ProductDialog product={dialog.product} data={data} onClose={() => setDialog(null)} onDone={done} />}
      {dialog?.kind === "price" && <PriceDialog product={dialog.product} onClose={() => setDialog(null)} onDone={done} />}
      {dialog?.kind === "category" && <CategoryDialog category={dialog.category} onClose={() => setDialog(null)} onDone={done} />}
      {dialog?.kind === "modifier" && <ModifierDialog modifier={dialog.modifier} onClose={() => setDialog(null)} onDone={done} />}
    </div>
  );
}
