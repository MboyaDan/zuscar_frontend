"use client";

import { CircleAlert, CircleCheck, Info, LoaderCircle, X } from "lucide-react";
import { useEffect, useId, useRef } from "react";

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "danger";
  busy?: boolean;
};

const buttonStyles = {
  primary: "bg-teal-brand text-white hover:bg-teal-brand/90",
  secondary: "border border-stone-brand bg-white text-slate-brand hover:bg-stone-brand/40",
  danger: "bg-danger text-white hover:bg-danger/90",
} as const;

export function Button({ variant = "primary", busy, disabled, className = "", children, type = "button", ...rest }: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || busy}
      className={`target inline-flex items-center justify-center gap-2 rounded-md px-4 py-2 font-medium disabled:cursor-not-allowed disabled:opacity-60 ${buttonStyles[variant]} ${className}`}
      {...rest}
    >
      {busy && <LoaderCircle aria-hidden className="size-4 animate-spin" />}
      {children}
    </button>
  );
}

type FieldProps = React.InputHTMLAttributes<HTMLInputElement> & { label: string; error?: string; hint?: string };

export function TextField({ label, error, hint, id, className = "", ...rest }: FieldProps) {
  const auto = useId();
  const fieldId = id ?? auto;
  const describedBy = [error ? `${fieldId}-error` : "", hint ? `${fieldId}-hint` : ""].filter(Boolean).join(" ") || undefined;
  return (
    <div className="space-y-1">
      <label htmlFor={fieldId} className="block text-sm font-medium">{label}</label>
      <input
        id={fieldId}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className={`target w-full rounded-md border bg-white px-3 py-2 ${error ? "border-danger" : "border-stone-brand"} ${className}`}
        {...rest}
      />
      {hint && <p id={`${fieldId}-hint`} className="text-sm text-slate-brand/80">{hint}</p>}
      {error && (
        <p id={`${fieldId}-error`} className="flex items-center gap-1 text-sm text-danger">
          <CircleAlert aria-hidden className="size-4 shrink-0" /> {error}
        </p>
      )}
    </div>
  );
}

const alertStyles = {
  error: { box: "border-danger bg-white text-danger", Icon: CircleAlert, label: "Error" },
  success: { box: "border-success bg-white text-success", Icon: CircleCheck, label: "Done" },
  info: { box: "border-stone-brand bg-white text-slate-brand", Icon: Info, label: "Note" },
} as const;

/** Every state carries an icon and a word, never colour alone (design tokens). */
export function Alert({ tone = "info", children }: { tone?: keyof typeof alertStyles; children: React.ReactNode }) {
  const { box, Icon, label } = alertStyles[tone];
  return (
    <div role={tone === "error" ? "alert" : "status"} className={`flex items-start gap-2 rounded-md border-l-4 border px-3 py-2 text-sm ${box}`}>
      <Icon aria-hidden className="mt-0.5 size-4 shrink-0" />
      <div><span className="sr-only">{label}: </span>{children}</div>
    </div>
  );
}

export function LoadingState({ label = "Loading" }: { label?: string }) {
  return (
    <div role="status" className="flex items-center gap-2 p-6 text-slate-brand/80">
      <LoaderCircle aria-hidden className="size-5 animate-spin" /> {label}…
    </div>
  );
}

export function EmptyState({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed border-stone-brand bg-white p-8 text-center">
      <p className="font-heading text-lg font-semibold">{title}</p>
      {children && <div className="mt-2 text-slate-brand/80">{children}</div>}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="space-y-3 rounded-lg border border-stone-brand bg-white p-6">
      <Alert tone="error">{message}</Alert>
      {onRetry && <Button variant="secondary" onClick={onRetry}>Try again</Button>}
    </div>
  );
}

/** A modal built on the native dialog element: focus is trapped and Escape closes it. */
export function Modal({ open, title, onClose, children }: { open: boolean; title: string; onClose: () => void; children: React.ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onClose={onClose}
      className="m-auto w-[min(32rem,calc(100vw-2rem))] rounded-lg border border-stone-brand bg-cream p-0 text-slate-brand backdrop:bg-midnight/60"
    >
      {open && (
        <div className="p-5">
          <div className="mb-4 flex items-start justify-between gap-4">
            <h2 id={titleId} className="text-xl font-semibold">{title}</h2>
            <button type="button" onClick={onClose} aria-label="Close" className="target -m-2 inline-flex items-center justify-center rounded-md hover:bg-stone-brand/50">
              <X aria-hidden className="size-5" />
            </button>
          </div>
          {children}
        </div>
      )}
    </dialog>
  );
}
