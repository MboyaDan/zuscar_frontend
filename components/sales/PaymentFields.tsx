"use client";

import { SelectField } from "@/components/catalogue/SelectField";
import { TextField } from "@/components/ui";
import { METHODS } from "@/lib/payments";
import type { PaymentMethod } from "@/lib/types";

export type PaymentDraft = { key: number; method: PaymentMethod; amount: string; reference: string };

/** Method, amount and (for everything but cash) the code the payer sent. Shared by the pay screen and the add-payment form. */
export function PaymentFields({ draft, onChange, errors }: { draft: PaymentDraft; onChange: (d: PaymentDraft) => void; errors?: { amount?: string; reference?: string } }) {
  const needsRef = METHODS.find((m) => m.value === draft.method)?.needsReference ?? false;
  return (
    <div className="grid grid-cols-2 gap-3">
      <SelectField label="Method" value={draft.method} onChange={(e) => onChange({ ...draft, method: e.target.value as PaymentMethod, reference: e.target.value === "cash" ? "" : draft.reference })}>
        {METHODS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
      </SelectField>
      <TextField label="Amount (KES)" inputMode="decimal" value={draft.amount} error={errors?.amount} onChange={(e) => onChange({ ...draft, amount: e.target.value })} />
      {needsRef && (
        <div className="col-span-2"><TextField label="Code or reference" value={draft.reference} maxLength={64} error={errors?.reference} hint="Typed from the payer's message or slip. Counts as paid only after a manager confirms it." onChange={(e) => onChange({ ...draft, reference: e.target.value })} /></div>
      )}
    </div>
  );
}
