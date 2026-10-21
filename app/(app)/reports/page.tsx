"use client";

import { useEffect, useState } from "react";
import { SelectField } from "@/components/catalogue/SelectField";
import { ReportSheet } from "@/components/reports/ReportSheet";
import { EmptyState, ErrorState, LoadingState, TextField } from "@/components/ui";
import { api, errorMessage } from "@/lib/api";
import { todayYmd } from "@/lib/format";
import { REPORTS, formatCell, printSheet, type Report, type ReportColumn, type ReportSection } from "@/lib/reports";
import { useSession } from "@/lib/session";

type Load = { status: "loading" } | { status: "error"; message: string } | { status: "ready"; report: Report };

function Table({ section }: { section: ReportSection }) {
  const rows = section.rows ?? [];
  const numeric = (c: ReportColumn) => c.kind === "money" || c.kind === "int" || c.kind === "bp";
  return (
    <section className="space-y-2">
      <h2 className="text-lg font-semibold">{section.title}</h2>
      {rows.length === 0 ? (
        <p className="text-sm text-neutral-600">Nothing to show for this.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-neutral-50 text-left text-neutral-600">
              <tr>
                {section.columns.map((c) => (
                  <th key={c.key} className={`whitespace-nowrap px-3 py-2 font-medium ${numeric(c) ? "text-right" : ""}`}>
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={i} className="border-t border-neutral-100">
                  {section.columns.map((c, j) => (
                    <td key={c.key} className={`px-3 py-2 ${numeric(c) ? "whitespace-nowrap text-right tabular-nums" : ""}`}>
                      {formatCell(c, row[j])}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
            {section.totals && (
              <tfoot>
                <tr className="border-t border-neutral-300 bg-neutral-50 font-semibold">
                  {section.columns.map((c, j) => (
                    <td key={c.key} className={`px-3 py-2 ${numeric(c) ? "whitespace-nowrap text-right tabular-nums" : ""}`}>
                      {formatCell(c, section.totals?.[j])}
                    </td>
                  ))}
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}
    </section>
  );
}

export default function ReportsPage() {
  const { state, can } = useSession();
  const allowed = can("reports.view");
  const canExport = can("reports.export");
  const [name, setName] = useState("sales");
  const [from, setFrom] = useState(() => todayYmd(-6));
  const [to, setTo] = useState(() => todayYmd());
  const [day, setDay] = useState(() => todayYmd());
  const [load, setLoad] = useState<Load>({ status: "loading" });
  const [tick, setTick] = useState(0);
  const choice = REPORTS.find((r) => r.name === name) ?? REPORTS[0]!;
  const single = choice.single === true;
  const ready = single ? day !== "" : !choice.ranged || (from !== "" && to !== "" && from <= to);

  useEffect(() => {
    if (!allowed || !ready) return;
    let alive = true;
    api<{ report: Report }>(`/reports/${name}`, { query: single ? { from: day } : choice.ranged ? { from, to } : undefined })
      .then((r) => alive && setLoad({ status: "ready", report: r.report }))
      .catch((err) => alive && setLoad({ status: "error", message: errorMessage(err) }));
    return () => {
      alive = false;
    };
  }, [allowed, ready, name, from, to, day, single, choice.ranged, tick]);

  if (state.status !== "authenticated") return null;
  const roles = state.me.roles;
  // A cashier reads only their own sales and collections (the API enforces it; this just hides what would be refused).
  const cashierOnly = roles.includes("cashier") && !roles.some((r) => ["super_admin", "business_manager", "accountant_auditor"].includes(r));
  if (!allowed) return <EmptyState title="No access">Your role does not include reports.</EmptyState>;

  const csv = `/api/v1/reports/${name}?format=csv${single ? `&from=${day}` : choice.ranged ? `&from=${from}&to=${to}` : ""}`;

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-semibold">Reports</h1>
      <div className="flex flex-wrap items-end gap-3">
        <div className="w-full sm:w-64">
          <SelectField
            label="Report"
            value={name}
            onChange={(e) => {
              setLoad({ status: "loading" });
              setName(e.target.value);
            }}
          >
            {REPORTS.filter((r) => r.own || !cashierOnly).map((r) => (
              <option key={r.name} value={r.name}>
                {r.label}
              </option>
            ))}
          </SelectField>
        </div>
        {single && (
          <div className="w-full sm:w-44">
            <TextField label="Day" type="date" value={day} max={todayYmd()} onChange={(e) => { setLoad({ status: "loading" }); setDay(e.target.value); }} />
          </div>
        )}
        {choice.ranged && !single && (
          <>
            <div className="w-[calc(50%-0.375rem)] sm:w-44">
              <TextField label="From" type="date" value={from} onChange={(e) => { setLoad({ status: "loading" }); setFrom(e.target.value); }} />
            </div>
            <div className="w-[calc(50%-0.375rem)] sm:w-44">
              <TextField label="To" type="date" value={to} onChange={(e) => { setLoad({ status: "loading" }); setTo(e.target.value); }} />
            </div>
          </>
        )}
        {ready && load.status === "ready" && load.report.name === name && (
          <button type="button" onClick={printSheet} className="inline-flex min-h-11 items-center rounded-lg border border-neutral-300 bg-white px-4 text-sm font-medium hover:bg-neutral-50">
            Print
          </button>
        )}
        {canExport && (
          <a href={csv} download className="inline-flex min-h-11 items-center rounded-lg border border-neutral-300 bg-white px-4 text-sm font-medium hover:bg-neutral-50">
            Download CSV
          </a>
        )}
      </div>
      <p className="text-sm text-neutral-600">{choice.description}</p>

      {!ready && <p className="text-sm text-neutral-600">Pick both dates, with the first on or before the last.</p>}
      {ready && load.status === "loading" && <LoadingState label="Loading the report" />}
      {ready && load.status === "error" && <ErrorState message={load.message} onRetry={() => { setLoad({ status: "loading" }); setTick((t) => t + 1); }} />}
      {ready && load.status === "ready" && load.report.name === name && (
        <div className="space-y-6">
          <ReportSheet report={load.report} printedBy={state.me.user.display_name} signLines={single} />
          {load.report.sections.map((s) => (
            <Table key={s.key} section={s} />
          ))}
          {(load.report.notes ?? []).length > 0 && (
            <ul className="list-disc space-y-1 pl-5 text-sm text-neutral-600">
              {(load.report.notes ?? []).map((n, i) => (
                <li key={i}>{n}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
