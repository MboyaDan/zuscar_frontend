"use client";

import { useState } from "react";
import { FormDialog } from "@/components/FormDialog";
import { Alert, TextField } from "@/components/ui";
import { api } from "@/lib/api";
import { useReauth } from "@/lib/reauth";
import type { Role } from "@/lib/types";

type Common = { onClose: () => void; onDone: (message: string) => void };

const CODE_PATTERN = /^[a-z][a-z0-9_]{1,39}$/;

export function CreateRoleDialog({ onClose, onDone }: Common) {
  const withReauth = useReauth();
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const codeOk = CODE_PATTERN.test(code);
  return (
    <FormDialog
      open
      title="Add a role"
      submitLabel="Add role"
      onClose={onClose}
      onFieldErrors={setErrors}
      disabled={!codeOk || !name.trim()}
      onSubmit={async () => {
        await withReauth(() => api("/roles", { method: "POST", body: { code, name: name.trim(), description: description.trim() } }));
        onDone(`The role ${name.trim()} was added with no permissions. Choose what it may do, then save.`);
      }}
    >
      <TextField label="Role name" value={name} onChange={(e) => setName(e.target.value)} error={errors.name} required autoFocus />
      <TextField
        label="Code"
        autoCapitalize="none"
        spellCheck={false}
        value={code}
        onChange={(e) => setCode(e.target.value)}
        hint="2 to 40 characters: lower-case letters, digits and underscore, starting with a letter. It cannot be changed later."
        error={errors.code ?? (code && !codeOk ? "Use lower-case letters, digits and underscore, starting with a letter." : undefined)}
        className="font-mono"
        required
      />
      <TextField label="What is this role for? (optional)" value={description} onChange={(e) => setDescription(e.target.value)} error={errors.description} />
    </FormDialog>
  );
}

export function EditRoleDialog({ role, onClose, onDone }: Common & { role: Role }) {
  const withReauth = useReauth();
  const [name, setName] = useState(role.name);
  const [description, setDescription] = useState(role.description);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const unchanged = name.trim() === role.name && description.trim() === role.description;
  return (
    <FormDialog
      open
      title={`Edit ${role.name}`}
      submitLabel="Save"
      onClose={onClose}
      onFieldErrors={setErrors}
      disabled={!name.trim() || unchanged}
      onSubmit={async () => {
        await withReauth(() => api(`/roles/${role.id}`, { method: "PATCH", body: { name: name.trim(), description: description.trim() } }));
        onDone(`${name.trim()} was updated.`);
      }}
    >
      <TextField label="Role name" value={name} onChange={(e) => setName(e.target.value)} error={errors.name} required autoFocus />
      <TextField label="Description" value={description} onChange={(e) => setDescription(e.target.value)} error={errors.description} />
    </FormDialog>
  );
}

export function DeleteRoleDialog({ role, onClose, onDone }: Common & { role: Role }) {
  const withReauth = useReauth();
  const [typed, setTyped] = useState("");
  return (
    <FormDialog
      open
      title={`Delete ${role.name}`}
      submitLabel="Delete role"
      danger
      onClose={onClose}
      disabled={typed !== role.code}
      onSubmit={async () => {
        await withReauth(() => api(`/roles/${role.id}`, { method: "DELETE" }));
        onDone(`${role.name} was deleted.`);
      }}
    >
      <Alert tone="error">Deleting a role cannot be undone. It only works while nobody holds the role.</Alert>
      <TextField label={`Type ${role.code} to confirm`} autoCapitalize="none" spellCheck={false} value={typed} onChange={(e) => setTyped(e.target.value)} className="font-mono" autoFocus />
    </FormDialog>
  );
}
