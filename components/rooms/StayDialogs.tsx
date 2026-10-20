"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { FormDialog } from "@/components/FormDialog";
import { SelectField } from "@/components/catalogue/SelectField";
import { Alert, Button, ErrorState, LoadingState, Modal, TextField } from "@/components/ui";
import { api, errorMessage, newIdempotencyKey } from "@/lib/api";
import { formatDay } from "@/lib/format";
import { formatKes, parseKes } from "@/lib/money";
import { METHODS, PAYMENT_STATUS_LABEL, methodLabel } from "@/lib/payments";
import { useSession } from "@/lib/session";
import type { Folio, FolioItem, PaymentMethod, Room } from "@/lib/types";

type Common = { onClose: () => void; onDone: (message: string) => void };

/** One key per distinct request body, so a retry is replayed and a changed request is new. */
function useAttempt() {
  const ref = useRef<{ payload: string; key: string } | null>(null);
  return (body: unknown) => {
    const payload = JSON.stringify(body);
    if (ref.current?.payload !== payload) ref.current = { payload, key: newIdempotencyKey() };
    return ref.current.key;
  };
}

const MAX_CENTS = 100_000_000;

// ---- check in ----

export function CheckInDialog({ bookingId, summary, onClose, onDone }: Common & { bookingId: number; summary: string }) {
  const [key] = useState(() => newIdempotencyKey());
  return (
    <FormDialog
      open
      title="Check the guest in"
      submitLabel="Check in"
      onClose={onClose}
      onSubmit={async () => {
        await api(`/reservations/${bookingId}/check-in`, { method: "POST", idempotencyKey: key });
        onDone(`Checked in. ${summary}`);
      }}
    >
      <p>{summary}</p>
      <p className="text-sm text-slate-brand/80">This opens the guest&apos;s account (folio) and adds a charge for every booked night. The room becomes occupied.</p>
    </FormDialog>
  );
}

// ---- room status ----

export const ROOM_STATUS_LABEL: Record<string, string> = {
  vacant_ready: "Ready",
  occupied: "Occupied",
  dirty: "Needs cleaning",
  cleaning: "Being cleaned",
  out_of_service: "Out of service",
  reserved: "Reserved",
};

const MOVES: Record<string, { to: string; label: string }[]> = {
  vacant_ready: [{ to: "dirty", label: "Needs cleaning" }, { to: "out_of_service", label: "Out of service" }],
  dirty: [{ to: "cleaning", label: "Start cleaning" }, { to: "out_of_service", label: "Out of service" }],
  cleaning: [{ to: "vacant_ready", label: "Ready" }, { to: "dirty", label: "Needs cleaning" }, { to: "out_of_service", label: "Out of service" }],
  reserved: [{ to: "vacant_ready", label: "Ready" }],
  out_of_service: [{ to: "dirty", label: "Back in service" }],
};

export function RoomStatusButtons({ room, onChange }: { room: Room; onChange: (to: string, label: string) => void }) {
  const moves = MOVES[room.physical_status] ?? [];
  if (moves.length === 0) return null;
  return (
    <div className="mt-2 flex flex-wrap gap-2">
      {moves.map((m) => (
        <Button key={m.to} variant="secondary" onClick={() => onChange(m.to, m.label)}>{m.label}</Button>
      ))}
    </div>
  );
}

export function RoomStatusDialog({ room, to, label, onClose, onDone }: Common & { room: Room; to: string; label: string }) {
  const [reason, setReason] = useState("");
  const needs = to === "out_of_service";
  return (
    <FormDialog
      open
      title={`Room ${room.number}: ${label}`}
      submitLabel="Save"
      onClose={onClose}
      disabled={needs && !reason.trim()}
      onSubmit={async () => {
        await api(`/rooms/${room.id}/status`, { method: "POST", body: { status: to, reason: reason.trim() } });
        onDone(`Room ${room.number} is now: ${ROOM_STATUS_LABEL[to] ?? to}.`);
      }}
    >
      <p>Room {room.number} is now {ROOM_STATUS_LABEL[room.physical_status] ?? room.physical_status}. It will become {ROOM_STATUS_LABEL[to] ?? to}.</p>
      <TextField label={needs ? "Why (required)" : "Note (optional)"} value={reason} maxLength={200} onChange={(e) => setReason(e.target.value)} autoFocus />
    </FormDialog>
  );
}

// ---- the folio ----

type Sub = "pay" | "charge" | "credit" | "writeoff" | "extend" | "move" | "reopen" | undefined;
type State = { status: "loading" } | { status: "error"; message: string } | { status: "ready"; folio: Folio };

export function FolioDialog({ folioId, rooms, onClose, onChanged }: { folioId: number; rooms: Room[]; onClose: () => void; onChanged: (message?: string) => void }) {
  const { can } = useSession();
  const [state, setState] = useState<State>({ status: "loading" });
  const [tick, setTick] = useState(0);
  const [sub, setSub] = useState<Sub>();
  const [credit, setCredit] = useState<FolioItem>();
  const [notice, setNotice] = useState<string>();
  const [problem, setProblem] = useState<string>();
  const [busy, setBusy] = useState(false);
  const outKey = useRef(newIdempotencyKey());

  useEffect(() => {
    let alive = true;
    api<{ folio: Folio }>(`/folios/${folioId}`)
      .then((r) => alive && setState({ status: "ready", folio: r.folio }))
      .catch((err) => alive && setState({ status: "error", message: errorMessage(err) }));
    return () => {
      alive = false;
    };
  }, [folioId, tick]);

  const done = useCallback((message: string) => {
    setNotice(message);
    setProblem(undefined);
    setSub(undefined);
    setCredit(undefined);
    setTick((t) => t + 1);
    onChanged();
  }, [onChanged]);

  async function run(path: string, message: string, key?: string) {
    setBusy(true);
    setProblem(undefined);
    try {
      await api(path, { method: "POST", idempotencyKey: key });
      setNotice(message);
      setTick((t) => t + 1);
      onChanged(message);
    } catch (err) {
      setProblem(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const manage = can("folios.manage");
  const manager = can("sales.refund");
  const f = state.status === "ready" ? state.folio : undefined;
  const open = f?.status === "open";
  const inHouse = f?.stay_status === "in_house";
  const t = f?.totals;

  return (
    <>
      <Modal open title={f ? `Folio ${f.folio_no} · Room ${f.room_number}` : "Folio"} onClose={onClose}>
        {state.status === "loading" && <LoadingState label="Loading folio" />}
        {state.status === "error" && <ErrorState message={state.message} onRetry={() => setTick((n) => n + 1)} />}
        {f && t && (
          <div className="space-y-4">
            <div>
              <p className="text-lg font-semibold">{f.guest_name}</p>
              <p className="text-sm text-slate-brand/80">
                {formatDay(f.check_in)} to {formatDay(f.expected_out)} · {inHouse ? "In the house" : f.stay_status === "checked_out" ? "Checked out" : f.stay_status} · {open ? "Open" : "Closed"}
              </p>
            </div>
            {notice && <Alert tone="success">{notice}</Alert>}
            {problem && <Alert tone="error">{problem}</Alert>}

            <dl className="grid grid-cols-2 gap-x-4 gap-y-1">
              <dt>Charges</dt><dd className="money text-right">{formatKes(t.items_cents)}</dd>
              <dt>Paid</dt><dd className="money text-right">{formatKes(t.paid_cents)}</dd>
              {t.write_off_cents > 0 && (<><dt>Written off</dt><dd className="money text-right">{formatKes(t.write_off_cents)}</dd></>)}
              {t.pending_cents > 0 && (<><dt>Waiting for confirmation</dt><dd className="money text-right">{formatKes(t.pending_cents)}</dd></>)}
              <dt className="font-semibold">Still owed</dt><dd className="money text-right text-xl font-semibold">{formatKes(t.balance_cents)}</dd>
            </dl>
            {f.write_off_reason && <p className="text-sm">Written off: {f.write_off_reason}</p>}

            <section>
              <h3 className="mb-1 font-semibold">Charges</h3>
              <ul className="divide-y divide-stone-brand rounded-md border border-stone-brand bg-white">
                {f.items.map((it) => (
                  <li key={it.id} className="flex items-start justify-between gap-2 p-2">
                    <div className="min-w-0">
                      <p className={it.reversed ? "line-through" : ""}>{it.description}</p>
                      <p className="text-sm text-slate-brand/80">
                        {it.night_date ? formatDay(it.night_date) : ""}
                        {it.reason ? `${it.night_date ? " · " : ""}${it.reason}` : ""}
                        {it.reversed ? " · credited" : ""}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="money">{formatKes(it.amount_cents)}</p>
                      {open && manage && manager && it.amount_cents > 0 && !it.reversed && (
                        <button type="button" className="text-sm underline" onClick={() => setCredit(it)}>Credit</button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </section>

            <section>
              <h3 className="mb-1 font-semibold">Payments</h3>
              {f.payments.length === 0 ? (
                <p className="text-sm text-slate-brand/80">Nothing paid yet.</p>
              ) : (
                <ul className="divide-y divide-stone-brand rounded-md border border-stone-brand bg-white">
                  {f.payments.map((p) => (
                    <li key={p.id} className="flex items-start justify-between gap-2 p-2">
                      <div>
                        <p>{methodLabel(p.method)}{p.purpose === "deposit" ? " · deposit" : ""}{p.reference ? ` · ${p.reference}` : ""}</p>
                        <p className="text-sm text-slate-brand/80">{PAYMENT_STATUS_LABEL[p.status]} · {p.created_by_name}</p>
                      </div>
                      <p className="money shrink-0">{formatKes(p.amount_cents)}</p>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {manage && (
              <div className="flex flex-wrap gap-2">
                {open && t.balance_cents - t.pending_cents > 0 && <Button onClick={() => setSub("pay")}>Take a payment</Button>}
                {open && <Button variant="secondary" onClick={() => setSub("charge")}>Add a charge</Button>}
                {open && manager && t.balance_cents > 0 && t.write_off_cents === 0 && <Button variant="secondary" onClick={() => setSub("writeoff")}>Write off</Button>}
                {open && inHouse && f.stay_id !== null && <Button variant="secondary" onClick={() => setSub("extend")}>Extend stay</Button>}
                {open && inHouse && f.stay_id !== null && <Button variant="secondary" onClick={() => setSub("move")}>Change room</Button>}
                {open && inHouse && f.stay_id !== null && (
                  <Button busy={busy} disabled={t.balance_cents !== 0 || t.pending_cents > 0} onClick={() => run(`/stays/${f.stay_id}/check-out`, "Checked out. The room needs cleaning.", outKey.current)}>Check out</Button>
                )}
                {open && !inHouse && <Button busy={busy} disabled={t.balance_cents !== 0 || t.pending_cents > 0} onClick={() => run(`/folios/${f.id}/close`, "Folio closed.")}>Close folio</Button>}
                {!open && <Button variant="secondary" onClick={() => setSub("reopen")}>Reopen</Button>}
              </div>
            )}
            {open && inHouse && manage && (t.balance_cents !== 0 || t.pending_cents > 0) && (
              <p className="text-sm text-slate-brand/80">Check-out needs nothing owed and no payment waiting for confirmation.</p>
            )}
          </div>
        )}
      </Modal>

      {f && sub === "pay" && <PaymentDialog folio={f} onClose={() => setSub(undefined)} onDone={done} />}
      {f && sub === "charge" && <AdjustDialog folio={f} onClose={() => setSub(undefined)} onDone={done} />}
      {f && credit && <CreditDialog folio={f} item={credit} onClose={() => setCredit(undefined)} onDone={done} />}
      {f && sub === "writeoff" && <WriteOffDialog folio={f} onClose={() => setSub(undefined)} onDone={done} />}
      {f && sub === "extend" && f.stay_id !== null && <ExtendDialog folio={f} onClose={() => setSub(undefined)} onDone={done} />}
      {f && sub === "move" && f.stay_id !== null && <MoveDialog folio={f} rooms={rooms} onClose={() => setSub(undefined)} onDone={done} />}
      {f && sub === "reopen" && <ReopenDialog folio={f} onClose={() => setSub(undefined)} onDone={done} />}
    </>
  );
}

function PaymentDialog({ folio, onClose, onDone }: Common & { folio: Folio }) {
  const owed = folio.totals.balance_cents - folio.totals.pending_cents;
  const [method, setMethod] = useState<PaymentMethod>("cash");
  const [amount, setAmount] = useState(String(owed / 100));
  const [reference, setReference] = useState("");
  const [deposit, setDeposit] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const attempt = useAttempt();
  const m = METHODS.find((x) => x.value === method);
  const cents = parseKes(amount);
  const bad = cents === null || cents <= 0 || cents > owed;
  return (
    <FormDialog
      open
      title="Take a payment"
      submitLabel="Take payment"
      onClose={onClose}
      onFieldErrors={setErrors}
      disabled={bad || (!!m?.needsReference && !reference.trim())}
      onSubmit={async () => {
        const body = { method, amount_cents: cents, reference: reference.trim(), purpose: deposit ? "deposit" : "settlement" };
        await api(`/folios/${folio.id}/payments`, { method: "POST", body, idempotencyKey: attempt(body) });
        onDone(method === "cash" ? `${formatKes(cents ?? 0)} cash taken.` : `${formatKes(cents ?? 0)} recorded. It counts once someone confirms it.`);
      }}
    >
      <p>Still to pay: {formatKes(owed)}</p>
      <SelectField label="How" value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)}>
        {METHODS.map((x) => <option key={x.value} value={x.value}>{x.label}</option>)}
      </SelectField>
      <TextField label="Amount (KES)" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} error={bad ? `Enter an amount up to ${formatKes(owed)}.` : errors.amount_cents} />
      {m?.needsReference && <TextField label="Reference (for example the M-Pesa code)" value={reference} onChange={(e) => setReference(e.target.value)} error={errors.reference} />}
      <label className="target flex items-center gap-3">
        <input type="checkbox" className="h-5 w-5" checked={deposit} onChange={(e) => setDeposit(e.target.checked)} />
        <span>This is a deposit</span>
      </label>
      {errors.method && <Alert tone="error">{errors.method}</Alert>}
    </FormDialog>
  );
}

function AdjustDialog({ folio, onClose, onDone }: Common & { folio: Folio }) {
  const [desc, setDesc] = useState("");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const attempt = useAttempt();
  const cents = parseKes(amount);
  const bad = cents === null || cents <= 0 || cents > MAX_CENTS;
  return (
    <FormDialog
      open
      title="Add a charge"
      submitLabel="Add charge"
      onClose={onClose}
      disabled={!desc.trim() || bad || !reason.trim()}
      onSubmit={async () => {
        const body = { description: desc.trim(), amount_cents: cents, reason: reason.trim() };
        await api(`/folios/${folio.id}/adjustments`, { method: "POST", body, idempotencyKey: attempt(body) });
        onDone(`${desc.trim()}: ${formatKes(cents ?? 0)} added to the folio.`);
      }}
    >
      <TextField label="What for" value={desc} maxLength={120} onChange={(e) => setDesc(e.target.value)} autoFocus />
      <TextField label="Amount (KES)" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} error={amount && bad ? "Enter an amount above 0." : undefined} />
      <TextField label="Why (required)" value={reason} maxLength={200} onChange={(e) => setReason(e.target.value)} />
    </FormDialog>
  );
}

function CreditDialog({ folio, item, onClose, onDone }: Common & { folio: Folio; item: FolioItem }) {
  const [reason, setReason] = useState("");
  const attempt = useAttempt();
  return (
    <FormDialog
      open
      title="Credit a charge"
      submitLabel="Credit it"
      onClose={onClose}
      disabled={!reason.trim()}
      onSubmit={async () => {
        const body = { reverses_item_id: item.id, reason: reason.trim() };
        await api(`/folios/${folio.id}/adjustments`, { method: "POST", body, idempotencyKey: attempt(body) });
        onDone(`${item.description} was credited: ${formatKes(item.amount_cents)} off the folio.`);
      }}
    >
      <p>{item.description}: {formatKes(item.amount_cents)} comes off the folio in full. This can be done once.</p>
      <TextField label="Why (required)" value={reason} maxLength={200} onChange={(e) => setReason(e.target.value)} autoFocus />
    </FormDialog>
  );
}

function WriteOffDialog({ folio, onClose, onDone }: Common & { folio: Folio }) {
  const owed = folio.totals.balance_cents;
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const attempt = useAttempt();
  const cents = parseKes(amount);
  const bad = cents === null || cents <= 0 || cents > owed;
  return (
    <FormDialog
      open
      danger
      title="Write off part of the bill"
      submitLabel="Write off"
      onClose={onClose}
      disabled={bad || !reason.trim()}
      onSubmit={async () => {
        const body = { amount_cents: cents, reason: reason.trim() };
        await api(`/folios/${folio.id}/write-off`, { method: "POST", body, idempotencyKey: attempt(body) });
        onDone(`${formatKes(cents ?? 0)} written off.`);
      }}
    >
      <p>Still owed: {formatKes(owed)}. The guest does not pay what you write off. It can be done once and your name is kept with it.</p>
      <TextField label="Amount (KES)" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} error={amount && bad ? `Enter an amount up to ${formatKes(owed)}.` : undefined} autoFocus />
      <TextField label="Why (required)" value={reason} maxLength={200} onChange={(e) => setReason(e.target.value)} />
    </FormDialog>
  );
}

function ExtendDialog({ folio, onClose, onDone }: Common & { folio: Folio }) {
  const [out, setOut] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  return (
    <FormDialog
      open
      title="Extend the stay"
      submitLabel="Extend"
      onClose={onClose}
      onFieldErrors={setErrors}
      disabled={!out || out <= folio.expected_out}
      onSubmit={async () => {
        await api(`/stays/${folio.stay_id}/extend`, { method: "POST", body: { check_out: out } });
        onDone(`Stay extended to ${formatDay(out)}. The extra nights are on the folio.`);
      }}
    >
      <p>Now leaving {formatDay(folio.expected_out)}.</p>
      <TextField label="New leaving date" type="date" min={folio.expected_out} value={out} onChange={(e) => setOut(e.target.value)} error={errors.check_out} autoFocus />
    </FormDialog>
  );
}

function MoveDialog({ folio, rooms, onClose, onDone }: Common & { folio: Folio; rooms: Room[] }) {
  const [roomId, setRoomId] = useState("");
  const [reason, setReason] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const options = rooms.filter((r) => r.active && r.physical_status === "vacant_ready" && r.number !== folio.room_number);
  return (
    <FormDialog
      open
      title="Change room"
      submitLabel="Move guest"
      onClose={onClose}
      onFieldErrors={setErrors}
      disabled={!roomId || !reason.trim()}
      onSubmit={async () => {
        await api(`/stays/${folio.stay_id}/change-room`, { method: "POST", body: { room_id: Number(roomId), reason: reason.trim() } });
        onDone("The guest was moved. The old room needs cleaning. The price stays the same.");
      }}
    >
      <SelectField label="Move to (ready rooms)" value={roomId} onChange={(e) => setRoomId(e.target.value)} error={errors.room_id}>
        <option value="">Choose a room</option>
        {options.map((r) => <option key={r.id} value={r.id}>Room {r.number} · {r.room_type}</option>)}
      </SelectField>
      <TextField label="Why (required)" value={reason} maxLength={200} onChange={(e) => setReason(e.target.value)} />
    </FormDialog>
  );
}

function ReopenDialog({ folio, onClose, onDone }: Common & { folio: Folio }) {
  const [reason, setReason] = useState("");
  return (
    <FormDialog
      open
      title="Reopen the folio"
      submitLabel="Reopen"
      onClose={onClose}
      disabled={!reason.trim()}
      onSubmit={async () => {
        await api(`/folios/${folio.id}/reopen`, { method: "POST", body: { reason: reason.trim() } });
        onDone("The folio is open again. The guest does not go back into the room.");
      }}
    >
      <p>Use this for something found after the guest left. Settle it and close the folio again.</p>
      <TextField label="Why (required)" value={reason} maxLength={200} onChange={(e) => setReason(e.target.value)} autoFocus />
    </FormDialog>
  );
}
