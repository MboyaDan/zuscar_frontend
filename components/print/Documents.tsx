import { formatKes } from "@/lib/money";
import { methodLabel } from "@/lib/payments";
import { RECEIPT_LOGO, reprintBanner, stamp, type BillDoc, type DocLine, type PrintDocument, type PrintJob, type ReceiptDoc, type TestDoc, type TicketDoc } from "@/lib/print";

type Marker = Pick<PrintJob, "is_reprint" | "copy_no">;

function Banner({ job }: { job: Marker }) {
  const text = reprintBanner(job);
  return text ? <p className="banner" data-testid="reprint-banner">{text}</p> : null;
}

function Logo() {
  // eslint-disable-next-line @next/next/no-img-element -- print only: the 1-bit receipt logo must reach the printer as supplied
  return <img src={RECEIPT_LOGO.src} width={RECEIPT_LOGO.width} height={RECEIPT_LOGO.height} alt="" />;
}

function Head({ b }: { b: ReceiptDoc["business"] }) {
  return (
    <div className="center">
      <Logo />
      <p className="strong">{b.name}</p>
      {b.address && <p>{b.address}</p>}
      {b.phone && <p>{b.phone}</p>}
    </div>
  );
}

function Lines({ lines }: { lines: DocLine[] }) {
  return (
    <div>
      {lines.map((l, i) => (
        <div key={i}>
          <div className="row"><span>{l.qty} × {l.name}</span><span>{formatKes(l.line_total_cents)}</span></div>
          {l.modifiers && <p className="small">  {l.modifiers}</p>}
          {l.discount_cents > 0 && <p className="small">  Discount -{formatKes(l.discount_cents)}{l.discount_reason ? ` (${l.discount_reason})` : ""}</p>}
        </div>
      ))}
    </div>
  );
}

function Receipt({ d, job }: { d: ReceiptDoc; job: Marker }) {
  return (
    <div className="print-doc">
      <Head b={d.business} />
      <Banner job={job} />
      <p className="center strong">RECEIPT {d.receipt_no}</p>
      <div className="rule" />
      <p>{stamp(d.created_at, d.business.timezone)}</p>
      <p>Cashier: {d.cashier_name}</p>
      {d.order_no ? <p>Order: {d.order_no}</p> : null}
      <div className="rule" />
      <Lines lines={d.lines} />
      <div className="rule" />
      {d.discount_cents > 0 && <div className="row"><span>Discounts</span><span>-{formatKes(d.discount_cents)}</span></div>}
      <div className="row big"><span>TOTAL</span><span>{formatKes(d.total_cents)}</span></div>
      <div className="row small"><span>{d.tax_inclusive ? "Includes tax of" : "Tax"}</span><span>{formatKes(d.tax_cents)}</span></div>
      <div className="rule" />
      {d.payments.length === 0 ? <p>No payment yet</p> : d.payments.map((p, i) => (
        <div key={i}>
          <div className="row"><span>{methodLabel(p.method)}</span><span>{formatKes(p.amount_cents)}</span></div>
          {p.reference && <p className="small">  Ref {p.reference}</p>}
          {p.status === "pending_confirmation" && <p className="small">  Waiting for confirmation</p>}
        </div>
      ))}
      <div className="row"><span>Paid</span><span>{formatKes(d.paid_cents)}</span></div>
      {d.pending_cents > 0 && <div className="row"><span>Waiting for confirmation</span><span>{formatKes(d.pending_cents)}</span></div>}
      {d.balance_cents > 0 && <div className="row strong"><span>BALANCE DUE</span><span>{formatKes(d.balance_cents)}</span></div>}
      {d.tax_status === "provisional_unverified" && (<><div className="rule" /><p className="center small">Tax setup not verified</p></>)}
      {d.business.footer && (<><div className="rule" /><p className="center">{d.business.footer}</p></>)}
    </div>
  );
}

function Ticket({ d, job }: { d: TicketDoc; job: Marker }) {
  const where = d.order_type === "takeaway" ? "TAKEAWAY" : d.table_label.toUpperCase();
  return (
    <div className="print-doc">
      <p className="kitchen-title">KITCHEN</p>
      <Banner job={job} />
      <p className="center big">TICKET {d.ticket_no}</p>
      <p className="center big">{where}</p>
      {d.kind === "update" && <p className="banner">CHANGE TO ORDER</p>}
      <p className="center">Order {d.order_no} · {stamp(d.created_at, d.timezone)}</p>
      <p className="center">By {d.created_by}</p>
      <div className="rule" />
      {d.lines.map((l, i) => (
        <div key={i} className="kitchen-line">
          <p className={l.change_type === "cancel" ? "cancelled" : ""}>
            {l.change_type === "cancel" ? "CANCEL " : l.change_type === "modify" ? "CHANGE " : ""}{l.qty} × {l.name}
          </p>
          {l.modifiers && <p className="small strong">  {l.modifiers}</p>}
          {l.note && <p className="strong" style={{ fontSize: 13 }}>  NOTE: {l.note}</p>}
        </div>
      ))}
      <div className="rule" />
      <p className="center small">{d.business_name}</p>
    </div>
  );
}

function Bill({ d, job }: { d: BillDoc; job: Marker }) {
  return (
    <div className="print-doc">
      <Head b={d.business} />
      <Banner job={job} />
      <p className="banner">BILL · NOT A RECEIPT</p>
      <p>Order {d.order_no}</p>
      <p>{stamp(d.generated_at, d.business.timezone)}</p>
      <div className="rule" />
      <Lines lines={d.lines} />
      <div className="rule" />
      <div className="row big"><span>TO PAY</span><span>{formatKes(d.total_cents)}</span></div>
      <div className="row small"><span>{d.tax_inclusive ? "Includes tax of" : "Tax"}</span><span>{formatKes(d.tax_cents)}</span></div>
      <div className="rule" />
      <p className="center small">This bill is not proof of payment.</p>
      {d.tax_status === "provisional_unverified" && <p className="center small">Tax setup not verified</p>}
    </div>
  );
}

function Test({ d }: { d: TestDoc }) {
  return (
    <div className="print-doc">
      <Head b={d.business} />
      <p className="banner">PRINTER TEST</p>
      <p className="center">{stamp(d.generated_at, d.business.timezone)}</p>
      <div className="rule" />
      <p className="small">Edge marks: both black squares must show.</p>
      <div className="row"><div className="edge" /><div className="edge" /></div>
      <p className="small">Ruler: this line should measure {d.print_mm} mm.</p>
      <div className="ruler" />
      <p className="small">Marks every 10 mm.</p>
      <div className="rule" />
      <p className="small">Solid black box: no grey, no white lines.</p>
      <div className="solid" />
      <div className="rule" />
      <p style={{ fontSize: 8 }}>8 px: The quick brown fox jumps over the lazy dog</p>
      <p style={{ fontSize: 10 }}>10 px: The quick brown fox jumps over the lazy dog</p>
      <p style={{ fontSize: 12 }}>12 px: The quick brown fox jumps over the lazy dog</p>
      <p style={{ fontSize: 16 }} className="strong">16 px bold: Receipt 0123456789</p>
      <p>0O 8B 1lI 7 5S 2Z 6G</p>
      <p className="money">KES 1,234,567.89</p>
      <div className="rule" />
      <p className="center small">Paper {d.paper_mm} mm · print width about {d.print_mm} mm</p>
    </div>
  );
}

/** One component for every print document. The job says whether this is a copy, so a reprint always carries its banner. */
export function PrintDocumentView({ doc, job }: { doc: PrintDocument; job: Marker }) {
  switch (doc.type) {
    case "receipt":
      return <Receipt d={doc} job={job} />;
    case "kitchen_ticket":
      return <Ticket d={doc} job={job} />;
    case "bill":
      return <Bill d={doc} job={job} />;
    case "test_page":
      return <Test d={doc} />;
  }
}
