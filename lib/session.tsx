"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { api, ApiError, UNAUTHENTICATED_EVENT } from "@/lib/api";
import { clearPosCache } from "@/lib/pos-cache";
import type { LoginResult, Me } from "@/lib/types";

type State =
  | { status: "loading" }
  | { status: "anonymous" }
  | { status: "error"; message: string }
  | { status: "authenticated"; me: Me };

type SessionValue = {
  state: State;
  /** True when the signed-in user holds the permission. The API still enforces every rule. */
  can: (permission: string) => boolean;
  refresh: () => Promise<void>;
  signIn: (username: string, password: string) => Promise<LoginResult>;
  signOut: () => Promise<void>;
};

const SessionContext = createContext<SessionValue | null>(null);

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<State>({ status: "loading" });

  const refresh = useCallback(async () => {
    try {
      const me = await api<Me>("/auth/me");
      setState({ status: "authenticated", me });
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) setState({ status: "anonymous" });
      else setState({ status: "error", message: err instanceof ApiError ? err.message : "Could not load your session." });
    }
  }, []);

  useEffect(() => {
    let alive = true;
    api<Me>("/auth/me")
      .then((me) => alive && setState({ status: "authenticated", me }))
      .catch((err) => {
        if (!alive) return;
        if (err instanceof ApiError && err.status === 401) setState({ status: "anonymous" });
        else setState({ status: "error", message: err instanceof ApiError ? err.message : "Could not load your session." });
      });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    const onUnauthenticated = () => {
      clearPosCache();
      setState({ status: "anonymous" });
    };
    window.addEventListener(UNAUTHENTICATED_EVENT, onUnauthenticated);
    return () => window.removeEventListener(UNAUTHENTICATED_EVENT, onUnauthenticated);
  }, []);

  const signIn = useCallback(
    async (username: string, password: string) => {
      const result = await api<LoginResult>("/auth/login", { method: "POST", body: { username, password } });
      clearPosCache();
      await refresh();
      return result;
    },
    [refresh],
  );

  const signOut = useCallback(async () => {
    try {
      await api("/auth/logout", { method: "POST" });
    } catch {
      // the server session may already be gone; the browser is signed out either way
    }
    clearPosCache();
    setState({ status: "anonymous" });
  }, []);

  const value = useMemo<SessionValue>(() => {
    const perms = state.status === "authenticated" ? new Set(state.me.permissions) : new Set<string>();
    return { state, can: (p) => perms.has(p), refresh, signIn, signOut };
  }, [state, refresh, signIn, signOut]);

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionValue {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession must be used inside SessionProvider");
  return ctx;
}

/** Only follow a "next" address that stays inside this app. */
export function safeNext(next: string | null | undefined): string {
  if (next && next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\")) return next;
  return "/dashboard";
}
