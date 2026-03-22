import Link from 'next/link';

export function Header() {
  return (
    <header className="border-b border-border">
      <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
        <Link
          href="/"
          className="text-foreground font-medium hover:text-accent transition-colors"
        >
          mpp.t2000.ai
        </Link>
        <nav className="flex items-center gap-5 text-xs text-muted">
          <Link
            href="/services"
            className="hover:text-foreground transition-colors"
          >
            Services
          </Link>
          <Link
            href="/explorer"
            className="hover:text-foreground transition-colors pointer-events-none opacity-40"
          >
            Explorer
          </Link>
          <a
            href="https://t2000.ai/docs"
            className="hover:text-foreground transition-colors"
          >
            Docs
          </a>
        </nav>
      </div>
    </header>
  );
}
