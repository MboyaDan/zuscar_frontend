import { CircleAlert, CircleCheck } from "lucide-react";

// Server component: asks the backend directly (server to server) and shows the result.
// The full connection indicator with an outage-procedure link arrives in Stage 8.
export const dynamic = "force-dynamic";

async function check(): Promise<boolean> {
  const base = process.env.BACKEND_URL ?? "http://localhost:8080";
  try {
    const res = await fetch(`${base}/healthz`, { cache: "no-store", signal: AbortSignal.timeout(3000) });
    return res.ok;
  } catch {
    return false;
  }
}

export async function BackendStatus() {
  const ok = await check();
  return ok ? (
    <p className="flex items-center gap-2 text-success"><CircleCheck aria-hidden className="size-5" /> Backend connected</p>
  ) : (
    <p className="flex items-center gap-2 text-danger"><CircleAlert aria-hidden className="size-5" /> Backend not reachable. Check that it is running and that BACKEND_URL is correct.</p>
  );
}
