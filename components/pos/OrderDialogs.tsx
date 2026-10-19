"use client";

import { Minus, Plus } from "lucide-react";
import { useState } from "react";
import { FormDialog } from "@/components/FormDialog";
import { TextField } from "@/components/ui";
import { formatKes } from "@/lib/money";
import type { MenuProduct } from "@/lib/types";

/** Choose quantity, modifiers and a note for a product that has modifiers (or when the cashier wants to type a note). */
export function AddItemDialog({ product, onAdd, onClose }: { product: MenuProduct | null; onAdd: (qty: number, modifierIds: number[], note: string) => Promise<void>; onClose: () => void }) {
  const [qty, setQty] = useState(1);
  const [picked, setPicked] = useState<number[]>([]);
  const [note, setNote] = useState("");
  if (!product) return null;
  const extra = product.modifiers.filter((m) => picked.includes(m.id)).reduce((s, m) => s + m.price_delta_cents, 0);
  return (
    <FormDialog open title={product.name} submitLabel={`Add ${qty} · ${formatKes((product.price_cents + extra) * qty)}`} onClose={onClose} onSubmit={() => onAdd(qty, picked, note.trim())}>
      <div className="flex items-center gap-3">
        <span className="text-sm font-medium">Quantity</span>
        <button type="button" aria-label="One fewer" disabled={qty <= 1} onClick={() => setQty((q) => q - 1)} className="target inline-flex items-center justify-center rounded-md border border-stone-brand bg-white disabled:opacity-50"><Minus aria-hidden className="size-4" /></button>
        <span aria-live="polite" className="money w-8 text-center text-lg font-semibold">{qty}</span>
        <button type="button" aria-label="One more" disabled={qty >= 999} onClick={() => setQty((q) => q + 1)} className="target inline-flex items-center justify-center rounded-md border border-stone-brand bg-white disabled:opacity-50"><Plus aria-hidden className="size-4" /></button>
      </div>
      {product.modifiers.length > 0 && (
        <fieldset className="space-y-1">
          <legend className="text-sm font-medium">Options</legend>
          {product.modifiers.map((m) => (
            <label key={m.id} className="target flex items-center gap-3 rounded-md px-1 hover:bg-stone-brand/40">
              <input type="checkbox" className="size-5" checked={picked.includes(m.id)} onChange={(e) => setPicked((p) => (e.target.checked ? [...p, m.id] : p.filter((x) => x !== m.id)))} />
              <span className="flex-1">{m.name}</span>
              <span className="money text-sm text-slate-brand/80">{m.price_delta_cents ? `${m.price_delta_cents > 0 ? "+" : ""}${formatKes(m.price_delta_cents)}` : ""}</span>
            </label>
          ))}
        </fieldset>
      )}
      <TextField label="Note for the kitchen (optional)" autoFocus value={note} maxLength={200} onChange={(e) => setNote(e.target.value)} />
    </FormDialog>
  );
}

/** Used to cancel a line or the whole order: the API requires a reason and records it. */
export function ReasonDialog({ open, title, submitLabel, hint, onSubmit, onClose }: { open: boolean; title: string; submitLabel: string; hint?: string; onSubmit: (reason: string) => Promise<void>; onClose: () => void }) {
  const [reason, setReason] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const clean = reason.trim();
  return (
    <FormDialog
      open={open}
      title={title}
      submitLabel={submitLabel}
      danger
      disabled={clean.length === 0}
      onFieldErrors={setErrors}
      onClose={() => {
        setReason("");
        setErrors({});
        onClose();
      }}
      onSubmit={() => onSubmit(clean)}
    >
      <TextField label="Reason" value={reason} maxLength={200} autoFocus hint={hint} error={errors.reason} onChange={(e) => setReason(e.target.value)} />
    </FormDialog>
  );
}
