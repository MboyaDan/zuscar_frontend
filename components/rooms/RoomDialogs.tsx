"use client";

import { useEffect, useRef, useState } from "react";
import { SelectField } from "@/components/catalogue/SelectField";
import { FormDialog } from "@/components/FormDialog";
import { Alert, TextField } from "@/components/ui";
import { api, newIdempotencyKey } from "@/lib/api";
import { formatDay, nightsBetween, todayYmd } from "@/lib/format";
import { centsToInput, formatKes, parseKes } from "@/lib/money";
import type { Guest, Reservation, Room, RoomType, TaxRate } from "@/lib/types";

type Common = { onClose: () => void; onDone: (message: string) => void };

const MAX_RATE_CENTS = 10_000_000; // KES 100,000 a night, the limit the API applies

/** One key per distinct request body, so a retry of the same booking is replayed and a changed one is new. */
function useAttempt() {
  const ref = useRef<{ payload: string; key: string } | null>(null);
  return (body: unknown) => {
    const payload = JSON.stringify(body);
    if (ref.current?.payload !== payload) ref.current = { payload, key: newIdempotencyKey() };
    return ref.current.key;
  };
}

// ---- room type ----

export function RoomTypeDialog({ type, rates, onClose, onDone }: Common & { type?: RoomType; rates: TaxRate[] }) {
  const usable = rates.filter((r) => r.active || r.id === type?.tax_rate_id);
  const [name, setName] = useState(type?.name ?? "");
  const [rate, setRate] = useState(type ? centsToInput(type.base_rate_cents) : "");
  const [capacity, setCapacity] = useState(String(type?.capacity ?? 2));
  const [tax, setTax] = useState(String(type?.tax_rate_id ?? usable.find((r) => r.treatment === "standard")?.id ?? ""));
  const [active, setActive] = useState(type?.active ?? true);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const cents = parseKes(rate);
  const rateBad = rate.trim() !== "" && (cents === null || cents > MAX_RATE_CENTS);
  const people = Number(capacity);
  return (
    <FormDialog
      open
      title={type ? `Edit ${type.name}` : "Add a room type"}
      submitLabel={type ? "Save" : "Add room type"}
      onClose={onClose}
      onFieldErrors={setErrors}
      disabled={!name.trim() || cents === null || rateBad || !Number.isInteger(people) || people < 1 || people > 12 || !tax}
      onSubmit={async () => {
        const body = { name: name.trim(), base_rate_cents: cents!, capacity: people, tax_rate_id: Number(tax) };
        if (type) await api(`/room-types/${type.id}`, { method: "PATCH", body: { ...body, active } });
        else await api("/room-types", { method: "POST", body });
        onDone(`${name.trim()} was ${type ? "saved" : "added"}.`);
      }}
    >
      <TextField label="Name" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} error={errors.name} required autoFocus />
      <TextField label="Price for one night (KES)" inputMode="decimal" value={rate} onChange={(e) => setRate(e.target.value)} error={rateBad ? "Enter an amount up to 100,000.00." : errors.base_rate_cents} hint="The price the guest pays, tax included. Bookings already made keep the price they were made at." />
      <TextField label="Sleeps (people)" inputMode="numeric" value={capacity} onChange={(e) => setCapacity(e.target.value)} error={errors.capacity} />
      <SelectField label="Tax category" value={tax} onChange={(e) => setTax(e.target.value)} error={errors.tax_rate_id}>
        {usable.map((r) => <option key={r.id} value={r.id}>{r.name} ({(r.rate_bp / 100).toFixed(2)}%)</option>)}
      </SelectField>
      {type && (
        <label className="target flex items-center gap-3">
          <input type="checkbox" className="h-5 w-5" checked={active} onChange={(e) => setActive(e.target.checked)} />
          <span>Active (rooms of this type can be booked)</span>
        </label>
      )}
      {errors.active && <Alert tone="error">{errors.active}</Alert>}
    </FormDialog>
  );
}

// ---- room ----

export function RoomDialog({ room, types, onClose, onDone }: Common & { room?: Room; types: RoomType[] }) {
  const usable = types.filter((t) => t.active || t.id === room?.room_type_id);
  const [number, setNumber] = useState(room?.number ?? "");
  const [typeId, setTypeId] = useState(String(room?.room_type_id ?? ""));
  const [floor, setFloor] = useState(room?.floor === null || room?.floor === undefined ? "" : String(room.floor));
  const [active, setActive] = useState(room?.active ?? true);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const floorBad = floor.trim() !== "" && !/^-?\d{1,2}$/.test(floor.trim());
  return (
    <FormDialog
      open
      title={room ? `Edit room ${room.number}` : "Add a room"}
      submitLabel={room ? "Save" : "Add room"}
      onClose={onClose}
      onFieldErrors={setErrors}
      disabled={!number.trim() || !typeId || floorBad}
      onSubmit={async () => {
        const fl = floor.trim() === "" ? null : Number(floor.trim());
        if (room) await api(`/rooms/${room.id}`, { method: "PATCH", body: { number: number.trim(), room_type_id: Number(typeId), floor: fl, active } });
        else await api("/rooms", { method: "POST", body: { number: number.trim(), room_type_id: Number(typeId), ...(fl === null ? {} : { floor: fl }) } });
        onDone(`Room ${number.trim()} was ${room ? "saved" : "added"}.`);
      }}
    >
      <TextField label="Room number" value={number} maxLength={10} onChange={(e) => setNumber(e.target.value)} error={errors.number} required autoFocus />
      <SelectField label="Type" value={typeId} onChange={(e) => setTypeId(e.target.value)} error={errors.room_type_id} required>
        <option value="">Choose a type</option>
        {usable.map((t) => <option key={t.id} value={t.id}>{t.name} · {formatKes(t.base_rate_cents)} a night</option>)}
      </SelectField>
      <TextField label="Floor (optional)" inputMode="numeric" value={floor} onChange={(e) => setFloor(e.target.value)} error={floorBad ? "Enter a whole number, like 1." : errors.floor} />
      {room && (
        <label className="target flex items-center gap-3">
          <input type="checkbox" className="h-5 w-5" checked={active} onChange={(e) => setActive(e.target.checked)} />
          <span>Active (the room can be booked)</span>
        </label>
      )}
      {errors.active && <Alert tone="error">{errors.active}</Alert>}
    </FormDialog>
  );
}

// ---- guest ----

export function GuestDialog({ guest, onClose, onDone }: Common & { guest?: Guest }) {
  const [name, setName] = useState(guest?.full_name ?? "");
  const [phone, setPhone] = useState(guest?.phone ?? "");
  const [email, setEmail] = useState(guest?.email ?? "");
  const [notes, setNotes] = useState(guest?.notes ?? "");
  const [errors, setErrors] = useState<Record<string, string>>({});
  return (
    <FormDialog
      open
      title={guest ? `Edit ${guest.full_name}` : "Add a guest"}
      submitLabel={guest ? "Save" : "Add guest"}
      onClose={onClose}
      onFieldErrors={setErrors}
      disabled={!name.trim()}
      onSubmit={async () => {
        const body = { full_name: name.trim(), phone: phone.trim(), email: email.trim(), notes: notes.trim() };
        if (guest) await api(`/guests/${guest.id}`, { method: "PATCH", body });
        else await api("/guests", { method: "POST", body });
        onDone(`${name.trim()} was ${guest ? "saved" : "added"}.`);
      }}
    >
      <TextField label="Full name" value={name} maxLength={120} onChange={(e) => setName(e.target.value)} error={errors.full_name} required autoFocus />
      <TextField label="Phone (optional)" inputMode="tel" value={phone} maxLength={30} onChange={(e) => setPhone(e.target.value)} error={errors.phone} />
      <TextField label="Email (optional)" inputMode="email" value={email} maxLength={160} onChange={(e) => setEmail(e.target.value)} error={errors.email} />
      <TextField label="Notes (optional)" value={notes} maxLength={500} onChange={(e) => setNotes(e.target.value)} error={errors.notes} hint="No ID number is kept here." />
    </FormDialog>
  );
}

// ---- booking ----

export type BookingStart = { room?: Room; from?: string; to?: string };

export function BookingDialog({ rooms, start, edit, onClose, onDone }: Common & { rooms: Room[]; start?: BookingStart; edit?: Reservation }) {
  const [mode, setMode] = useState<"existing" | "new">("existing");
  const [query, setQuery] = useState("");
  const [found, setFound] = useState<Guest[]>([]);
  const [guestId, setGuestId] = useState("");
  const [newName, setNewName] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [roomId, setRoomId] = useState(String(edit?.room_id ?? start?.room?.id ?? ""));
  const [checkIn, setCheckIn] = useState(edit?.check_in ?? start?.from ?? todayYmd(0));
  const [checkOut, setCheckOut] = useState(edit?.check_out ?? start?.to ?? todayYmd(1));
  const [adults, setAdults] = useState(String(edit?.adults ?? 1));
  const [rate, setRate] = useState(edit ? centsToInput(edit.nightly_rate_cents) : start?.room ? centsToInput(start.room.base_rate_cents) : "");
  const [rateTouched, setRateTouched] = useState(!!edit);
  const [hold, setHold] = useState(false);
  const [notes, setNotes] = useState(edit?.notes ?? "");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const attempt = useAttempt();
  const live = rooms.filter((r) => r.active || r.id === edit?.room_id);
  const room = live.find((r) => String(r.id) === roomId);

  useEffect(() => {
    if (edit || mode !== "existing") return;
    let alive = true;
    api<{ guests: Guest[] }>("/guests", { query: { q: query.trim(), limit: 20 } })
      .then((r) => alive && setFound(r.guests))
      .catch(() => alive && setFound([]));
    return () => {
      alive = false;
    };
  }, [edit, mode, query]);

  const nights = nightsBetween(checkIn, checkOut);
  const cents = parseKes(rate);
  const rateBad = rate.trim() !== "" && (cents === null || cents > MAX_RATE_CENTS);
  const people = Number(adults);
  const guestOk = edit ? true : mode === "existing" ? guestId !== "" : newName.trim() !== "";
  const peopleOk = Number.isInteger(people) && people >= 1 && (!room || people <= room.capacity);
  const ready = guestOk && !!room && nights > 0 && cents !== null && !rateBad && peopleOk;

  function pickRoom(id: string) {
    setRoomId(id);
    const r = live.find((x) => String(x.id) === id);
    if (r && !rateTouched) setRate(centsToInput(r.base_rate_cents));
  }

  return (
    <FormDialog
      open
      title={edit ? `Change booking #${edit.reservation_no}` : "Make a booking"}
      submitLabel={edit ? "Save changes" : hold ? "Hold the room" : "Book the room"}
      onClose={onClose}
      onFieldErrors={setErrors}
      disabled={!ready}
      onSubmit={async () => {
        if (edit) {
          await api(`/reservations/${edit.id}`, {
            method: "PATCH",
            body: { room_id: Number(roomId), check_in: checkIn, check_out: checkOut, adults: people, nightly_rate_cents: cents!, notes: notes.trim() },
          });
          onDone(`Booking #${edit.reservation_no} was saved.`);
          return;
        }
        const body = {
          ...(mode === "existing" ? { guest_id: Number(guestId) } : { guest: { full_name: newName.trim(), phone: newPhone.trim() } }),
          room_id: Number(roomId),
          check_in: checkIn,
          check_out: checkOut,
          adults: people,
          nightly_rate_cents: cents!,
          status: hold ? "tentative" : "confirmed",
          notes: notes.trim(),
        };
        const res = await api<{ reservation: Reservation }>("/reservations", { method: "POST", body, idempotencyKey: attempt(body) });
        onDone(`Booking #${res.reservation.reservation_no} for ${res.reservation.guest_name}, room ${res.reservation.room_number}, ${formatDay(checkIn)} to ${formatDay(checkOut)}${hold ? " is on hold." : " is confirmed."}`);
      }}
    >
      {!edit && (
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">Guest</legend>
          <div className="flex gap-2">
            {(["existing", "new"] as const).map((m) => (
              <button key={m} type="button" aria-pressed={mode === m} className={`target rounded-md border px-3 py-1.5 text-sm font-medium ${mode === m ? "border-teal-brand bg-teal-brand text-white" : "border-stone-brand bg-white"}`} onClick={() => setMode(m)}>
                {m === "existing" ? "Someone we know" : "A new guest"}
              </button>
            ))}
          </div>
          {mode === "existing" ? (
            <>
              <TextField label="Search by name or phone" value={query} onChange={(e) => setQuery(e.target.value)} />
              <SelectField label="Guest" value={guestId} onChange={(e) => setGuestId(e.target.value)} error={errors.guest_id} required>
                <option value="">{found.length ? "Choose a guest" : "No guest found"}</option>
                {found.map((g) => <option key={g.id} value={g.id}>{g.full_name}{g.phone ? ` · ${g.phone}` : ""}</option>)}
              </SelectField>
            </>
          ) : (
            <>
              <TextField label="Full name" value={newName} maxLength={120} onChange={(e) => setNewName(e.target.value)} error={errors.full_name} required />
              <TextField label="Phone (optional)" inputMode="tel" value={newPhone} maxLength={30} onChange={(e) => setNewPhone(e.target.value)} error={errors.phone} />
            </>
          )}
        </fieldset>
      )}
      {edit && <p className="text-sm">Guest: <strong>{edit.guest_name}</strong></p>}
      <SelectField label="Room" value={roomId} onChange={(e) => pickRoom(e.target.value)} error={errors.room_id} required>
        <option value="">Choose a room</option>
        {live.map((r) => <option key={r.id} value={r.id}>Room {r.number} · {r.room_type} · sleeps {r.capacity}</option>)}
      </SelectField>
      <div className="grid grid-cols-2 gap-3">
        <TextField label="Arrives" type="date" min={edit ? undefined : todayYmd(0)} value={checkIn} onChange={(e) => setCheckIn(e.target.value)} error={errors.check_in} />
        <TextField label="Leaves" type="date" min={checkIn || undefined} value={checkOut} onChange={(e) => setCheckOut(e.target.value)} error={errors.check_out} hint="The leaving night is free for the next guest." />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <TextField label="Adults" inputMode="numeric" value={adults} onChange={(e) => setAdults(e.target.value)} error={!peopleOk && room ? `This room sleeps ${room.capacity}.` : errors.adults} />
        <TextField label="Price for one night (KES)" inputMode="decimal" value={rate} onChange={(e) => { setRate(e.target.value); setRateTouched(true); }} error={rateBad ? "Enter an amount up to 100,000.00." : errors.nightly_rate_cents} hint="Tax included." />
      </div>
      <TextField label="Notes (optional)" value={notes} maxLength={500} onChange={(e) => setNotes(e.target.value)} error={errors.notes} />
      {!edit && (
        <label className="target flex items-center gap-3">
          <input type="checkbox" className="h-5 w-5" checked={hold} onChange={(e) => setHold(e.target.checked)} />
          <span>Only hold it for now (the room stays free for others until you confirm)</span>
        </label>
      )}
      <p className="money text-right text-lg font-semibold">
        {nights > 0 && cents !== null && !rateBad ? `${nights} night${nights === 1 ? "" : "s"} · ${formatKes(nights * cents)}` : "Choose the dates"}
      </p>
    </FormDialog>
  );
}

// ---- cancel ----

export function CancelBookingDialog({ booking, onClose, onDone }: Common & { booking: Reservation }) {
  const [reason, setReason] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  return (
    <FormDialog
      open
      title={`Cancel booking #${booking.reservation_no}`}
      submitLabel="Cancel the booking"
      danger
      onClose={onClose}
      onFieldErrors={setErrors}
      disabled={!reason.trim()}
      onSubmit={async () => {
        await api(`/reservations/${booking.id}/cancel`, { method: "POST", body: { reason: reason.trim() } });
        onDone(`Booking #${booking.reservation_no} was cancelled. Room ${booking.room_number} is free again.`);
      }}
    >
      <p>{booking.guest_name} · room {booking.room_number} · {formatDay(booking.check_in)} to {formatDay(booking.check_out)}</p>
      <TextField label="Why is it cancelled?" value={reason} maxLength={200} onChange={(e) => setReason(e.target.value)} error={errors.reason} required autoFocus />
    </FormDialog>
  );
}
