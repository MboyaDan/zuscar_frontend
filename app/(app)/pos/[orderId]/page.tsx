"use client";

import { ArrowLeft, Banknote, BedDouble, ChefHat, Minus, Plus, Printer, Search, Trash2, X } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChargeToRoomDialog } from "@/components/pos/ChargeToRoomDialog";
import { AddItemDialog, ReasonDialog } from "@/components/pos/OrderDialogs";
import { PrintDialog, type PrintTarget } from "@/components/print/PrintDialog";
import { Alert, Button, EmptyState, ErrorState, LoadingState } from "@/components/ui";
import { ApiError, api, errorMessage, newIdempotencyKey } from "@/lib/api";
import { formatKes } from "@/lib/money";
import { dropHandedOffOrder, fetchMenu, peekHandedOffOrder, peekMenu } from "@/lib/pos-cache";
import { useSession } from "@/lib/session";
import type { KitchenTicket, MenuCategory, MenuProduct, Order, OrderLine } from "@/lib/types";

type Load = { status: "loading" } | { status: "error"; message: string } | { status: "ready"; order: Order; menu: MenuCategory[] };
type Notice = { tone: "success" | "error"; text: string } | undefined;

export default function OrderPage() {
  const { state, can } = useSession();
  const params = useParams<{ orderId: string }>();
  const id = Number(params.orderId);
  const [load, setLoad] = useState<Load>(() => {
    // Paint at once when the order came back from creating it and the menu was loaded ahead of time.
    const order = peekHandedOffOrder(Number(params.orderId));
    const menu = peekMenu();
    return order && menu ? { status: "ready", order, menu } : { status: "loading" };
  });
  const [notice, setNotice] = useState<Notice>();
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<number | "all">("all");
  const [adding, setAdding] = useState<MenuProduct | null>(null);
  const [cancelLine, setCancelLine] = useState<OrderLine | null>(null);
  const [cancelOrder, setCancelOrder] = useState(false);
  const [charging, setCharging] = useState(false);
  const [sending, setSending] = useState(false);
  const [printing, setPrinting] = useState<PrintTarget | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  // The send key belongs to one order version: the same tap retried reuses it, a changed order gets a new one (NN-05).
  const sendKey = useRef<{ version: number; key: string } | null>(null);
  const allowed = can("orders.manage");

  const [tick, setTick] = useState(0);
  const reload = useCallback(() => setTick((n) => n + 1), []);

  useEffect(() => {
    if (!allowed || !Number.isInteger(id) || id <= 0) return;
    let alive = true;
    dropHandedOffOrder();
    Promise.all([api<{ order: Order }>(`/orders/${id}`), fetchMenu()])
      .then(([o, categories]) => alive && setLoad({ status: "ready", order: o.order, menu: categories }))
      .catch((err) => alive && setLoad({ status: "error", message: err instanceof ApiError && err.status === 404 ? "That order does not exist, or it is not yours to open." : errorMessage(err) }));
    return () => {
      alive = false;
    };
  }, [allowed, id, tick]);

  // "/" jumps to the search box from anywhere on the screen.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement;
      if (e.key === "/" && !["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName) && !document.querySelector("dialog[open]")) {
        e.preventDefault();
        searchRef.current?.focus();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const products = useMemo(() => {
    if (load.status !== "ready") return [];
    const q = query.trim().toLowerCase();
    return load.menu
      .filter((c) => category === "all" || c.id === category)
      .flatMap((c) => c.products.map((p) => ({ ...p, categoryName: c.name })))
      .filter((p) => !q || p.name.toLowerCase().includes(q) || p.categoryName.toLowerCase().includes(q));
  }, [load, query, category]);

  if (state.status !== "authenticated") return null;
  if (!allowed) return <EmptyState title="No access">Your role does not include taking orders.</EmptyState>;
  if (load.status === "loading") return <LoadingState label="Loading the order" />;
  if (load.status === "error") return <ErrorState message={load.message} onRetry={reload} />;

  const { order, menu } = load;
  const editable = order.status === "open" || order.status === "sent";
  const active = order.items.filter((l) => l.status === "active");
  const unsent = active.filter((l) => l.kitchen_routed && !l.sent_to_kitchen);

  /** Every change carries the version the screen showed; if someone else changed the order the API says so and we refresh. */
  async function change<T extends { order: Order }>(path: string, method: "POST" | "PATCH", body: Record<string, unknown>, headers?: { idempotencyKey?: string }): Promise<T> {
    try {
      const res = await api<T>(path, { method, body: { ...body, expected_version: order.version }, ...headers });
      setLoad({ status: "ready", order: res.order, menu });
      return res;
    } catch (err) {
      if (err instanceof ApiError && err.code === "order_changed") {
        reload();
        setNotice({ tone: "error", text: "Someone else changed this order. It has been refreshed: check it and try again." });
      }
      throw err;
    }
  }

  async function addLine(p: MenuProduct, qty: number, modifierIds: number[], note: string) {
    setNotice(undefined);
    // Tapping the same plain product again adds to its unsent line instead of making a new one.
    const same = !modifierIds.length && !note ? active.find((l) => l.product_id === p.id && !l.sent_to_kitchen && !l.modifiers.length && !l.note) : undefined;
    if (same) await change(`/orders/${id}/items/${same.id}`, "PATCH", { qty: same.qty + qty });
    else await change(`/orders/${id}/items`, "POST", { product_id: p.id, qty, modifier_ids: modifierIds, note });
  }

  async function quickAdd(p: MenuProduct) {
    if (!editable) return;
    if (p.modifiers.length) {
      setAdding(p);
      return;
    }
    try {
      await addLine(p, 1, [], "");
    } catch (err) {
      if (!(err instanceof ApiError && err.code === "order_changed")) setNotice({ tone: "error", text: errorMessage(err) });
    }
  }

  async function setQty(l: OrderLine, qty: number) {
    setNotice(undefined);
    try {
      await change(`/orders/${id}/items/${l.id}`, "PATCH", { qty });
    } catch (err) {
      if (!(err instanceof ApiError && err.code === "order_changed")) setNotice({ tone: "error", text: errorMessage(err) });
    }
  }

  async function send() {
    if (sendKey.current?.version !== order.version) sendKey.current = { version: order.version, key: newIdempotencyKey() };
    setSending(true);
    setNotice(undefined);
    try {
      const res = await change<{ order: Order; ticket: KitchenTicket }>(`/orders/${id}/send-to-kitchen`, "POST", {}, { idempotencyKey: sendKey.current.key });
      sendKey.current = null;
      setNotice({ tone: "success", text: `Sent to the kitchen as ticket ${res.ticket.ticket_no}${res.ticket.kind === "update" ? " (update)" : ""}.` });
      // The ticket is saved before this point; printing it is a separate step that can fail without losing it (AC-03, AC-04).
      if (can("kitchen.view")) setPrinting({ kind: "new", docType: "kitchen_ticket", refId: res.ticket.id });
    } catch (err) {
      if (!(err instanceof ApiError && err.code === "order_changed")) setNotice({ tone: "error", text: errorMessage(err) });
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Link href="/pos" className="target inline-flex items-center gap-1 rounded-md px-2 hover:bg-stone-brand/50"><ArrowLeft aria-hidden className="size-4" /> Orders</Link>
        <h1 className="text-2xl font-semibold">Order {order.order_no} · {order.order_type === "dine_in" ? order.table_label : "Takeaway"}</h1>
        <span className="rounded-full border border-stone-brand px-2 text-sm">{{ open: "Open", sent: "Sent to kitchen", finalised: "Paid / closed", cancelled: "Cancelled" }[order.status]}</span>
      </div>
      {notice && <Alert tone={notice.tone}>{notice.text}</Alert>}
      {order.status === "cancelled" && <Alert tone="info">This order was cancelled: {order.cancel_reason}</Alert>}
      {order.status === "finalised" && <Alert tone="info">This order is closed.</Alert>}

      <div className="grid gap-4 lg:grid-cols-[1fr_24rem]">
        <section aria-labelledby="menu-h" className="space-y-3">
          <h2 id="menu-h" className="sr-only">Menu</h2>
          <div className="relative">
            <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 size-5 -translate-y-1/2 text-slate-brand/60" />
            <input
              ref={searchRef}
              type="search"
              autoFocus
              value={query}
              disabled={!editable}
              aria-label="Search the menu. Press Enter to add the first match."
              placeholder="Search the menu (press / to jump here, Enter adds the first match)"
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && products[0]) {
                  e.preventDefault();
                  void quickAdd(products[0]);
                  setQuery("");
                }
                if (e.key === "Escape") setQuery("");
              }}
              className="target w-full rounded-md border border-stone-brand bg-white py-2 pl-10 pr-3"
            />
          </div>
          <div role="tablist" aria-label="Categories" className="flex flex-wrap gap-2">
            {[{ id: "all" as const, name: "All" }, ...menu].map((c) => (
              <button key={c.id} role="tab" type="button" aria-selected={category === c.id} onClick={() => setCategory(c.id)} className={`target rounded-full border px-4 ${category === c.id ? "border-midnight bg-midnight text-cream" : "border-stone-brand bg-white hover:bg-stone-brand/40"}`}>
                {c.name}
              </button>
            ))}
          </div>
          {products.length === 0 ? (
            <EmptyState title="Nothing matches">Try another word, or pick All.</EmptyState>
          ) : (
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
              {products.map((p) => (
                <li key={p.id}>
                  <button type="button" disabled={!editable} onClick={() => void quickAdd(p)} className="target flex h-full w-full flex-col items-start gap-1 rounded-lg border border-stone-brand bg-white p-3 text-left hover:bg-stone-brand/40 disabled:opacity-60">
                    <span className="font-medium">{p.name}</span>
                    <span className="money text-sm text-slate-brand/80">{formatKes(p.price_cents)}</span>
                    {p.modifiers.length > 0 && <span className="text-xs text-slate-brand/70">Has options</span>}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section aria-labelledby="lines-h" className="h-fit space-y-3 rounded-lg border border-stone-brand bg-white p-4 lg:sticky lg:top-4">
          <h2 id="lines-h" className="text-lg font-semibold">This order</h2>
          {order.items.length === 0 ? (
            <p className="text-slate-brand/80">Nothing added yet. Tap a product to add it.</p>
          ) : (
            <ul className="divide-y divide-stone-brand">
              {order.items.map((l) => (
                <li key={l.id} className={`py-2 ${l.status === "cancelled" ? "opacity-60" : ""}`}>
                  <div className="flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <p className={`font-medium ${l.status === "cancelled" ? "line-through" : ""}`}>{l.qty} × {l.name}</p>
                      {l.modifiers.length > 0 && <p className="text-sm text-slate-brand/80">{l.modifiers.map((m) => m.name).join(", ")}</p>}
                      {l.note && <p className="text-sm italic text-slate-brand/80">{l.note}</p>}
                      <p className="text-xs text-slate-brand/70">
                        {l.status === "cancelled" ? `Cancelled: ${l.cancel_reason}` : l.kitchen_routed ? (l.sent_to_kitchen ? "In the kitchen" : "Not sent yet") : "No kitchen ticket"}
                      </p>
                    </div>
                    <span className="money font-medium">{formatKes(l.line_total_cents)}</span>
                  </div>
                  {editable && l.status === "active" && (
                    <div className="mt-1 flex items-center gap-1">
                      <button type="button" aria-label={`One fewer ${l.name}`} disabled={l.qty <= 1} onClick={() => void setQty(l, l.qty - 1)} className="target inline-flex items-center justify-center rounded-md border border-stone-brand disabled:opacity-40"><Minus aria-hidden className="size-4" /></button>
                      <button type="button" aria-label={`One more ${l.name}`} disabled={l.qty >= 999} onClick={() => void setQty(l, l.qty + 1)} className="target inline-flex items-center justify-center rounded-md border border-stone-brand disabled:opacity-40"><Plus aria-hidden className="size-4" /></button>
                      <button type="button" onClick={() => setCancelLine(l)} className="target ml-auto inline-flex items-center gap-1 rounded-md px-2 text-danger hover:bg-stone-brand/50"><Trash2 aria-hidden className="size-4" /> Cancel line</button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
          <div className="flex items-baseline justify-between border-t border-stone-brand pt-3">
            <span className="font-medium">Total</span>
            <span className="money text-xl font-semibold">{formatKes(order.subtotal_cents)}</span>
          </div>
          <p className="text-xs text-slate-brand/70">Prices include tax. The payment screen shows the final bill.</p>
          {editable && (
            <div className="flex flex-wrap gap-2">
              {can("sales.create") && active.length > 0 && (
                <Link href={`/pos/${id}/pay`} className="target inline-flex w-full items-center justify-center gap-2 rounded-md bg-midnight px-4 py-2 font-medium text-cream hover:bg-midnight/90">
                  <Banknote aria-hidden className="size-5" /> Take payment · {formatKes(order.subtotal_cents)}
                </Link>
              )}
              {can("folios.post") && active.length > 0 && (
                <Button variant="secondary" onClick={() => setCharging(true)} className="w-full"><BedDouble aria-hidden className="size-5" /> Charge to a room</Button>
              )}
              <Button onClick={() => void send()} busy={sending} disabled={unsent.length === 0} className="flex-1">
                <ChefHat aria-hidden className="size-5" /> Send to kitchen{unsent.length > 0 ? ` (${unsent.length})` : ""}
              </Button>
              <Button variant="secondary" onClick={() => setCancelOrder(true)}><X aria-hidden className="size-4" /> Cancel order</Button>
            </div>
          )}
          {can("sales.create") && active.length > 0 && (
            <Button variant="secondary" onClick={() => setPrinting({ kind: "new", docType: "bill", refId: id })} className="w-full"><Printer aria-hidden className="size-4" /> Print bill</Button>
          )}
        </section>
      </div>

      {charging && load.status === "ready" && (
        <ChargeToRoomDialog
          orderId={id}
          version={load.order.version}
          totalCents={load.order.subtotal_cents}
          onClose={() => setCharging(false)}
          onDone={(message) => {
            setCharging(false);
            setNotice({ tone: "success", text: message });
            setTick((t) => t + 1);
          }}
        />
      )}
      {printing && <PrintDialog key={JSON.stringify(printing)} target={printing} onClose={() => setPrinting(null)} />}
      <AddItemDialog
        key={adding?.id ?? "none"}
        product={adding}
        onClose={() => setAdding(null)}
        onAdd={async (qty, mods, note) => {
          if (adding) await addLine(adding, qty, mods, note);
        }}
      />
      <ReasonDialog
        open={cancelLine !== null}
        title={cancelLine ? `Cancel ${cancelLine.qty} × ${cancelLine.name}` : "Cancel line"}
        submitLabel="Cancel line"
        hint={cancelLine?.sent_to_kitchen ? "The kitchen already has this line: they will get an update ticket." : undefined}
        onClose={() => setCancelLine(null)}
        onSubmit={async (reason) => {
          if (cancelLine) await change(`/orders/${id}/items/${cancelLine.id}/cancel`, "POST", { reason });
        }}
      />
      <ReasonDialog
        open={cancelOrder}
        title={`Cancel order ${order.order_no}`}
        submitLabel="Cancel order"
        hint={order.status === "sent" ? "Tickets the kitchen has not finished are cancelled, and they get a cancel ticket." : undefined}
        onClose={() => setCancelOrder(false)}
        onSubmit={async (reason) => {
          await change(`/orders/${id}/cancel`, "POST", { reason });
        }}
      />
    </div>
  );
}
