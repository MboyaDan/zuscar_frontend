"use client";

import { useEffect, useRef, useState } from "react";
import { SelectField } from "@/components/catalogue/SelectField";
import { FormDialog } from "@/components/FormDialog";
import { Alert, Button, EmptyState, ErrorState, LoadingState, TextField } from "@/components/ui";
import { api, errorMessage, newIdempotencyKey } from "@/lib/api";
import { formatWhen } from "@/lib/format";
import { parseWhole, qtyText, unitChoices } from "@/lib/inventory";
import type { CountStatus, InventoryItem, StockCount, StockLocation } from "@/lib/types";

const STATUS_LABEL: Record<CountStatus, string> = { draft: "In progress", approved: "Approved", cancelled: "Cancelled" };

type ListLoad = { status: "loading" } | { status: "error"; message: string } | { status: "ready"; counts: StockCount[] };

/** The Counts tab: past and open counts, and a way to start one. */
export function CountsPanel({ items, locations, onChanged }: { items: InventoryItem[]; locations: StockLocation[]; onChanged: () => void }) {
  const [load, setLoad] = useState<ListLoad>({ status: "loading" });
  const [tick, setTick] = useState(0);
  const [open, setOpen] = useState<number>();
  const [starting, setStarting] = useState(false);
  const [notice, setNotice] = useState<string>();

  useEffect(() => {
    let alive = true;
    api<{ counts: StockCount[] }>("/inventory/counts", { query: { limit: 100 } })
      .then((r) => alive && setLoad({ status: "ready", counts: r.counts }))
      .catch((err) => alive && setLoad({ status: "error", message: errorMessage(err) }));
    return () => {
      alive = false;
    };
  }, [tick]);

  if (open !== undefined) {
    return (
      <CountSheet
        id={open}
        items={items}
        onBack={() => {
          setOpen(undefined);
          setTick((t) => t + 1);
        }}
        onChanged={onChanged}
      />
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="max-w-prose text-slate-brand/80">Count one place at a time. Nothing changes in stock until a count is approved, and then only the differences are posted.</p>
        <Button onClick={() => setStarting(true)}>Start a count</Button>
      </div>
      {notice && <Alert tone="success">{notice}</Alert>}
      {load.status === "loading" && <LoadingState label="Loading counts" />}
      {load.status === "error" && <ErrorState message={load.message} onRetry={() => setTick((t) => t + 1)} />}
      {load.status === "ready" && load.counts.length === 0 && <EmptyState title="No counts yet">Start a count when you are ready to check a shelf against the books.</EmptyState>}
      {load.status === "ready" && load.counts.length > 0 && (
        <ul className="space-y-3">
          {load.counts.map((c) => (
            <li key={c.id} className="rounded-lg border border-stone-brand bg-white p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h2 className="text-lg font-semibold">Count #{c.count_no} · {c.location_name}</h2>
                  <p className="text-sm text-slate-brand/80">
                    {STATUS_LABEL[c.status]} · started {formatWhen(c.created_at)} by {c.created_by_name}
                    {c.status === "approved" && c.approved_at ? ` · approved ${formatWhen(c.approved_at)} by ${c.approved_by_name}` : ""}
                  </p>
                  {c.note && <p className="text-sm">{c.note}</p>}
                </div>
                <p className="text-right text-sm">{c.line_count} {c.line_count === 1 ? "item" : "items"} counted<br />{c.difference_count} {c.difference_count === 1 ? "difference" : "differences"}</p>
              </div>
              <div className="mt-3">
                <Button variant={c.status === "draft" ? "primary" : "secondary"} onClick={() => setOpen(c.id)}>{c.status === "draft" ? "Open the sheet" : "View"}</Button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {starting && (
        <StartCountDialog
          locations={locations}
          onClose={() => setStarting(false)}
          onStarted={(id) => {
            setNotice(undefined);
            setOpen(id);
          }}
        />
      )}
    </div>
  );
}

function StartCountDialog({ locations, onClose, onStarted }: { locations: StockLocation[]; onClose: () => void; onStarted: (id: number) => void }) {
  const [loc, setLoc] = useState("");
  const [note, setNote] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const key = useRef<{ payload: string; key: string } | null>(null);
  return (
    <FormDialog
      open
      title="Start a count"
      submitLabel="Start counting"
      onClose={onClose}
      onFieldErrors={setErrors}
      disabled={!loc}
      onSubmit={async () => {
        const body = { location_id: Number(loc), note: note.trim() };
        const payload = JSON.stringify(body);
        if (key.current?.payload !== payload) key.current = { payload, key: newIdempotencyKey() };
        const r = await api<{ count: StockCount }>("/inventory/counts", { method: "POST", body, idempotencyKey: key.current.key });
        onStarted(r.count.id);
      }}
    >
      <SelectField label="Which place?" value={loc} onChange={(e) => setLoc(e.target.value)} error={errors.location_id} required>
        <option value="">Choose a place</option>
        {locations.filter((l) => l.active).map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
      </SelectField>
      <TextField label="Note (optional)" value={note} maxLength={200} onChange={(e) => setNote(e.target.value)} error={errors.note} hint="For example: Friday close, back bar." />
    </FormDialog>
  );
}

type Row = { item_id: number; qty: string; unit: string };
type SheetLoad = { status: "loading" } | { status: "error"; message: string } | { status: "ready"; count: StockCount };

function rowsFrom(c: StockCount, items: InventoryItem[]): Row[] {
  return (c.lines ?? []).map((l) => {
    const item = items.find((i) => i.id === l.item_id);
    return { item_id: l.item_id, qty: String(l.entered_qty), unit: item && l.entered_unit_id !== item.base_unit.id ? String(l.entered_unit_id) : "" };
  });
}

function CountSheet({ id, items, onBack, onChanged }: { id: number; items: InventoryItem[]; onBack: () => void; onChanged: () => void }) {
  const [load, setLoad] = useState<SheetLoad>({ status: "loading" });
  const [rows, setRows] = useState<Row[]>([]);
  const [saved, setSaved] = useState("[]");
  const [add, setAdd] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const [dialog, setDialog] = useState<"approve" | "cancel">();

  function accept(c: StockCount) {
    const r = rowsFrom(c, items);
    setLoad({ status: "ready", count: c });
    setRows(r);
    setSaved(JSON.stringify(r));
  }

  useEffect(() => {
    let alive = true;
    api<{ count: StockCount }>(`/inventory/counts/${id}`)
      .then((r) => {
        if (!alive) return;
        const rs = rowsFrom(r.count, items);
        setLoad({ status: "ready", count: r.count });
        setRows(rs);
        setSaved(JSON.stringify(rs));
      })
      .catch((err) => alive && setLoad({ status: "error", message: errorMessage(err) }));
    return () => {
      alive = false;
    };
  }, [id, items]);

  if (load.status === "loading") return <LoadingState label="Loading the count" />;
  if (load.status === "error") return <ErrorState message={load.message} onRetry={onBack} />;
  const count = load.count;
  const draft = count.status === "draft";
  const live = items.filter((i) => i.active);
  const dirty = JSON.stringify(rows) !== saved;
  const bad = rows.some((r) => {
    const n = parseWhole(r.qty);
    return n === null || n < 0;
  });
  const lineOf = (itemId: number) => count.lines?.find((l) => l.item_id === itemId);

  async function save() {
    setBusy(true);
    setError(undefined);
    setNotice(undefined);
    try {
      const body = { lines: rows.map((r) => ({ item_id: r.item_id, qty: parseWhole(r.qty) ?? 0, unit_id: r.unit ? Number(r.unit) : undefined })) };
      const r = await api<{ count: StockCount }>(`/inventory/counts/${id}/lines`, { method: "PUT", body });
      accept(r.count);
      setNotice("The sheet was saved.");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  function addAllHere() {
    const have = new Set(rows.map((r) => r.item_id));
    const more = live.filter((i) => !have.has(i.id) && i.balances.some((b) => b.location_id === count.location_id && b.qty_base !== 0)).map((i) => ({ item_id: i.id, qty: "", unit: "" }));
    setRows((rs) => [...rs, ...more]);
  }

  const net = (count.lines ?? []).reduce((n, l) => n + l.variance_base, 0);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-xl font-semibold">Count #{count.count_no} · {count.location_name}</h2>
          <p className="text-sm text-slate-brand/80">{STATUS_LABEL[count.status]}{count.note ? ` · ${count.note}` : ""}</p>
        </div>
        <Button variant="secondary" onClick={onBack}>Back to counts</Button>
      </div>
      {draft && <p className="max-w-prose text-slate-brand/80">Type what is really on the shelf for each item. Save the sheet to see the differences. Sales and deliveries that happen while you count are kept: only the difference you find is posted.</p>}
      {notice && <Alert tone="success">{notice}</Alert>}
      {error && <Alert tone="error">{error}</Alert>}

      {draft && (
        <div className="flex flex-wrap items-end gap-2">
          <div className="min-w-[14rem] flex-1">
            <SelectField label="Add an item" value={add} onChange={(e) => setAdd(e.target.value)}>
              <option value="">Choose an item</option>
              {live.filter((i) => !rows.some((r) => r.item_id === i.id)).map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
            </SelectField>
          </div>
          <Button
            variant="secondary"
            disabled={!add}
            onClick={() => {
              setRows((rs) => [...rs, { item_id: Number(add), qty: "", unit: "" }]);
              setAdd("");
            }}
          >
            Add
          </Button>
          <Button variant="secondary" onClick={addAllHere}>Add everything that has stock here</Button>
        </div>
      )}

      {rows.length === 0 ? (
        <EmptyState title="Nothing on the sheet">{draft ? "Add the items you are counting." : "This count had no items."}</EmptyState>
      ) : (
        <ul className="space-y-3">
          {rows.map((r) => {
            const item = items.find((i) => i.id === r.item_id);
            const line = lineOf(r.item_id);
            const unitCode = item?.base_unit.code ?? line?.base_unit_code ?? "";
            const n = parseWhole(r.qty);
            const invalid = r.qty !== "" && (n === null || n < 0);
            return (
              <li key={r.item_id} className="space-y-2 rounded-lg border border-stone-brand bg-white p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <h3 className="text-lg font-semibold">{item?.name ?? line?.item_name}</h3>
                  {line && (
                    <p className="text-right text-sm">
                      Books said {qtyText(line.expected_base, unitCode)}
                      {draft && line.balance_now !== null && line.balance_now !== line.expected_base && <><br />Books now {qtyText(line.balance_now, unitCode)}</>}
                    </p>
                  )}
                </div>
                {draft && item ? (
                  <div className="grid grid-cols-2 gap-3">
                    <TextField label="Counted" inputMode="numeric" value={r.qty} onChange={(e) => setRows((rs) => rs.map((x) => (x.item_id === r.item_id ? { ...x, qty: e.target.value } : x)))} error={invalid ? "Enter a whole number, 0 or more." : undefined} />
                    <SelectField label="In" value={r.unit} onChange={(e) => setRows((rs) => rs.map((x) => (x.item_id === r.item_id ? { ...x, unit: e.target.value } : x)))}>
                      {unitChoices(item).map((u, i) => <option key={u.id} value={i === 0 ? "" : u.id}>{u.label}</option>)}
                    </SelectField>
                  </div>
                ) : (
                  line && <p className="text-sm">Counted {line.entered_qty.toLocaleString("en-KE")} {line.entered_unit_code}{line.entered_unit_code !== unitCode ? ` (${qtyText(line.counted_base, unitCode)})` : ""}</p>
                )}
                {line && !dirty && (
                  <p className={`money text-sm font-medium ${line.variance_base === 0 ? "" : line.variance_base < 0 ? "text-danger" : "text-ember"}`}>
                    {line.variance_base === 0 ? "Matches the books." : `${line.variance_base < 0 ? "Short" : "Over"} by ${qtyText(Math.abs(line.variance_base), unitCode)}.`}
                  </p>
                )}
                {draft && <Button variant="secondary" onClick={() => setRows((rs) => rs.filter((x) => x.item_id !== r.item_id))}>Take off the sheet</Button>}
              </li>
            );
          })}
        </ul>
      )}

      {draft && (
        <div className="flex flex-wrap items-center gap-2">
          <Button busy={busy} disabled={!dirty || bad || rows.some((r) => r.qty === "")} onClick={save}>Save the sheet</Button>
          <Button disabled={dirty || count.line_count === 0} onClick={() => setDialog("approve")}>Approve the count</Button>
          <Button variant="secondary" onClick={() => setDialog("cancel")}>Cancel the count</Button>
          {dirty && <span className="text-sm text-slate-brand/80">Save the sheet before approving.</span>}
        </div>
      )}
      {!draft && count.status === "approved" && <p className="text-sm">Net change posted: <span className="money font-medium">{net > 0 ? "+" : ""}{net.toLocaleString("en-KE")}</span> (in each item&apos;s own unit, added up).</p>}

      {dialog === "approve" && (
        <FormDialog
          open
          title={`Approve count #${count.count_no}`}
          submitLabel="Approve and post"
          onClose={() => setDialog(undefined)}
          onSubmit={async () => {
            const r = await api<{ count: StockCount }>(`/inventory/counts/${id}/approve`, { method: "POST", idempotencyKey: newIdempotencyKey() });
            accept(r.count);
            onChanged();
            setNotice(`Count #${count.count_no} was approved. The differences are in the stock.`);
          }}
        >
          <p>{count.difference_count === 0 ? "Everything matched the books, so nothing will change." : `${count.difference_count} ${count.difference_count === 1 ? "item differs" : "items differ"} from the books. The difference is added to or taken from stock, and the count cannot be changed afterwards.`}</p>
          <p className="text-sm text-slate-brand/80">If you approve a wrong number, put it right with a reversal from the movement list.</p>
        </FormDialog>
      )}
      {dialog === "cancel" && (
        <FormDialog
          open
          title={`Cancel count #${count.count_no}`}
          submitLabel="Cancel the count"
          danger
          onClose={() => setDialog(undefined)}
          onSubmit={async () => {
            const r = await api<{ count: StockCount }>(`/inventory/counts/${id}/cancel`, { method: "POST" });
            accept(r.count);
            setNotice(`Count #${count.count_no} was cancelled. No stock changed.`);
          }}
        >
          <p>Throw this sheet away? Nothing was posted to stock, so nothing needs undoing.</p>
        </FormDialog>
      )}
    </div>
  );
}

/** The Low stock tab: items at or under their low-stock level. */
export function LowStockPanel({ tick }: { tick: number }) {
  const [state, setState] = useState<{ status: "loading" } | { status: "error"; message: string } | { status: "ready"; items: InventoryItem[] }>({ status: "loading" });
  useEffect(() => {
    let alive = true;
    api<{ items: InventoryItem[] }>("/inventory/low-stock")
      .then((r) => alive && setState({ status: "ready", items: r.items }))
      .catch((err) => alive && setState({ status: "error", message: errorMessage(err) }));
    return () => {
      alive = false;
    };
  }, [tick]);
  if (state.status === "loading") return <LoadingState label="Loading the low-stock list" />;
  if (state.status === "error") return <ErrorState message={state.message} />;
  if (state.items.length === 0) return <EmptyState title="Nothing is low">Every item with a low-stock level is above it. Set a level on an item (Edit) to be told when it runs low.</EmptyState>;
  return (
    <ul className="space-y-3">
      {state.items.map((i) => (
        <li key={i.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-stone-brand bg-white p-4">
          <div>
            <h2 className="text-lg font-semibold">{i.name}</h2>
            <p className="text-sm text-slate-brand/80">Low at or under {qtyText(i.low_stock_threshold ?? 0, i.base_unit.code)}</p>
          </div>
          <p className={`money text-xl font-semibold ${i.total_base < 0 ? "text-danger" : "text-ember"}`}>{qtyText(i.total_base, i.base_unit.code)}</p>
        </li>
      ))}
    </ul>
  );
}
