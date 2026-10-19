"use client";

import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { ReconcileDialog } from "@/components/shifts/ShiftDialogs";
import { ShiftSummaryView } from "@/components/shifts/ShiftSummaryView";
import { Alert, Button, EmptyState, ErrorState, LoadingState } from "@/components/ui";
import { ApiError, api, errorMessage } from "@/lib/api";
import { useSession } from "@/lib/session";
import type { ShiftSummary } from "@/lib/types";

type Load = { status: "loading" } | { status: "error"; message: string } | { status: "ready"; summary: ShiftSummary };

export default function ShiftDetailPage() {
  const { state, can } = useSession();
  const params = useParams<{ shiftId: string }>();
  const id = Number(params.shiftId);
  const [load, setLoad] = useState<Load>({ status: "loading" });
  const [tick, setTick] = useState(0);
  const [checking, setChecking] = useState(false);
  const [notice, setNotice] = useState<string>();
  const allowed = can("shifts.manage");

  useEffect(() => {
    if (!allowed || !Number.isInteger(id) || id <= 0) return;
    let alive = true;
    api<{ summary: ShiftSummary }>(`/shifts/${id}/summary`)
      .then((r) => alive && setLoad({ status: "ready", summary: r.summary }))
      .catch((err) => alive && setLoad({ status: "error", message: err instanceof ApiError && err.status === 404 ? "That shift does not exist, or it is not yours to open." : errorMessage(err) }));
    return () => {
      alive = false;
    };
  }, [allowed, id, tick]);

  if (state.status !== "authenticated") return null;
  if (!allowed) return <EmptyState title="No access">Your role does not include viewing shifts.</EmptyState>;
  if (load.status === "loading") return <LoadingState label="Loading the shift" />;
  if (load.status === "error") return <ErrorState message={load.message} onRetry={() => setTick((t) => t + 1)} />;

  const { summary } = load;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Link href="/shifts" className="target inline-flex items-center gap-1 rounded-md px-2 hover:bg-stone-brand/50"><ArrowLeft aria-hidden className="size-4" /> Shifts</Link>
        <h1 className="text-2xl font-semibold">Shift {summary.shift.id}</h1>
        {summary.shift.status === "closed" && can("payments.reconcile") && <Button onClick={() => setChecking(true)}>Mark as checked</Button>}
      </div>
      {notice && <Alert tone="success">{notice}</Alert>}
      <ShiftSummaryView summary={summary} />
      <ReconcileDialog shiftId={id} open={checking} onClose={() => setChecking(false)} onDone={() => { setNotice("Shift marked as checked."); setTick((t) => t + 1); }} />
    </div>
  );
}
