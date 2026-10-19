import type { Metadata } from "next";
import Link from "next/link";
import { Logo } from "@/components/Logo";

export const metadata: Metadata = { title: "Connection lost" };

// Kept outside the signed-in area on purpose: when the connection is down you may not be able to sign in.
export default function OutagePage() {
  return (
    <main id="main" className="mx-auto max-w-prose px-6 py-10">
      <Logo variant="horizontal" className="mb-8 h-12 w-auto" />
      <h1 className="text-3xl font-semibold">Connection lost</h1>
      <p className="mt-4">The app cannot reach the server right now. This page opens when the connection indicator shows <strong>Offline</strong>.</p>
      <ul className="mt-4 list-disc space-y-2 pl-6">
        <li>Check the internet connection of this device and try again.</li>
        <li>Do not enter the same action twice while you wait. Screens that save data will tell you when a save did not go through.</li>
        <li>Tell your manager that the system is offline.</li>
      </ul>
      <h2 className="mt-8 text-xl font-semibold">If the system stays down: sell on paper</h2>
      <p className="mt-2">Only a manager decides to switch to paper. Then:</p>
      <ol className="mt-2 list-decimal space-y-2 pl-6">
        <li>Take orders on paper pads. The kitchen cooks from the paper ticket.</li>
        <li>Write every sale in the numbered receipt book: the book number, date and time, each item with quantity and the price charged, the total, and how it was paid (the M-Pesa, card or bank reference if it was not cash).</li>
        <li>Give the customer the top copy. Keep the carbon in the book, in order. A receipt written wrongly is crossed out, marked VOID and left in the book.</li>
        <li>Keep the cash in the drawer. Do not enter anything in the system yet, and do not re-key the sale later as a new order.</li>
      </ol>
      <p className="mt-4">When the system is back, the Business Manager enters each paper receipt once on the <strong>Outage entries</strong> screen. A receipt that was already entered is refused. Receipts older than 31 days go to the owner. The full procedure is kept with the system documents.</p>
      <p className="mt-6"><Link href="/dashboard" className="text-teal-brand underline">Try again</Link></p>
    </main>
  );
}
