"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { SelectField } from "@/components/catalogue/SelectField";
import { ReasonDialog } from "@/components/pos/OrderDialogs";
import { Alert, Button, EmptyState, ErrorState, LoadingState, TextField } from "@/components/ui";
import { ApiError, api, errorMessage, newIdempotencyKey } from "@/lib/api";
import { categoryLabel, CATEGORY_LABELS, METHOD_LABELS, methodLabel, type Expense, type ExpenseList } from "@/lib/expenses";
import { formatDay, todayYmd } from "@/lib/format";
import { formatKes, parseKes } from "@/lib/money";
import { useSession } from "@/lib/session";

type Load = { status: "loading" } | { status: "error"; message: string } | { status: "ready"; list: ExpenseList };

export default function ExpensesPage() {
  const { state, can } = useSession();
  const allowed = can("expenses.manage");
  const [from, setFrom] = useState(() => todayYmd(-29));
  const [to, setTo] = useState(() => todayYmd());
  const [showVoided, setShowVoided] = useState(false);
  const [load, setLoad] = useState<Load>({ status: "loading" });
  const [tick, setTick] = useState(0);
  const [voiding, setVoiding] = useState<Expense | null>(null);
  const [notice, setNotice] = useState<string>();

  // The form. The key belongs to one attempt: a retry after a bad connection reuses it, so the expense is written once.
  const [date, setDate] = useState(() => todayYmd());
  const [what, setWhat] = useState("");
  const [category, setCategory] = useState("other");
  const [amount, setAmount] = useState("");
  const [paidBy, setPaidBy] = useState("");
  const [paidWith, setPaidWith] = useState("cash");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string>();
  const key = useRef<string | null>(null);
  const ready = from !== "" && to !== "" && from <= to;

  useEffect(() => {
    if (!allowed || !ready) return;
    let alive = true;
    api<ExpenseList>("/expenses", { query: { from, to, include_voided: showVoided ? "true" : undefined } })
      .then((list) => alive && setLoad({ status: "ready", list }))
      .catch((err) => alive && setLoad({ status: "error", message: errorMessage(err) }));
    return () => {
      alive = false;
    };
  }, [allowed, ready, from, to, showVoided, tick]);

  const total = useMemo(() => (load.status === "ready" ? load.list.expenses.filter((e) => !e.voided).reduce((n, e) => n + e.amount_cents, 0) : 0), [load]);

  if (state.status !== "authenticated") return null;
  if (!allowed) return <EmptyState title="No access">Your role does not include expenses.</EmptyState>;

  const cents = parseKes(amount);
  const who = paidBy.trim() === "" ? state.me.user.display_name : paidBy.trim();

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setErrors({});
    setFormError(undefined);
    setNotice(undefined);
    const next: Record<string, string> = {};
    if (what.trim() === "") next.description = "Say what it was for.";
    if (cents === null || cents <= 0) next.amount_cents = "Enter an amount like 1500 or 1500.50.";
    if (Object.keys(next).length) {
      setErrors(next);
      return;
    }
    key.current ??= newIdempotencyKey();
    setBusy(true);
    try {
      await api("/expenses", { method: "POST", idempotencyKey: key.current, body: { expense_date: date, description: what.trim(), category, amount_cents: cents, paid_by: who, paid_with: paidWith } });
      key.current = null;
      setNotice(`Saved: ${what.trim()}, ${formatKes(cents!)}.`);
      setWhat("");
      setAmount("");
      setTick((n) => n + 1);
    } catch (err) {
      if (err instanceof ApiError && err.fields.length) {
        setErrors(Object.fromEntries(err.fields.map((f) => [f.field, f.message])));
        key.current = null; // the request was refused, so the next try is a new one
      } else {
        setFormError(errorMessage(err));
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Expenses</h1>
      <p className="text-sm text-neutral-600">
        Money the business spent that is not stock from a supplier: rent, power, wages, repairs. Cash taken from a till drawer is entered on the shift instead. A wrong entry cannot be edited: cancel it with a reason and enter it again.
      </p>

      <form onSubmit={save} noValidate className="space-y-4 rounded-lg border border-neutral-200 bg-white p-4" aria-label="New expense">
        <h2 className="text-lg font-semibold">Add an expense</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <TextField label="Date" type="date" value={date} max={todayYmd()} error={errors.expense_date} onChange={(e) => setDate(e.target.value)} />
          <TextField label="What was it for" value={what} maxLength={200} error={errors.description} onChange={(e) => setWhat(e.target.value)} />
          <SelectField label="Kind" value={category} error={errors.category} onChange={(e) => setCategory(e.target.value)}>
            {Object.entries(CATEGORY_LABELS).map(([k, label]) => (
              <option key={k} value={k}>{label}</option>
            ))}
          </SelectField>
          <TextField label="Amount (KES)" inputMode="decimal" value={amount} placeholder="0.00" error={errors.amount_cents} onChange={(e) => setAmount(e.target.value)} />
          <TextField label="Who paid" value={paidBy} maxLength={80} placeholder={state.me.user.display_name} hint="Leave empty if it was you." error={errors.paid_by} onChange={(e) => setPaidBy(e.target.value)} />
          <SelectField label="Paid with" value={paidWith} error={errors.paid_with} onChange={(e) => setPaidWith(e.target.value)}>
            {Object.entries(METHOD_LABELS).map(([k, label]) => (
              <option key={k} value={k}>{label}</option>
            ))}
          </SelectField>
        </div>
        {formError && <Alert tone="error">{formError}</Alert>}
        {notice && <Alert tone="success">{notice}</Alert>}
        <Button type="submit" busy={busy}>Save expense</Button>
      </form>

      <section className="space-y-3" aria-labelledby="list-h">
        <h2 id="list-h" className="text-lg font-semibold">What was entered</h2>
        <div className="flex flex-wrap items-end gap-3">
          <div className="w-[calc(50%-0.375rem)] sm:w-44">
            <TextField label="From" type="date" value={from} onChange={(e) => { setLoad({ status: "loading" }); setFrom(e.target.value); }} />
          </div>
          <div className="w-[calc(50%-0.375rem)] sm:w-44">
            <TextField label="To" type="date" value={to} onChange={(e) => { setLoad({ status: "loading" }); setTo(e.target.value); }} />
          </div>
          <label className="target flex items-center gap-2 text-sm">
            <input type="checkbox" checked={showVoided} onChange={(e) => { setLoad({ status: "loading" }); setShowVoided(e.target.checked); }} /> Show cancelled entries
          </label>
        </div>
        {!ready && <p className="text-sm text-neutral-600">Pick both dates, with the first on or before the last.</p>}
        {ready && load.status === "loading" && <LoadingState label="Loading expenses" />}
        {ready && load.status === "error" && <ErrorState message={load.message} onRetry={() => { setLoad({ status: "loading" }); setTick((n) => n + 1); }} />}
        {ready && load.status === "ready" && (load.list.expenses.length === 0 ? (
          <p className="text-sm text-neutral-600">Nothing entered for these days.</p>
        ) : (
          <>
            <div className="relative overflow-x-auto rounded-lg border border-neutral-200 bg-white">
              <table className="w-full text-sm">
                <thead className="bg-neutral-50 text-left text-neutral-600">
                  <tr>
                    <th scope="col" className="px-3 py-2 font-medium">Day</th>
                    <th scope="col" className="px-3 py-2 font-medium">What</th>
                    <th scope="col" className="px-3 py-2 font-medium">Who paid</th>
                    <th scope="col" className="px-3 py-2 font-medium">How</th>
                    <th scope="col" className="px-3 py-2 text-right font-medium">Amount</th>
                    <th scope="col" className="px-3 py-2"><span className="sr-only">Actions</span></th>
                  </tr>
                </thead>
                <tbody>
                  {load.list.expenses.map((x) => (
                    <tr key={x.id} className="border-t border-neutral-100 align-top">
                      <td className="whitespace-nowrap px-3 py-2">{formatDay(x.expense_date)}</td>
                      <td className={`px-3 py-2 ${x.voided ? "text-neutral-500 line-through" : ""}`}>
                        {x.description}
                        <span className="block text-xs text-neutral-500 no-underline">{categoryLabel(x.category)}{x.voided && x.void_reason ? ` · cancelled: ${x.void_reason}` : ""}</span>
                      </td>
                      <td className="px-3 py-2">{x.paid_by}</td>
                      <td className="px-3 py-2">{methodLabel(x.paid_with)}</td>
                      <td className={`whitespace-nowrap px-3 py-2 text-right tabular-nums ${x.voided ? "text-neutral-500 line-through" : ""}`}>{formatKes(x.amount_cents)}</td>
                      <td className="px-3 py-2 text-right">
                        {!x.voided && <Button variant="secondary" onClick={() => setVoiding(x)}>Cancel entry<span className="sr-only"> {x.description}</span></Button>}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t border-neutral-300 bg-neutral-50 font-semibold">
                    <td className="px-3 py-2" colSpan={4}>Total (cancelled entries left out)</td>
                    <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">{formatKes(total)}</td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
            {load.list.more && <Alert tone="info">Only the newest 200 are shown. Narrow the dates to see the rest.</Alert>}
          </>
        ))}
      </section>

      <ReasonDialog
        open={voiding !== null}
        title="Cancel this expense?"
        submitLabel="Cancel expense"
        hint="It stays on record with your reason, and leaves every total."
        onClose={() => setVoiding(null)}
        onSubmit={async (reason) => {
          if (!voiding) return;
          await api(`/expenses/${voiding.id}/void`, { method: "POST", body: { reason } });
          setTick((n) => n + 1);
        }}
      />
    </div>
  );
}
