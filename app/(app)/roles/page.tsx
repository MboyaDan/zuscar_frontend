"use client";

import { Lock, Pencil, Plus, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { CreateRoleDialog, DeleteRoleDialog, EditRoleDialog } from "@/components/roles/RoleDialogs";
import { Alert, Button, EmptyState, ErrorState, LoadingState } from "@/components/ui";
import { api, errorMessage } from "@/lib/api";
import { useReauth } from "@/lib/reauth";
import { useSession } from "@/lib/session";
import type { AffectedUser, PermissionItem, Role } from "@/lib/types";

type Load = { status: "loading" } | { status: "error"; message: string } | { status: "ready"; roles: Role[]; permissions: PermissionItem[] };
type Dialog = { kind: "create" } | { kind: "edit" | "delete"; role: Role };

/** "users.update" is shown under "users". Keys without a dot go under "general". */
function groupOf(key: string): string {
  const i = key.indexOf(".");
  return i === -1 ? "general" : key.slice(0, i);
}

function PermissionEditor({ role, permissions, canAssign, onSaved }: { role: Role; permissions: PermissionItem[]; canAssign: boolean; onSaved: (affected: AffectedUser[]) => void }) {
  const withReauth = useReauth();
  const [picked, setPicked] = useState<string[]>(role.permissions);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  const editable = canAssign && !role.is_protected;
  const changed = picked.length !== role.permissions.length || picked.some((k) => !role.permissions.includes(k));
  const groups = useMemo(() => {
    const map = new Map<string, PermissionItem[]>();
    for (const p of permissions) map.set(groupOf(p.key), [...(map.get(groupOf(p.key)) ?? []), p]);
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [permissions]);

  async function save() {
    setBusy(true);
    setError(undefined);
    try {
      const r = await withReauth(() => api<{ role: Role; affected_users: AffectedUser[] }>(`/roles/${role.id}/permissions`, { method: "PUT", body: { permissions: picked } }));
      onSaved(r.affected_users ?? []);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      {role.is_protected && <Alert tone="info">This role is protected. Its permissions cannot be changed here.</Alert>}
      {!role.is_protected && !canAssign && <Alert tone="info">You can see what this role may do, but your role cannot change permissions.</Alert>}
      {groups.map(([group, items]) => (
        <fieldset key={group} className="space-y-1">
          <legend className="font-heading font-semibold capitalize">{group.replaceAll("_", " ")}</legend>
          {items.map((p) => {
            const locked = p.is_protected;
            return (
              <label key={p.key} className={`target flex items-start gap-3 rounded-md border border-stone-brand bg-white px-3 py-2 ${editable && !locked ? "" : "opacity-80"}`}>
                <input
                  type="checkbox"
                  className="mt-1 size-4"
                  checked={picked.includes(p.key)}
                  disabled={!editable || locked}
                  onChange={() => setPicked((cur) => (cur.includes(p.key) ? cur.filter((k) => k !== p.key) : [...cur, p.key]))}
                />
                <span>
                  <span className="block font-mono text-sm">{p.key}</span>
                  {p.description && <span className="block text-sm text-slate-brand/80">{p.description}</span>}
                  {locked && <span className="flex items-center gap-1 text-sm text-slate-brand/80"><Lock aria-hidden className="size-3" /> Only the Super Admin role can hold this.</span>}
                </span>
              </label>
            );
          })}
        </fieldset>
      ))}
      {error && <Alert tone="error">{error}</Alert>}
      {editable && (
        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={save} busy={busy} disabled={!changed}>Save permissions</Button>
          {changed && <Button variant="secondary" onClick={() => setPicked(role.permissions)}>Undo changes</Button>}
        </div>
      )}
    </div>
  );
}

export default function RolesPage() {
  const { state, can } = useSession();
  const [load, setLoad] = useState<Load>({ status: "loading" });
  const [tick, setTick] = useState(0);
  const [selectedId, setSelectedId] = useState<number>();
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [notice, setNotice] = useState<string>();

  const allowed = can("roles.manage");

  useEffect(() => {
    if (!allowed) return;
    let alive = true;
    Promise.all([api<{ items: Role[] }>("/roles"), api<{ items: PermissionItem[] }>("/permissions")])
      .then(([r, p]) => alive && setLoad({ status: "ready", roles: r.items, permissions: p.items }))
      .catch((err) => alive && setLoad({ status: "error", message: errorMessage(err) }));
    return () => {
      alive = false;
    };
  }, [allowed, tick]);

  if (state.status !== "authenticated") return null;
  if (!allowed) return <EmptyState title="No access">Your role does not include managing roles.</EmptyState>;

  function reload() {
    setLoad({ status: "loading" });
    setTick((t) => t + 1);
  }
  const done = (message: string) => {
    setNotice(message);
    reload();
  };
  const close = () => setDialog(null);

  const roles = load.status === "ready" ? load.roles : [];
  const selected = roles.find((r) => r.id === selectedId) ?? roles[0];

  return (
    <div className="max-w-6xl space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-semibold">Roles and permissions</h1>
        <Button onClick={() => { setNotice(undefined); setDialog({ kind: "create" }); }}><Plus aria-hidden className="size-4" /> Add role</Button>
      </div>
      <p className="text-slate-brand/80">A permission change applies to everyone holding the role the next time they do anything. The server enforces it; hiding a button here is only a convenience.</p>
      {notice && <Alert tone="success">{notice}</Alert>}

      {load.status === "loading" && <LoadingState label="Loading roles" />}
      {load.status === "error" && <ErrorState message={load.message} onRetry={reload} />}
      {load.status === "ready" && roles.length === 0 && <EmptyState title="No roles yet">Add the first role with the button above.</EmptyState>}
      {load.status === "ready" && selected && (
        <div className="grid gap-4 md:grid-cols-[16rem_1fr]">
          <nav aria-label="Roles" className="space-y-1">
            {roles.map((r) => (
              <button
                key={r.id}
                type="button"
                aria-current={r.id === selected.id ? "true" : undefined}
                onClick={() => { setNotice(undefined); setSelectedId(r.id); }}
                className={`target w-full rounded-md border px-3 py-2 text-left ${r.id === selected.id ? "border-midnight bg-midnight text-cream" : "border-stone-brand bg-white hover:bg-stone-brand/40"}`}
              >
                <span className="flex items-center gap-2 font-medium">{r.name}{r.is_protected && <Lock aria-label="Protected" className="size-3.5" />}</span>
                <span className="block text-sm opacity-80">{r.user_count} {r.user_count === 1 ? "person" : "people"}</span>
              </button>
            ))}
          </nav>

          <section aria-labelledby="role-heading" className="space-y-4 rounded-lg border border-stone-brand bg-white p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 id="role-heading" className="text-2xl font-semibold">{selected.name}</h2>
                <p className="font-mono text-sm text-slate-brand/80">{selected.code}</p>
                {selected.description && <p className="mt-1">{selected.description}</p>}
              </div>
              {!selected.is_protected && (
                <div className="flex gap-2">
                  <Button variant="secondary" onClick={() => { setNotice(undefined); setDialog({ kind: "edit", role: selected }); }}><Pencil aria-hidden className="size-4" /> Edit</Button>
                  <Button variant="secondary" disabled={selected.user_count > 0} title={selected.user_count > 0 ? "Someone still holds this role" : undefined} onClick={() => { setNotice(undefined); setDialog({ kind: "delete", role: selected }); }}><Trash2 aria-hidden className="size-4" /> Delete</Button>
                </div>
              )}
            </div>
            {selected.user_count > 0 && !selected.is_protected && <p className="text-sm text-slate-brand/80">A role can be deleted only when nobody holds it.</p>}
            <PermissionEditor
              key={`${selected.id}:${selected.permissions.join(",")}`}
              role={selected}
              permissions={load.permissions}
              canAssign={can("permissions.assign")}
              onSaved={(affected) => done(affected.length ? `Saved. This affects: ${affected.map((u) => u.username).join(", ")}.` : "Saved. Nobody holds this role yet.")}
            />
          </section>
        </div>
      )}

      {dialog?.kind === "create" && <CreateRoleDialog onClose={close} onDone={done} />}
      {dialog?.kind === "edit" && <EditRoleDialog role={dialog.role} onClose={close} onDone={done} />}
      {dialog?.kind === "delete" && <DeleteRoleDialog role={dialog.role} onClose={close} onDone={done} />}
    </div>
  );
}
