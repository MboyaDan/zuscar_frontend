# Zuscar frontend (Next.js 16)

See ../CLAUDE.md for cross-repo rules.

## Commands
- Install: `npm ci`   Lint: `npm run lint`   Types: `npx tsc --noEmit`   Brand check: `npm run check:brand`
- Dev: `BACKEND_URL=http://localhost:8080 NEXT_PUBLIC_APP_URL=http://localhost:3000 npm run dev`
- Build needs the same two env vars set.
- Before committing: `git restore next-env.d.ts`; do not commit `AGENTS.md`, `.next`, or env files.

## Rules
- Every screen must work at 390 px wide with no sideways page scroll.
- Rapid taps on orders go through the queue + `latest` ref in `app/(app)/pos/[orderId]/page.tsx`; keep each change carrying the newest order version.
- Printing: 80 mm receipts and the A4 report sheet (`components/reports/ReportSheet.tsx`) share print CSS in `app/globals.css`. Test print changes in both.
- Money shown to users comes from backend cents; format only at display.
