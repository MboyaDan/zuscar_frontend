"use client";

import { ArrowLeft, Ban, Check, Printer, Undo2, X } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ReasonDialog } from "@/components/pos/OrderDialogs";
import { PrintDialog } from "@/components/print/PrintDialog";
import { RefundDialog, VoidDialog } from "@/components/sales/CorrectionDialogs";
import { PaymentFields, type PaymentDraft } from "@/components/sales/PaymentFields";
import { Alert, Button, EmptyState, ErrorState, LoadingState } from "@/components/ui";
import { ApiError, api, errorMessage, newIdempotencyKey } from "@/lib/api";
import { formatWhen } from "@/lib/format";
import { centsToInput, formatKes, parseKes } from "@/lib/money";
import { METHODS, PAYMENT_STATUS_LABEL, SALE_PAYMENT_LABEL, SALE_STATUS_LABEL, methodLabel } from "@/lib/payments";
import { useSession } from "@/lib/session";
import type { Sale, SalePayment } from "@/lib/types";

type Load = { status: "loading" } | { status: "error"; message: string } | { status: "ready"; sale: Sale };

export default function SalePage() {
  const { state, can } = useSession();
  const params = useParams<{ saleId: string }>();
  const id = Number(params.saleId);
  const [load, setLoad] = useState<Load>({ status: "loading" });
  const [tick, setTick] = useState(0);
  const [notice, setNotice] = useState<{ tone: "success" | "error"; text: string }>();
  const [draft, setDraft] = useState<PaymentDraft | null>(null);
  const [draftErr, setDraftErr] = useState<{ amount?: string; reference?: string }>({});
  const [busy, setBusy] = useState<number | "add" | null>(null);
  const [failing, setFailing] = useState<SalePayment | null>(null);
  const [printing, setPrinting] = useState(false);
  const [correcting, setCorrecting] = useState<"void" | "refund" | null>(null);
  const attempt = useRef<{ payload: string; key: string } | null>(null);
  const allowed = can("sales.view");

  useEffect(() => {
    if (!allowed || !Number.isInteger(id) || id <= 0) return;
    let alive = true;
    api<{ sale: Sale }>(`/sales/${id}`)
      .then((r) => alive && setLoad({ status: "ready", sale: r.sale }))
      .catch((err) => alive && setLoad({ status: "error", message: err instanceof ApiError && err.status === 404 ? "That sale does not exist, or it is not yours to open." : errorMessage(err) }));
    return () => {
      alive = false;
    };
  }, [allowed, id, tick]);

  if (state.status !== "authenticated") return null;
  if (!allowed) return <EmptyState title="No access">Your role does not include viewing sales.</EmptyState>;
  if (load.status === "loading") return <LoadingState label="Loading the sale" />;
  if (load.status === "error") return <ErrorState message={load.message} onRetry={() => setTick((t) => t + 1)} />;

  const sale = load.sale;
  const reload = () => setTick((t) => t + 1);
  const payable = sale.status === "finalised" && (sale.payment_status === "unpaid" || sale.payment_status === "partially_paid");
  // Money recorded but waiting for confirmation also uses up the balance, so the form offers only what is still free.
  const free = sale.total_cents - sale.paid_cents - sale.pending_cents;
  // A void is for a sale that should never have happened (same day, no refund yet); everything else is a refund (S-18).
  // The server decides and checks both again; these only decide which buttons are worth showing.
  const canVoid = sale.voidable && can("sales.void");
  const canRefund = (sale.status === "finalised" || sale.status === "partially_refunded") && sale.payment_status !== "charged_to_folio" && sale.paid_cents - sale.refunded_cents > 0 && can("sales.refund");
  const voidRecord = sale.refunds.find((r) => r.kind === "void");

  function startAdd() {
    attempt.current = null;
    setDraftErr({});
    setDraft({ key: 1, method: "cash", amount: free > 0 ? centsToInput(free) : "", reference: "" });
  }

  async function addPayment() {
    if (!draft) return;
    const cents = parseKes(draft.amount);
    const needsRef = METHODS.find((m) => m.value === draft.method)?.needsReference;
    const errs: { amount?: string; reference?: string } = {};
    if (cents === null || cents <= 0) errs.amount = "Enter an amount above 0, like 850 or 850.50";
    else if (cents > free) errs.amount = `At most ${formatKes(free)} is still free`;
    if (needsRef && !draft.reference.trim()) errs.reference = "Needed to confirm this payment later";
    setDraftErr(errs);
    if (errs.amount || errs.reference) return;
    const body = { method: draft.method, amount_cents: cents, reference: draft.reference.trim() };
    const payload = JSON.stringify(body);
    if (attempt.current?.payload !== payload) attempt.current = { payload, key: newIdempotencyKey() };
    setBusy("add");
    setNotice(undefined);
    try {
      await api(`/sales/${id}/payments`, { method: "POST", body, idempotencyKey: attempt.current.key });
      attempt.current = null;
      setDraft(null);
      setNotice({ tone: "success", text: draft.method === "cash" ? "Cash payment recorded." : "Payment recorded. It counts once a manager confirms it." });
      reload();
    } catch (err) {
      setNotice({ tone: "error", text: err instanceof ApiError && err.code === "shift_required" ? "Open your shift before taking cash, then try again." : errorMessage(err) });
    } finally {
      setBusy(null);
    }
  }

  async function confirm(p: SalePayment) {
    setBusy(p.id);
    setNotice(undefined);
    try {
      await api(`/payments/${p.id}/confirm`, { method: "POST", body: {}, idempotencyKey: newIdempotencyKey() });
      setNotice({ tone: "success", text: `${methodLabel(p.method)} payment confirmed.` });
      reload();
    } catch (err) {
      setNotice({ tone: "error", text: errorMessage(err) });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Link href="/sales" className="target inline-flex items-center gap-1 rounded-md px-2 hover:bg-stone-brand/50"><ArrowLeft aria-hidden className="size-4" /> Sales</Link>
        <h1 className="text-2xl font-semibold">Receipt {sale.receipt_no}</h1>
        <span className="rounded-full border border-stone-brand px-2 text-sm">{SALE_PAYMENT_LABEL[sale.payment_status]}</span>
        {sale.status !== "finalised" && <span className="rounded-full border border-ember px-2 text-sm text-ember">{SALE_STATUS_LABEL[sale.status]}</span>}
        {sale.status !== "voided" && sale.source !== "outage_reconciliation" && <Button variant="secondary" onClick={() => setPrinting(true)}><Printer aria-hidden className="size-4" /> Print receipt</Button>}
        {canRefund && <Button variant="secondary" onClick={() => setCorrecting("refund")}><Undo2 aria-hidden className="size-4" /> Refund</Button>}
        {canVoid && <Button variant="secondary" onClick={() => setCorrecting("void")}><Ban aria-hidden className="size-4" /> Void sale</Button>}
      </div>
      {notice && <Alert tone={notice.tone}>{notice.text}</Alert>}
      {voidRecord && <Alert tone="error">Voided by {voidRecord.created_by_name} on {formatWhen(voidRecord.created_at)}: {voidRecord.reason}. The receipt number {sale.receipt_no} stays in the book.</Alert>}
      {sale.manual_receipt && (
        <Alert tone="info">
          Entered from paper receipt <strong>{sale.manual_receipt.manual_receipt_no}</strong>, written {formatWhen(sale.manual_receipt.occurred_at)} and entered by {sale.manual_receipt.entered_by_name}.
          {sale.manual_receipt.paper_total_cents !== sale.total_cents && <> The paper total was {formatKes(sale.manual_receipt.paper_total_cents)}{sale.manual_receipt.discrepancy_note ? `: ${sale.manual_receipt.discrepancy_note}` : ""}.</>}
          {" "}No receipt is printed for it: the customer already has the paper one.
        </Alert>
      )}
      {sale.tax_status === "provisional_unverified" && <Alert tone="info">Provisional receipt: the tax setup was not verified when this was sold.</Alert>}

      <div className="grid gap-4 lg:grid-cols-[1fr_26rem]">
        <section aria-labelledby="items-h" className="space-y-3 rounded-lg border border-stone-brand bg-white p-4">
          <h2 id="items-h" className="text-lg font-semibold">Items</h2>
          <p className="text-sm text-slate-brand/80">{sale.source === "outage_reconciliation" ? "Paper receipt" : `Order ${sale.order_no ?? "-"}`} · {sale.business_date} · taken by {sale.cashier_name}</p>
          <ul className="divide-y divide-stone-brand">
            {sale.items.map((i) => (
              <li key={i.id} className="flex items-start justify-between gap-3 py-2">
                <div>
                  <p className="font-medium">{i.qty} × {i.name}</p>
                  {i.modifiers_text && <p className="text-sm text-slate-brand/80">{i.modifiers_text}</p>}
                  {i.discount_cents > 0 && <p className="text-sm text-ember">Discount {formatKes(i.discount_cents)}: {i.discount_reason}</p>}
                  {i.refunded_qty > 0 && <p className="text-sm text-ember">{i.refunded_qty === i.qty ? "All" : i.refunded_qty} refunded</p>}
                </div>
                <span className="money font-medium">{formatKes(i.line_total_cents)}</span>
              </li>
            ))}
          </ul>
          <dl className="space-y-1 border-t border-stone-brand pt-3">
            {sale.discount_cents > 0 && <div className="flex justify-between"><dt>Discounts</dt><dd className="money">-{formatKes(sale.discount_cents)}</dd></div>}
            <div className="flex justify-between text-xl font-semibold"><dt>Total</dt><dd className="money">{formatKes(sale.total_cents)}</dd></div>
            <div className="flex justify-between text-sm text-slate-brand/80"><dt>Includes tax of</dt><dd className="money">{formatKes(sale.tax_cents)}</dd></div>
          </dl>
        </section>

        <section aria-labelledby="pay-h" className="h-fit space-y-3 rounded-lg border border-stone-brand bg-white p-4">
          <h2 id="pay-h" className="text-lg font-semibold">Payments</h2>
          <dl className="space-y-1">
            <div className="flex justify-between"><dt>Paid (confirmed)</dt><dd className="money">{formatKes(sale.paid_cents)}</dd></div>
            {sale.pending_cents > 0 && <div className="flex justify-between"><dt>Waiting for confirmation</dt><dd className="money">{formatKes(sale.pending_cents)}</dd></div>}
            {sale.refunded_cents > 0 && <div className="flex justify-between"><dt>Handed back</dt><dd className="money">-{formatKes(sale.refunded_cents)}</dd></div>}
            {sale.status === "finalised" && <div className="flex justify-between font-semibold"><dt>Balance due</dt><dd className="money">{formatKes(sale.balance_cents)}</dd></div>}
          </dl>
          {sale.payments.length === 0 ? <p className="text-slate-brand/80">No payments yet.</p> : (
            <ul className="divide-y divide-stone-brand border-y border-stone-brand">
              {sale.payments.map((p) => (
                <li key={p.id} className="space-y-1 py-2">
                  <div className="flex justify-between gap-2">
                    <span className="font-medium">{methodLabel(p.method)}</span>
                    <span className="money">{formatKes(p.amount_cents)}</span>
                  </div>
                  <p className="text-sm text-slate-brand/80">
                    {PAYMENT_STATUS_LABEL[p.status]}{p.reference ? ` · ${p.reference}` : ""} · {formatWhen(p.created_at)}
                  </p>
                  {p.status === "pending_confirmation" && can("payments.reconcile") && (
                    <div className="flex gap-2">
                      <Button onClick={() => void confirm(p)} busy={busy === p.id}><Check aria-hidden className="size-4" /> Confirm</Button>
                      <Button variant="secondary" onClick={() => setFailing(p)}><X aria-hidden className="size-4" /> Did not arrive</Button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
          {payable && can("sales.create") && free > 0 && !draft && <Button onClick={startAdd}>Add a payment</Button>}
          {payable && free <= 0 && sale.pending_cents > 0 && <p className="text-sm text-slate-brand/80">The rest of the balance is waiting for confirmation.</p>}
          {draft && (
            <div className="space-y-3 rounded-md border border-stone-brand p-3">
              <PaymentFields draft={draft} onChange={setDraft} errors={draftErr} />
              <div className="flex gap-2">
                <Button onClick={() => void addPayment()} busy={busy === "add"}>Record payment</Button>
                <Button variant="secondary" onClick={() => setDraft(null)}>Cancel</Button>
              </div>
            </div>
          )}
        </section>
      </div>

      {sale.refunds.length > 0 && (
        <section aria-labelledby="corr-h" className="space-y-3 rounded-lg border border-stone-brand bg-white p-4">
          <h2 id="corr-h" className="text-lg font-semibold">Refunds and voids</h2>
          <ul className="divide-y divide-stone-brand">
            {sale.refunds.map((r) => (
              <li key={r.id} className="space-y-1 py-2">
                <div className="flex justify-between gap-2">
                  <span className="font-medium">{r.kind === "void" ? "Void" : "Refund"} no. {r.refund_no}</span>
                  <span className="money">{formatKes(r.amount_cents)}</span>
                </div>
                <p className="text-sm">{r.items.map((i) => `${i.qty} × ${i.name}`).join(", ")}</p>
                <p className="text-sm text-slate-brand/80">{r.reason} · {r.created_by_name} · {formatWhen(r.created_at)}</p>
                <p className="text-sm text-slate-brand/80">Handed back: {r.payouts.length === 0 ? "nothing (no money had been received)" : r.payouts.map((p) => `${methodLabel(p.method)} ${formatKes(p.amount_cents)}`).join(", ")}</p>
              </li>
            ))}
          </ul>
        </section>
      )}

      {correcting === "void" && <VoidDialog sale={sale} onClose={() => setCorrecting(null)} onDone={(text) => { setNotice({ tone: "success", text }); reload(); }} />}
      {correcting === "refund" && <RefundDialog sale={sale} onClose={() => setCorrecting(null)} onDone={(text) => { setNotice({ tone: "success", text }); reload(); }} />}
      {printing && <PrintDialog target={{ kind: "new", docType: "receipt", refId: sale.id }} onClose={() => setPrinting(false)} />}
      <ReasonDialog
        open={failing !== null}
        title={failing ? `Payment did not arrive: ${methodLabel(failing.method)} ${formatKes(failing.amount_cents)}` : "Payment did not arrive"}
        submitLabel="Mark as failed"
        hint="Say why, for example: not on the statement. The code can then be used again."
        onClose={() => setFailing(null)}
        onSubmit={async (reason) => {
          if (!failing) return;
          await api(`/payments/${failing.id}/fail`, { method: "POST", body: { note: reason } });
          setNotice({ tone: "success", text: "Payment marked as failed. The balance can be paid again." });
          reload();
        }}
      />
    </div>
  );
}
