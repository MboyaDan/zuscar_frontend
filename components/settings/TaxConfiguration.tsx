"use client";

import { CircleCheck, TriangleAlert } from "lucide-react";
import { useState } from "react";
import { FormDialog } from "@/components/FormDialog";
import { Alert, Button } from "@/components/ui";
import { api } from "@/lib/api";
import { formatWhen } from "@/lib/format";
import { useReauth } from "@/lib/reauth";
import { TAX_CHECKLIST } from "@/lib/taxChecklist";
import type { SettingsMap, TaxRate } from "@/lib/types";

const TREATMENT: Record<TaxRate["treatment"], string> = { standard: "Standard rate", zero_rated: "Zero-rated", exempt: "Exempt" };

function percent(bp: number): string {
  return `${(bp / 100).toFixed(2)}%`;
}

function text(v: unknown): string {
  return typeof v === "string" ? v : "";
}

export function TaxConfiguration({ settings, rates, onChanged }: { settings: SettingsMap; rates: TaxRate[]; onChanged: () => void }) {
  const withReauth = useReauth();
  const verified = text(settings.tax_config_status) === "verified";
  const [ticked, setTicked] = useState<string[]>([]);
  const [confirming, setConfirming] = useState(false);
  const [notice, setNotice] = useState<string>();
  const allTicked = TAX_CHECKLIST.every((i) => ticked.includes(i.id));

  return (
    <section aria-labelledby="tax-heading" className="space-y-5 rounded-lg border border-stone-brand bg-white p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="tax-heading" className="text-2xl font-semibold">Tax configuration</h2>
        {verified ? (
          <span className="inline-flex items-center gap-2 rounded-full bg-success px-3 py-1 text-sm font-medium text-white"><CircleCheck aria-hidden className="size-4" /> Verified</span>
        ) : (
          <span className="inline-flex items-center gap-2 rounded-full bg-saffron px-3 py-1 text-sm font-medium text-midnight"><TriangleAlert aria-hidden className="size-4" /> Provisional, not verified</span>
        )}
      </div>

      <Alert tone="info">
        The business may not be VAT-registered. Until the checklist below is true, treat every rate here as a placeholder for testing. This system does not claim KRA eTIMS compliance, and its receipts are receipts, not KRA tax invoices. This page is not tax advice; confirm the details with your accountant.
      </Alert>

      {notice && <Alert tone="success">{notice}</Alert>}

      <div>
        <h3 className="mb-2 text-lg font-semibold">Tax categories now in the system</h3>
        <div className="overflow-x-auto rounded-md border border-stone-brand">
          <table className="w-full min-w-[28rem] text-left">
            <caption className="sr-only">Tax categories</caption>
            <thead className="border-b border-stone-brand bg-stone-brand/30 text-sm">
              <tr>
                <th scope="col" className="px-3 py-2">Name</th>
                <th scope="col" className="px-3 py-2">Treatment</th>
                <th scope="col" className="px-3 py-2 text-right">Rate</th>
                <th scope="col" className="px-3 py-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {rates.map((r) => (
                <tr key={r.id} className="border-b border-stone-brand last:border-0">
                  <td className="px-3 py-2">{r.name}<span className="block font-mono text-xs text-slate-brand/80">{r.code}</span></td>
                  <td className="px-3 py-2">{TREATMENT[r.treatment] ?? r.treatment}</td>
                  <td className="money px-3 py-2 text-right">{percent(r.rate_bp)}</td>
                  <td className="px-3 py-2">{r.active ? "In use" : "Switched off"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-sm text-slate-brand/80">Changing a rate, switching a category on or off, or changing tax-inclusive pricing after verification returns the status to provisional.</p>
      </div>

      {verified ? (
        <Alert tone="success">Verified by {text(settings.tax_config_verified_by) || "an administrator"} on {formatWhen(text(settings.tax_config_verified_at))}.</Alert>
      ) : (
        <>
          <fieldset className="space-y-2">
            <legend className="text-lg font-semibold">Go-live checklist</legend>
            <p className="text-sm text-slate-brand/80">Tick each item only when it is true. The ticks are a reminder on this page and are not saved; the verification itself is recorded with your name and the time.</p>
            {TAX_CHECKLIST.map((item, i) => (
              <label key={item.id} className="target flex items-start gap-3 rounded-md border border-stone-brand bg-white px-3 py-2">
                <input
                  type="checkbox"
                  className="mt-1 size-4"
                  checked={ticked.includes(item.id)}
                  onChange={() => setTicked((cur) => (cur.includes(item.id) ? cur.filter((x) => x !== item.id) : [...cur, item.id]))}
                />
                <span><span className="font-medium">{i + 1}.</span> {item.text}</span>
              </label>
            ))}
          </fieldset>
          <div className="space-y-1">
            <Button disabled={!allTicked} onClick={() => { setNotice(undefined); setConfirming(true); }}>Mark as verified</Button>
            {!allTicked && <p className="text-sm text-slate-brand/80">{TAX_CHECKLIST.length - ticked.length} of {TAX_CHECKLIST.length} items still to tick.</p>}
          </div>
        </>
      )}

      {confirming && (
        <FormDialog
          open
          title="Mark the tax configuration as verified"
          submitLabel="Mark as verified"
          onClose={() => setConfirming(false)}
          onSubmit={async () => {
            await withReauth(() => api("/settings", { method: "PATCH", body: { settings: { tax_config_status: "verified" } } }));
            setNotice("The tax configuration is marked as verified.");
            onChanged();
          }}
        >
          <p>Your name and the time are recorded in the audit log. Only do this after every checklist item is true for this business.</p>
        </FormDialog>
      )}
    </section>
  );
}
