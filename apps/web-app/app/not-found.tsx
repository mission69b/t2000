import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center px-6 text-center">
      <div className="space-y-4">
        <h1 className="text-6xl font-bold">404</h1>
        <p className="text-neutral-400">This page doesn&apos;t exist.</p>
        <Link
          href="/"
          className="inline-block rounded-xl bg-white px-6 py-3 font-semibold text-neutral-950 transition hover:bg-neutral-200"
        >
          Back to home
        </Link>
      </div>
    </main>
  );
}
