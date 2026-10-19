"use client";

import { Printer } from "lucide-react";
import { useEffect, useState } from "react";
import { SelectField } from "@/components/catalogue/SelectField";
import { PrintDialog, type PrintTarget } from "@/components/print/PrintDialog";
import { Button, EmptyState, ErrorState, LoadingState } from "@/components/ui";
import { api, errorMessage } from "@/lib/api";
import { formatWhen } from "@/lib/format";
import { DOC_LABEL, JOB_STATUS_LABEL, type PrintJob } from "@/lib/print";
import { useSession } from "@/lib/session";

type Load = { status: "loading" } | { status: "error"; message: string } | { status: "ready"; items: PrintJob[]; next: string };

export default function PrintingPage() {
  const { state } = useSession();
  const [load, setLoad] = useState<Load>({ status: "loading" });
  const [status, setStatus] = useState("");
  const [tick, setTick] = useState(0);
  const [more, setMore] = useState(false);
  const [open, setOpen] = useState<PrintTarget | null>(null);

  useEffect(() => {
    let alive = true;
    api<{ jobs: PrintJob[]; next_cursor?: string }>("/print/jobs", { query: { status, limit: 50 } })
      .then((r) => alive && setLoad({ status: "ready", items: r.jobs, next: r.next_cursor ?? "" }))
      .catch((err) => alive && setLoad({ status: "error", message: errorMessage(err) }));
    return () => {
      alive = false;
    };
  }, [status, tick]);

  if (state.status !== "authenticated") return null;

  async function loadMore() {
    if (load.status !== "ready" || !load.next) return;
    setMore(true);
    try {
      const r = await api<{ jobs: PrintJob[]; next_cursor?: string }>("/print/jobs", { query: { status, limit: 50, cursor: load.next } });
      setLoad({ status: "ready", items: [...load.items, ...r.jobs], next: r.next_cursor ?? "" });
    } catch (err) {
      setLoad({ status: "error", message: errorMessage(err) });
    } finally {
      setMore(false);
    }
  }

  const what = (j: PrintJob) => (j.sale_id ? `Sale ${j.sale_id}` : j.ticket_id ? `Ticket ${j.ticket_id}` : j.order_id ? `Order ${j.order_id}` : "-");

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-2xl font-semibold">Printing</h1>
        <div className="flex flex-wrap items-end gap-3">
          <div className="w-56">
            <SelectField label="Show" value={status} onChange={(e) => { setLoad({ status: "loading" }); setStatus(e.target.value); }}>
              <option value="">All prints</option>
              <option value="failed">Did not print</option>
              <option value="queued">Waiting to print</option>
              <option value="printed">Printed</option>
              <option value="reprinted">Copies</option>
            </SelectField>
          </div>
          <Button variant="secondary" onClick={() => setOpen({ kind: "new", docType: "test_page", refId: 0 })}><Printer aria-hidden className="size-4" /> Print a test page</Button>
        </div>
      </div>
      <p className="text-slate-brand/80">Your prints, newest first. Managers see everyone&apos;s. Open one to print it again or to try a failed one again.</p>
      {load.status === "loading" && <LoadingState label="Loading prints" />}
      {load.status === "error" && <ErrorState message={load.message} onRetry={() => setTick((t) => t + 1)} />}
      {load.status === "ready" && (load.items.length === 0 ? <EmptyState title="No prints">Nothing matches yet.</EmptyState> : (
        <>
          <div className="overflow-x-auto rounded-lg border border-stone-brand bg-white">
            <table className="w-full text-left">
              <thead className="border-b border-stone-brand text-sm"><tr><th className="p-3">When</th><th className="p-3">What</th><th className="p-3">Record</th><th className="p-3">By</th><th className="p-3">Status</th><th className="p-3"><span className="sr-only">Open</span></th></tr></thead>
              <tbody>
                {load.items.map((j) => (
                  <tr key={j.id} className="border-b border-stone-brand last:border-0">
                    <td className="p-3">{formatWhen(j.created_at)}</td>
                    <td className="p-3">{DOC_LABEL[j.doc_type]}{j.is_reprint ? ` · REPRINT copy ${j.copy_no}` : ""}</td>
                    <td className="p-3">{what(j)}</td>
                    <td className="p-3">{j.created_by_name}</td>
                    <td className="p-3">{JOB_STATUS_LABEL[j.status]}</td>
                    <td className="p-3"><Button variant="secondary" onClick={() => setOpen({ kind: "job", jobId: j.id })}>Open</Button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {load.next && <Button variant="secondary" onClick={() => void loadMore()} busy={more}>Load more</Button>}
        </>
      ))}
      {open && <PrintDialog key={JSON.stringify(open)} target={open} onClose={() => setOpen(null)} onChanged={() => setTick((t) => t + 1)} />}
    </div>
  );
}
