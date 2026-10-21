"use client";

import { createPortal } from "react-dom";
import { formatDay, formatWhen } from "@/lib/format";
import { formatCell, type Report, type ReportColumn } from "@/lib/reports";

const numeric = (c: ReportColumn) => c.kind === "money" || c.kind === "int" || c.kind === "bp";

/**
 * The paper version of a report: plain black on white, A4, with the tables in the same order as on the screen.
 * It is mounted in the page all the time but only shows when printing (the print-only rule in globals.css).
 * A closing summary also gets lines to sign.
 */
export function ReportSheet({ report, printedBy, signLines }: { report: Report; printedBy: string; signLines?: boolean }) {
  if (typeof document === "undefined") return null;
  const period = report.from && report.to ? (report.from === report.to ? formatDay(report.from) : `${formatDay(report.from)} to ${formatDay(report.to)}`) : "";
  return createPortal(
    <div className="print-only">
      <div className="report-sheet">
        <h1>Zuscar · {report.title}</h1>
        <p className="meta">
          {period && <>{period} · </>}Printed {formatWhen(new Date().toISOString())} by {printedBy}
        </p>
        {report.sections.map((s) => (
          <section key={s.key}>
            <h2>{s.title}</h2>
            {(s.rows ?? []).length === 0 ? (
              <p className="none">Nothing for this.</p>
            ) : (
              <table>
                <thead>
                  <tr>
                    {s.columns.map((c) => (
                      <th key={c.key} className={numeric(c) ? "num" : ""}>{c.label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(s.rows ?? []).map((row, i) => (
                    <tr key={i}>
                      {s.columns.map((c, j) => (
                        <td key={c.key} className={numeric(c) ? "num" : ""}>{formatCell(c, row[j])}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
                {s.totals && (
                  <tfoot>
                    <tr>
                      {s.columns.map((c, j) => (
                        <td key={c.key} className={numeric(c) ? "num" : ""}>{formatCell(c, s.totals?.[j])}</td>
                      ))}
                    </tr>
                  </tfoot>
                )}
              </table>
            )}
          </section>
        ))}
        {(report.notes ?? []).length > 0 && (
          <ul className="notes">
            {(report.notes ?? []).map((n, i) => (
              <li key={i}>{n}</li>
            ))}
          </ul>
        )}
        {signLines && (
          <div className="sign">
            <p>Closed by: ______________________________</p>
            <p>Checked by: ______________________________</p>
            <p>Signature and date: ______________________</p>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
