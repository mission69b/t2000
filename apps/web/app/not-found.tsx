import Link from "next/link";

export default function NotFound() {
  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center text-center px-6">
      <div className="text-[80px] font-serif text-accent leading-none mb-4">
        404
      </div>
      <p className="text-muted text-sm mb-8 max-w-[320px]">
        This page doesn&apos;t exist. Maybe the agent wandered off.
      </p>
      <Link
        href="/"
        className="px-6 py-2.5 border border-accent text-accent text-xs tracking-[0.1em] uppercase transition-all hover:bg-accent-dim hover:shadow-[0_0_20px_var(--accent-glow)]"
      >
        Back to home
      </Link>
    </div>
  );
}
