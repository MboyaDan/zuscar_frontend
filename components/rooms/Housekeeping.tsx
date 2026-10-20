"use client";

import { useEffect, useState } from "react";
import { FormDialog } from "@/components/FormDialog";
import { SelectField } from "@/components/catalogue/SelectField";
import { Alert, Button, EmptyState, LoadingState, TextField } from "@/components/ui";
import { api, errorMessage } from "@/lib/api";
import type { HousekeepingTask, Room } from "@/lib/types";

const STATUS_LABEL: Record<HousekeepingTask["status"], string> = { open: "Waiting", in_progress: "Started", done: "Done", cancelled: "Cancelled" };
const KIND_LABEL: Record<HousekeepingTask["kind"], string> = { clean: "Cleaning", maintenance: "Repair" };

type State = { status: "loading" } | { status: "error"; message: string } | { status: "ready"; tasks: HousekeepingTask[] };

export function HousekeepingTab({ rooms, onRoomsChanged }: { rooms: Room[]; onRoomsChanged: () => void }) {
  const [filter, setFilter] = useState<"active" | "done" | "cancelled">("active");
  const [state, setState] = useState<State>({ status: "loading" });
  const [tick, setTick] = useState(0);
  const [adding, setAdding] = useState(false);
  const [notice, setNotice] = useState<string>();
  const [problem, setProblem] = useState<string>();
  const [busyId, setBusyId] = useState<number>();

  useEffect(() => {
    let alive = true;
    api<{ tasks: HousekeepingTask[] }>("/housekeeping/tasks", { query: { status: filter } })
      .then((r) => alive && setState({ status: "ready", tasks: r.tasks }))
      .catch((err) => alive && setState({ status: "error", message: errorMessage(err) }));
    return () => {
      alive = false;
    };
  }, [filter, tick]);

  async function move(t: HousekeepingTask, status: "in_progress" | "done" | "cancelled", message: string) {
    setBusyId(t.id);
    setProblem(undefined);
    try {
      await api(`/housekeeping/tasks/${t.id}`, { method: "PATCH", body: { status } });
      setNotice(message);
      setTick((n) => n + 1);
      onRoomsChanged();
    } catch (err) {
      setProblem(errorMessage(err));
    } finally {
      setBusyId(undefined);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div className="max-w-xs flex-1">
          <SelectField label="Show" value={filter} onChange={(e) => setFilter(e.target.value as typeof filter)}>
            <option value="active">To do</option>
            <option value="done">Done</option>
            <option value="cancelled">Cancelled</option>
          </SelectField>
        </div>
        <Button variant="secondary" onClick={() => setAdding(true)}>Add a job</Button>
      </div>
      <p className="text-slate-brand/80">A room that needs cleaning gets a job by itself. Starting it marks the room as being cleaned; finishing it makes the room ready for the next guest.</p>
      {notice && <Alert tone="success">{notice}</Alert>}
      {problem && <Alert tone="error">{problem}</Alert>}
      {state.status === "loading" && <LoadingState label="Loading jobs" />}
      {state.status === "error" && <Alert tone="error">{state.message}</Alert>}
      {state.status === "ready" &&
        (state.tasks.length === 0 ? (
          <EmptyState title="No jobs">{filter === "active" ? "Every room is clean and nothing needs fixing." : "Nothing here."}</EmptyState>
        ) : (
          <ul className="space-y-3">
            {state.tasks.map((t) => (
              <li key={t.id} className="rounded-lg border border-stone-brand bg-white p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h2 className="text-lg font-semibold">Room {t.room_number} · {KIND_LABEL[t.kind]}</h2>
                    <p className="text-sm text-slate-brand/80">{STATUS_LABEL[t.status]}{t.assigned_name ? ` · ${t.assigned_name}` : ""}</p>
                    {t.note && <p className="text-sm">{t.note}</p>}
                  </div>
                  {(t.status === "open" || t.status === "in_progress") && (
                    <div className="flex flex-wrap gap-2">
                      {t.status === "open" && <Button busy={busyId === t.id} onClick={() => move(t, "in_progress", `Room ${t.room_number}: started.`)}>Start</Button>}
                      <Button busy={busyId === t.id} variant={t.status === "open" ? "secondary" : "primary"} onClick={() => move(t, "done", t.kind === "clean" ? `Room ${t.room_number} is clean and ready.` : `Room ${t.room_number}: job done.`)}>
                        {t.kind === "clean" ? "Finish, room ready" : "Done"}
                      </Button>
                      <Button busy={busyId === t.id} variant="secondary" onClick={() => move(t, "cancelled", `Room ${t.room_number}: job cancelled.`)}>Cancel</Button>
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ul>
        ))}
      {adding && (
        <JobDialog
          rooms={rooms}
          onClose={() => setAdding(false)}
          onDone={(m) => {
            setNotice(m);
            setTick((n) => n + 1);
          }}
        />
      )}
    </div>
  );
}

function JobDialog({ rooms, onClose, onDone }: { rooms: Room[]; onClose: () => void; onDone: (message: string) => void }) {
  const [roomId, setRoomId] = useState("");
  const [kind, setKind] = useState<"clean" | "maintenance">("maintenance");
  const [note, setNote] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  return (
    <FormDialog
      open
      title="Add a job"
      submitLabel="Add job"
      onClose={onClose}
      onFieldErrors={setErrors}
      disabled={!roomId || (kind === "maintenance" && !note.trim())}
      onSubmit={async () => {
        await api("/housekeeping/tasks", { method: "POST", body: { room_id: Number(roomId), kind, note: note.trim() } });
        onDone("The job was added.");
      }}
    >
      <SelectField label="Room" value={roomId} onChange={(e) => setRoomId(e.target.value)} error={errors.room_id}>
        <option value="">Choose a room</option>
        {rooms.filter((r) => r.active).map((r) => <option key={r.id} value={r.id}>Room {r.number}</option>)}
      </SelectField>
      <SelectField label="What kind" value={kind} onChange={(e) => setKind(e.target.value as typeof kind)} error={errors.kind}>
        <option value="maintenance">Repair or fix</option>
        <option value="clean">Cleaning</option>
      </SelectField>
      <TextField label={kind === "maintenance" ? "What needs doing (required)" : "Note (optional)"} value={note} maxLength={200} onChange={(e) => setNote(e.target.value)} error={errors.note} />
    </FormDialog>
  );
}
