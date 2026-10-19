import { formatWhen } from "@/lib/format";
import { formatKes } from "@/lib/money";
import { PAYMENT_STATUS_LABEL, methodLabel } from "@/lib/payments";
import { MOVEMENT_LABEL, SHIFT_STATUS_LABEL, varianceText } from "@/lib/shifts";
import type { ShiftSummary } from "@/lib/types";

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={`flex justify-between gap-3 ${strong ? "font-semibold" : ""}`}>
      <dt>{label}</dt>
      <dd className="money">{value}</dd>
    </div>
  );
}

/** Read-only picture of a shift: the same figures whether it is open, closed or checked. */
export function ShiftSummaryView({ summary }: { summary: ShiftSummary }) {
  const { shift, cash } = summary;
  const closed = shift.status !== "open";
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <section aria-labelledby="cash-h" className="h-fit space-y-3 rounded-lg border border-stone-brand bg-white p-4">
        <h2 id="cash-h" className="text-lg font-semibold">Cash in the drawer</h2>
        <p className="text-sm text-slate-brand/80">{shift.user_name} · opened {formatWhen(shift.opened_at)} · {SHIFT_STATUS_LABEL[shift.status]}</p>
        <dl className="space-y-1">
          <Row label="Opening float" value={formatKes(cash.opening_float_cents)} />
          <Row label="Cash payments (confirmed)" value={formatKes(cash.cash_payments_cents)} />
          {cash.cash_refunds_cents > 0 && <Row label="Cash refunds" value={`-${formatKes(cash.cash_refunds_cents)}`} />}
          <Row label="Cash put in" value={formatKes(cash.paid_in_cents)} />
          <Row label="Cash taken out" value={`-${formatKes(cash.paid_out_cents)}`} />
          <Row label="Expenses" value={`-${formatKes(cash.expenses_cents)}`} />
          <div className="border-t border-stone-brand pt-2">
            <Row label={closed ? "Expected when closed" : "Expected in the drawer now"} value={formatKes(cash.expected_cash_cents)} strong />
          </div>
          {closed && shift.declared_cash_cents !== null && shift.variance_cents !== null && (
            <>
              <Row label="Counted by cashier" value={formatKes(shift.declared_cash_cents)} />
              <p role="status" className={`font-semibold ${shift.variance_cents === 0 ? "text-success" : "text-ember"}`}>{varianceText(shift.variance_cents)}</p>
            </>
          )}
        </dl>
        {shift.notes && <p className="text-sm text-slate-brand/80">Note: {shift.notes}</p>}
        {shift.closed_at && <p className="text-sm text-slate-brand/80">Closed {formatWhen(shift.closed_at)}{shift.reconciled_at ? ` · checked ${formatWhen(shift.reconciled_at)}` : ""}</p>}
      </section>

      <section aria-labelledby="took-h" className="h-fit space-y-3 rounded-lg border border-stone-brand bg-white p-4">
        <h2 id="took-h" className="text-lg font-semibold">What this shift took</h2>
        <p>{summary.sales.count} {summary.sales.count === 1 ? "sale" : "sales"} · {formatKes(summary.sales.total_cents)}</p>
        {summary.payments.length === 0 ? <p className="text-slate-brand/80">No payments yet.</p> : (
          <ul className="divide-y divide-stone-brand border-y border-stone-brand">
            {summary.payments.map((p) => (
              <li key={`${p.method}-${p.status}`} className="flex justify-between gap-3 py-2">
                <span>{methodLabel(p.method)} · {PAYMENT_STATUS_LABEL[p.status]} ({p.payments})</span>
                <span className="money">{formatKes(p.amount_cents)}</span>
              </li>
            ))}
          </ul>
        )}
        {summary.pending_not_cash.length > 0 && (
          <p className="text-sm text-slate-brand/80">Money still waiting for confirmation is not cash and is not in the drawer figure above. A manager confirms it on the Payments page.</p>
        )}
        <h3 className="font-semibold">Cash movements</h3>
        {summary.movements.length === 0 ? <p className="text-slate-brand/80">None.</p> : (
          <ul className="divide-y divide-stone-brand border-y border-stone-brand">
            {summary.movements.map((m) => (
              <li key={m.id} className="py-2">
                <div className="flex justify-between gap-3"><span>{MOVEMENT_LABEL[m.kind]}</span><span className="money">{formatKes(m.amount_cents)}</span></div>
                <p className="text-sm text-slate-brand/80">{m.reason} · {m.created_by_name} · {formatWhen(m.created_at)}</p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
