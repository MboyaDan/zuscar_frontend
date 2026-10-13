# Zuscar frontend

Next.js web app for Zuscar. This repository is **independent**: it deploys to Vercel on its own. The Go API lives in the separate `zuscar-backend` repository (Docker locally, Render in production). Project documents are in the backend repository's `docs/`; this repo keeps only `docs/design-tokens.md`.

**Status: Stage 5 (shell).** The page shows the layout, brand, test-environment banner and whether the backend is reachable. Login and the POS screens arrive in later stages.

## Run it locally
You need Node.js 22 (anything from 20.9 up works). **No Docker is needed for the frontend** (Vercel builds it from source). Start the backend first by following the backend README (`docker compose up --build -d`).

1. `npm install`
2. Create your local env file:
   - macOS/Linux: `cp .env.example .env.local`
   - Windows PowerShell: `Copy-Item .env.example .env.local`

   `.env.local` is git-ignored. The defaults (`http://localhost:3000` and `http://localhost:8080`) already match a locally running backend.
3. `npm run dev`
4. Open http://localhost:3000. You should see "Backend connected". As a direct check, http://localhost:3000/api/v1/health should show `{"status":"ok"}`: that request went from the web app to your Docker backend.

If it says "Backend not reachable": confirm `docker compose ps` in the backend repo shows it running, that http://localhost:8080/healthz works, and that `BACKEND_URL` in `.env.local` is right. Restart `npm run dev` after editing `.env.local`.

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
`npm run dev` · `npm run build` · `npm run lint` · `npm run typecheck` · `npm run check:brand` (logo sizes match the supplied SVG viewBoxes) · `npm run brand:icons` (re-render PNG icons from the favicon SVG).

## Brand
Supplied artwork is in `public/brand/` and is used only through `components/Logo.tsx`; never redraw or recolour it. Colour tokens are in `app/globals.css`; contrast checks are in `docs/design-tokens.md`.
