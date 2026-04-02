import Link from 'next/link';

export function Header() {
  return (
    <header className="border-b border-border">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
        <Link
          href="/"
          className="font-mono text-sm tracking-wider text-foreground hover:text-accent transition-colors"
        >
          mpp.t2000.ai
        </Link>
        <nav className="flex items-center gap-4 sm:gap-5">
          <Link
            href="/services"
            className="font-mono text-[10px] tracking-[0.12em] text-muted uppercase hover:text-foreground transition-colors min-h-[36px] flex items-center"
          >
            Services
          </Link>
          <Link
            href="/explorer"
            className="font-mono text-[10px] tracking-[0.12em] text-muted uppercase hover:text-foreground transition-colors min-h-[36px] flex items-center"
          >
            Explorer
          </Link>
          <a
            href="https://suimpp.dev/spec"
            target="_blank"
            rel="noopener noreferrer"
            className="font-mono text-[10px] tracking-[0.12em] text-muted uppercase hover:text-foreground transition-colors min-h-[36px] flex items-center"
          >
            Spec
          </a>
          <a
            href="https://suimpp.dev/docs"
            target="_blank"
            rel="noopener noreferrer"
            className="font-mono text-[10px] tracking-[0.12em] text-muted uppercase hover:text-foreground transition-colors min-h-[36px] flex items-center"
          >
            Docs
          </a>
        </nav>
      </div>
    </header>
  );
}
