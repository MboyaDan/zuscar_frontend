"use client";

import { CircleAlert } from "lucide-react";
import { useId } from "react";

type Props = React.SelectHTMLAttributes<HTMLSelectElement> & { label: string; error?: string; hint?: string };

/** A labelled drop-down matching TextField. Give it a first option with value "" so nothing is chosen for the person. */
export function SelectField({ label, error, hint, id, className = "", children, ...rest }: Props) {
  const auto = useId();
  const fieldId = id ?? auto;
  const describedBy = [error ? `${fieldId}-error` : "", hint ? `${fieldId}-hint` : ""].filter(Boolean).join(" ") || undefined;
  return (
    <div className="space-y-1">
      <label htmlFor={fieldId} className="block text-sm font-medium">{label}</label>
      <select
        id={fieldId}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className={`target w-full rounded-md border bg-white px-3 py-2 ${error ? "border-danger" : "border-stone-brand"} ${className}`}
        {...rest}
      >
        {children}
      </select>
      {hint && <p id={`${fieldId}-hint`} className="text-sm text-slate-brand/80">{hint}</p>}
      {error && (
        <p id={`${fieldId}-error`} className="flex items-center gap-1 text-sm text-danger">
          <CircleAlert aria-hidden className="size-4 shrink-0" /> {error}
        </p>
      )}
    </div>
  );
}
