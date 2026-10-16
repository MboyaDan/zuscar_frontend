"use client";

import { Ban, CircleCheck, EllipsisVertical, Plus, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { CreateUserDialog, DeleteDialog, EditUserDialog, PinDialog, ResetPasswordDialog, RolesDialog, StatusDialog } from "@/components/users/UserDialogs";
import { Alert, Button, EmptyState, ErrorState, LoadingState, TextField } from "@/components/ui";
import { api, errorMessage } from "@/lib/api";
import { formatWhen, roleLabel } from "@/lib/format";
import { useSession } from "@/lib/session";
import type { AssignableRole, UserList, UserView } from "@/lib/types";

type Dialog =
  | { kind: "create" }
  | { kind: "edit" | "roles" | "reset" | "pin" | "deactivate" | "reactivate" | "delete"; user: UserView };

type Load = { status: "loading" } | { status: "error"; message: string } | { status: "ready"; items: UserView[]; next: string };

function StatusBadge({ status }: { status: UserView["status"] }) {
  return status === "active" ? (
    <span className="inline-flex items-center gap-1 text-success"><CircleCheck aria-hidden className="size-4" /> Active</span>
  ) : (
    <span className="inline-flex items-center gap-1 text-danger"><Ban aria-hidden className="size-4" /> Deactivated</span>
  );
}

function RowMenu({ user, self, onPick }: { user: UserView; self: boolean; onPick: (k: Exclude<Dialog["kind"], "create">) => void }) {
  const { can } = useSession();
  const items: { kind: Exclude<Dialog["kind"], "create">; label: string }[] = [{ kind: "edit", label: "Edit name" }];
  if (!self) items.push({ kind: "roles", label: "Change roles" }, { kind: "reset", label: "Reset password" });
  items.push({ kind: "pin", label: "Set PIN" });
  if (!self && user.status === "active" && can("users.deactivate")) items.push({ kind: "deactivate", label: "Deactivate" });
  if (!self && user.status === "inactive") items.push({ kind: "reactivate", label: "Reactivate" });
  if (!self && can("users.delete")) items.push({ kind: "delete", label: "Delete" });
  return (
    <details className="relative">
      <summary aria-label={`Actions for ${user.username}`} className="target inline-flex cursor-pointer list-none items-center justify-center rounded-md hover:bg-stone-brand/60">
        <EllipsisVertical aria-hidden className="size-5" />
      </summary>
      <ul className="absolute right-0 z-10 mt-1 w-48 rounded-md border border-stone-brand bg-white p-1 shadow-lg">
        {items.map((i) => (
          <li key={i.kind}>
            <button
              type="button"
              className={`target w-full rounded-md px-3 py-2 text-left hover:bg-stone-brand/50 ${i.kind === "delete" || i.kind === "deactivate" ? "text-danger" : ""}`}
              onClick={(e) => {
                e.currentTarget.closest("details")?.removeAttribute("open");
                onPick(i.kind);
              }}
            >
              {i.label}
            </button>
          </li>
        ))}
      </ul>
    </details>
  );
}

export default function UsersPage() {
  const { state, can } = useSession();
  const [load, setLoad] = useState<Load>({ status: "loading" });
  const [roles, setRoles] = useState<AssignableRole[]>([]);
  const [filters, setFilters] = useState({ q: "", status: "" });
  const [search, setSearch] = useState("");
  const [tick, setTick] = useState(0);
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [notice, setNotice] = useState<string>();
  const [more, setMore] = useState<{ busy: boolean; error?: string }>({ busy: false });

  const allowed = can("users.update");

  useEffect(() => {
    if (!allowed) return;
    let alive = true;
    api<UserList>("/users", { query: { q: filters.q, status: filters.status, limit: 50 } })
      .then((r) => alive && setLoad({ status: "ready", items: r.items, next: r.next_cursor }))
      .catch((err) => alive && setLoad({ status: "error", message: errorMessage(err) }));
    return () => {
      alive = false;
    };
  }, [allowed, filters, tick]);

  useEffect(() => {
    if (!allowed) return;
    let alive = true;
    api<{ items: AssignableRole[] }>("/roles/assignable")
      .then((r) => alive && setRoles(r.items))
      .catch(() => undefined); // the role picker then shows "no roles you can assign"; the list still works
    return () => {
      alive = false;
    };
  }, [allowed]);

  const names = useMemo(() => new Map(roles.map((r) => [r.code, r.name])), [roles]);

  if (state.status !== "authenticated") return null;
  if (!allowed) return <EmptyState title="No access">Your role does not include managing users.</EmptyState>;
  const myId = state.me.user.id;

  function reload() {
    setLoad({ status: "loading" });
    setTick((t) => t + 1);
  }

  function applyFilters(e: React.FormEvent) {
    e.preventDefault();
    setLoad({ status: "loading" });
    setFilters((f) => ({ ...f, q: search.trim() }));
  }

  async function loadMore() {
    if (load.status !== "ready" || !load.next) return;
    setMore({ busy: true });
    try {
      const r = await api<UserList>("/users", { query: { q: filters.q, status: filters.status, limit: 50, cursor: load.next } });
      setLoad({ status: "ready", items: [...load.items, ...r.items], next: r.next_cursor });
      setMore({ busy: false });
    } catch (err) {
      setMore({ busy: false, error: errorMessage(err) });
    }
  }

  const done = (message: string) => {
    setNotice(message);
    reload();
  };
  const close = () => setDialog(null);

  return (
    <div className="max-w-5xl space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-semibold">Users</h1>
        {can("users.create") && (
          <Button onClick={() => { setNotice(undefined); setDialog({ kind: "create" }); }}><Plus aria-hidden className="size-4" /> Add user</Button>
        )}
      </div>

      <form onSubmit={applyFilters} className="flex flex-wrap items-end gap-3" role="search">
        <div className="min-w-56 flex-1"><TextField label="Search by name or username" value={search} onChange={(e) => setSearch(e.target.value)} /></div>
        <div className="space-y-1">
          <label htmlFor="status" className="block text-sm font-medium">Status</label>
          <select id="status" className="target rounded-md border border-stone-brand bg-white px-3 py-2" value={filters.status} onChange={(e) => { setLoad({ status: "loading" }); setFilters((f) => ({ ...f, status: e.target.value })); }}>
            <option value="">All</option>
            <option value="active">Active</option>
            <option value="inactive">Deactivated</option>
          </select>
        </div>
        <Button type="submit" variant="secondary"><Search aria-hidden className="size-4" /> Search</Button>
      </form>

      {notice && <Alert tone="success">{notice}</Alert>}

      {load.status === "loading" && <LoadingState label="Loading users" />}
      {load.status === "error" && <ErrorState message={load.message} onRetry={reload} />}
      {load.status === "ready" && load.items.length === 0 && (
        <EmptyState title="No users found">{filters.q || filters.status ? "Try a different search or filter." : "Add the first user with the button above."}</EmptyState>
      )}
      {load.status === "ready" && load.items.length > 0 && (
        <>
          <div className="overflow-x-auto rounded-lg border border-stone-brand bg-white">
            <table className="w-full min-w-[40rem] text-left">
              <caption className="sr-only">Users</caption>
              <thead className="border-b border-stone-brand bg-stone-brand/30 text-sm">
                <tr>
                  <th scope="col" className="px-4 py-2">Person</th>
                  <th scope="col" className="px-4 py-2">Roles</th>
                  <th scope="col" className="px-4 py-2">Status</th>
                  <th scope="col" className="px-4 py-2">Last sign-in</th>
                  <th scope="col" className="px-4 py-2"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {load.items.map((u) => (
                  <tr key={u.id} className="border-b border-stone-brand last:border-0">
                    <td className="px-4 py-3">
                      <span className="block font-medium">{u.display_name}{u.id === myId && <span className="ml-2 text-sm font-normal text-slate-brand/80">(you)</span>}</span>
                      <span className="block font-mono text-sm text-slate-brand/80">{u.username}</span>
                    </td>
                    <td className="px-4 py-3">{u.roles.length ? u.roles.map((r) => roleLabel(r, names)).join(", ") : <span className="text-slate-brand/80">None</span>}</td>
                    <td className="px-4 py-3">
                      <StatusBadge status={u.status} />
                      {u.must_change_password && <span className="block text-sm text-slate-brand/80">Must change password</span>}
                    </td>
                    <td className="px-4 py-3 text-sm">{formatWhen(u.last_login_at)}</td>
                    <td className="px-4 py-3 text-right"><RowMenu user={u} self={u.id === myId} onPick={(kind) => { setNotice(undefined); setDialog({ kind, user: u }); }} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {load.next && (
            <div className="space-y-2">
              <Button variant="secondary" busy={more.busy} onClick={loadMore}>Show more</Button>
              {more.error && <Alert tone="error">{more.error}</Alert>}
            </div>
          )}
        </>
      )}

      {dialog?.kind === "create" && <CreateUserDialog roles={roles} onClose={close} onDone={done} />}
      {dialog?.kind === "edit" && <EditUserDialog user={dialog.user} onClose={close} onDone={done} />}
      {dialog?.kind === "roles" && <RolesDialog user={dialog.user} roles={roles} onClose={close} onDone={done} />}
      {dialog?.kind === "reset" && <ResetPasswordDialog user={dialog.user} onClose={close} onDone={done} />}
      {dialog?.kind === "pin" && <PinDialog user={dialog.user} onClose={close} onDone={done} />}
      {dialog?.kind === "deactivate" && <StatusDialog user={dialog.user} activate={false} onClose={close} onDone={done} />}
      {dialog?.kind === "reactivate" && <StatusDialog user={dialog.user} activate onClose={close} onDone={done} />}
      {dialog?.kind === "delete" && <DeleteDialog user={dialog.user} onClose={close} onDone={done} />}
    </div>
  );
}
