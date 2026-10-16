"use client";

import { CircleAlert, CircleCheck, Search, ShieldX } from "lucide-react";
import { useEffect, useState } from "react";
import { Alert, Button, EmptyState, ErrorState, LoadingState, TextField } from "@/components/ui";
import { api, errorMessage } from "@/lib/api";
import { formatWhen } from "@/lib/format";
import { useSession } from "@/lib/session";
import type { AuditEntry, AuditList } from "@/lib/types";

type Filters = { action: string; entity_type: string; result: string; from: string; to: string };
const NO_FILTERS: Filters = { action: "", entity_type: "", result: "", from: "", to: "" };

type Load = { status: "loading" } | { status: "error"; message: string } | { status: "ready"; items: AuditEntry[]; next: string };

/** A date picked in the browser's own time zone, as the start of that day (or the start of the next day for "to"). */
function dayBoundary(day: string, endOfDay: boolean): string | undefined {
  if (!day) return undefined;
  const d = new Date(`${day}T00:00:00`);
  if (Number.isNaN(d.getTime())) return undefined;
  if (endOfDay) d.setDate(d.getDate() + 1);
  return d.toISOString();
}

function query(f: Filters) {
  return { action: f.action.trim(), entity_type: f.entity_type.trim(), result: f.result, from: dayBoundary(f.from, false), to: dayBoundary(f.to, true), limit: 50 };
}

function ResultBadge({ result }: { result: string }) {
  if (result === "success") return <span className="inline-flex items-center gap-1 text-success"><CircleCheck aria-hidden className="size-4" /> Success</span>;
  if (result === "denied") return <span className="inline-flex items-center gap-1 text-danger"><ShieldX aria-hidden className="size-4" /> Denied</span>;
  return <span className="inline-flex items-center gap-1 text-danger"><CircleAlert aria-hidden className="size-4" /> {result ? result.charAt(0).toUpperCase() + result.slice(1) : "Unknown"}</span>;
}

function Json({ label, value }: { label: string; value: unknown }) {
  if (value === null || value === undefined) return null;
  return (
    <div>
      <p className="text-sm font-medium">{label}</p>
      <pre className="overflow-x-auto rounded-md bg-stone-brand/40 p-2 font-mono text-xs">{JSON.stringify(value, null, 2)}</pre>
    </div>
  );
}

export default function AuditPage() {
  const { state, can } = useSession();
  const [load, setLoad] = useState<Load>({ status: "loading" });
  const [draft, setDraft] = useState<Filters>(NO_FILTERS);
  const [filters, setFilters] = useState<Filters>(NO_FILTERS);
  const [tick, setTick] = useState(0);
  const [more, setMore] = useState<{ busy: boolean; error?: string }>({ busy: false });

  const allowed = can("audit.view");

  useEffect(() => {
    if (!allowed) return;
    let alive = true;
    api<AuditList>("/audit-logs", { query: query(filters) })
      .then((r) => alive && setLoad({ status: "ready", items: r.items, next: r.next_cursor }))
      .catch((err) => alive && setLoad({ status: "error", message: errorMessage(err) }));
    return () => {
      alive = false;
    };
  }, [allowed, filters, tick]);

  if (state.status !== "authenticated") return null;
  if (!allowed) return <EmptyState title="No access">Your role does not include reading the audit log.</EmptyState>;

  function apply(e: React.FormEvent) {
    e.preventDefault();
    setLoad({ status: "loading" });
    setFilters(draft);
  }

  function clear() {
    setDraft(NO_FILTERS);
    setLoad({ status: "loading" });
    setFilters(NO_FILTERS);
  }

  function reload() {
    setLoad({ status: "loading" });
    setTick((t) => t + 1);
  }

  async function loadMore() {
    if (load.status !== "ready" || !load.next) return;
    setMore({ busy: true });
    try {
      const r = await api<AuditList>("/audit-logs", { query: { ...query(filters), cursor: load.next } });
      setLoad({ status: "ready", items: [...load.items, ...r.items], next: r.next_cursor });
      setMore({ busy: false });
    } catch (err) {
      setMore({ busy: false, error: errorMessage(err) });
    }
  }

  const set = (k: keyof Filters) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setDraft((d) => ({ ...d, [k]: e.target.value }));

  return (
    <div className="max-w-6xl space-y-4">
      <h1 className="text-3xl font-semibold">Audit log</h1>
      <p className="text-slate-brand/80">Newest first. Entries cannot be edited or removed. Changes to users, roles, permissions and settings are shown only to the Super Admin and the Accountant / Auditor.</p>

      <form onSubmit={apply} role="search" className="flex flex-wrap items-end gap-3">
        <div className="min-w-48 flex-1"><TextField label="Action" placeholder="for example users.roles_changed" value={draft.action} onChange={set("action")} /></div>
        <div className="min-w-40"><TextField label="Record type" placeholder="for example user" value={draft.entity_type} onChange={set("entity_type")} /></div>
        <div className="space-y-1">
          <label htmlFor="result" className="block text-sm font-medium">Result</label>
          <select id="result" className="target rounded-md border border-stone-brand bg-white px-3 py-2" value={draft.result} onChange={set("result")}>
            <option value="">All</option>
            <option value="success">Success</option>
            <option value="denied">Denied</option>
            <option value="failed">Failed</option>
          </select>
        </div>
        <TextField label="From" type="date" value={draft.from} onChange={set("from")} />
        <TextField label="To" type="date" value={draft.to} onChange={set("to")} />
        <Button type="submit" variant="secondary"><Search aria-hidden className="size-4" /> Search</Button>
        <Button variant="secondary" onClick={clear}>Clear</Button>
      </form>

      {load.status === "loading" && <LoadingState label="Loading the audit log" />}
      {load.status === "error" && <ErrorState message={load.message} onRetry={reload} />}
      {load.status === "ready" && load.items.length === 0 && <EmptyState title="Nothing found">Try a wider date range or fewer filters.</EmptyState>}
      {load.status === "ready" && load.items.length > 0 && (
        <>
          <div className="overflow-x-auto rounded-lg border border-stone-brand bg-white">
            <table className="w-full min-w-[48rem] text-left">
              <caption className="sr-only">Audit log</caption>
              <thead className="border-b border-stone-brand bg-stone-brand/30 text-sm">
                <tr>
                  <th scope="col" className="px-4 py-2">When</th>
                  <th scope="col" className="px-4 py-2">Who</th>
                  <th scope="col" className="px-4 py-2">What</th>
                  <th scope="col" className="px-4 py-2">Result</th>
                </tr>
              </thead>
              <tbody>
                {load.items.map((e) => (
                  <tr key={e.id} className="border-b border-stone-brand align-top last:border-0">
                    <td className="px-4 py-3 text-sm">{formatWhen(e.occurred_at)}</td>
                    <td className="px-4 py-3">{e.actor_label || <span className="text-slate-brand/80">System</span>}</td>
                    <td className="px-4 py-3">
                      <span className="block font-mono text-sm">{e.action}</span>
                      <span className="block text-sm text-slate-brand/80">{e.entity_type}{e.entity_id ? ` ${e.entity_id}` : ""}</span>
                      <details className="mt-1">
                        <summary className="target flex cursor-pointer items-center text-sm text-teal-brand underline">Details</summary>
                        <div className="mt-2 space-y-2">
                          {e.reason && <p className="text-sm">Reason: {e.reason}</p>}
                          <Json label="Before" value={e.before} />
                          <Json label="After" value={e.after} />
                          <p className="font-mono text-xs text-slate-brand/80">Request {e.request_id || "none"} · IP {e.ip || "unknown"}</p>
                        </div>
                      </details>
                    </td>
                    <td className="px-4 py-3"><ResultBadge result={e.result} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {load.next && (
            <div className="space-y-2">
              <Button variant="secondary" busy={more.busy} onClick={loadMore}>Show older entries</Button>
              {more.error && <Alert tone="error">{more.error}</Alert>}
            </div>
          )}
        </>
      )}
    </div>
  );
}
