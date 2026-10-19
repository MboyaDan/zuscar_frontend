"use client";

import { RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import { Alert, Button, EmptyState, ErrorState, LoadingState } from "@/components/ui";
import { ApiError, api, errorMessage } from "@/lib/api";
import { useSession } from "@/lib/session";
import type { KitchenTicket } from "@/lib/types";

type Load = { status: "loading" } | { status: "error"; message: string } | { status: "ready"; tickets: KitchenTicket[]; at: Date };
type Column = { status: KitchenTicket["status"]; title: string; action?: { to: "preparing" | "ready" | "served"; label: string } };

const COLUMNS: Column[] = [
  { status: "submitted", title: "New", action: { to: "preparing", label: "Start" } },
  { status: "preparing", title: "Preparing", action: { to: "ready", label: "Ready" } },
  { status: "ready", title: "Ready to serve", action: { to: "served", label: "Served" } },
];

const REFRESH_MS = 10_000;

function waiting(from: string, now: number): string {
  const mins = Math.max(0, Math.floor((now - new Date(from).getTime()) / 60_000));
  return mins < 1 ? "just now" : mins < 60 ? `${mins} min` : `${Math.floor(mins / 60)} h ${mins % 60} min`;
}

export default function KitchenPage() {
  const { state, can } = useSession();
  const [load, setLoad] = useState<Load>({ status: "loading" });
  const [tick, setTick] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const [busy, setBusy] = useState<number | null>(null);
  const [notice, setNotice] = useState<string>();
  const allowed = can("kitchen.view");
  const canUpdate = can("kitchen.update");

  useEffect(() => {
    if (!allowed) return;
    let alive = true;
    api<{ items: KitchenTicket[] }>("/kitchen/tickets", { query: { limit: 200 } })
      .then((r) => alive && (setLoad({ status: "ready", tickets: r.items, at: new Date() }), setNow(Date.now())))
      .catch((err) => alive && setLoad((prev) => (prev.status === "ready" ? prev : { status: "error", message: errorMessage(err) })));
    return () => {
      alive = false;
    };
  }, [allowed, tick]);

  // The kitchen screen refreshes itself; the API has no push channel yet.
  useEffect(() => {
    if (!allowed) return;
    const t = setInterval(() => {
      if (!document.hidden) setTick((n) => n + 1);
    }, REFRESH_MS);
    return () => clearInterval(t);
  }, [allowed]);

  if (state.status !== "authenticated") return null;
  if (!allowed) return <EmptyState title="No access">Your role does not include the kitchen screen.</EmptyState>;

  async function move(t: KitchenTicket, to: "preparing" | "ready" | "served") {
    setBusy(t.id);
    setNotice(undefined);
    try {
      await api(`/kitchen/tickets/${t.id}/status`, { method: "POST", body: { status: to } });
    } catch (err) {
      setNotice(err instanceof ApiError && err.code === "invalid_transition" ? "Someone has already moved that ticket. The board is up to date now." : errorMessage(err));
    } finally {
      setBusy(null);
      setTick((n) => n + 1);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Kitchen</h1>
        <div className="flex items-center gap-3 text-sm text-slate-brand/80">
          {load.status === "ready" && <span>Updated {load.at.toLocaleTimeString("en-KE", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}. Refreshes every 10 seconds.</span>}
          <Button variant="secondary" onClick={() => setTick((n) => n + 1)}><RefreshCw aria-hidden className="size-4" /> Refresh</Button>
        </div>
      </div>
      {notice && <Alert tone="error">{notice}</Alert>}
      {load.status === "loading" && <LoadingState label="Loading tickets" />}
      {load.status === "error" && <ErrorState message={load.message} onRetry={() => setTick((n) => n + 1)} />}
      {load.status === "ready" && (
        <div className="grid gap-4 lg:grid-cols-3">
          {COLUMNS.map((col) => {
            const list = load.tickets.filter((t) => t.status === col.status);
            return (
              <section key={col.status} aria-labelledby={`k-${col.status}`} className="space-y-3">
                <h2 id={`k-${col.status}`} className="text-lg font-semibold">{col.title} <span className="text-slate-brand/80">({list.length})</span></h2>
                {list.length === 0 ? <p className="rounded-lg border border-dashed border-stone-brand p-4 text-slate-brand/80">Nothing here.</p> : (
                  <ul className="space-y-3">
                    {list.map((t) => (
                      <li key={t.id} className="space-y-2 rounded-lg border border-stone-brand bg-white p-3">
                        <div className="flex flex-wrap items-baseline justify-between gap-2">
                          <p className="text-lg font-semibold">{t.order_type === "takeaway" ? "Takeaway" : t.table_label} · Ticket {t.ticket_no}</p>
                          <p className="text-sm text-slate-brand/80">{waiting(t.created_at, now)}</p>
                        </div>
                        <p className="text-sm text-slate-brand/80">Order {t.order_no} · {t.created_by_name}</p>
                        {t.kind === "update" && <p className="inline-block rounded-full border border-ember px-2 text-sm font-medium text-ember">Change to an order already sent</p>}
                        <ul className="space-y-1">
                          {t.lines.map((l) => (
                            <li key={l.order_item_id + l.change_type} className={l.change_type === "cancel" ? "line-through" : ""}>
                              {l.change_type === "cancel" && <span className="mr-1 font-semibold no-underline">CANCEL</span>}
                              {l.change_type === "modify" && <span className="mr-1 font-semibold">CHANGE</span>}
                              <span className="font-medium">{l.qty} × {l.name}</span>
                              {l.modifiers && <span className="block text-sm">{l.modifiers}</span>}
                              {l.note && <span className="block text-sm font-medium">Note: {l.note}</span>}
                            </li>
                          ))}
                        </ul>
                        {canUpdate && col.action && <Button onClick={() => void move(t, col.action!.to)} busy={busy === t.id} className="w-full">{col.action.label}</Button>}
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
