"use client";

import { Plus, Trash2 } from "lucide-react";
import { useRef, useState } from "react";
import { SelectField } from "@/components/catalogue/SelectField";
import { PaymentFields, type PaymentDraft } from "@/components/sales/PaymentFields";
import { Alert, Button, TextField } from "@/components/ui";
import { ApiError, api, errorMessage, newIdempotencyKey } from "@/lib/api";
import { formatWhen } from "@/lib/format";
import { centsToInput, formatKes, parseKes } from "@/lib/money";
import { METHODS } from "@/lib/payments";
import type { ManualReceiptEntry, MenuCategory, Sale } from "@/lib/types";

// Entering a paper receipt written during an outage (Stage 16, ASSUMPTIONS S-66 to S-70). The screen only collects what
// the paper says. The server works out the total and the tax, refuses a paper number that was already entered, and
// checks every rule again.

type LineDraft = { key: number; productId: string; qty: string; price: string };

// Row keys for the line and payment lists. The server decides whether the date is acceptable (not in the future, not older than 31 days).
let rowKey = 1;
const nextKey = () => rowKey++;

export function ManualReceiptForm({ menu, onDone }: { menu: MenuCategory[]; onDone: (sale: Sale) => void }) {
  const blankLine = (): LineDraft => ({ key: nextKey(), productId: "", qty: "1", price: "" });
  const blankPayment = (): PaymentDraft => ({ key: nextKey(), method: "cash", amount: "", reference: "" });

  const [no, setNo] = useState("");
  const [when, setWhen] = useState("");
  const [lines, setLines] = useState<LineDraft[]>(() => [blankLine()]);
  const [payments, setPayments] = useState<PaymentDraft[]>(() => [blankPayment()]);
  const [paperTotal, setPaperTotal] = useState("");
  const [discrepancy, setDiscrepancy] = useState("");
  const [sourceNote, setSourceNote] = useState("");
  const [dup, setDup] = useState<ManualReceiptEntry | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string>();
  const [busy, setBusy] = useState(false);
  // The same filled-in form retried (a lost answer, a double tap) reuses its key and cannot make a second sale (NN-05).
  const attempt = useRef<{ sig: string; key: string } | null>(null);

  const products = menu.flatMap((c) => c.products.map((p) => ({ ...p, category: c.name })));
  const priceOf = (id: string) => products.find((p) => String(p.id) === id)?.price_cents;

  const lineCents = lines.map((l) => {
    const q = Number(l.qty);
    const p = parseKes(l.price);
    return Number.isInteger(q) && q >= 1 && p !== null ? q * p : null;
  });
  const linesOk = lineCents.every((c) => c !== null);
  const linesTotal = linesOk ? lineCents.reduce<number>((a, c) => a + (c ?? 0), 0) : null;
  const paperCents = parseKes(paperTotal);
  const differs = linesTotal !== null && paperCents !== null && paperCents !== linesTotal;

  async function checkNumber() {
    const n = no.trim();
    if (!n) {
      setDup(null);
      return;
    }
    try {
      const r = await api<{ entries: ManualReceiptEntry[] }>("/reconciliation/manual-receipts", { query: { manual_receipt_no: n, limit: 1 } });
      setDup(r.entries[0] ?? null);
    } catch {
      setDup(null); // the server checks again on submit; this is only an early warning
    }
  }

  function setLine(key: number, patch: Partial<LineDraft>) {
    setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  }

  function validate(): Record<string, string> {
    const e: Record<string, string> = {};
    if (!no.trim()) e.manual_receipt_no = "Type the number printed on the paper receipt";
    if (!when) e.occurred_at = "When was this sale made?";
    else if (Number.isNaN(new Date(when).getTime())) e.occurred_at = "That date and time is not valid";
    if (lines.some((l) => !l.productId)) e.lines = "Choose a product on every line";
    else if (!linesOk) e.lines = "Every line needs a quantity of 1 or more and the price written on the paper";
    if (paperCents === null) e.paper_total_cents = "Type the total written on the paper receipt";
    if (differs && !discrepancy.trim()) e.discrepancy_note = "The paper total is different from the lines. Say why";
    const paid = payments.filter((p) => p.amount.trim() !== "");
    for (const p of paid) {
      const c = parseKes(p.amount);
      if (c === null || c <= 0) e.payments = "Every payment needs an amount above 0";
      else if (METHODS.find((m) => m.value === p.method)?.needsReference && !p.reference.trim()) e.payments = "M-Pesa, card and bank payments need the code or reference";
    }
    if (!e.payments && linesTotal !== null && paid.reduce((a, p) => a + (parseKes(p.amount) ?? 0), 0) > linesTotal) e.payments = `Payments add up to more than the lines (${formatKes(linesTotal)})`;
    return e;
  }

  async function submit(ev: React.FormEvent) {
    ev.preventDefault();
    setFormError(undefined);
    const e = validate();
    setErrors(e);
    if (Object.keys(e).length > 0 || dup) return;
    const body = {
      manual_receipt_no: no.trim(),
      occurred_at: new Date(when).toISOString(),
      lines: lines.map((l) => ({ product_id: Number(l.productId), qty: Number(l.qty), unit_price_cents: parseKes(l.price) })),
      payments: payments.filter((p) => p.amount.trim() !== "").map((p) => ({ method: p.method, amount_cents: parseKes(p.amount), ...(p.method === "cash" ? {} : { reference: p.reference.trim() }) })),
      paper_total_cents: paperCents,
      ...(discrepancy.trim() ? { discrepancy_note: discrepancy.trim() } : {}),
      ...(sourceNote.trim() ? { source_note: sourceNote.trim() } : {}),
    };
    const sig = JSON.stringify(body);
    if (attempt.current?.sig !== sig) attempt.current = { sig, key: newIdempotencyKey() };
    setBusy(true);
    try {
      const r = await api<{ sale: Sale }>("/reconciliation/manual-receipts", { method: "POST", body, idempotencyKey: attempt.current.key });
      attempt.current = null;
      setNo(""); setWhen(""); setLines([blankLine()]); setPayments([blankPayment()]); setPaperTotal(""); setDiscrepancy(""); setSourceNote(""); setDup(null); setErrors({});
      onDone(r.sale);
    } catch (err) {
      if (err instanceof ApiError && err.fields.length > 0) setErrors(Object.fromEntries(err.fields.map((f) => [f.field, f.message])));
      setFormError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-4 rounded-lg border border-stone-brand bg-white p-4" aria-labelledby="enter-h">
      <h2 id="enter-h" className="text-lg font-semibold">Enter a paper receipt</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        <TextField
          label="Number on the paper receipt"
          value={no}
          maxLength={40}
          error={errors.manual_receipt_no}
          hint="Exactly as printed in the receipt book."
          onChange={(e) => { setNo(e.target.value); setDup(null); }}
          onBlur={() => void checkNumber()}
        />
        <TextField label="When the sale was made" type="datetime-local" value={when} error={errors.occurred_at} onChange={(e) => setWhen(e.target.value)} />
      </div>
      {dup && (
        <Alert tone="error">
          Paper receipt {dup.manual_receipt_no} was already entered on {formatWhen(dup.entered_at)} by {dup.entered_by_name} as receipt {dup.receipt_no}. Do not enter it again.
        </Alert>
      )}

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Items on the paper receipt</legend>
        {lines.map((l, i) => (
          <div key={l.key} className="grid grid-cols-[4rem_1fr_auto] items-end gap-2 sm:grid-cols-[1fr_5rem_8rem_auto]">
            <div className="col-span-3 sm:col-span-1">
            <SelectField
              label={`Item ${i + 1}`}
              value={l.productId}
              onChange={(e) => { const id = e.target.value; const cents = priceOf(id); setLine(l.key, { productId: id, price: cents !== undefined && l.price === "" ? centsToInput(cents) : l.price }); }}
            >
              <option value="">Choose a product</option>
              {menu.map((c) => (
                <optgroup key={c.id} label={c.name}>
                  {c.products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </optgroup>
              ))}
            </SelectField>
            </div>
            <TextField label="Qty" inputMode="numeric" value={l.qty} onChange={(e) => setLine(l.key, { qty: e.target.value })} />
            <TextField label="Price each (KES)" inputMode="decimal" value={l.price} onChange={(e) => setLine(l.key, { price: e.target.value })} />
            <Button variant="secondary" aria-label={`Remove item ${i + 1}`} disabled={lines.length === 1} onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))}><Trash2 aria-hidden className="size-4" /></Button>
          </div>
        ))}
        {errors.lines && <p className="text-sm text-danger">{errors.lines}</p>}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Button variant="secondary" onClick={() => setLines((ls) => [...ls, blankLine()])}><Plus aria-hidden className="size-4" /> Add item</Button>
          <p className="text-sm">Items add up to <strong className="money">{linesTotal === null ? "-" : formatKes(linesTotal)}</strong></p>
        </div>
        <p className="text-sm text-slate-brand/80">Use the price the customer was charged for each one, with tax included. If a product is missing, it is not available in the catalogue right now.</p>
      </fieldset>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">How it was paid</legend>
        {payments.map((p, i) => (
          <div key={p.key} className="flex items-start gap-2">
            <div className="flex-1"><PaymentFields draft={p} onChange={(d) => setPayments((ps) => ps.map((x) => (x.key === p.key ? d : x)))} /></div>
            <Button variant="secondary" aria-label={`Remove payment ${i + 1}`} className="mt-6" disabled={payments.length === 1 && p.amount === ""} onClick={() => setPayments((ps) => (ps.length === 1 ? [blankPayment()] : ps.filter((x) => x.key !== p.key)))}><Trash2 aria-hidden className="size-4" /></Button>
          </div>
        ))}
        {errors.payments && <p className="text-sm text-danger">{errors.payments}</p>}
        <Button variant="secondary" onClick={() => setPayments((ps) => [...ps, blankPayment()])}><Plus aria-hidden className="size-4" /> Add payment</Button>
        <p className="text-sm text-slate-brand/80">Leave the amount empty if nothing was paid yet. Payments entered here count as received.</p>
      </fieldset>

      <div className="grid gap-3 sm:grid-cols-2">
        <TextField label="Total written on the paper (KES)" inputMode="decimal" value={paperTotal} error={errors.paper_total_cents} onChange={(e) => setPaperTotal(e.target.value)} />
        <TextField label="Where it came from (optional)" value={sourceNote} maxLength={200} hint="For example: book 2, page 14" onChange={(e) => setSourceNote(e.target.value)} />
      </div>
      {(differs || errors.discrepancy_note) && (
        <TextField label="Why the paper total is different" value={discrepancy} maxLength={200} error={errors.discrepancy_note} hint={`The items add up to ${linesTotal === null ? "-" : formatKes(linesTotal)}; the sale will use that.`} onChange={(e) => setDiscrepancy(e.target.value)} />
      )}

      {formError && Object.keys(errors).length === 0 && <Alert tone="error">{formError}</Alert>}
      <div className="flex justify-end">
        <Button type="submit" busy={busy} disabled={dup !== null}>Enter this receipt</Button>
      </div>
    </form>
  );
}
