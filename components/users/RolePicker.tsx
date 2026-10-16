"use client";

import type { AssignableRole } from "@/lib/types";

/** Checkboxes for the roles the signed-in user may grant. Roles the user already holds but may not grant are kept. */
export function RolePicker({ roles, value, onChange, locked = [] }: { roles: AssignableRole[]; value: string[]; onChange: (v: string[]) => void; locked?: string[] }) {
  const toggle = (code: string) => onChange(value.includes(code) ? value.filter((c) => c !== code) : [...value, code]);
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium">Roles</legend>
      {roles.length === 0 && <p className="text-sm text-slate-brand/80">There are no roles you can assign.</p>}
      {roles.map((r) => (
        <label key={r.code} className="target flex items-start gap-3 rounded-md border border-stone-brand bg-white px-3 py-2">
          <input type="checkbox" className="mt-1 size-4" checked={value.includes(r.code)} onChange={() => toggle(r.code)} />
          <span>
            <span className="block font-medium">{r.name}</span>
            {r.description && <span className="block text-sm text-slate-brand/80">{r.description}</span>}
          </span>
        </label>
      ))}
      {locked.length > 0 && <p className="text-sm text-slate-brand/80">Also has: {locked.join(", ")} (you cannot grant that role, so it stays as it is).</p>}
    </fieldset>
  );
}
