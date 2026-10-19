"use client";

import { ArrowLeft, Banknote, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { PaymentFields, type PaymentDraft } from "@/components/sales/PaymentFields";
import { Alert, Button, EmptyState, ErrorState, LoadingState, TextField } from "@/components/ui";
import { ApiError, api, errorMessage, newIdempotencyKey } from "@/lib/api";
import { centsToInput, formatKes, parseKes } from "@/lib/money";
import { METHODS } from "@/lib/payments";
import { useSession } from "@/lib/session";
import type { Bill, Order, Sale } from "@/lib/types";

type Load = { status: "loading" } | { status: "error"; message: string } | { status: "ready"; order: Order; bill: Bill };

export default function PayPage() {
  const { state, can } = useSession();
  const router = useRouter();
  const params = useParams<{ orderId: string }>();
  const id = Number(params.orderId);
  const [load, setLoad] = useState<Load>({ status: "loading" });
  const [tick, setTick] = useState(0);
  const [rows, setRows] = useState<PaymentDraft[]>([]);
  const [discounts, setDiscounts] = useState<Record<number, { amount: string; reason: string }>>({});
  const [received, setReceived] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const nextKey = useRef(1);
  // One Idempotency-Key per exact request: a double click or a retry after a dropped connection finalises once (AC-01).
  const attempt = useRef<{ payload: string; key: string } | null>(null);
  const allowed = can("sales.create");
  const canDiscount = can("sales.discount");

  useEffect(() => {
    if (!allowed || !Number.isInteger(id) || id <= 0) return;
    let alive = true;
    Promise.all([api<{ order: Order }>(`/orders/${id}`), api<{ bill: Bill }>(`/orders/${id}/bill`)])
      .then(([o, b]) => alive && setLoad({ status: "ready", order: o.order, bill: b.bill }))
      .catch((err) => alive && setLoad({ status: "error", message: err instanceof ApiError && err.status === 404 ? "That order does not exist, or it is not yours to open." : errorMessage(err) }));
    return () => {
      alive = false;
    };
  }, [allowed, id, tick]);

  if (state.status !== "authenticated") return null;
  if (!allowed) return <EmptyState title="No access">Your role does not take payments.</EmptyState>;
  if (load.status === "loading") return <LoadingState label="Loading the bill" />;
  if (load.status === "error") return <ErrorState message={load.message} onRetry={() => setTick((t) => t + 1)} />;

  const { order, bill } = load;
  const back = <Link href={`/pos/${id}`} className="target inline-flex items-center gap-1 rounded-md px-2 hover:bg-stone-brand/50"><ArrowLeft aria-hidden className="size-4" /> Back to the order</Link>;
  if (order.status !== "open" && order.status !== "sent") {
    return (
      <div className="space-y-4">
        {back}
        <EmptyState title={order.status === "finalised" ? "This order is already closed" : "This order was cancelled"}>
          {order.status === "finalised" ? <>Find it in <Link className="underline" href="/sales">Sales</Link> to see or add payments.</> : order.cancel_reason}
        </EmptyState>
      </div>
    );
  }

  const discountCents = bill.lines.reduce((s, l) => s + (parseKes(discounts[l.order_item_id]?.amount ?? "") ?? 0), 0);
  const due = Math.max(bill.total_cents - discountCents, 0);
  const paying = rows.reduce((s, r) => s + (parseKes(r.amount) ?? 0), 0);
  const remaining = due - paying;
  const cashRows = rows.filter((r) => r.method === "cash");
  const receivedCents = parseKes(received);
  const cashDue = cashRows.reduce((s, r) => s + (parseKes(r.amount) ?? 0), 0);

  const addRow = (method: PaymentDraft["method"] = "cash", amount = remaining > 0 ? centsToInput(remaining) : "") =>
    setRows((r) => [...r, { key: nextKey.current++, method, amount, reference: "" }]);

  async function finalise() {
    const errs: Record<string, string> = {};
    const payments = rows.map((r) => {
      const cents = parseKes(r.amount);
      const needsRef = METHODS.find((m) => m.value === r.method)?.needsReference;
      if (cents === null || cents <= 0) errs[`amount-${r.key}`] = "Enter an amount above 0, like 850 or 850.50";
      if (needsRef && !r.reference.trim()) errs[`ref-${r.key}`] = "Needed to confirm this payment later";
      return { method: r.method, amount_cents: cents ?? 0, reference: r.reference.trim() };
    });
    const discs = bill.lines.flatMap((l) => {
      const d = discounts[l.order_item_id];
      if (!d?.amount.trim()) return [];
      const cents = parseKes(d.amount);
      if (cents === null || cents <= 0) errs[`disc-${l.order_item_id}`] = "Enter an amount above 0";
      else if (!d.reason.trim()) errs[`discr-${l.order_item_id}`] = "A reason is required";
      return [{ order_item_id: l.order_item_id, amount_cents: cents ?? 0, reason: d.reason.trim() }];
    });
    if (paying > due) errs.total = "The payments add up to more than the amount due";
    setErrors(errs);
    if (Object.keys(errs).length) return;

    const body = { payments, discounts: discs, expected_version: order.version };
    const payload = JSON.stringify(body);
    if (attempt.current?.payload !== payload) attempt.current = { payload, key: newIdempotencyKey() };
    setBusy(true);
    setError(undefined);
    try {
      const res = await api<{ sale: Sale }>(`/orders/${id}/finalise`, { method: "POST", body, idempotencyKey: attempt.current.key });
      attempt.current = null;
      router.replace(`/sales/${res.sale.id}`);
    } catch (err) {
      if (err instanceof ApiError && err.code === "order_changed") {
        setTick((t) => t + 1);
        setError("The order was changed by someone else. The bill has been refreshed: check it and try again.");
      } else if (err instanceof ApiError && err.code === "shift_required") {
        setError("Open your shift before taking cash (Shift in the menu), then try again.");
      } else {
        setError(errorMessage(err));
      }
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        {back}
        <h1 className="text-2xl font-semibold">Pay · Order {bill.order_no}</h1>
      </div>
      {bill.tax_status === "provisional_unverified" && <Alert tone="info">The tax setup has not been verified yet, so these receipts are provisional.</Alert>}
      {error && <Alert tone="error">{error}</Alert>}
      {errors.total && <Alert tone="error">{errors.total}</Alert>}

      <div className="grid gap-4 lg:grid-cols-[1fr_26rem]">
        <section aria-labelledby="bill-h" className="space-y-3 rounded-lg border border-stone-brand bg-white p-4">
          <h2 id="bill-h" className="text-lg font-semibold">Bill</h2>
          <ul className="divide-y divide-stone-brand">
            {bill.lines.map((l) => (
              <li key={l.order_item_id} className="space-y-2 py-2">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-medium">{l.qty} × {l.name}</p>
                    {l.modifiers_text && <p className="text-sm text-slate-brand/80">{l.modifiers_text}</p>}
                  </div>
                  <span className="money font-medium">{formatKes(l.line_total_cents)}</span>
                </div>
                {canDiscount && (
                  <div className="grid gap-2 sm:grid-cols-[9rem_1fr]">
                    <TextField label="Discount (KES)" inputMode="decimal" value={discounts[l.order_item_id]?.amount ?? ""} error={errors[`disc-${l.order_item_id}`]} onChange={(e) => setDiscounts((d) => ({ ...d, [l.order_item_id]: { amount: e.target.value, reason: d[l.order_item_id]?.reason ?? "" } }))} />
                    <TextField label="Reason for the discount" value={discounts[l.order_item_id]?.reason ?? ""} maxLength={200} error={errors[`discr-${l.order_item_id}`]} onChange={(e) => setDiscounts((d) => ({ ...d, [l.order_item_id]: { amount: d[l.order_item_id]?.amount ?? "", reason: e.target.value } }))} />
                  </div>
                )}
              </li>
            ))}
          </ul>
          <dl className="space-y-1 border-t border-stone-brand pt-3">
            {discountCents > 0 && <div className="flex justify-between"><dt>Discounts</dt><dd className="money">-{formatKes(discountCents)}</dd></div>}
            <div className="flex justify-between text-xl font-semibold"><dt>Amount due</dt><dd className="money">{formatKes(due)}</dd></div>
            <div className="flex justify-between text-sm text-slate-brand/80"><dt>Includes tax of (before any discount)</dt><dd className="money">{formatKes(bill.tax_cents)}</dd></div>
          </dl>
        </section>

        <section aria-labelledby="pay-h" className="h-fit space-y-4 rounded-lg border border-stone-brand bg-white p-4">
          <h2 id="pay-h" className="text-lg font-semibold">Payments</h2>
          {rows.length === 0 && <p className="text-slate-brand/80">No payment yet. Add what the customer pays now, or leave it unpaid to settle later.</p>}
          {rows.map((r) => (
            <div key={r.key} className="space-y-2 rounded-md border border-stone-brand p-3">
              <PaymentFields draft={r} onChange={(d) => setRows((all) => all.map((x) => (x.key === r.key ? d : x)))} errors={{ amount: errors[`amount-${r.key}`], reference: errors[`ref-${r.key}`] }} />
              <button type="button" onClick={() => setRows((all) => all.filter((x) => x.key !== r.key))} className="target inline-flex items-center gap-1 rounded-md px-2 text-danger hover:bg-stone-brand/50"><Trash2 aria-hidden className="size-4" /> Remove</button>
            </div>
          ))}
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => addRow()}><Plus aria-hidden className="size-4" /> Add payment</Button>
            {rows.length === 0 && due > 0 && <Button variant="secondary" onClick={() => addRow("cash", centsToInput(due))}><Banknote aria-hidden className="size-4" /> Full amount in cash</Button>}
          </div>
          {cashDue > 0 && (
            <div className="space-y-1">
              <TextField label="Cash received (optional, for change)" inputMode="decimal" value={received} onChange={(e) => setReceived(e.target.value)} />
              {receivedCents !== null && receivedCents >= cashDue && <p className="money text-lg font-semibold" aria-live="polite">Change to give: {formatKes(receivedCents - cashDue)}</p>}
              {receivedCents !== null && receivedCents < cashDue && <p className="text-sm text-danger">That is less than the cash being paid.</p>}
            </div>
          )}
          <dl className="space-y-1 border-t border-stone-brand pt-3">
            <div className="flex justify-between"><dt>Paying now</dt><dd className="money">{formatKes(paying)}</dd></div>
            <div className={`flex justify-between font-semibold ${remaining < 0 ? "text-danger" : ""}`}><dt>{remaining < 0 ? "Too much by" : "Left to pay later"}</dt><dd className="money">{formatKes(Math.abs(remaining))}</dd></div>
          </dl>
          <p className="text-xs text-slate-brand/70">Cash counts as paid at once. M-Pesa, card and bank payments stay &quot;waiting for confirmation&quot; until a manager confirms them.</p>
          <Button onClick={() => void finalise()} busy={busy} disabled={due === 0 && bill.lines.length === 0} className="w-full">
            {rows.length === 0 ? "Finalise, unpaid" : remaining > 0 ? "Finalise, part paid" : "Finalise sale"}
          </Button>
        </section>
      </div>
    </div>
  );
}
