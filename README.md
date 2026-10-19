# Zuscar frontend

Next.js web app for Zuscar. This repository is **independent**: it deploys to Vercel on its own. The Go API lives in the separate `zuscar-backend` repository (Docker locally, Render in production). Project documents are in the backend repository's `docs/`; this repo keeps only `docs/design-tokens.md`.

**Status: Stage 13, part b-2 (shifts and the payments queue).** Everything from before (sign-in, shell, admin screens, catalogue, table board, order screen, payment screen, sales) plus: **My shift** (open with a float, running expected cash, cash in, cash out and expenses, close with the counted cash and the difference shown), **Shifts** (the list for managers, a shift's cash-up, and marking a closed shift as checked) and **Payments** (the queue of M-Pesa, card and bank payments waiting for a reconciler to confirm or mark as failed). The kitchen ticket list comes in the last patch of Stage 13.

## How the app is organised
- `lib/api.ts`: the only code that calls the backend. Same-origin `/api/v1`, CSRF header on state-changing calls, one `ApiError` shape (code, message, field messages, request id), `newIdempotencyKey()` for calls that must not be applied twice.
- `lib/session.tsx`: who is signed in (`GET /auth/me`) and `can(permission)`. Permissions come from the API on every load; hiding a menu item is a convenience, the API refuses what a user may not do.
- `lib/reauth.tsx`: `withReauth(() => api(...))` opens the password prompt when the API answers `reauth_required` and retries once.
- `lib/nav.ts`: the navigation list. A screen is added here when its page exists.
- `app/(app)/pos/`: the Sell screens. `/pos` is the table board (free and taken tables, open orders, new takeaway order); `/pos/[orderId]` is the order screen. Keyboard: the search box has focus when the order opens, `/` jumps back to it, Enter adds the first match (a product with options opens a small dialog; Enter in its note box adds it), Escape clears the search. Every change sends the order version the screen showed, so if someone else changed the order the screen refreshes instead of overwriting it. "Send to kitchen" keeps one Idempotency-Key per order version, so a double tap or a retry cannot issue two ticket numbers.
- `app/(app)/pos/[orderId]/pay` and `app/(app)/sales`: the payment screen, the sale page and the Sales list. Finalising and adding a payment each send one Idempotency-Key per exact request (the key is reused only while the request body is identical), so a double click or a retry after a dropped connection records one sale or one payment. Amounts are typed in KES and converted to cents by `lib/money.ts`; the API still decides every total. Cash needs an open shift: without one the API answers `shift_required` and the screen says to open it on My shift.
- `app/(app)/`: signed-in screens, behind the gate in `layout.tsx`. `app/login`, `app/change-password` and `app/help/outage` are outside the gate on purpose.
- `proxy.ts`: sends someone with no session cookie to the sign-in page. Not a security check.
- `components/ui.tsx`: buttons, fields, alerts, modal, loading, empty and error states. Every error state carries an icon and a word.

## Run it locally
You need Node.js 22 (anything from 20.9 up works). **No Docker is needed for the frontend** (Vercel builds it from source). Start the backend first by following the backend README (`docker compose up --build -d`).

1. `npm install`
2. Create your local env file:
   - macOS/Linux: `cp .env.example .env.local`
   - Windows PowerShell: `Copy-Item .env.example .env.local`

   `.env.local` is git-ignored. The defaults (`http://localhost:3000` and `http://localhost:8080`) already match a locally running backend.
3. `npm run dev`
4. Open http://localhost:3000. You should land on the sign-in page with "Connected" at the bottom. In development the backend's `seed-dev` command creates fictional users (`dev.owner`, `dev.manager`, ...); its output prints the shared development password. As a direct check, http://localhost:3000/api/v1/health should show `{"status":"ok"}`: that request went from the web app to your Docker backend.

If the indicator says "Offline": confirm `docker compose ps` in the backend repo shows it running, that http://localhost:8080/healthz works, and that `BACKEND_URL` in `.env.local` is right. Restart `npm run dev` after editing `.env.local`.

## How the frontend finds the backend (nothing hard-coded)
The browser only ever calls **its own origin** under `/api/...`. Next.js forwards those requests to the backend using `BACKEND_URL` (see `next.config.ts`). So there is no CORS to configure, and the session cookie stays first-party.

| Variable | Local (`.env.local`) | Vercel |
|---|---|---|
| `NEXT_PUBLIC_APP_URL` | `http://localhost:3000` | your production https URL or custom domain |
| `NEXT_PUBLIC_APP_ENV` | `development` | `production` (anything else shows the "Test environment" banner) |
| `BACKEND_URL` | `http://localhost:8080` | your Render URL, e.g. `https://zuscar-api.onrender.com` |

Two things to know:
- `BACKEND_URL` is **server-side only** (no `NEXT_PUBLIC_` prefix, so it is never sent to browsers) and is read at **build** time. After changing it on Vercel, redeploy. A production build fails on purpose if it is missing.
- The backend must be told this app's address too: its `FRONTEND_URL` must equal `NEXT_PUBLIC_APP_URL` exactly.

## Deploy to Vercel (outline, unverified)
1. Push this repository to Git and import it in Vercel (framework: Next.js, defaults are fine).
2. Add the three variables above under Project Settings > Environment Variables, then deploy.
3. Put the resulting URL into the backend's `FRONTEND_URL` on Render.
4. Whether the Vercel rewrite forwards cookies and long requests correctly has not been tested on a real deployment yet; it is checked during Stages 6 and 8.

## Commands
`npm run dev` · `npm run build` (needs `BACKEND_URL` in `.env.local`, because a production build refuses to run without it) · `npm run lint` · `npm run typecheck` · `npm run check:brand` (logo sizes match the supplied SVG viewBoxes) · `npm run brand:icons` (re-render PNG icons from the favicon SVG).

## Brand
Supplied artwork is in `public/brand/` and is used only through `components/Logo.tsx`; never redraw or recolour it. Colour tokens are in `app/globals.css`; contrast checks are in `docs/design-tokens.md`.
- `app/(app)/shift`, `app/(app)/shifts` and `app/(app)/payments`: the till shift screens and the payments queue. The expected cash is always the API's figure; the browser only compares the typed count with it. Open, cash movement, close and reconcile each send one Idempotency-Key per exact request body. Pending non-cash money is shown apart from cash.
