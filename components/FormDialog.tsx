"use client";

import { useState } from "react";
import { Alert, Button, Modal } from "@/components/ui";
import { ApiError, errorMessage } from "@/lib/api";

type Props = {
  open: boolean;
  title: string;
  submitLabel: string;
  danger?: boolean;
  /** Return normally to close the dialog. Throw to keep it open: an ApiError is shown, field errors go to onFieldErrors. */
  onSubmit: () => Promise<void>;
  onClose: () => void;
  onFieldErrors?: (errors: Record<string, string>) => void;
  disabled?: boolean;
  children: React.ReactNode;
};

/** One shape for every "fill in, confirm, see the error" dialog, so busy, error and cancel behave the same everywhere. */
export function FormDialog({ open, title, submitLabel, danger, onSubmit, onClose, onFieldErrors, disabled, children }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(undefined);
    onFieldErrors?.({});
    try {
      await onSubmit();
      onClose();
    } catch (err) {
      if (err instanceof ApiError && err.fields.length && onFieldErrors) {
        onFieldErrors(Object.fromEntries(err.fields.map((f) => [f.field, f.message])));
      } else {
        setError(errorMessage(err));
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} title={title} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4" noValidate>
        {children}
        {error && <Alert tone="error">{error}</Alert>}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" variant={danger ? "danger" : "primary"} busy={busy} disabled={disabled}>{submitLabel}</Button>
        </div>
      </form>
    </Modal>
  );
}
