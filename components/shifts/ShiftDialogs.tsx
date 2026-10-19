"use client";

import { useRef, useState } from "react";
import { SelectField } from "@/components/catalogue/SelectField";
import { FormDialog } from "@/components/FormDialog";
import { TextField } from "@/components/ui";
import { ApiError, api, newIdempotencyKey } from "@/lib/api";
import { formatKes, parseKes } from "@/lib/money";
import { MOVEMENT_LABEL } from "@/lib/shifts";
import type { CashMovement, ShiftSummary } from "@/lib/types";

/** One Idempotency-Key per exact request body: a retry of the same body reuses it, an edited body gets a new one. */
function useKeyFor() {
  const last = useRef<{ payload: string; key: string } | null>(null);
  return (body: unknown) => {
    const payload = JSON.stringify(body);
    if (last.current?.payload !== payload) last.current = { payload, key: newIdempotencyKey() };
    return last.current.key;
  };
}

export function MovementDialog({ shiftId, open, onClose, onDone }: { shiftId: number; open: boolean; onClose: () => void; onDone: () => void }) {
  const [kind, setKind] = useState<CashMovement["kind"]>("expense");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const keyFor = useKeyFor();
  const reset = () => {
    setAmount("");
    setReason("");
    setErrors({});
  };
  return (
    <FormDialog
      open={open}
      title="Record cash movement"
      submitLabel="Record"
      onFieldErrors={setErrors}
      onClose={() => {
        reset();
        onClose();
      }}
      onSubmit={async () => {
        const cents = parseKes(amount);
        const local: Record<string, string> = {};
        if (cents === null || cents <= 0) local.amount_cents = "Enter an amount above 0, like 500 or 500.50";
        if (!reason.trim()) local.reason = "Say what it was for";
        if (local.amount_cents || local.reason) {
          setErrors(local);
          throw new ApiError(400, "validation_failed", "Check the highlighted fields.", []);
        }
        const body = { kind, amount_cents: cents, reason: reason.trim() };
        await api(`/shifts/${shiftId}/cash-movements`, { method: "POST", body, idempotencyKey: keyFor(body) });
        reset();
        onDone();
      }}
    >
      <SelectField label="What happened" value={kind} onChange={(e) => setKind(e.target.value as CashMovement["kind"])}>
        {(Object.keys(MOVEMENT_LABEL) as CashMovement["kind"][]).map((k) => <option key={k} value={k}>{MOVEMENT_LABEL[k]}</option>)}
      </SelectField>
      <TextField label="Amount (KES)" inputMode="decimal" value={amount} error={errors.amount_cents} onChange={(e) => setAmount(e.target.value)} />
      <TextField label="Reason" value={reason} maxLength={200} error={errors.reason} onChange={(e) => setReason(e.target.value)} />
    </FormDialog>
  );
}

export function CloseShiftDialog({ summary, open, onClose, onClosed }: { summary: ShiftSummary; open: boolean; onClose: () => void; onClosed: (s: ShiftSummary) => void }) {
  const [declared, setDeclared] = useState("");
  const [notes, setNotes] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const keyFor = useKeyFor();
  const cents = parseKes(declared);
  const diff = cents === null ? null : cents - summary.cash.expected_cash_cents;
  return (
    <FormDialog
      open={open}
      title="Close your shift"
      submitLabel="Close shift"
      disabled={cents === null}
      onFieldErrors={setErrors}
      onClose={onClose}
      onSubmit={async () => {
        if (cents === null) return;
        const body = { declared_cash_cents: cents, notes: notes.trim() };
        const res = await api<ShiftSummary>(`/shifts/${summary.shift.id}/close`, { method: "POST", body, idempotencyKey: keyFor(body) });
        onClosed(res);
      }}
    >
      <p>Count the cash in the drawer, then type the total. A manager will see any difference.</p>
      <TextField label="Cash counted (KES)" inputMode="decimal" autoFocus value={declared} error={errors.declared_cash_cents ?? (declared && cents === null ? "Enter an amount like 12500 or 12500.50" : undefined)} onChange={(e) => setDeclared(e.target.value)} />
      {diff !== null && <p aria-live="polite" className="text-sm">Expected {formatKes(summary.cash.expected_cash_cents)}. {diff === 0 ? "This matches." : diff < 0 ? `This is ${formatKes(-diff)} short.` : `This is ${formatKes(diff)} over.`}</p>}
      <TextField label="Note (optional)" value={notes} maxLength={500} error={errors.notes} onChange={(e) => setNotes(e.target.value)} />
    </FormDialog>
  );
}

export function ReconcileDialog({ shiftId, open, onClose, onDone }: { shiftId: number; open: boolean; onClose: () => void; onDone: () => void }) {
  const [note, setNote] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const keyFor = useKeyFor();
  return (
    <FormDialog
      open={open}
      title="Mark this shift as checked"
      submitLabel="Mark as checked"
      onFieldErrors={setErrors}
      onClose={onClose}
      onSubmit={async () => {
        const body = { note: note.trim() };
        await api(`/shifts/${shiftId}/reconcile`, { method: "POST", body, idempotencyKey: keyFor(body) });
        onDone();
      }}
    >
      <p>Do this after you have counted the drawer against the figures and dealt with any difference.</p>
      <TextField label="Note (optional)" value={note} maxLength={500} error={errors.note} onChange={(e) => setNote(e.target.value)} />
    </FormDialog>
  );
}
