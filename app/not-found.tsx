import Link from "next/link";
import { Logo } from "@/components/Logo";

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-[70vh] max-w-md flex-col items-center justify-center gap-6 px-6 text-center">
      <Logo variant="horizontal" className="h-16 w-auto" />
      <h1 className="text-2xl font-semibold">Page not found</h1>
      <p>The page you asked for does not exist.</p>
      <Link href="/" className="target inline-flex items-center rounded-lg bg-teal-brand px-5 font-medium text-white">
        Back to start
      </Link>
    </main>
  );
}
