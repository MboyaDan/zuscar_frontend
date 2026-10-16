// The one place the browser talks to the backend. Calls go to this app's own origin under /api/v1 (ADR-05);
// Next.js forwards them to the Go API. State-changing calls carry the CSRF token the API set in a cookie (ADR-13).

export type FieldError = { field: string; message: string };

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly fields: FieldError[] = [],
    public readonly requestId?: string,
  ) {
    super(message);
    this.name = "ApiError";
  }

  /** The message for one form field, if the API named it. */
  fieldMessage(field: string): string | undefined {
    return this.fields.find((f) => f.field === field)?.message;
  }
}

/** Fired when any call (other than sign-in) is answered with 401, so the session can return to signed-out. */
export const UNAUTHENTICATED_EVENT = "zuscar:unauthenticated";

const BASE = "/api/v1";

function csrfToken(): string {
  const match = document.cookie.match(/(?:^|; )zuscar_csrf=([^;]*)/);
  return match?.[1] ? decodeURIComponent(match[1]) : "";
}

/** A fresh key for a state-changing call that must not be applied twice (docs: idempotency, NN-05). */
export function newIdempotencyKey(): string {
  return crypto.randomUUID();
}

type Method = "GET" | "POST" | "PATCH" | "PUT" | "DELETE";

export type RequestOptions = {
  method?: Method;
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined | null>;
  /** Sent as Idempotency-Key. Reuse the same key when retrying the same user action. */
  idempotencyKey?: string;
  signal?: AbortSignal;
};

function buildUrl(path: string, query?: RequestOptions["query"]): string {
  const url = `${BASE}${path}`;
  if (!query) return url;
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (v !== undefined && v !== null && v !== "") params.set(k, String(v));
  }
  const qs = params.toString();
  return qs ? `${url}?${qs}` : url;
}

export async function api<T = void>(path: string, opts: RequestOptions = {}): Promise<T> {
  const method = opts.method ?? "GET";
  const headers: Record<string, string> = { Accept: "application/json" };
  if (opts.body !== undefined) headers["Content-Type"] = "application/json";
  if (method !== "GET") headers["X-CSRF-Token"] = csrfToken();
  if (opts.idempotencyKey) headers["Idempotency-Key"] = opts.idempotencyKey;

  let res: Response;
  try {
    res = await fetch(buildUrl(path, opts.query), {
      method,
      headers,
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
      credentials: "same-origin",
      cache: "no-store",
      signal: opts.signal,
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") throw err;
    throw new ApiError(0, "network", "Cannot reach the server. Check the connection and try again.");
  }

  if (res.ok) {
    if (res.status === 204) return undefined as T;
    return (await res.json()) as T;
  }

  let code = "bad_response";
  let message = "The server sent an unexpected answer. Please try again.";
  let fields: FieldError[] = [];
  let requestId: string | undefined;
  try {
    const body = (await res.json()) as { error?: { code?: string; message?: string; fields?: FieldError[]; request_id?: string } };
    if (body.error) {
      code = body.error.code ?? code;
      message = body.error.message ?? message;
      fields = body.error.fields ?? [];
      requestId = body.error.request_id;
    }
  } catch {
    // not JSON (for example a gateway error page): keep the generic message
  }
  if (res.status === 401 && path !== "/auth/login") {
    window.dispatchEvent(new Event(UNAUTHENTICATED_EVENT));
  }
  throw new ApiError(res.status, code, message, fields, requestId);
}

/** A short, human line for any thrown value. */
export function errorMessage(err: unknown): string {
  if (err instanceof ApiError) return err.message.charAt(0).toUpperCase() + err.message.slice(1);
  return "Something went wrong. Please try again.";
}
