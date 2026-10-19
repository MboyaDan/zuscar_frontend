"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { SelectField } from "@/components/catalogue/SelectField";
import { Button, EmptyState, ErrorState, LoadingState } from "@/components/ui";
import { api, errorMessage } from "@/lib/api";
import { formatWhen } from "@/lib/format";
import { formatKes } from "@/lib/money";
import { SHIFT_STATUS_LABEL, varianceText } from "@/lib/shifts";
import { useSession } from "@/lib/session";
import type { Shift } from "@/lib/types";

type Load = { status: "loading" } | { status: "error"; message: string } | { status: "ready"; items: Shift[]; next: string };

export default function ShiftsPage() {
  const { state, can } = useSession();
  const [load, setLoad] = useState<Load>({ status: "loading" });
  const [status, setStatus] = useState("");
  const [tick, setTick] = useState(0);
  const [more, setMore] = useState(false);
  const allowed = can("shifts.close");

  useEffect(() => {
    if (!allowed) return;
    let alive = true;
    api<{ shifts: Shift[]; next_cursor?: string }>("/shifts", { query: { status, limit: 50 } })
      .then((r) => alive && setLoad({ status: "ready", items: r.shifts, next: r.next_cursor ?? "" }))
      .catch((err) => alive && setLoad({ status: "error", message: errorMessage(err) }));
    return () => {
      alive = false;
    };
  }, [allowed, status, tick]);

  if (state.status !== "authenticated") return null;
  if (!allowed) return <EmptyState title="No access">Your role does not include the shift list.</EmptyState>;

  async function loadMore() {
    if (load.status !== "ready" || !load.next) return;
    setMore(true);
    try {
      const r = await api<{ shifts: Shift[]; next_cursor?: string }>("/shifts", { query: { status, limit: 50, cursor: load.next } });
      setLoad({ status: "ready", items: [...load.items, ...r.shifts], next: r.next_cursor ?? "" });
    } catch (err) {
      setLoad({ status: "error", message: errorMessage(err) });
    } finally {
      setMore(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-2xl font-semibold">Shifts</h1>
        <div className="w-56">
          <SelectField label="Show" value={status} onChange={(e) => { setLoad({ status: "loading" }); setStatus(e.target.value); }}>
            <option value="">All shifts</option>
            <option value="open">Open</option>
            <option value="closed">Closed, not yet checked</option>
            <option value="reconciled">Checked</option>
          </SelectField>
        </div>
      </div>
      {load.status === "loading" && <LoadingState label="Loading shifts" />}
      {load.status === "error" && <ErrorState message={load.message} onRetry={() => setTick((t) => t + 1)} />}
      {load.status === "ready" && (load.items.length === 0 ? <EmptyState title="No shifts">Nothing matches yet.</EmptyState> : (
        <>
          <div className="overflow-x-auto rounded-lg border border-stone-brand bg-white">
            <table className="w-full text-left">
              <thead className="border-b border-stone-brand text-sm"><tr><th className="p-3">Opened</th><th className="p-3">Cashier</th><th className="p-3">Status</th><th className="p-3 text-right">Float</th><th className="p-3">Cash check</th></tr></thead>
              <tbody>
                {load.items.map((s) => (
                  <tr key={s.id} className="border-b border-stone-brand last:border-0 hover:bg-stone-brand/30">
                    <td className="p-3"><Link className="target inline-flex items-center font-semibold underline" href={`/shifts/${s.id}`}>{formatWhen(s.opened_at)}</Link></td>
                    <td className="p-3">{s.user_name}</td>
                    <td className="p-3">{SHIFT_STATUS_LABEL[s.status]}</td>
                    <td className="money p-3 text-right">{formatKes(s.opening_float_cents)}</td>
                    <td className="p-3">{s.variance_cents === null ? "-" : varianceText(s.variance_cents)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {load.next && <Button variant="secondary" onClick={() => void loadMore()} busy={more}>Load more</Button>}
        </>
      ))}
    </div>
  );
}
