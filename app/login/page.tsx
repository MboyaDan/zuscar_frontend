"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { ConnectionIndicator } from "@/components/ConnectionIndicator";
import { Logo } from "@/components/Logo";
import { Alert, Button, LoadingState, TextField } from "@/components/ui";
import { ApiError, errorMessage } from "@/lib/api";
import { safeNext, useSession } from "@/lib/session";

function LoginForm() {
  const { state, signIn } = useSession();
  const router = useRouter();
  const next = safeNext(useSearchParams().get("next"));
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  // Already signed in (the session cookie is valid): go where they were headed.
  useEffect(() => {
    if (state.status === "authenticated") router.replace(state.me.must_change_password ? "/change-password" : next);
  }, [state, router, next]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(undefined);
    try {
      const result = await signIn(username.trim(), password);
      router.replace(result.must_change_password ? "/change-password" : next);
    } catch (err) {
      setPassword("");
      if (err instanceof ApiError && err.code === "csrf_failed") setError("The sign-in could not be verified. Reload the page and try again.");
      else setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  if (state.status === "loading" || state.status === "authenticated") return <LoadingState label="Checking your session" />;

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <TextField label="Username" autoComplete="username" autoCapitalize="none" autoCorrect="off" spellCheck={false} value={username} onChange={(e) => setUsername(e.target.value)} required autoFocus />
      <TextField label="Password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
      {error && <Alert tone="error">{error}</Alert>}
      <Button type="submit" busy={busy} disabled={!username.trim() || !password} className="w-full">Sign in</Button>
    </form>
  );
}

export default function LoginPage() {
  return (
    <main id="main" className="mx-auto flex min-h-[70vh] max-w-md flex-col justify-center px-6 py-10">
      <Logo variant="horizontal" className="mx-auto mb-8 h-14 w-auto" />
      <h1 className="mb-6 text-center text-2xl font-semibold">Sign in</h1>
      <Suspense fallback={<LoadingState />}>
        <LoginForm />
      </Suspense>
      <div className="mt-8 flex justify-center rounded-md bg-midnight px-3 py-2"><ConnectionIndicator /></div>
    </main>
  );
}
