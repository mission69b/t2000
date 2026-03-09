import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";

export const metadata: Metadata = {
  title: "t2000 — Security",
  description:
    "Security posture, audit status, and responsible disclosure for the t2000 platform.",
};

const GITHUB_URL = "https://github.com/mission69b/t2000";

const AUDIT_FINDINGS = [
  { severity: "CRITICAL", count: 1, fixed: 1, color: "text-red-400 bg-red-500/10 border-red-500/20" },
  { severity: "HIGH", count: 5, fixed: 5, color: "text-orange-400 bg-orange-500/10 border-orange-500/20" },
  { severity: "MEDIUM", count: 7, fixed: 5, color: "text-yellow-400 bg-yellow-500/10 border-yellow-500/20" },
  { severity: "LOW", count: 5, fixed: 4, color: "text-blue-400 bg-blue-500/10 border-blue-500/20" },
  { severity: "INFO", count: 4, fixed: 0, color: "text-zinc-400 bg-zinc-500/10 border-zinc-500/20" },
];

const SECURITY_MEASURES = [
  {
    title: "Non-Custodial",
    desc: "Private keys are generated and stored locally, encrypted with AES-256-GCM and scrypt KDF. We never have access to your keys.",
  },
  {
    title: "Transaction Simulation",
    desc: "All transactions are simulated (dry-run) before signing. Move abort codes are mapped to user-friendly error messages.",
  },
  {
    title: "On-Chain Governance",
    desc: "Fee changes require a 7-day on-chain timelock. Fees are hard-capped at 5% in the smart contract. Two-step admin transfer.",
  },
  {
    title: "Price Circuit Breaker",
    desc: "Gas sponsorship is automatically paused when SUI price moves >20% in one hour, preventing oracle manipulation.",
  },
  {
    title: "Automated Scanning",
    desc: "GitHub Actions pipeline runs CodeQL static analysis, dependency audits, and license compliance checks on every push and weekly.",
  },
  {
    title: "Test Suite",
    desc: "317 tests across 20 files covering unit, integration, and adapter compliance — including multi-protocol orchestration edge cases.",
  },
];

export default function SecurityPage() {
  return (
    <main className="min-h-screen bg-background text-foreground relative z-10">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-12 sm:py-20">
        <header className="mb-12">
          <Link
            href="/"
            className="inline-block text-muted hover:text-accent text-xs font-mono mb-8 transition-colors"
          >
            ← t2000.ai
          </Link>
          <div className="flex items-center gap-3 mb-2">
            <h1 className="text-3xl sm:text-4xl font-serif italic text-foreground tracking-tight">
              Security
            </h1>
            <span className="px-2 py-0.5 text-[9px] font-semibold tracking-widest uppercase bg-amber-500/20 text-amber-400 border border-amber-500/30 rounded font-mono">
              beta
            </span>
          </div>
          <p className="text-sm text-muted font-mono">
            Audit status, security measures, and responsible disclosure
          </p>
        </header>

        {/* ── Audit Status ── */}
        <section className="mb-12">
          <h2 className="text-foreground text-lg font-serif italic mb-4">
            Audit Status
          </h2>
          <div className="bg-card border border-border rounded-lg p-5 space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted font-mono">
                Last audit
              </span>
              <span className="text-sm text-foreground font-mono">
                March 2026
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted font-mono">Type</span>
              <span className="text-sm text-foreground font-mono">
                Full-stack automated review
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted font-mono">Scope</span>
              <span className="text-sm text-foreground font-mono">
                SDK, CLI, Server, Indexer, Contracts, CI/CD
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted font-mono">Report</span>
              <a
                href={`${GITHUB_URL}/blob/main/SECURITY_AUDIT.md`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-accent hover:underline font-mono"
              >
                SECURITY_AUDIT.md →
              </a>
            </div>
            <div className="h-px bg-border" />
            <div className="flex flex-wrap gap-2">
              {AUDIT_FINDINGS.map((f) => (
                <span
                  key={f.severity}
                  className={`px-2.5 py-1 text-[11px] font-mono font-semibold border rounded ${f.color}`}
                >
                  {f.count} {f.severity}{f.fixed > 0 && ` (${f.fixed} fixed)`}
                </span>
              ))}
            </div>
            <p className="text-xs text-muted font-mono">
              No critical vulnerabilities enabling direct fund theft were found.
              20 of 22 findings remediated. 2 deferred (infrastructure changes).
            </p>
          </div>
        </section>

        {/* ── CI Badges ── */}
        <section className="mb-12">
          <h2 className="text-foreground text-lg font-serif italic mb-4">
            CI / CD Pipeline
          </h2>
          <div className="flex flex-wrap gap-3">
            <a
              href={`${GITHUB_URL}/actions/workflows/ci.yml`}
              target="_blank"
              rel="noopener noreferrer"
            >
              <Image
                src={`${GITHUB_URL}/actions/workflows/ci.yml/badge.svg`}
                alt="CI status"
                width={120}
                height={20}
                unoptimized
              />
            </a>
            <a
              href={`${GITHUB_URL}/actions/workflows/security.yml`}
              target="_blank"
              rel="noopener noreferrer"
            >
              <Image
                src={`${GITHUB_URL}/actions/workflows/security.yml/badge.svg`}
                alt="Security status"
                width={120}
                height={20}
                unoptimized
              />
            </a>
          </div>
          <p className="text-xs text-muted font-mono mt-3">
            Every push and PR runs lint, typecheck, 317 tests, CodeQL analysis,
            dependency audit, and license compliance.
          </p>
        </section>

        {/* ── Security Measures ── */}
        <section className="mb-12">
          <h2 className="text-foreground text-lg font-serif italic mb-4">
            Security Measures
          </h2>
          <div className="grid gap-4">
            {SECURITY_MEASURES.map((m) => (
              <div
                key={m.title}
                className="bg-card border border-border rounded-lg p-4"
              >
                <h3 className="text-sm text-foreground font-mono font-semibold mb-1">
                  {m.title}
                </h3>
                <p className="text-xs text-muted font-mono leading-relaxed">
                  {m.desc}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* ── Responsible Disclosure ── */}
        <section className="mb-12">
          <h2 className="text-foreground text-lg font-serif italic mb-4">
            Responsible Disclosure
          </h2>
          <div className="bg-card border border-border rounded-lg p-5 space-y-3 font-mono text-[13px]">
            <p className="text-muted">
              If you discover a security vulnerability, please report it
              responsibly.{" "}
              <strong className="text-foreground">
                Do not open a public GitHub issue.
              </strong>
            </p>
            <div className="space-y-2">
              <div className="flex items-center gap-3">
                <span className="text-muted w-24 shrink-0">Report</span>
                <a
                  href={`${GITHUB_URL}/security/advisories/new`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-accent hover:underline"
                >
                  GitHub Security Advisory →
                </a>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-muted w-24 shrink-0">Response</span>
                <span className="text-foreground">
                  Acknowledgment within 48 hours
                </span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-muted w-24 shrink-0">Policy</span>
                <a
                  href={`${GITHUB_URL}/blob/main/SECURITY.md`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-accent hover:underline"
                >
                  SECURITY.md →
                </a>
              </div>
            </div>
          </div>
        </section>

        <footer className="mt-16 pt-8 border-t border-border text-xs text-dim font-mono flex gap-6">
          <Link href="/terms" className="hover:text-muted transition-colors">
            Terms
          </Link>
          <Link
            href="/disclaimer"
            className="hover:text-muted transition-colors"
          >
            Disclaimer
          </Link>
          <Link href="/privacy" className="hover:text-muted transition-colors">
            Privacy
          </Link>
        </footer>
      </div>
    </main>
  );
}
