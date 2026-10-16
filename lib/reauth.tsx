"use client";

import { createContext, useCallback, useContext, useRef, useState } from "react";
import { Alert, Button, Modal, TextField } from "@/components/ui";
import { api, ApiError, errorMessage } from "@/lib/api";

type Runner = <T>(action: () => Promise<T>) => Promise<T>;

const ReauthContext = createContext<Runner | null>(null);

/**
 * Sensitive admin actions need the password entered in the last 5 minutes (S-16). Wrap the call:
 * `await withReauth(() => api(...))`. If the API answers reauth_required, a password prompt opens, the password is
 * confirmed, and the call is retried once. Cancelling rejects with the original error.
 */
export function ReauthProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const waiter = useRef<{ resolve: () => void; reject: (e: unknown) => void } | null>(null);

  const ask = useCallback(
    () =>
      new Promise<void>((resolve, reject) => {
        waiter.current = { resolve, reject };
        setPassword("");
        setError(undefined);
        setOpen(true);
      }),
    [],
  );

  const run = useCallback<Runner>(
    async (action) => {
      try {
        return await action();
      } catch (err) {
        if (!(err instanceof ApiError) || err.code !== "reauth_required") throw err;
        try {
          await ask();
        } catch {
          throw err;
        }
        return action();
      }
    },
    [ask],
  );

  async function confirm(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(undefined);
    try {
      await api("/auth/reauth", { method: "POST", body: { password } });
      setOpen(false);
      waiter.current?.resolve();
    } catch (err) {
      setError(err instanceof ApiError && err.code === "invalid_credentials" ? "That password is not right." : errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  function cancel() {
    setOpen(false);
    waiter.current?.reject(new Error("cancelled"));
    waiter.current = null;
  }

  return (
    <ReauthContext.Provider value={run}>
      {children}
      <Modal open={open} title="Confirm your password" onClose={cancel}>
        <form onSubmit={confirm} className="space-y-4">
          <p>This change needs your password again. It stays valid for 5 minutes.</p>
          <TextField label="Password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required autoFocus />
          {error && <Alert tone="error">{error}</Alert>}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={cancel}>Cancel</Button>
            <Button type="submit" busy={busy} disabled={!password}>Confirm</Button>
          </div>
        </form>
      </Modal>
    </ReauthContext.Provider>
  );
}

export function useReauth(): Runner {
  const ctx = useContext(ReauthContext);
  if (!ctx) throw new Error("useReauth must be used inside ReauthProvider");
  return ctx;
}
