"use client";

import { useState } from "react";
import { FormDialog } from "@/components/FormDialog";
import { RolePicker } from "@/components/users/RolePicker";
import { Alert, Button, TextField } from "@/components/ui";
import { api } from "@/lib/api";
import { generatePassword, roleLabel } from "@/lib/format";
import { useReauth } from "@/lib/reauth";
import type { AssignableRole, UserView } from "@/lib/types";

type Common = { onClose: () => void; onDone: (message: string) => void };

function PasswordField({ value, onChange, error, username }: { value: string; onChange: (v: string) => void; error?: string; username?: string }) {
  const [shown, setShown] = useState(false);
  return (
    <div className="space-y-2">
      <TextField
        label="Temporary password"
        type={shown ? "text" : "password"}
        autoComplete="off"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        hint={`At least 12 characters${username ? ", not containing the username" : ""}. The person must change it when they first sign in. Give it to them in person.`}
        error={error}
        className="font-mono"
        required
      />
      <div className="flex gap-2">
        <Button variant="secondary" onClick={() => { onChange(generatePassword()); setShown(true); }}>Generate one</Button>
        <Button variant="secondary" onClick={() => setShown((s) => !s)}>{shown ? "Hide" : "Show"}</Button>
      </div>
    </div>
  );
}

export function CreateUserDialog({ roles, onClose, onDone }: Common & { roles: AssignableRole[] }) {
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  return (
    <FormDialog
      open
      title="Add a user"
      submitLabel="Add user"
      onClose={onClose}
      onFieldErrors={setErrors}
      disabled={!username.trim() || !displayName.trim() || !password}
      onSubmit={async () => {
        const body = { username: username.trim(), display_name: displayName.trim(), password, roles: picked };
        await api("/users", { method: "POST", body });
        onDone(`${username.trim()} was added. They must choose a new password at their first sign-in.`);
      }}
    >
      <TextField label="Username" autoCapitalize="none" spellCheck={false} value={username} onChange={(e) => setUsername(e.target.value)} hint="3 to 40 characters: lower-case letters, digits, dot, dash or underscore. It cannot be changed later." error={errors.username} required autoFocus />
      <TextField label="Full name" value={displayName} onChange={(e) => setDisplayName(e.target.value)} error={errors.display_name} required />
      <PasswordField value={password} onChange={setPassword} error={errors.password} username={username} />
      <RolePicker roles={roles} value={picked} onChange={setPicked} />
    </FormDialog>
  );
}

export function EditUserDialog({ user, onClose, onDone }: Common & { user: UserView }) {
  const [name, setName] = useState(user.display_name);
  const [errors, setErrors] = useState<Record<string, string>>({});
  return (
    <FormDialog
      open
      title={`Edit ${user.username}`}
      submitLabel="Save"
      onClose={onClose}
      onFieldErrors={setErrors}
      disabled={!name.trim() || name.trim() === user.display_name}
      onSubmit={async () => {
        await api(`/users/${user.id}`, { method: "PATCH", body: { display_name: name.trim() } });
        onDone("Name saved.");
      }}
    >
      <TextField label="Full name" value={name} onChange={(e) => setName(e.target.value)} error={errors.display_name} required autoFocus />
      <p className="text-sm text-slate-brand/80">The username <strong>{user.username}</strong> cannot be changed. If it is wrong, add a new user and deactivate this one.</p>
    </FormDialog>
  );
}

export function RolesDialog({ user, roles, onClose, onDone }: Common & { user: UserView; roles: AssignableRole[] }) {
  const withReauth = useReauth();
  const assignable = new Set(roles.map((r) => r.code));
  const locked = user.roles.filter((c) => !assignable.has(c));
  const [picked, setPicked] = useState(user.roles.filter((c) => assignable.has(c)));
  const changed = picked.length !== user.roles.length - locked.length || picked.some((c) => !user.roles.includes(c));
  return (
    <FormDialog
      open
      title={`Roles for ${user.username}`}
      submitLabel="Save roles"
      onClose={onClose}
      disabled={!changed}
      onSubmit={async () => {
        await withReauth(() => api(`/users/${user.id}/roles`, { method: "PUT", body: { roles: [...picked, ...locked] } }));
        onDone("Roles saved. They apply to the person's next request.");
      }}
    >
      <RolePicker roles={roles} value={picked} onChange={setPicked} locked={locked.map((c) => roleLabel(c))} />
    </FormDialog>
  );
}

export function ResetPasswordDialog({ user, onClose, onDone }: Common & { user: UserView }) {
  const withReauth = useReauth();
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  return (
    <FormDialog
      open
      title={`Reset password for ${user.username}`}
      submitLabel="Reset password"
      danger
      onClose={onClose}
      onFieldErrors={setErrors}
      disabled={!password}
      onSubmit={async () => {
        await withReauth(() => api(`/users/${user.id}/reset-password`, { method: "POST", body: { new_password: password } }));
        onDone(`Password reset. ${user.username} is signed out everywhere and must choose a new password at the next sign-in.`);
      }}
    >
      <PasswordField value={password} onChange={setPassword} error={errors.new_password} username={user.username} />
    </FormDialog>
  );
}

export function PinDialog({ user, onClose, onDone }: Common & { user: UserView }) {
  const [pin, setPin] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  return (
    <FormDialog
      open
      title={`PIN for ${user.username}`}
      submitLabel="Save PIN"
      onClose={onClose}
      onFieldErrors={setErrors}
      disabled={!/^[0-9]{4,8}$/.test(pin)}
      onSubmit={async () => {
        await api(`/users/${user.id}/pin`, { method: "PUT", body: { pin } });
        onDone("PIN saved.");
      }}
    >
      <TextField label="PIN" inputMode="numeric" autoComplete="off" value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 8))} hint="4 to 8 digits. Only floor roles (waiter, cashier, bartender and similar) can use a PIN to take over a terminal. Avoid obvious numbers such as 1234." error={errors.pin} className="font-mono" required autoFocus />
    </FormDialog>
  );
}

export function StatusDialog({ user, activate, onClose, onDone }: Common & { user: UserView; activate: boolean }) {
  const withReauth = useReauth();
  const [reason, setReason] = useState("");
  return (
    <FormDialog
      open
      title={activate ? `Reactivate ${user.username}` : `Deactivate ${user.username}`}
      submitLabel={activate ? "Reactivate" : "Deactivate"}
      danger={!activate}
      onClose={onClose}
      onSubmit={async () => {
        if (activate) await withReauth(() => api(`/users/${user.id}/reactivate`, { method: "POST" }));
        else await withReauth(() => api(`/users/${user.id}/deactivate`, { method: "POST", body: { reason: reason.trim() } }));
        onDone(activate ? `${user.username} can sign in again.` : `${user.username} is deactivated and signed out. Their history is kept.`);
      }}
    >
      {activate ? (
        <p>{user.display_name} will be able to sign in again with their current password and roles.</p>
      ) : (
        <>
          <p>{user.display_name} will be signed out at once and cannot sign in. Their sales and history stay in the records. You can reactivate them later.</p>
          <TextField label="Reason (optional)" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} hint="Recorded in the audit log." />
        </>
      )}
    </FormDialog>
  );
}

export function DeleteDialog({ user, onClose, onDone }: Common & { user: UserView }) {
  const withReauth = useReauth();
  const [typed, setTyped] = useState("");
  return (
    <FormDialog
      open
      title={`Delete ${user.username}`}
      submitLabel="Delete permanently"
      danger
      onClose={onClose}
      disabled={typed !== user.username}
      onSubmit={async () => {
        await withReauth(() => api(`/users/${user.id}`, { method: "DELETE" }));
        onDone(`${user.username} was deleted.`);
      }}
    >
      <Alert tone="error">Deleting cannot be undone. It only works for an account that has never signed in or done anything. Anyone with history must be deactivated instead.</Alert>
      <TextField label={`Type ${user.username} to confirm`} autoCapitalize="none" spellCheck={false} value={typed} onChange={(e) => setTyped(e.target.value)} autoFocus />
    </FormDialog>
  );
}
