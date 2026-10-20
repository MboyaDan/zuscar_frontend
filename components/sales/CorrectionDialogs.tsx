"use client";

import { useEffect, useRef, useState } from "react";
import { SelectField } from "@/components/catalogue/SelectField";
import { FormDialog } from "@/components/FormDialog";
import { Alert, LoadingState, TextField } from "@/components/ui";
import { ApiError, api, errorMessage, newIdempotencyKey } from "@/lib/api";
import { centsToInput, formatKes, parseKes } from "@/lib/money";
import { METHODS, methodLabel } from "@/lib/payments";
import type { PaymentMethod, RefundQuote, Sale } from "@/lib/types";

// Voids and refunds (Stage 15, ASSUMPTIONS S-18, S-63 to S-64). The screen never works out money: the amount of a refund
// comes from the server's quote, and the server checks every figure again when the refund is made.

/** The server's reasons are written for the person; the one about the drawer needs saying in the till's own words. */
function friendly(err: unknown): ApiError | unknown {
  if (err instanceof ApiError && err.code === "shift_required") {
    return new ApiError(err.status, err.code, "Open your shift first: cash that goes back to the customer comes out of your drawer.", err.fields, err.requestId);
  }
  return err;
}

/** What each method received on this sale, confirmed only. A void hands back exactly this. */
function receivedByMethod(sale: Sale): { method: PaymentMethod; cents: number }[] {
  const by = new Map<PaymentMethod, number>();
  for (const p of sale.payments) if (p.status === "confirmed") by.set(p.method, (by.get(p.method) ?? 0) + p.amount_cents);
  return [...by.entries()].map(([method, cents]) => ({ method, cents }));
}

export function VoidDialog({ sale, onClose, onDone }: { sale: Sale; onClose: () => void; onDone: (text: string) => void }) {
  const [reason, setReason] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const attempt = useRef<{ reason: string; key: string } | null>(null);
  const clean = reason.trim();
  const back = receivedByMethod(sale);
  const hasCash = back.some((b) => b.method === "cash");

  return (
    <FormDialog
      open
      title={`Void receipt ${sale.receipt_no}`}
      submitLabel="Void this sale"
      danger
      disabled={clean.length === 0}
      onFieldErrors={setErrors}
      onClose={onClose}
      onSubmit={async () => {
        if (attempt.current?.reason !== clean) attempt.current = { reason: clean, key: newIdempotencyKey() };
        try {
          await api(`/sales/${sale.id}/void`, { method: "POST", body: { reason: clean }, idempotencyKey: attempt.current.key });
        } catch (err) {
          throw friendly(err);
        }
        onDone(`Receipt ${sale.receipt_no} voided.`);
      }}
    >
      <Alert tone="info">
        A void cancels a sale that should never have happened. The whole sale is taken back and the receipt number is kept. It can only be done on the day of the sale. After that, use Refund. Stock the sale took is put back.
      </Alert>
      {back.length > 0 ? (
        <div>
          <p className="font-medium">Money handed back</p>
          <ul className="mt-1 space-y-1">
            {back.map((b) => <li key={b.method} className="flex justify-between"><span>{methodLabel(b.method)}</span><span className="money">{formatKes(b.cents)}</span></li>)}
          </ul>
          {hasCash && <p className="mt-2 text-sm text-slate-brand/80">The cash comes out of your open drawer.</p>}
        </div>
      ) : (
        <p className="text-slate-brand/80">Nothing was paid on this sale, so no money goes back.</p>
      )}
      <TextField label="Reason" value={reason} maxLength={200} autoFocus hint="For example: entered on the wrong table." error={errors.reason} onChange={(e) => setReason(e.target.value)} />
    </FormDialog>
  );
}

const METHOD_ORDER: PaymentMethod[] = ["cash", "mpesa_manual", "card_manual", "bank_manual"];

/** Hand the refund back by the methods that still have room, cash first. The person can change every figure. */
function allocate(quote: RefundQuote): Record<string, string> {
  let left = quote.amount_cents;
  const out: Record<string, string> = {};
  for (const m of METHOD_ORDER) {
    const room = quote.methods.find((x) => x.method === m)?.returnable_cents ?? 0;
    const take = Math.min(left, room);
    if (take > 0) {
      out[m] = centsToInput(take);
      left -= take;
    }
  }
  return out;
}

type Quoted = { key: string; quote?: RefundQuote; error?: string };

export function RefundDialog({ sale, onClose, onDone }: { sale: Sale; onClose: () => void; onDone: (text: string) => void }) {
  const [qty, setQty] = useState<Record<number, number>>({});
  const [reason, setReason] = useState("");
  const [restock, setRestock] = useState(false);
  const [pay, setPay] = useState<Record<string, string>>({});
  const [refs, setRefs] = useState<Record<string, string>>({});
  const [quoted, setQuoted] = useState<Quoted>({ key: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const attempt = useRef<{ payload: string; key: string } | null>(null);

  const lines = Object.entries(qty).filter(([, n]) => n > 0).sort(([a], [b]) => Number(a) - Number(b));
  const key = lines.map(([id, n]) => `${id}:${n}`).join(",");

  useEffect(() => {
    if (!key) return;
    let alive = true;
    api<{ quote: RefundQuote }>(`/sales/${sale.id}/refund-quote`, { query: { lines: key } })
      .then((r) => {
        if (!alive) return;
        setQuoted({ key, quote: r.quote });
        setPay(allocate(r.quote));
      })
      .catch((err) => alive && setQuoted({ key, error: errorMessage(err) }));
    return () => {
      alive = false;
    };
  }, [key, sale.id]);

  const current = quoted.key === key ? quoted : null;
  const quote = current?.quote;
  const entered = Object.fromEntries(Object.entries(pay).map(([m, t]) => [m, t.trim() === "" ? 0 : parseKes(t)]));
  const bad = Object.values(entered).some((v) => v === null);
  const total = Object.values(entered).reduce<number>((a, v) => a + (v ?? 0), 0);
  const clean = reason.trim();
  const ready = Boolean(quote) && !bad && clean.length > 0 && total === quote?.amount_cents;
  const open = sale.items.filter((i) => i.qty - i.refunded_qty > 0);

  return (
    <FormDialog
      open
      title={`Refund from receipt ${sale.receipt_no}`}
      submitLabel={quote ? `Refund ${formatKes(quote.amount_cents)}` : "Refund"}
      danger
      disabled={!ready}
      onFieldErrors={setErrors}
      onClose={onClose}
      onSubmit={async () => {
        if (!quote) return;
        const body = {
          reason: clean,
          restock,
          lines: lines.map(([id, n]) => ({ sale_item_id: Number(id), qty: n })),
          payouts: Object.entries(entered).filter(([, v]) => (v ?? 0) > 0).map(([method, v]) => ({ method, amount_cents: v as number, reference: (refs[method] ?? "").trim() })),
        };
        const payload = JSON.stringify(body);
        if (attempt.current?.payload !== payload) attempt.current = { payload, key: newIdempotencyKey() };
        try {
          await api(`/sales/${sale.id}/refunds`, { method: "POST", body, idempotencyKey: attempt.current.key });
        } catch (err) {
          throw friendly(err);
        }
        onDone(`Refunded ${formatKes(quote.amount_cents)}.`);
      }}
    >
      <fieldset className="space-y-2">
        <legend className="font-medium">What is coming back</legend>
        <ul className="divide-y divide-stone-brand">
          {open.map((i) => {
            const left = i.qty - i.refunded_qty;
            return (
              <li key={i.id} className="flex items-center justify-between gap-3 py-2">
                <div>
                  <p>{i.name}</p>
                  <p className="text-sm text-slate-brand/80">{left} of {i.qty} can still go back</p>
                </div>
                <div className="w-24">
                  <SelectField label="Quantity" value={String(qty[i.id] ?? 0)} onChange={(e) => setQty({ ...qty, [i.id]: Number(e.target.value) })}>
                    {Array.from({ length: left + 1 }, (_, n) => <option key={n} value={n}>{n}</option>)}
                  </SelectField>
                </div>
              </li>
            );
          })}
        </ul>
      </fieldset>

      {key === "" && <p className="text-slate-brand/80">Choose at least one item.</p>}
      {key !== "" && !current && <LoadingState label="Working out the refund" />}
      {current?.error && <Alert tone="error">{current.error}</Alert>}

      {quote && (
        <div className="space-y-3">
          <p className="flex justify-between text-lg font-semibold"><span>Refund</span><span className="money">{formatKes(quote.amount_cents)}</span></p>
          <fieldset className="space-y-2">
            <legend className="font-medium">How it goes back</legend>
            {quote.methods.length === 0 && <Alert tone="error">No confirmed payment is left to give back on this sale.</Alert>}
            {METHOD_ORDER.map((m) => {
              const room = quote.methods.find((x) => x.method === m)?.returnable_cents ?? 0;
              if (room <= 0) return null;
              const needsRef = METHODS.find((x) => x.value === m)?.needsReference;
              return (
                <div key={m} className="grid grid-cols-2 gap-3">
                  <TextField label={`${methodLabel(m)} (KES)`} inputMode="decimal" value={pay[m] ?? ""} hint={`Up to ${formatKes(room)}`}
                    error={entered[m] === null ? "Enter an amount like 850 or 850.50" : (entered[m] ?? 0) > room ? `At most ${formatKes(room)}` : undefined}
                    onChange={(e) => setPay({ ...pay, [m]: e.target.value })} />
                  {needsRef && <TextField label="Reference (optional)" value={refs[m] ?? ""} maxLength={64} onChange={(e) => setRefs({ ...refs, [m]: e.target.value })} />}
                </div>
              );
            })}
            {!bad && total !== quote.amount_cents && <p className="text-sm text-danger">Handing back {formatKes(total)}; it must add up to {formatKes(quote.amount_cents)}.</p>}
            {(entered.cash ?? 0) > 0 && <p className="text-sm text-slate-brand/80">The cash comes out of your open drawer.</p>}
          </fieldset>
        </div>
      )}

      <label className="target flex items-start gap-3">
        <input type="checkbox" className="mt-1 size-4" checked={restock} onChange={(e) => setRestock(e.target.checked)} />
        <span>Put the items back in stock. Tick this when the item is still good and can be sold again, such as a sealed bottle. Leave it empty for food or drink that is thrown away. Items that do not track stock are not affected.</span>
      </label>
      <TextField label="Reason" value={reason} maxLength={200} hint="For example: customer returned one, wrong item." error={errors.reason} onChange={(e) => setReason(e.target.value)} />
    </FormDialog>
  );
}
