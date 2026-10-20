"use client";

import { useCallback, useEffect, useState } from "react";
import { SelectField } from "@/components/catalogue/SelectField";
import { BookingDialog, CancelBookingDialog, GuestDialog, RoomDialog, RoomTypeDialog, type BookingStart } from "@/components/rooms/RoomDialogs";
import { FolioDialog, CheckInDialog, ROOM_STATUS_LABEL, RoomStatusButtons, RoomStatusDialog } from "@/components/rooms/StayDialogs";
import { Alert, Button, EmptyState, ErrorState, LoadingState, TextField } from "@/components/ui";
import { api, errorMessage } from "@/lib/api";
import { formatDay, todayYmd } from "@/lib/format";
import { formatKes } from "@/lib/money";
import { useSession } from "@/lib/session";
import type { AvailabilityRoom, Guest, InHouseStay, Reservation, ReservationStatus, Room, RoomType, TaxRate } from "@/lib/types";

type Load =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; reservations: Reservation[]; rooms: Room[]; types: RoomType[]; rates: TaxRate[] };

type Dialog =
  | { kind: "book"; start?: BookingStart }
  | { kind: "edit"; booking: Reservation }
  | { kind: "cancel"; booking: Reservation }
  | { kind: "type"; type?: RoomType }
  | { kind: "room"; room?: Room }
  | { kind: "guest"; guest?: Guest }
  | { kind: "checkin"; booking: Reservation }
  | { kind: "folio"; id: number }
  | { kind: "status"; room: Room; to: string; label: string };

type Tab = "bookings" | "house" | "free" | "guests" | "rooms";

const STATUS_LABEL: Record<ReservationStatus, string> = {
  tentative: "On hold",
  confirmed: "Confirmed",
  checked_in: "In the house",
  checked_out: "Checked out",
  cancelled: "Cancelled",
  no_show: "Did not arrive",
};
const OPEN: ReservationStatus[] = ["tentative", "confirmed", "checked_in"];

export default function RoomsPage() {
  const { state, can } = useSession();
  const [tab, setTab] = useState<Tab>("bookings");
  const [filter, setFilter] = useState<"open" | ReservationStatus>("open");
  const [load, setLoad] = useState<Load>({ status: "loading" });
  const [tick, setTick] = useState(0);
  const [dialog, setDialog] = useState<Dialog>();
  const [notice, setNotice] = useState<string>();
  const [problem, setProblem] = useState<string>();
  const [busyId, setBusyId] = useState<number>();
  const allowed = can("rooms.manage");

  useEffect(() => {
    if (!allowed) return;
    let alive = true;
    Promise.all([
      api<{ reservations: Reservation[] }>("/reservations", { query: { limit: 200 } }),
      api<{ rooms: Room[] }>("/rooms"),
      api<{ room_types: RoomType[] }>("/room-types"),
      api<{ items: TaxRate[] }>("/tax-rates"),
    ])
      .then(([b, r, t, x]) => alive && setLoad({ status: "ready", reservations: b.reservations, rooms: r.rooms, types: t.room_types, rates: x.items }))
      .catch((err) => alive && setLoad({ status: "error", message: errorMessage(err) }));
    return () => {
      alive = false;
    };
  }, [allowed, tick]);

  const done = useCallback((message: string) => {
    setNotice(message);
    setProblem(undefined);
    setTick((t) => t + 1);
  }, []);

  if (state.status !== "authenticated") return null;
  if (!allowed) return <EmptyState title="No access">Your role does not include rooms and bookings.</EmptyState>;

  async function act(b: Reservation, action: "confirm" | "no-show", message: string) {
    setBusyId(b.id);
    setProblem(undefined);
    try {
      await api(`/reservations/${b.id}/${action}`, { method: "POST" });
      done(message);
    } catch (err) {
      setProblem(errorMessage(err));
    } finally {
      setBusyId(undefined);
    }
  }

  const today = todayYmd(0);
  const rows =
    load.status === "ready"
      ? load.reservations
          .filter((b) => (filter === "open" ? OPEN.includes(b.status) : b.status === filter))
          .sort((a, b) => (filter === "open" ? a.check_in.localeCompare(b.check_in) || a.id - b.id : b.id - a.id))
      : [];
  const tabs: [Tab, string][] = [["bookings", "Bookings"], ["house", "In the house"], ["free", "Free rooms"], ["guests", "Guests"], ["rooms", "Rooms and rates"]];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold">Rooms</h1>
        {load.status === "ready" && (
          <Button onClick={() => setDialog({ kind: "book" })} disabled={load.rooms.filter((r) => r.active).length === 0}>Make a booking</Button>
        )}
      </div>
      <p className="text-slate-brand/80">Book a room for a guest, hold one without blocking it, and see which rooms are free for the nights you need. A room can only be booked once for any night.</p>
      {notice && <Alert tone="success">{notice}</Alert>}
      {problem && <Alert tone="error">{problem}</Alert>}

      <div role="tablist" className="flex flex-wrap gap-2">
        {tabs.map(([t, label]) => (
          <button key={t} role="tab" aria-selected={tab === t} className={`target rounded-md border px-4 py-2 font-medium ${tab === t ? "border-teal-brand bg-teal-brand text-white" : "border-stone-brand bg-white"}`} onClick={() => setTab(t)}>
            {label}
          </button>
        ))}
      </div>

      {load.status === "loading" && <LoadingState label="Loading rooms" />}
      {load.status === "error" && <ErrorState message={load.message} onRetry={() => setTick((t) => t + 1)} />}

      {load.status === "ready" && tab === "bookings" && (
        <>
          <div className="max-w-xs">
            <SelectField label="Show" value={filter} onChange={(e) => setFilter(e.target.value as "open" | ReservationStatus)}>
              <option value="open">Open bookings</option>
              {(Object.keys(STATUS_LABEL) as ReservationStatus[]).map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
            </SelectField>
          </div>
          {load.rooms.length === 0 && <Alert tone="info">Add your rooms first (Rooms and rates), then make bookings.</Alert>}
          {rows.length === 0 ? (
            <EmptyState title="No bookings">{filter === "open" ? "Nothing is booked or on hold." : "None with that status."}</EmptyState>
          ) : (
            <ul className="space-y-3">
              {rows.map((b) => (
                <li key={b.id} className="rounded-lg border border-stone-brand bg-white p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <h2 className="text-lg font-semibold">#{b.reservation_no} · Room {b.room_number} · {b.guest_name}</h2>
                      <p className="text-sm text-slate-brand/80">
                        {formatDay(b.check_in)} to {formatDay(b.check_out)} · {b.nights} night{b.nights === 1 ? "" : "s"} · {b.adults} adult{b.adults === 1 ? "" : "s"} · {b.room_type}
                      </p>
                      {b.guest_phone && <p className="text-sm text-slate-brand/80">{b.guest_phone}</p>}
                    </div>
                    <div className="text-right">
                      <p className="money text-xl font-semibold">{formatKes(b.total_cents)}</p>
                      <p className="text-sm text-slate-brand/80">{formatKes(b.nightly_rate_cents)} a night</p>
                    </div>
                  </div>
                  <p className={`mt-1 text-sm font-medium ${b.status === "cancelled" || b.status === "no_show" ? "text-ember" : ""}`}>
                    {STATUS_LABEL[b.status]}
                    {b.cancelled_reason ? ` · ${b.cancelled_reason}` : ""}
                  </p>
                  {b.notes && <p className="mt-1 text-sm">{b.notes}</p>}
                  {b.status === "checked_in" && b.folio_id !== null && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Button onClick={() => setDialog({ kind: "folio", id: b.folio_id! })}>Open folio</Button>
                    </div>
                  )}
                  {b.status === "checked_out" && b.folio_id !== null && can("folios.view") && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Button variant="secondary" onClick={() => setDialog({ kind: "folio", id: b.folio_id! })}>Open folio</Button>
                    </div>
                  )}
                  {(b.status === "tentative" || b.status === "confirmed") && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {b.status === "confirmed" && b.check_in <= today && b.check_out > today && (
                        <Button onClick={() => setDialog({ kind: "checkin", booking: b })}>Check in</Button>
                      )}
                      {b.status === "tentative" && (
                        <Button busy={busyId === b.id} onClick={() => act(b, "confirm", `Booking #${b.reservation_no} is confirmed. Room ${b.room_number} is yours for those nights.`)}>Confirm</Button>
                      )}
                      <Button variant="secondary" onClick={() => setDialog({ kind: "edit", booking: b })}>Change</Button>
                      {b.status === "confirmed" && b.check_in <= today && (
                        <Button variant="secondary" busy={busyId === b.id} onClick={() => act(b, "no-show", `Booking #${b.reservation_no} is marked as not arrived. Room ${b.room_number} is free again.`)}>Did not arrive</Button>
                      )}
                      <Button variant="secondary" onClick={() => setDialog({ kind: "cancel", booking: b })}>Cancel</Button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      {load.status === "ready" && tab === "house" && <InHouse key={`house-${tick}`} onOpen={(id) => setDialog({ kind: "folio", id })} />}

      {load.status === "ready" && tab === "free" && <FreeRooms key={`free-${tick}`} types={load.types} rooms={load.rooms} onBook={(start) => setDialog({ kind: "book", start })} />}

      {load.status === "ready" && tab === "guests" && <GuestList refresh={tick} onEdit={(guest) => setDialog({ kind: "guest", guest })} onAdd={() => setDialog({ kind: "guest" })} />}

      {load.status === "ready" && tab === "rooms" && (
        <div className="space-y-6">
          <section className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-xl font-semibold">Room types</h2>
              <Button variant="secondary" onClick={() => setDialog({ kind: "type" })}>Add a room type</Button>
            </div>
            {load.types.length === 0 ? (
              <EmptyState title="No room types yet">Add a type (for example Standard) with its price for one night, then add rooms of that type.</EmptyState>
            ) : (
              <ul className="space-y-3">
                {load.types.map((t) => (
                  <li key={t.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-stone-brand bg-white p-4">
                    <div>
                      <h3 className="text-lg font-semibold">{t.name}{!t.active && <span className="ml-2 text-sm font-normal">(switched off)</span>}</h3>
                      <p className="text-sm text-slate-brand/80">{formatKes(t.base_rate_cents)} a night, tax included · sleeps {t.capacity} · {t.room_count} room{t.room_count === 1 ? "" : "s"} · {t.tax_name}</p>
                    </div>
                    <Button variant="secondary" onClick={() => setDialog({ kind: "type", type: t })}>Edit</Button>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-xl font-semibold">Rooms</h2>
              <Button variant="secondary" onClick={() => setDialog({ kind: "room" })} disabled={load.types.filter((t) => t.active).length === 0}>Add a room</Button>
            </div>
            {load.rooms.length === 0 ? (
              <EmptyState title="No rooms yet">Add each room with its number and type.</EmptyState>
            ) : (
              <ul className="grid gap-3 sm:grid-cols-2">
                {load.rooms.map((r) => (
                  <li key={r.id} className="flex items-center justify-between gap-2 rounded-lg border border-stone-brand bg-white p-4">
                    <div>
                      <h3 className="text-lg font-semibold">Room {r.number}{!r.active && <span className="ml-2 text-sm font-normal">(switched off)</span>}</h3>
                      <p className="text-sm text-slate-brand/80">{r.room_type}{r.floor !== null ? ` · floor ${r.floor}` : ""}</p>
                      <p className="text-sm font-medium">{ROOM_STATUS_LABEL[r.physical_status] ?? r.physical_status}</p>
                      {r.active && <RoomStatusButtons room={r} onChange={(to, label) => setDialog({ kind: "status", room: r, to, label })} />}
                    </div>
                    <Button variant="secondary" onClick={() => setDialog({ kind: "room", room: r })}>Edit</Button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}

      {load.status === "ready" && dialog?.kind === "book" && <BookingDialog rooms={load.rooms} start={dialog.start} onClose={() => setDialog(undefined)} onDone={done} />}
      {load.status === "ready" && dialog?.kind === "edit" && <BookingDialog rooms={load.rooms} edit={dialog.booking} onClose={() => setDialog(undefined)} onDone={done} />}
      {dialog?.kind === "cancel" && <CancelBookingDialog booking={dialog.booking} onClose={() => setDialog(undefined)} onDone={done} />}
      {load.status === "ready" && dialog?.kind === "type" && <RoomTypeDialog type={dialog.type} rates={load.rates} onClose={() => setDialog(undefined)} onDone={done} />}
      {load.status === "ready" && dialog?.kind === "room" && <RoomDialog room={dialog.room} types={load.types} onClose={() => setDialog(undefined)} onDone={done} />}
      {dialog?.kind === "checkin" && (
        <CheckInDialog bookingId={dialog.booking.id} summary={`${dialog.booking.guest_name}, room ${dialog.booking.room_number}, ${formatDay(dialog.booking.check_in)} to ${formatDay(dialog.booking.check_out)} (${dialog.booking.nights} night${dialog.booking.nights === 1 ? "" : "s"}, ${formatKes(dialog.booking.total_cents)}).`} onClose={() => setDialog(undefined)} onDone={done} />
      )}
      {load.status === "ready" && dialog?.kind === "folio" && <FolioDialog key={`folio-${dialog.id}`} folioId={dialog.id} rooms={load.rooms} onClose={() => setDialog(undefined)} onChanged={(m) => { if (m) setNotice(m); setTick((t) => t + 1); }} />}
      {dialog?.kind === "status" && <RoomStatusDialog room={dialog.room} to={dialog.to} label={dialog.label} onClose={() => setDialog(undefined)} onDone={done} />}
      {dialog?.kind === "guest" && <GuestDialog guest={dialog.guest} onClose={() => setDialog(undefined)} onDone={done} />}
    </div>
  );
}

function FreeRooms({ types, rooms, onBook }: { types: RoomType[]; rooms: Room[]; onBook: (start: BookingStart) => void }) {
  const [from, setFrom] = useState(() => todayYmd(0));
  const [to, setTo] = useState(() => todayYmd(1));
  const [typeId, setTypeId] = useState("");
  const [result, setResult] = useState<{ status: "idle" } | { status: "loading" } | { status: "error"; message: string } | { status: "ready"; rooms: AvailabilityRoom[]; from: string; to: string }>({ status: "idle" });

  function look() {
    setResult({ status: "loading" });
    api<{ rooms: AvailabilityRoom[] }>("/availability", { query: { from, to, room_type_id: typeId } })
      .then((r) => setResult({ status: "ready", rooms: r.rooms, from, to }))
      .catch((err) => setResult({ status: "error", message: errorMessage(err) }));
  }

  const free = result.status === "ready" ? result.rooms.filter((r) => r.available) : [];
  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-4">
        <TextField label="Arrives" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        <TextField label="Leaves" type="date" min={from || undefined} value={to} onChange={(e) => setTo(e.target.value)} />
        <SelectField label="Type" value={typeId} onChange={(e) => setTypeId(e.target.value)}>
          <option value="">Any type</option>
          {types.filter((t) => t.active).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </SelectField>
        <div className="flex items-end">
          <Button onClick={look} disabled={!from || !to || to <= from}>Look</Button>
        </div>
      </div>
      {result.status === "idle" && <p className="text-slate-brand/80">Choose the nights and press Look. The night you leave is not counted.</p>}
      {result.status === "loading" && <LoadingState label="Looking" />}
      {result.status === "error" && <Alert tone="error">{result.message}</Alert>}
      {result.status === "ready" && (
        <>
          <p className="font-medium">{free.length} of {result.rooms.length} rooms free from {formatDay(result.from)} to {formatDay(result.to)}</p>
          {result.rooms.length === 0 ? (
            <EmptyState title="No rooms">There are no active rooms of that type.</EmptyState>
          ) : (
            <ul className="grid gap-3 sm:grid-cols-2">
              {result.rooms.map((r) => (
                <li key={r.room_id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-stone-brand bg-white p-4">
                  <div>
                    <h3 className="text-lg font-semibold">Room {r.number}</h3>
                    <p className="text-sm text-slate-brand/80">{r.room_type} · sleeps {r.capacity} · {formatKes(r.base_rate_cents)} a night</p>
                    <p className={`text-sm font-medium ${r.available ? "text-success" : "text-ember"}`}>
                      {r.available ? "Free" : `Booked ${formatDay(r.blocked_from)} to ${formatDay(r.blocked_until)}`}
                      {r.holds > 0 ? ` · ${r.holds} on hold` : ""}
                    </p>
                  </div>
                  {r.available && (
                    <Button onClick={() => onBook({ room: rooms.find((x) => x.id === r.room_id), from: result.from, to: result.to })}>Book</Button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}

function GuestList({ refresh, onEdit, onAdd }: { refresh: number; onEdit: (g: Guest) => void; onAdd: () => void }) {
  const [q, setQ] = useState("");
  const [state, setState] = useState<{ status: "loading" } | { status: "error"; message: string } | { status: "ready"; guests: Guest[] }>({ status: "loading" });
  useEffect(() => {
    let alive = true;
    api<{ guests: Guest[] }>("/guests", { query: { q: q.trim(), limit: 100 } })
      .then((r) => alive && setState({ status: "ready", guests: r.guests }))
      .catch((err) => alive && setState({ status: "error", message: errorMessage(err) }));
    return () => {
      alive = false;
    };
  }, [q, refresh]);
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div className="min-w-0 flex-1 sm:max-w-xs">
          <TextField label="Search by name or phone" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <Button variant="secondary" onClick={onAdd}>Add a guest</Button>
      </div>
      {state.status === "loading" && <LoadingState label="Loading guests" />}
      {state.status === "error" && <Alert tone="error">{state.message}</Alert>}
      {state.status === "ready" &&
        (state.guests.length === 0 ? (
          <EmptyState title="No guests">{q ? "Nobody matches that." : "Guests appear here once you add them or make a booking for a new guest."}</EmptyState>
        ) : (
          <ul className="space-y-3">
            {state.guests.map((g) => (
              <li key={g.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-stone-brand bg-white p-4">
                <div>
                  <h2 className="text-lg font-semibold">{g.full_name}</h2>
                  <p className="text-sm text-slate-brand/80">{[g.phone, g.email].filter(Boolean).join(" · ") || "No contact details"}</p>
                  {g.notes && <p className="text-sm">{g.notes}</p>}
                </div>
                <Button variant="secondary" onClick={() => onEdit(g)}>Edit</Button>
              </li>
            ))}
          </ul>
        ))}
    </div>
  );
}

function InHouse({ onOpen }: { onOpen: (folioId: number) => void }) {
  const [state, setState] = useState<{ status: "loading" } | { status: "error"; message: string } | { status: "ready"; stays: InHouseStay[] }>({ status: "loading" });
  useEffect(() => {
    let alive = true;
    api<{ stays: InHouseStay[] }>("/rooms/in-house")
      .then((r) => alive && setState({ status: "ready", stays: r.stays }))
      .catch((err) => alive && setState({ status: "error", message: errorMessage(err) }));
    return () => {
      alive = false;
    };
  }, []);
  if (state.status === "loading") return <LoadingState label="Loading guests in the house" />;
  if (state.status === "error") return <Alert tone="error">{state.message}</Alert>;
  if (state.stays.length === 0) return <EmptyState title="Nobody in the house">Guests appear here when they are checked in.</EmptyState>;
  return (
    <ul className="space-y-3">
      {state.stays.map((s) => (
        <li key={s.stay_id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-stone-brand bg-white p-4">
          <div>
            <h2 className="text-lg font-semibold">Room {s.room_number} · {s.guest_name}</h2>
            <p className="text-sm text-slate-brand/80">{formatDay(s.check_in)} to {formatDay(s.expected_out)} · {s.room_type}</p>
            {s.balance_cents !== undefined && <p className="money font-medium">Owes {formatKes(s.balance_cents)}</p>}
          </div>
          {s.folio_id !== undefined && <Button variant="secondary" onClick={() => onOpen(s.folio_id!)}>Open folio</Button>}
        </li>
      ))}
    </ul>
  );
}
