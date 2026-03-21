import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-6">
      <div className="text-center max-w-md">
        <div className="text-accent font-mono text-sm mb-2">404</div>
        <h1 className="text-foreground text-lg font-medium mb-3">
          This is an API endpoint
        </h1>
        <p className="text-muted text-sm mb-6 leading-relaxed">
          MPP endpoints accept <code className="text-foreground bg-panel px-1.5 py-0.5 rounded border border-border text-xs">POST</code> requests
          with Sui USDC payment. Use the CLI or SDK to interact.
        </p>
        <div className="flex items-center justify-center gap-4 text-xs">
          <Link href="/" className="text-accent hover:underline">
            Browse services
          </Link>
          <span className="text-dim">·</span>
          <Link href="/api/services" className="text-accent hover:underline">
            API catalog
          </Link>
          <span className="text-dim">·</span>
          <Link href="/llms.txt" className="text-accent hover:underline">
            llms.txt
          </Link>
        </div>
      </div>
    </div>
  );
}
