"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { CloseShiftDialog, MovementDialog } from "@/components/shifts/ShiftDialogs";
import { ShiftSummaryView } from "@/components/shifts/ShiftSummaryView";
import { Alert, Button, EmptyState, ErrorState, LoadingState, TextField } from "@/components/ui";
import { ApiError, api, errorMessage, newIdempotencyKey } from "@/lib/api";
import { formatKes, parseKes } from "@/lib/money";
import { useSession } from "@/lib/session";
import type { ShiftSummary } from "@/lib/types";

type Load = { status: "loading" } | { status: "error"; message: string } | { status: "ready"; summary: ShiftSummary | null };

export default function ShiftPage() {
  const { state, can } = useSession();
  const [load, setLoad] = useState<Load>({ status: "loading" });
  const [tick, setTick] = useState(0);
  const [notice, setNotice] = useState<{ tone: "success" | "error"; text: string }>();
  const [closedNow, setClosedNow] = useState<ShiftSummary | null>(null);
  const [moving, setMoving] = useState(false);
  const [closing, setClosing] = useState(false);
  const [float, setFloat] = useState("");
  const [floatErr, setFloatErr] = useState<string>();
  const [opening, setOpening] = useState(false);
  const attempt = useRef<{ payload: string; key: string } | null>(null);
  const allowed = can("shifts.manage");

  useEffect(() => {
    if (!allowed) return;
    let alive = true;
    api<{ summary: ShiftSummary | null }>("/shifts/current")
      .then((r) => alive && setLoad({ status: "ready", summary: r.summary }))
      .catch((err) => alive && setLoad({ status: "error", message: errorMessage(err) }));
    return () => {
      alive = false;
    };
  }, [allowed, tick]);

  if (state.status !== "authenticated") return null;
  if (!allowed) return <EmptyState title="No access">Your role does not include working a till shift.</EmptyState>;

  const reload = () => setTick((t) => t + 1);

  async function open() {
    const cents = parseKes(float || "0");
    if (cents === null) {
      setFloatErr("Enter an amount like 5000 or 5000.50, or 0");
      return;
    }
    setFloatErr(undefined);
    const body = { opening_float_cents: cents };
    const payload = JSON.stringify(body);
    if (attempt.current?.payload !== payload) attempt.current = { payload, key: newIdempotencyKey() };
    setOpening(true);
    setNotice(undefined);
    try {
      await api("/shifts/open", { method: "POST", body, idempotencyKey: attempt.current.key });
      attempt.current = null;
      setClosedNow(null);
      setFloat("");
      setNotice({ tone: "success", text: "Shift opened. You can take cash now." });
      reload();
    } catch (err) {
      setNotice({ tone: "error", text: err instanceof ApiError && err.code === "shift_already_open" ? "You already have an open shift." : errorMessage(err) });
      if (err instanceof ApiError && err.code === "shift_already_open") reload();
    } finally {
      setOpening(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">My shift</h1>
        {can("shifts.close") && <Link href="/shifts" className="target inline-flex items-center underline">All shifts</Link>}
      </div>
      {notice && <Alert tone={notice.tone}>{notice.text}</Alert>}

      {closedNow && (
        <>
          <Alert tone="success">Shift closed. Hand the drawer to your manager.</Alert>
          <ShiftSummaryView summary={closedNow} />
        </>
      )}

      {!closedNow && load.status === "loading" && <LoadingState label="Loading your shift" />}
      {!closedNow && load.status === "error" && <ErrorState message={load.message} onRetry={reload} />}

      {!closedNow && load.status === "ready" && load.summary === null && (
        <section aria-labelledby="open-h" className="max-w-md space-y-3 rounded-lg border border-stone-brand bg-white p-4">
          <h2 id="open-h" className="text-lg font-semibold">Open your shift</h2>
          <p>You need an open shift before you can take cash. Count the float in the drawer and type it in.</p>
          <TextField label="Opening float (KES)" inputMode="decimal" value={float} error={floatErr} hint="The cash already in the drawer. Type 0 if there is none." onChange={(e) => setFloat(e.target.value)} />
          <Button onClick={() => void open()} busy={opening}>Open shift</Button>
        </section>
      )}

      {!closedNow && load.status === "ready" && load.summary && (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <p className="text-lg">Expected in the drawer now: <span className="money font-semibold">{formatKes(load.summary.cash.expected_cash_cents)}</span></p>
            <Button variant="secondary" onClick={() => setMoving(true)}>Record cash movement</Button>
            {can("shifts.close") && <Button onClick={() => setClosing(true)}>Close shift</Button>}
          </div>
          <ShiftSummaryView summary={load.summary} />
          <MovementDialog shiftId={load.summary.shift.id} open={moving} onClose={() => setMoving(false)} onDone={() => { setNotice({ tone: "success", text: "Cash movement recorded." }); reload(); }} />
          <CloseShiftDialog
            summary={load.summary}
            open={closing}
            onClose={() => setClosing(false)}
            onClosed={(s) => {
              setClosedNow(s);
              setNotice(undefined);
              reload();
            }}
          />
        </>
      )}
    </div>
  );
}
