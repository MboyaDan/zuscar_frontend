"use client";

import { Printer, RotateCcw } from "lucide-react";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { PrintDocumentView } from "@/components/print/Documents";
import { Alert, Button, ErrorState, LoadingState, Modal } from "@/components/ui";
import { api, errorMessage, newIdempotencyKey } from "@/lib/api";
import { DOC_LABEL, JOB_STATUS_LABEL, reprintPermission, type DocType, type PrintJob } from "@/lib/print";
import { useSession } from "@/lib/session";

/** Either print a document for the first time (the API returns the existing job if it was already queued) or open a job from the list. */
export type PrintTarget = { kind: "new"; docType: DocType; refId: number } | { kind: "job"; jobId: number };

type Load = { status: "loading" } | { status: "error"; message: string } | { status: "ready"; job: PrintJob; existing: boolean };

/**
 * Mount this only while it is open (the parent renders it conditionally), so each opening starts fresh.
 * The record being printed already exists: this dialog only makes and moves a print job, never the sale or the ticket (AC-03).
 * "Printed" is the person's answer: a browser cannot tell whether paper came out (DG-03).
 */
export function PrintDialog({ target, onClose, onChanged }: { target: PrintTarget; onClose: () => void; onChanged?: () => void }) {
  const { can } = useSession();
  const [load, setLoad] = useState<Load>({ status: "loading" });
  const [asked, setAsked] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string>();
  const [tick, setTick] = useState(0);
  // One key per opening: if this window's first request is sent twice (a re-render, a retry), the API returns the same job.
  const [createKey] = useState(() => newIdempotencyKey());

  useEffect(() => {
    let alive = true;
    const start =
      target.kind === "job"
        ? api<{ job: PrintJob }>(`/print/jobs/${target.jobId}`).then((r) => ({ job: r.job, existing: true }))
        : api<{ job: PrintJob; created: boolean }>("/print/jobs", { method: "POST", idempotencyKey: createKey, body: { doc_type: target.docType, ref_id: target.refId || undefined } }).then((r) => ({ job: r.job, existing: !r.created }));
    start
      .then((r) => alive && setLoad({ status: "ready", job: r.job, existing: r.existing }))
      .catch((err) => alive && setLoad({ status: "error", message: errorMessage(err) }));
    return () => {
      alive = false;
    };
  }, [target, tick, createKey]);

  async function act(name: string, path: string, body?: unknown) {
    setBusy(name);
    setError(undefined);
    try {
      const r = await api<{ job: PrintJob }>(path, { method: "POST", body });
      setLoad({ status: "ready", job: r.job, existing: false });
      setAsked(false);
      onChanged?.();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  function printNow() {
    window.print();
    setAsked(true); // Chrome returns once the print dialog closes; either way the person tells us what happened
  }

  const title = load.status === "ready" ? `${DOC_LABEL[load.job.doc_type]}${load.job.is_reprint ? ` · copy ${load.job.copy_no}` : ""}` : "Print";
  const job = load.status === "ready" ? load.job : null;
  const perm = job ? reprintPermission(job.doc_type) : null;
  const canReprint = perm !== null && can(perm);

  return (
    <Modal open title={title} onClose={onClose}>
      <div className="space-y-4">
        {load.status === "loading" && <LoadingState label="Preparing the print" />}
        {load.status === "error" && <ErrorState message={load.message} onRetry={() => { setLoad({ status: "loading" }); setTick((t) => t + 1); }} />}
        {job && job.document && (
          <>
            {load.status === "ready" && load.existing && target.kind === "new" && job.status !== "queued" && (
              <Alert tone="info">This was already sent to print earlier ({JOB_STATUS_LABEL[job.status].toLowerCase()}). Printing again makes a copy marked REPRINT.</Alert>
            )}
            <div className="max-h-[45vh] overflow-auto rounded-md border border-stone-brand bg-white p-3">
              <PrintDocumentView doc={job.document} job={job} />
            </div>
            {typeof document !== "undefined" && createPortal(<div className="print-only"><PrintDocumentView doc={job.document} job={job} /></div>, document.body)}
            {error && <Alert tone="error">{error}</Alert>}

            {job.status === "queued" && !asked && (
              <Button onClick={printNow} className="w-full"><Printer aria-hidden className="size-4" /> Print</Button>
            )}
            {job.status === "queued" && asked && (
              <div className="space-y-2">
                <p className="font-medium">Did the paper come out?</p>
                <div className="flex flex-wrap gap-2">
                  <Button onClick={() => void act("printed", `/print/jobs/${job.id}/attempts`, { outcome: "printed" })} busy={busy === "printed"}>Yes, it printed</Button>
                  <Button variant="secondary" onClick={() => void act("failed", `/print/jobs/${job.id}/attempts`, { outcome: "failed", note: "reported at the printer" })} busy={busy === "failed"}>No, it did not print</Button>
                  <Button variant="secondary" onClick={() => setAsked(false)}>Print again</Button>
                </div>
              </div>
            )}
            {job.status === "failed" && (
              <div className="space-y-2">
                <Alert tone="error">This did not print. The record is safe; check the printer, then try again.</Alert>
                <Button onClick={() => void act("retry", `/print/jobs/${job.id}/retry`)} busy={busy === "retry"}><RotateCcw aria-hidden className="size-4" /> Try again</Button>
              </div>
            )}
            {(job.status === "printed" || job.status === "reprinted") && (
              <div className="space-y-2">
                <Alert tone="success">{job.status === "reprinted" ? "Copy printed." : "Printed."}</Alert>
                {job.doc_type !== "test_page" && (canReprint ? (
                  <Button variant="secondary" onClick={() => void act("reprint", `/print/jobs/${job.id}/reprint`)} busy={busy === "reprint"}><Printer aria-hidden className="size-4" /> Print another copy (REPRINT)</Button>
                ) : (
                  <p className="text-sm text-slate-brand/80">Another copy needs a manager.</p>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </Modal>
  );
}
