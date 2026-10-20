"use client";

import { useEffect, useRef, useState } from "react";
import { FormDialog } from "@/components/FormDialog";
import { SelectField } from "@/components/catalogue/SelectField";
import { Alert, LoadingState } from "@/components/ui";
import { ApiError, api, errorMessage, newIdempotencyKey } from "@/lib/api";
import { formatKes } from "@/lib/money";
import type { InHouseStay } from "@/lib/types";

type Result = { charge: { receipt_no: number; total_cents: number; room_number: string; guest_name: string } };

/** Charge an order to the room of a guest who is in the house. Nothing is paid: the guest settles the folio at the desk. */
export function ChargeToRoomDialog({ orderId, version, totalCents, onClose, onDone }: { orderId: number; version: number; totalCents: number; onClose: () => void; onDone: (message: string) => void }) {
  const [stays, setStays] = useState<InHouseStay[] | { error: string }>();
  const [folioId, setFolioId] = useState("");
  // One key per exact request, so a double tap or a retry charges once.
  const key = useRef(newIdempotencyKey());

  useEffect(() => {
    let alive = true;
    api<{ stays: InHouseStay[] }>("/rooms/in-house")
      .then((r) => alive && setStays(r.stays.filter((s) => s.folio_id !== undefined)))
      .catch((err) => alive && setStays({ error: errorMessage(err) }));
    return () => {
      alive = false;
    };
  }, []);

  const list = Array.isArray(stays) ? stays : [];
  const chosen = list.find((s) => String(s.folio_id) === folioId);
  return (
    <FormDialog
      open
      title="Charge to a room"
      submitLabel={chosen ? `Charge ${formatKes(totalCents)} to room ${chosen.room_number}` : "Charge to room"}
      onClose={onClose}
      disabled={!chosen}
      onSubmit={async () => {
        try {
          const res = await api<Result>(`/folios/${folioId}/charges`, { method: "POST", body: { order_id: orderId, expected_version: version }, idempotencyKey: key.current });
          onDone(`Charged ${formatKes(res.charge.total_cents)} to room ${res.charge.room_number} (${res.charge.guest_name}). Receipt #${res.charge.receipt_no}.`);
        } catch (err) {
          if (err instanceof ApiError && err.code !== "idempotency_conflict") key.current = newIdempotencyKey();
          throw err;
        }
      }}
    >
      {stays === undefined && <LoadingState label="Looking for guests in the house" />}
      {stays && !Array.isArray(stays) && <Alert tone="error">{stays.error}</Alert>}
      {Array.isArray(stays) && list.length === 0 && <Alert tone="info">Nobody is checked in, so there is no room to charge.</Alert>}
      {list.length > 0 && (
        <>
          <p>The guest pays this with their room bill. The order total is {formatKes(totalCents)}.</p>
          <SelectField label="Room" value={folioId} onChange={(e) => setFolioId(e.target.value)}>
            <option value="">Choose a room</option>
            {list.map((s) => <option key={s.stay_id} value={s.folio_id}>Room {s.room_number} · {s.guest_name}</option>)}
          </SelectField>
        </>
      )}
    </FormDialog>
  );
}
