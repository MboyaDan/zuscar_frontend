"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Logo } from "@/components/Logo";
import { Alert, Button, LoadingState, TextField } from "@/components/ui";
import { api, ApiError, errorMessage } from "@/lib/api";
import { useSession } from "@/lib/session";

const MIN = 12;

export default function ChangePasswordPage() {
  const { state, refresh } = useSession();
  const router = useRouter();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [again, setAgain] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (state.status === "anonymous") router.replace("/login?next=/change-password");
  }, [state, router]);

  if (state.status === "loading" || state.status === "anonymous") return <LoadingState label="Checking your session" />;
  if (state.status === "error") return <Alert tone="error">{state.message}</Alert>;
  const forced = state.me.must_change_password;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const problems: Record<string, string> = {};
    if (next.length < MIN) problems.new_password = `Use at least ${MIN} characters.`;
    if (again !== next) problems.again = "The two new passwords do not match.";
    setFieldErrors(problems);
    setError(undefined);
    if (Object.keys(problems).length) return;
    setBusy(true);
    try {
      await api("/auth/change-password", { method: "POST", body: { current_password: current, new_password: next } });
      await refresh();
      router.replace("/dashboard");
    } catch (err) {
      if (err instanceof ApiError && err.fields.length) {
        setFieldErrors(Object.fromEntries(err.fields.map((f) => [f.field, f.message])));
      } else if (err instanceof ApiError && err.code === "invalid_credentials") {
        setFieldErrors({ current_password: "That is not your current password." });
      } else {
        setError(errorMessage(err));
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <main id="main" className="mx-auto flex min-h-[70vh] max-w-md flex-col justify-center px-6 py-10">
      <Logo variant="horizontal" className="mx-auto mb-8 h-14 w-auto" />
      <h1 className="mb-2 text-center text-2xl font-semibold">Change your password</h1>
      {forced && <div className="mb-4"><Alert tone="info">You need to choose a new password before you can continue.</Alert></div>}
      <form onSubmit={submit} className="space-y-4" noValidate>
        <TextField label="Current password" type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} error={fieldErrors.current_password} required autoFocus />
        <TextField label="New password" type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} hint={`At least ${MIN} characters. Do not reuse your username.`} error={fieldErrors.new_password} required />
        <TextField label="New password again" type="password" autoComplete="new-password" value={again} onChange={(e) => setAgain(e.target.value)} error={fieldErrors.again} required />
        {error && <Alert tone="error">{error}</Alert>}
        <div className="flex items-center gap-3">
          <Button type="submit" busy={busy} disabled={!current || !next || !again}>Change password</Button>
          {!forced && <Link href="/dashboard" className="target inline-flex items-center text-teal-brand underline">Cancel</Link>}
        </div>
      </form>
    </main>
  );
}
