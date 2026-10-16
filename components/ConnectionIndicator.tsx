"use client";

import { Wifi, WifiOff } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

type Status = "checking" | "online" | "offline";

async function probe(): Promise<Status> {
  if (!navigator.onLine) return "offline";
  try {
    const res = await fetch("/api/v1/health", { cache: "no-store", signal: AbortSignal.timeout(5000) });
    return res.ok ? "online" : "offline";
  } catch {
    return "offline";
  }
}

// Checks the backend through this app's own origin, so it reflects what the signed-in user can actually reach.
export function ConnectionIndicator() {
  const [status, setStatus] = useState<Status>("checking");

  useEffect(() => {
    let alive = true;
    const run = () => void probe().then((s) => alive && setStatus(s));
    run();
    const timer = setInterval(run, 30_000);
    window.addEventListener("online", run);
    window.addEventListener("offline", run);
    return () => {
      alive = false;
      clearInterval(timer);
      window.removeEventListener("online", run);
      window.removeEventListener("offline", run);
    };
  }, []);

  if (status === "offline") {
    return (
      <Link href="/help/outage" className="target inline-flex items-center gap-2 rounded-md bg-saffron px-3 py-1 text-sm font-medium text-midnight">
        <WifiOff aria-hidden className="size-4" /> Offline. What to do
      </Link>
    );
  }
  return (
    <span role="status" className="inline-flex items-center gap-2 text-sm text-cream">
      <Wifi aria-hidden className="size-4" /> {status === "checking" ? "Checking connection" : "Connected"}
    </span>
  );
}
