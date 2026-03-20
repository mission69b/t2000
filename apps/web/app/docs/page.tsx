"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";

const GITHUB_URL = "https://github.com/mission69b/t2000";

/* ─── Sidebar nav item (shared between desktop sidebar & mobile drawer) ─── */
function SidebarNav({
  nav,
  activeSection,
  onSelect,
}: {
  nav: { label: string; items: NavItem[] }[];
  activeSection: string;
  onSelect: (id: string) => void;
}) {
  return (
    <>
      {nav.map((group, gi) => (
        <div key={group.label}>
          {gi > 0 && <div className="h-px bg-[var(--border)] mx-5 my-4" />}
          <div className="mb-7">
            <div className="text-[10px] font-semibold tracking-[0.12em] uppercase text-[var(--doc-muted)] px-5 mb-1.5">
              {group.label}
            </div>
            {group.items.map((item) =>
              item.href ? (
                <a
                  key={item.id}
                  href={item.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-between px-5 py-1.5 text-[12.5px] text-[var(--doc-muted)] no-underline cursor-pointer transition-colors border-l-2 border-l-transparent hover:text-[var(--doc-text)] hover:bg-white/[0.03]"
                >
                  {item.name}
                </a>
              ) : (
                <a
                  key={item.id}
                  onClick={() => onSelect(item.id)}
                  className={`flex items-center justify-between px-5 py-1.5 text-[12.5px] cursor-pointer transition-colors border-l-2 no-underline ${
                    activeSection === item.id
                      ? "text-accent border-l-accent bg-accent-dim"
                      : "text-[var(--doc-muted)] border-l-transparent hover:text-[var(--doc-text)] hover:bg-white/[0.03]"
                  }`}
                >
                  {item.name}
                  {item.badge && (
                    <span
                      className={`text-[10px] rounded-[3px] px-1.5 py-px ${
                        item.badgeGreen
                          ? "text-accent bg-accent-dim"
                          : "text-warning bg-[rgba(245,166,35,0.10)]"
                      }`}
                    >
                      {item.badge}
                    </span>
                  )}
                </a>
              ),
            )}
          </div>
        </div>
      ))}
    </>
  );
}

/* ─── Nav structure ─── */
interface NavItem {
  id: string;
  name: string;
  badge?: string;
  badgeGreen?: boolean;
  href?: string;
}

const NAV: { label: string; items: NavItem[] }[] = [
  {
    label: "Getting Started",
    items: [
      { id: "quickstart", name: "Quick Start" },
      { id: "install", name: "Installation" },
      { id: "concepts", name: "Core Concepts" },
    ],
  },
  {
    label: "CLI",
    items: [
      { id: "cli-wallet", name: "Wallet" },
      { id: "cli-savings", name: "Savings & Credit" },
      { id: "cli-invest", name: "Investment" },
      { id: "cli-more", name: "Exchange & More" },
    ],
  },
  {
    label: "Reference",
    items: [
      { id: "sdk", name: "SDK / API", badge: "TS", badgeGreen: true },
      { id: "config", name: "Configuration" },
      { id: "errors", name: "Error Codes" },
    ],
  },
  {
    label: "AI Advisor",
    items: [
      { id: "mcp", name: "MCP Server", badge: "NEW", badgeGreen: true },
      { id: "init-wizard", name: "Init Wizard" },
    ],
  },
  {
    label: "Guides",
    items: [
      { id: "skills", name: "Agent Skills" },
      { id: "mpp", name: "MPP Payments" },
      { id: "defi", name: "DeFi & Yield" },
      { id: "gas", name: "Gas Management" },
    ],
  },
  {
    label: "More",
    items: [
      { id: "changelog", name: "Changelog" },
      { id: "_github", name: "GitHub ↗", href: GITHUB_URL },
      { id: "_twitter", name: "X ↗", href: "https://x.com/t2000ai" },
      { id: "_discord", name: "Discord ↗", href: "https://discord.gg/qtVJR5eH" },
    ],
  },
];

/* ─── Reusable components ─── */

function CodeBlock({
  lang,
  filename,
  children,
}: {
  lang: string;
  filename?: string;
  children: React.ReactNode;
}) {
  const preRef = useRef<HTMLPreElement>(null);
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    if (!preRef.current) return;
    navigator.clipboard.writeText(preRef.current.textContent ?? "");
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="relative bg-[var(--surface)] border border-[var(--border)] rounded-lg my-4 mb-6 overflow-hidden -mx-4 sm:mx-0">
      <div className="flex items-center justify-between px-3 sm:px-4 py-2 sm:py-2.5 border-b border-[var(--border)] bg-white/[0.02]">
        <div className="flex items-center gap-3">
          {filename && (
            <span className="text-[11.5px] text-white/45">{filename}</span>
          )}
          <span className="text-[10px] tracking-[0.08em] uppercase text-[var(--doc-muted)]">
            {lang}
          </span>
        </div>
        <button
          onClick={handleCopy}
          className={`text-[11px] border rounded px-2.5 py-0.5 cursor-pointer transition-colors ${
            copied
              ? "text-accent border-accent"
              : "text-[var(--doc-muted)] border-[var(--border)] hover:text-[var(--doc-text)] hover:border-[var(--border-mid)]"
          }`}
        >
          {copied ? "✓ Copied" : "Copy"}
        </button>
      </div>
      <pre
        ref={preRef}
        className="px-3 sm:px-5 py-3.5 sm:py-4.5 overflow-x-auto text-[12px] sm:text-[13px] leading-[1.65]"
      >
        <code>{children}</code>
      </pre>
    </div>
  );
}

function Callout({
  type,
  label,
  children,
}: {
  type: "tip" | "note" | "warn";
  label: string;
  children: React.ReactNode;
}) {
  const styles = {
    tip: "border-l-accent bg-accent-dim",
    note: "border-l-warning bg-[rgba(245,166,35,0.10)]",
    warn: "border-l-danger bg-[rgba(255,95,87,0.08)]",
  };
  const labelColors = {
    tip: "text-accent",
    note: "text-warning",
    warn: "text-danger",
  };
  return (
    <div
      className={`border-l-3 rounded-r-md px-4.5 py-3.5 my-5 text-[13px] text-white/70 ${styles[type]}`}
    >
      <div
        className={`text-[10px] font-semibold tracking-[0.1em] uppercase mb-1.5 ${labelColors[type]}`}
      >
        {label}
      </div>
      {children}
    </div>
  );
}

function TryIt({ cmd, note }: { cmd: string; note?: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    navigator.clipboard.writeText(cmd);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 sm:gap-0 bg-[var(--surface)] border border-[rgba(0,214,143,0.25)] rounded-lg px-4 sm:px-4.5 py-3 sm:py-3.5 my-6 shadow-[0_0_20px_rgba(0,214,143,0.06)]">
      <div className="flex items-center gap-3 min-w-0">
        <span className="text-accent text-[13px] shrink-0">$</span>
        <span className="text-[12px] sm:text-[13px] text-white/85 break-all sm:break-normal">{cmd}</span>
      </div>
      <div className="flex items-center gap-3 self-end sm:self-auto">
        {note && (
          <span className="text-[11.5px] text-[var(--doc-muted)] hidden sm:inline">
            {note}
          </span>
        )}
        <button
          onClick={handleCopy}
          className={`text-[11px] px-3.5 py-1.5 rounded-[5px] cursor-pointer shrink-0 transition-shadow ${
            copied
              ? "text-accent bg-[rgba(0,214,143,0.2)] border border-[rgba(0,214,143,0.3)]"
              : "text-accent bg-accent-dim border border-[rgba(0,214,143,0.3)] hover:shadow-[0_0_12px_var(--accent-glow)]"
          }`}
        >
          {copied ? "✓ Copied" : "Copy"}
        </button>
      </div>
    </div>
  );
}

function DocTable({
  headers,
  rows,
  skillRow,
}: {
  headers: string[];
  rows: React.ReactNode[][];
  skillRow?: boolean;
}) {
  return (
    <div className="overflow-x-auto -mx-4 sm:mx-0 px-4 sm:px-0">
    <table className="w-full border-collapse my-4 mb-7 text-[12px] sm:text-[13px] sm:min-w-[480px]">
      <thead>
        <tr>
          {headers.map((h) => (
            <th
              key={h}
              className="text-left px-3.5 py-2.5 text-[10px] font-semibold tracking-[0.1em] uppercase text-[var(--doc-muted)] border-b border-[var(--border)] bg-[var(--surface-2)]"
            >
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, i) => (
          <tr key={i} className="hover:bg-white/[0.02]">
            {row.map((cell, j) => (
              <td
                key={j}
                className={`px-3.5 py-2.5 border-b border-[var(--border)] text-white/65 align-top ${
                  j === 0 && !skillRow
                    ? "[&_code]:text-accent [&_code]:bg-accent-dim [&_code]:border-[rgba(0,214,143,0.2)]"
                    : ""
                } ${
                  j === 0 && skillRow
                    ? "[&_code]:!text-warning [&_code]:!bg-[rgba(245,166,35,0.10)] [&_code]:!border-[rgba(245,166,35,0.2)]"
                    : ""
                }`}
              >
                {cell}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
    </div>
  );
}

function Badge({
  color,
  children,
}: {
  color: "green" | "amber" | "muted";
  children: React.ReactNode;
}) {
  const styles = {
    green:
      "text-accent bg-accent-dim border border-[rgba(0,214,143,0.2)]",
    amber:
      "text-warning bg-[rgba(245,166,35,0.10)] border border-[rgba(245,166,35,0.2)]",
    muted:
      "text-[var(--doc-muted)] bg-[var(--surface-2)] border border-[var(--border)]",
  };
  return (
    <span
      className={`inline-flex items-center text-[10px] font-semibold tracking-[0.06em] uppercase rounded px-1.5 py-px align-middle ml-2 ${styles[color]}`}
    >
      {children}
    </span>
  );
}

function InlineCode({ children }: { children: React.ReactNode }) {
  return (
    <code className="bg-[var(--surface-2)] border border-[var(--border)] rounded-[3px] px-1.5 py-px text-[12.5px] text-white/80 break-words">
      {children}
    </code>
  );
}

function CmdCard({
  name,
  desc,
  badge,
  onClick,
}: {
  name: string;
  desc: string;
  badge?: string;
  onClick: () => void;
}) {
  return (
    <div
      onClick={onClick}
      className="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-4 cursor-pointer transition-colors hover:border-[rgba(0,214,143,0.3)] hover:bg-[rgba(0,214,143,0.04)]"
    >
      <div className="text-accent text-[13px] font-medium mb-1.5">
        {name}
        {badge && <Badge color="amber">{badge}</Badge>}
      </div>
      <div className="text-[12px] text-[var(--doc-muted)] leading-[1.5]">
        {desc}
      </div>
    </div>
  );
}

/* ─── Syntax helpers ─── */
const S = {
  g: (t: string) => <span className="t-green">{t}</span>,
  a: (t: string) => <span className="t-amber">{t}</span>,
  b: (t: string) => <span className="t-blue">{t}</span>,
  p: (t: string) => <span className="t-purple">{t}</span>,
  m: (t: string) => <span className="t-muted">{t}</span>,
  c: (t: string) => <span className="t-comment">{t}</span>,
  s: (t: string) => <span className="t-string">{t}</span>,
  r: (t: string) => <span className="t-red">{t}</span>,
};

/* ─── Section content ─── */

function QuickStart({
  goTo,
}: {
  goTo: (id: string, anchor?: string) => void;
}) {
  return (
    <>
      <div className="text-[11px] tracking-[0.12em] uppercase text-accent mb-3">
        Getting Started
      </div>
      <h1 className="font-serif text-[28px] sm:text-4xl font-normal leading-[1.2] text-white/95 mb-4">
        Up and running <em className="italic text-accent">in 45 seconds.</em>
      </h1>
      <p className="text-[13px] sm:text-[14.5px] text-white/55 leading-[1.7] mb-8 sm:mb-10 max-w-[580px]">
        t2000 is a bank account for AI agents on Sui — checking, savings,
        credit, and investment via MCP. Works with Claude Desktop, Cursor, and Windsurf.
      </p>

      <h2 id="qs-install">1. Install t2000</h2>
      <TryIt cmd="curl -fsSL https://t2000.ai/install.sh | bash" note="macOS / Linux" />
      <p className="text-[12px] text-white/40 -mt-3 mb-6">
        Or install manually with npm:
      </p>
      <TryIt cmd="npm install -g @t2000/cli" note="Node.js 18+ required" />

      <h2 id="qs-init">2. Set up your agent</h2>
      <p>
        The init wizard creates your wallet, configures MCP platforms,
        and sets up safeguards — all in one command.
      </p>
      <CodeBlock lang="bash">
        {S.g("$")} t2000 init{"\n\n"}
        {"  "}{S.b("Step 1 of 3")} — Create wallet{"\n"}
        {"  Create PIN (min 4 chars): ****\n"}
        {"  Confirm PIN: ****\n\n"}
        {"  "}{S.m("Creating agent wallet...")}{"\n"}
        {"  "}{S.g("✓")} Keypair generated{"\n"}
        {"  "}{S.g("✓")} Network {S.m("Sui mainnet")}{"\n"}
        {"  "}{S.g("✓")} Gas sponsorship {S.m("enabled")}{"\n\n"}
        {"  "}{S.m("Setting up accounts...")}{"\n"}
        {"  "}{S.g("✓")} Checking  {S.g("✓")} Savings  {S.g("✓")} Credit  {S.g("✓")} Exchange  {S.g("✓")} Investment{"\n\n"}
        {"  "}🎉 {S.g("Bank account created")}{"\n"}
        {"  "}Address: {S.a("0x8b3e...d412")}{"\n\n"}
        {"  "}{S.b("Step 2 of 3")} — Connect AI platforms{"\n"}
        {"  Which AI platforms do you use? (space to select)\n"}
        {"  "}{S.g("◉")} Claude Desktop{"\n"}
        {"  "}{S.g("◉")} Cursor{"\n"}
        {"  ◯ Windsurf\n\n"}
        {"  "}{S.m("Adding t2000 to your AI platforms...")}{"\n"}
        {"  "}{S.g("✓")} Claude Desktop  configured{"\n"}
        {"  "}{S.g("✓")} Cursor  configured{"\n\n"}
        {"  "}{S.b("Step 3 of 3")} — Set safeguards{"\n"}
        {"  Max per transaction ($): 500\n"}
        {"  Max daily sends ($): 1000\n"}
        {"  "}{S.g("✓")} Safeguards configured{"\n\n"}
        {"  "}{S.g("✓ You're all set")}{"\n\n"}
        {"  Next steps:\n"}
        {"    1. Restart Claude Desktop / Cursor\n"}
        {"    2. Ask: "}{S.b("\"What's my t2000 balance?\"")}{"\n\n"}
        {"  Deposit USDC to get started:\n"}
        {"    "}{S.a("0x8b3e...d412")}
      </CodeBlock>
      <Callout type="tip" label="Tip">
        Your encrypted key lives at <InlineCode>~/.t2000/wallet.key</InlineCode>.
        Never commit this file — add it to{" "}
        <InlineCode>.gitignore</InlineCode> before initializing in a repo.
      </Callout>

      <h2 id="qs-first">3. First operations</h2>

      <ol className="list-none my-4 mb-7">
        <li className="flex gap-4 mb-6 relative">
          <div className="absolute left-4 top-9 bottom-[-12px] w-px bg-[var(--border)]" />
          <div className="w-8 h-8 border border-accent rounded-md flex items-center justify-center text-xs text-accent bg-accent-dim shrink-0 relative z-1 shadow-[0_0_8px_var(--accent-glow)]">
            ✓
          </div>
          <div className="flex-1 min-w-0 pt-1">
            <div className="text-[13.5px] font-medium text-white/85 mb-1.5">
              Check your balance
            </div>
            <CodeBlock lang="bash">
              {S.g("$")} t2000 balance{"\n\n"}
              Available:  {S.a("$100.00")}  {S.c("(checking — spendable)")}{"\n"}
              {S.m("──────────────────────────────────────")}{"\n"}
              Total:      {S.a("$100.00")}
            </CodeBlock>
          </div>
        </li>
        <li className="flex gap-4 mb-6 relative">
          <div className="absolute left-4 top-9 bottom-[-12px] w-px bg-[var(--border)]" />
          <div className="w-8 h-8 border border-accent rounded-md flex items-center justify-center text-xs text-accent bg-accent-dim shrink-0 relative z-1 shadow-[0_0_8px_var(--accent-glow)]">
            ✓
          </div>
          <div className="flex-1 min-w-0 pt-1">
            <div className="text-[13.5px] font-medium text-white/85 mb-1.5">
              Put idle funds to work
            </div>
            <CodeBlock lang="bash">
              {S.g("$")} t2000 save all{"\n\n"}
              {S.g("✓")} Gas manager: {S.a("$1.00")} USDC → SUI{"\n"}
              {S.g("✓")} Saved {S.a("$99.00")} USDC to best rate{"\n"}
              {S.g("✓")} Protocol fee: {S.m("$0.099 USDC (0.1%)")}{"\n"}
              {S.g("✓")} Current APY: {S.g("4.21%")}{"\n"}
              {S.g("✓")} Savings balance: {S.a("$98.90")} USDC{"\n"}
              {"  "}Tx: {S.b("https://suiscan.xyz/mainnet/tx/0x9f2c...")}
            </CodeBlock>
          </div>
        </li>
      </ol>
      <Callout type="note" label="Agent Skills (optional)">
        For Claude Code, Codex, or Copilot — run{" "}
        <InlineCode>npx skills add mission69b/t2000-skills</InlineCode>{" "}
        to let agents discover t2000 automatically. See the{" "}
        <a
          onClick={() => goTo("skills")}
          className="text-accent cursor-pointer hover:underline"
        >
          Agent Skills
        </a>{" "}
        docs.
      </Callout>

      <Callout type="note" label="Next step">
        Want your agent to pay for APIs autonomously? See the{" "}
        <a
          onClick={() => goTo("mpp")}
          className="text-accent cursor-pointer hover:underline"
        >
          MPP Payments guide
        </a>{" "}
        to set up <InlineCode>t2000 pay</InlineCode>.
      </Callout>
    </>
  );
}

function InstallSection() {
  return (
    <>
      <div className="text-[11px] tracking-[0.12em] uppercase text-accent mb-3">
        Getting Started
      </div>
      <h1 className="font-serif text-[28px] sm:text-4xl font-normal leading-[1.2] text-white/95 mb-4">
        <em className="italic text-accent">Installation</em>
      </h1>
      <p className="text-[13px] sm:text-[14.5px] text-white/55 leading-[1.7] mb-8 sm:mb-10 max-w-[580px]">
        t2000 is a Node.js CLI. Install globally, then initialize a wallet per
        agent or per project.
      </p>

      <h2 id="inst-req">Requirements</h2>
      <DocTable
        headers={["Dependency", "Version", "Notes"]}
        rows={[
          [<InlineCode key="n">node</InlineCode>, "18+", "LTS recommended"],
          [<InlineCode key="n">npm</InlineCode>, "8+", "Included with Node.js"],
          ["Sui RPC", "—", "Public endpoint used by default"],
        ]}
      />

      <h2 id="inst-curl">One-line install (recommended)</h2>
      <CodeBlock lang="bash">
        {S.g("$")} curl -fsSL https://t2000.ai/install.sh | bash{"\n\n"}
        {S.m("Checks for Node.js 18+, installs @t2000/cli globally,")}{"\n"}
        {S.m("runs t2000 init, and optionally configures MCP.")}
      </CodeBlock>

      <h2 id="inst-global">Manual install (npm)</h2>
      <CodeBlock lang="bash">
        {S.g("$")} npm install -g @t2000/cli{"\n\n"}
        {S.c("# Verify")}{"\n"}
        {S.g("$")} t2000 --version{"\n"}
        {S.a("0.20.2")}
      </CodeBlock>

      <h2 id="inst-config">File locations</h2>
      <DocTable
        headers={["File", "Path", "Description"]}
        rows={[
          [<InlineCode key="k">wallet.key</InlineCode>, <InlineCode key="v">~/.t2000/wallet.key</InlineCode>, "AES-256-GCM encrypted Ed25519 keypair"],
          [<InlineCode key="k">config.json</InlineCode>, <InlineCode key="v">~/.t2000/config.json</InlineCode>, "General config (managed via t2000 config set)"],
        ]}
      />
      <p>
        The private key is stored <strong>encrypted</strong> in{" "}
        <InlineCode>wallet.key</InlineCode>, never in config.json.
        Use <InlineCode>t2000 config get</InlineCode> to view and{" "}
        <InlineCode>t2000 config set &lt;key&gt; &lt;value&gt;</InlineCode> to
        update config values.
      </p>
      <Callout type="warn" label="Security">
        Never commit <InlineCode>~/.t2000/</InlineCode>. Add it to your{" "}
        <InlineCode>.gitignore</InlineCode>. For CI/CD, use the{" "}
        <InlineCode>T2000_PIN</InlineCode> environment variable instead.
      </Callout>

      <h2 id="inst-env">Environment variables</h2>
      <DocTable
        headers={["Variable", "Description"]}
        rows={[
          [<InlineCode key="k">T2000_PIN</InlineCode>, "Bank account PIN (skip interactive prompt)"],
          [<InlineCode key="k">T2000_PRIVATE_KEY</InlineCode>, <>Private key for <InlineCode>t2000 import</InlineCode> (skip interactive prompt)</>],
        ]}
      />
    </>
  );
}

function ConceptsSection() {
  return (
    <>
      <div className="text-[11px] tracking-[0.12em] uppercase text-accent mb-3">
        Getting Started
      </div>
      <h1 className="font-serif text-[28px] sm:text-4xl font-normal leading-[1.2] text-white/95 mb-4">
        Core <em className="italic text-accent">Concepts</em>
      </h1>
      <p className="text-[13px] sm:text-[14.5px] text-white/55 leading-[1.7] mb-8 sm:mb-10 max-w-[580px]">
        Five accounts, one wallet. Everything runs on Sui via atomic
        Programmable Transaction Blocks.
      </p>

      <h2 id="con-accounts">The five accounts</h2>
      <DocTable
        headers={["Account", "What it is", "CLI"]}
        rows={[
          [<InlineCode key="k">checking</InlineCode>, "USDC available for immediate use. Shown as Available in balance output.", <InlineCode key="v">t2000 send</InlineCode>],
          [<InlineCode key="k">savings</InlineCode>, "USDC deposited to lending protocols (NAVI, Suilend), earning variable APY. Auto-routed to best rate.", <><InlineCode>t2000 save</InlineCode> / <InlineCode>withdraw</InlineCode></>],
          [<InlineCode key="k">credit</InlineCode>, "USDC borrowed against savings collateral. Health factor enforced on-chain.", <><InlineCode>t2000 borrow</InlineCode> / <InlineCode>repay</InlineCode></>],
          [<InlineCode key="k">exchange</InlineCode>, "Currency exchange via Cetus DEX. Use t2000 exchange to swap between USDC, SUI, and stablecoins. Also used internally by rebalance and auto-swap.", <InlineCode key="v">t2000 exchange</InlineCode>],
          [<InlineCode key="k">investment</InlineCode>, "Buy and sell SUI, BTC, ETH, GOLD with dollar-denominated commands. Cost-basis P&L tracking. Investment locking guard prevents accidental liquidation.", <><InlineCode>t2000 invest</InlineCode> / <InlineCode>portfolio</InlineCode></>],
        ]}
      />

      <h2 id="con-gas">Gas management</h2>
      <p>
        Every operation routes through a 3-step gas resolution chain. The agent
        never fails due to low gas if it has USDC or the Gas Station is
        reachable:
      </p>
      <DocTable
        headers={["Step", "Strategy", "Condition"]}
        rows={[
          ["1", "Self-funded", "SUI ≥ 0.05 — uses agent's own SUI"],
          ["2", "Auto-topup", "SUI < 0.05, USDC ≥ $2 — swaps $1 USDC → SUI (sponsored), then self-funds"],
          ["3", "Sponsored", "Steps 1 & 2 fail — Gas Station sponsors the full transaction"],
        ]}
      />
      <p>
        Every transaction result includes a <InlineCode>gasMethod</InlineCode> field
        (<InlineCode>self-funded</InlineCode> | <InlineCode>auto-topup</InlineCode> | <InlineCode>sponsored</InlineCode>)
        indicating which strategy was used. You never need to manually top up gas.
      </p>

      <h2 id="con-ptb">Programmable Transaction Blocks</h2>
      <p>
        Multi-step operations (like <InlineCode>save all</InlineCode> when gas
        is low) are executed as a single atomic Programmable Transaction Block.
        Either the entire sequence succeeds or nothing happens — no partial
        states, no stranded funds.
      </p>

      <h2 id="con-fees">Fees</h2>
      <DocTable
        headers={["Operation", "Fee", "Notes"]}
        rows={[
          ["Save", "0.1%", "Protocol fee on deposit"],
          ["Borrow", "0.05%", "Protocol fee on loan"],
          ["Exchange", <strong key="f">Free</strong>, "Cetus pool fees only (slippage protected on-chain)"],
          ["Withdraw", <strong key="f">Free</strong>, ""],
          ["Repay", <strong key="f">Free</strong>, ""],
          ["Send", <strong key="f">Free</strong>, ""],
          ["Pay (MPP)", <strong key="f">Free</strong>, "Agent pays the API price, no t2000 surcharge"],
        ]}
      />
      <p>
        Fees are collected atomically on-chain — if the transaction fails, no fee
        is charged.
      </p>

      <h2 id="con-hf">Health factor</h2>
      <p>
        If you have an active borrow, t2000 enforces a minimum health factor of{" "}
        <strong>1.5</strong> on all withdrawal and borrow operations. Health
        factor is calculated as:
      </p>
      <CodeBlock lang="formula">
        HF = (collateral_value × liquidation_threshold) / borrowed_value{"\n\n"}
        {S.c("# HF ≥ 1.5  →  safe to operate")}{"\n"}
        {S.c("# HF  < 1.0  →  position eligible for liquidation")}
      </CodeBlock>
    </>
  );
}

function scrollTo(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function CliWalletSection() {
  return (
    <>
      <div className="text-[11px] tracking-[0.12em] uppercase text-accent mb-3">
        CLI
      </div>
      <h1 className="font-serif text-[28px] sm:text-4xl font-normal leading-[1.2] text-white/95 mb-4">
        <em className="italic text-accent">Wallet</em>
      </h1>
      <p className="text-[13px] sm:text-[14.5px] text-white/55 leading-[1.7] mb-8 sm:mb-10 max-w-[580px]">
        Create your bank account, check balances, and send USDC. All commands
        support <InlineCode>--json</InlineCode> for agent consumption.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-3 my-4 mb-7">
        <CmdCard name="t2000 init" desc="Guided setup wizard" onClick={() => scrollTo("cmd-init")} />
        <CmdCard name="t2000 balance" desc="View all accounts + limits" onClick={() => scrollTo("cmd-balance")} />
        <CmdCard name="t2000 send" desc="Transfer USDC to any address" onClick={() => scrollTo("cmd-send")} />
        <CmdCard name="t2000 contacts" desc="Manage named contacts" onClick={() => scrollTo("cmd-contacts")} />
      </div>

      <h2 id="cmd-init">t2000 init</h2>
      <p>Guided setup wizard — creates wallet, configures MCP platforms (Claude Desktop, Cursor, Windsurf), and sets up safeguards.</p>
      <CodeBlock lang="bash">
        t2000 init [--key &lt;path&gt;] [--no-sponsor]
      </CodeBlock>
      <CodeBlock lang="output">
        {"┌─────────────────────────────────────────┐\n"}
        {"│  "}{S.b("Welcome to t2000")}{"                       │\n"}
        {"│  A bank account for AI agents           │\n"}
        {"└─────────────────────────────────────────┘\n\n"}
        {S.m("Creating agent wallet...")}{"\n"}
        {S.g("✓")} Keypair generated{"\n"}
        {S.g("✓")} Network {S.m("Sui mainnet")}{"\n"}
        {S.g("✓")} Gas sponsorship {S.m("enabled")}{"\n"}
        {S.g("✓")} Checking  {S.g("✓")} Savings  {S.g("✓")} Credit  {S.g("✓")} Exchange  {S.g("✓")} Investment{"\n\n"}
        {"🎉 "}{S.g("Bank account created")}{"\n"}
        {"Address: "}{S.a("0x8b3e...d412")}{"\n\n"}
        {S.g("✓")} MCP configured (Claude Desktop, Cursor){"\n"}
        {S.g("✓")} Safeguards set{"\n\n"}
        {"Open Claude Desktop or Cursor → "}{S.b("\"What's my t2000 balance?\"")}
      </CodeBlock>

      <h2 id="cmd-balance">t2000 balance</h2>
      <p>Returns balances across all accounts. Use <InlineCode>--show-limits</InlineCode> before any borrow or withdrawal with an active loan.</p>
      <CodeBlock lang="bash">
        t2000 balance [flags]{"\n\n"}
        {"  "}{S.a("--show-limits")}   Include maxWithdraw, maxBorrow, healthFactor{"\n"}
        {"  "}{S.a("--json")}          Machine-readable JSON output
      </CodeBlock>
      <CodeBlock lang="output">
        {"  "}Available:  {S.a("$69.60")}  {S.c("(checking — spendable)")}{"\n"}
        {"  "}Savings:  {S.a("$9.26")}  {S.c("(earning 4.15% APY)")}{"\n"}
        {"  "}Credit:  {S.r("-$1.00")}  {S.c("(7.67% APY)")}{"\n"}
        {"  "}Investment:  {S.a("$5.01")}  {S.c("(+0.1%)")}{"\n"}
        {"  "}{S.m("──────────────────────────────────────")}{"\n"}
        {"  "}Total:  {S.a("$82.87")}
      </CodeBlock>

      <h2 id="cmd-send">t2000 send</h2>
      <p>Transfer USDC to any Sui address or named contact.</p>
      <CodeBlock lang="bash">
        t2000 send &lt;amount&gt; USDC to &lt;address|contact&gt;{"\n\n"}
        t2000 send {S.a("10")} USDC to {S.a("0x8b3e...d412")}{"\n"}
        t2000 send {S.a("50")} USDC to {S.a("alice")}   {S.c("# named contact")}
      </CodeBlock>
      <CodeBlock lang="output">
        {"  "}{S.g("✓")} Sent {S.a("$10.00")} USDC → 0x8b3e...d412{"\n"}
        {"  "}Balance:  {S.a("$90.00")} USDC{"\n"}
        {"  "}Tx:  {S.b("https://suiscan.xyz/mainnet/tx/0xa1b2...")}{"\n"}
        {"  "}Gas:  {S.a("0.0050")} SUI (self-funded)
      </CodeBlock>

      <h2 id="cmd-contacts">t2000 contacts</h2>
      <p>Save named contacts for easy sends — no more pasting raw addresses.</p>
      <CodeBlock lang="bash">
        t2000 contacts                     {S.c("# list all contacts")}{"\n"}
        t2000 contacts add alice {S.a("0x8b3e...d412")}{"\n"}
        t2000 contacts remove alice
      </CodeBlock>
      <CodeBlock lang="output">
        {S.g("✓")} Added alice (0x8b3e...d412)
      </CodeBlock>

      <h2 id="cmd-wallet-more">More wallet commands</h2>
      <DocTable
        headers={["Command", "Description"]}
        rows={[
          [<InlineCode key="k">t2000 address</InlineCode>, "Print wallet address"],
          [<InlineCode key="k">t2000 deposit</InlineCode>, "Show step-by-step funding instructions"],
          [<InlineCode key="k">t2000 history</InlineCode>, "Recent transaction history with action type and timestamp"],
          [<InlineCode key="k">t2000 import &lt;key&gt;</InlineCode>, <>Import wallet from private key (<InlineCode>suiprivkey1...</InlineCode> or hex)</>],
          [<InlineCode key="k">t2000 export</InlineCode>, "Export private key (Ed25519, hex)"],
        ]}
      />
    </>
  );
}

function CliSavingsSection() {
  return (
    <>
      <div className="text-[11px] tracking-[0.12em] uppercase text-accent mb-3">
        CLI
      </div>
      <h1 className="font-serif text-[28px] sm:text-4xl font-normal leading-[1.2] text-white/95 mb-4">
        Savings <em className="italic text-accent">& Credit</em>
      </h1>
      <p className="text-[13px] sm:text-[14.5px] text-white/55 leading-[1.7] mb-8 sm:mb-10 max-w-[580px]">
        Earn yield on idle USDC, borrow against collateral, and optimize
        rates across protocols — all with health factor protection.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-3 my-4 mb-7">
        <CmdCard name="t2000 save" desc="Deposit to savings (best rate)" onClick={() => scrollTo("cmd-save")} />
        <CmdCard name="t2000 withdraw" desc="Pull funds from savings" onClick={() => scrollTo("cmd-withdraw")} />
        <CmdCard name="t2000 borrow" desc="Borrow against collateral" onClick={() => scrollTo("cmd-borrow")} />
        <CmdCard name="t2000 repay" desc="Repay outstanding loan" onClick={() => scrollTo("cmd-repay")} />
        <CmdCard name="t2000 rebalance" desc="Optimize yield across protocols" onClick={() => scrollTo("cmd-rebalance")} />
        <CmdCard name="t2000 earn" desc="All earning opportunities" onClick={() => scrollTo("cmd-earn")} />
      </div>

      <h2 id="cmd-save">t2000 save</h2>
      <p>Deposit USDC into savings to earn variable APY. Auto-routes to the best rate across NAVI and Suilend, or specify a protocol with <InlineCode>--protocol</InlineCode>.</p>
      <CodeBlock lang="bash">
        t2000 save &lt;amount&gt; [--protocol &lt;name&gt;]{"\n"}
        t2000 save all              {S.c("# saves everything; gas manager runs first if needed")}{"\n"}
        t2000 save {S.a("80")} --protocol suilend  {S.c("# target a specific protocol")}
      </CodeBlock>
      <CodeBlock lang="output">
        {"  "}{S.g("✓")} Saved {S.a("$80.00")} USDC to best rate{"\n"}
        {"  "}{S.g("✓")} Protocol fee: {S.m("$0.08 USDC (0.1%)")}{"\n"}
        {"  "}{S.g("✓")} Current APY: {S.g("4.86%")}{"\n"}
        {"  "}{S.g("✓")} Savings balance: {S.a("$79.92")} USDC{"\n"}
        {"  "}Tx:  {S.b("https://suiscan.xyz/mainnet/tx/0x9f2c...")}
      </CodeBlock>
      <Callout type="note" label="Fee">
        A <strong>0.1% protocol fee</strong> applies to every deposit.{" "}
        <InlineCode>save all</InlineCode> may also trigger the gas manager,
        auto-converting up to $1 USDC → SUI before depositing the remainder.
      </Callout>

      <h2 id="cmd-withdraw">t2000 withdraw</h2>
      <p>Pull USDC from savings back to checking. Risk-checked if you have an active loan.</p>
      <CodeBlock lang="bash">
        t2000 withdraw &lt;amount&gt; [--protocol &lt;name&gt;]{"\n"}
        t2000 withdraw all
      </CodeBlock>
      <CodeBlock lang="output">
        {"  "}{S.g("✓")} Withdrew {S.a("$50.00")} USDC{"\n"}
        {"  "}Tx:  {S.b("https://suiscan.xyz/mainnet/tx/0xc3d4...")}
      </CodeBlock>

      <h2 id="cmd-borrow">t2000 borrow</h2>
      <p>Borrow USDC against your savings collateral. Health factor must stay above 1.5.</p>
      <CodeBlock lang="bash">
        t2000 borrow &lt;amount&gt;{"\n\n"}
        t2000 borrow {S.a("40")}    {S.c("# health factor enforced — must stay ≥ 1.5")}
      </CodeBlock>
      <CodeBlock lang="output">
        {"  "}{S.g("✓")} Borrowed {S.a("$40.00")} USDC{"\n"}
        {"  "}Health Factor:  {S.a("2.15")}{"\n"}
        {"  "}Tx:  {S.b("https://suiscan.xyz/mainnet/tx/0xd5e6...")}
      </CodeBlock>

      <h2 id="cmd-repay">t2000 repay</h2>
      <p>Repay outstanding borrows. Use <InlineCode>all</InlineCode> to clear the full debt including accrued interest.</p>
      <CodeBlock lang="bash">
        t2000 repay &lt;amount&gt;{"\n"}
        t2000 repay all             {S.c("# includes accrued interest")}
      </CodeBlock>
      <CodeBlock lang="output">
        {"  "}{S.g("✓")} Repaid {S.a("$40.00")} USDC{"\n"}
        {"  "}Remaining Debt:  {S.a("$0.00")}{"\n"}
        {"  "}Tx:  {S.b("https://suiscan.xyz/mainnet/tx/0xe7f8...")}
      </CodeBlock>

      <h2 id="cmd-rebalance">t2000 rebalance</h2>
      <p>Optimize yield by moving savings to the best rate across protocols and stablecoins. Executes as a single atomic PTB (withdraw → swap → deposit).</p>
      <CodeBlock lang="bash">
        t2000 rebalance [--dry-run] [--min-diff &lt;pct&gt;] [--max-break-even &lt;days&gt;]{"\n\n"}
        t2000 rebalance --dry-run   {S.c("# preview without executing")}{"\n"}
        t2000 rebalance             {S.c("# execute rebalance")}
      </CodeBlock>
      <CodeBlock lang="output">
        {"  "}{S.b("Rebalance Plan")}{"\n"}
        {"  "}{S.m("─────────────────────────────────────────────────────")}{"\n"}
        {"  "}From:  USDC on NAVI Protocol ({S.m("4.86%")} APY){"\n"}
        {"  "}To:  suiUSDT on NAVI Protocol ({S.g("5.37%")} APY){"\n"}
        {"  "}Amount:  {S.a("$5.10")}{"\n\n"}
        {"  "}{S.b("Economics")}{"\n"}
        {"  "}{S.m("─────────────────────────────────────────────────────")}{"\n"}
        {"  "}APY Gain:  {S.g("+0.51%")}{"\n"}
        {"  "}Annual Gain:  {S.a("$0.03")}/year{"\n"}
        {"  "}Swap Cost:  ~$0.00{"\n"}
        {"  "}Break-even:  6 days{"\n\n"}
        {"  "}{S.g("✓")} Rebalanced {S.a("$5.10")} → {S.a("5.37%")} APY{"\n"}
        {"  "}Tx:  {S.b("https://suiscan.xyz/mainnet/tx/84qXk...")}
      </CodeBlock>

      <h2 id="cmd-earn">t2000 earn</h2>
      <p>Show all earning opportunities in one dashboard — savings yield, investment yield, and sentinel bounties.</p>
      <CodeBlock lang="bash">
        t2000 earn [--json]
      </CodeBlock>
      <CodeBlock lang="output">
        {"  "}Earning Opportunities{"\n\n"}
        {"  "}{S.b("SAVINGS — Passive Yield")}{"\n"}
        {"  "}{S.m("─────────────────────────────────────────────────────")}{"\n"}
        {"  "}navi:  {S.a("$5.10")} USDC @ {S.g("4.86%")} APY{"\n"}
        {"  "}suilend:  {S.a("$3.15")} SUI @ {S.g("2.61%")} APY{"\n"}
        {"  "}    ~$0.00/day · ~$0.03/month{"\n\n"}
        {"  "}Total Saved:  {S.a("$8.25")}{"\n\n"}
        {"  "}{S.b("INVESTMENTS — Earning Yield")}{"\n"}
        {"  "}{S.m("─────────────────────────────────────────────────────")}{"\n"}
        {"  "}SUI via Suilend:  {S.a("$1.00")} (0.9734 SUI) @ {S.g("2.61%")} APY{"\n\n"}
        {"  "}{S.b("SENTINEL BOUNTIES — Active Red Teaming")}{"\n"}
        {"  "}{S.m("─────────────────────────────────────────────────────")}{"\n"}
        {"  "}Active:  49 sentinels{"\n"}
        {"  "}Prize Pools:  238.67 SUI available
      </CodeBlock>

      <h2 id="cmd-savings-more">More savings commands</h2>
      <DocTable
        headers={["Command", "Description"]}
        rows={[
          [<InlineCode key="k">t2000 health</InlineCode>, "Check lending health factor (color-coded by severity)"],
          [<InlineCode key="k">t2000 positions</InlineCode>, "View all open DeFi positions across protocols"],
          [<InlineCode key="k">t2000 earnings</InlineCode>, "Yield earned to date, daily rate, APY"],
          [<InlineCode key="k">t2000 rates</InlineCode>, "Live save & borrow APYs from all protocols"],
          [<InlineCode key="k">t2000 fund-status</InlineCode>, "Full savings summary with monthly projection"],
        ]}
      />
    </>
  );
}

function CliInvestSection() {
  return (
    <>
      <div className="text-[11px] tracking-[0.12em] uppercase text-accent mb-3">
        CLI
      </div>
      <h1 className="font-serif text-[28px] sm:text-4xl font-normal leading-[1.2] text-white/95 mb-4">
        <em className="italic text-accent">Investment</em>
      </h1>
      <p className="text-[13px] sm:text-[14.5px] text-white/55 leading-[1.7] mb-8 sm:mb-10 max-w-[580px]">
        Buy and sell SUI, BTC, ETH, GOLD with dollar-denominated commands.
        Cost-basis P&L tracking, strategy allocations, yield on holdings,
        and investment locking guard.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-3 my-4 mb-7">
        <CmdCard name="t2000 invest buy / sell" desc="Buy or sell SUI, BTC, ETH, GOLD" onClick={() => scrollTo("cmd-invest")} />
        <CmdCard name="t2000 invest earn" desc="Earn yield on holdings" onClick={() => scrollTo("cmd-invest-earn")} />
        <CmdCard name="t2000 invest rebalance" desc="Move earning to better rate" onClick={() => scrollTo("cmd-invest-rebalance")} />
        <CmdCard name="t2000 invest strategy" desc="Themed allocations (bluechip, layer1)" onClick={() => scrollTo("cmd-strategy")} />
        <CmdCard name="t2000 invest auto" desc="Dollar-cost averaging (DCA)" onClick={() => scrollTo("cmd-auto-invest")} />
        <CmdCard name="t2000 portfolio" desc="View portfolio with cost-basis P&L" onClick={() => scrollTo("cmd-portfolio")} />
      </div>

      <h2 id="cmd-invest">t2000 invest buy / sell</h2>
      <p>Buy or sell SUI, BTC, or ETH. Portfolio tracks cost basis, average price, and realized P&L. Investment assets are locked from <InlineCode>send</InlineCode> and <InlineCode>exchange</InlineCode> — use <InlineCode>invest sell</InlineCode> to liquidate.</p>
      <CodeBlock lang="bash">
        t2000 invest buy &lt;amount&gt; &lt;asset&gt;{"\n"}
        t2000 invest sell &lt;amount|all&gt; &lt;asset&gt;{"\n\n"}
        t2000 invest buy {S.a("5")} SUI            {S.c("# buy $5 of SUI")}{"\n"}
        t2000 invest buy {S.a("10")} BTC           {S.c("# buy $10 of BTC")}{"\n"}
        t2000 invest sell all ETH       {S.c("# sell entire ETH position")}
      </CodeBlock>
      <CodeBlock lang="output">
        {"  "}{S.g("✓")} Bought {S.a("4.8500")} SUI at {S.a("$1.03")}{"\n"}
        {"  "}Invested:  {S.a("$5.00")}{"\n"}
        {"  "}Portfolio:  {S.a("4.8500")} SUI (avg {S.a("$1.03")}){"\n"}
        {"  "}Tx:  {S.b("https://suiscan.xyz/mainnet/tx/...")}
      </CodeBlock>

      <h2 id="cmd-invest-earn">invest earn / unearn</h2>
      <p>Deposit an invested asset into the best-rate lending protocol to earn yield while keeping price exposure. <InlineCode>unearn</InlineCode> withdraws from lending but keeps the asset in your portfolio. Auto-withdraw on sell.</p>
      <CodeBlock lang="bash">
        t2000 invest earn &lt;asset&gt;     {S.c("# deposit to best lending rate")}{"\n"}
        t2000 invest unearn &lt;asset&gt;   {S.c("# withdraw from lending, keep invested")}{"\n\n"}
        t2000 invest earn SUI         {S.c("# earn 2.6% APY on SUI via Suilend")}{"\n"}
        t2000 invest earn ETH         {S.c("# earn 0.04% APY on ETH via NAVI")}{"\n"}
        t2000 invest unearn SUI       {S.c("# pull SUI back from lending")}
      </CodeBlock>
      <CodeBlock lang="output">
        {"  "}{S.g("✓")} SUI deposited into Suilend (2.6% APY){"\n"}
        {"  "}Amount:  {S.a("0.9734")} SUI{"\n"}
        {"  "}Protocol:  Suilend{"\n"}
        {"  "}APY:  {S.g("2.61%")}{"\n"}
        {"  "}Tx:  {S.b("https://suiscan.xyz/mainnet/tx/...")}
      </CodeBlock>

      <h2 id="cmd-invest-rebalance">invest rebalance</h2>
      <p>Move earning investment positions to higher-rate protocols. Compares APY across NAVI and Suilend and moves any position where a better rate is available (0.1% minimum difference).</p>
      <CodeBlock lang="bash">
        t2000 invest rebalance            {S.c("# move earning positions to best rate")}{"\n"}
        t2000 invest rebalance --dry-run  {S.c("# preview moves without executing")}{"\n"}
        t2000 invest rebalance --min-diff 0.5  {S.c("# only move if 0.5%+ APY gain")}
      </CodeBlock>
      <CodeBlock lang="output">
        {"  "}{S.g("✓")} Rebalanced earning positions{"\n"}
        {"  "}──────────────────────────────────────{"\n"}
        {"    "}SUI: NAVI Protocol (2.42%) → Suilend (2.61%){"\n"}
        {"  "}Amount:  {S.a("1.0639")} SUI{"\n"}
        {"  "}APY gain:  {S.g("+0.20%")}{"\n"}
        {"  "}Tx:  {S.b("https://suiscan.xyz/mainnet/tx/...")}
      </CodeBlock>

      <h2 id="cmd-strategy">invest strategy</h2>
      <p>Buy into themed allocations with a single atomic transaction. Built-in strategies: <InlineCode>bluechip</InlineCode> (BTC/ETH/SUI), <InlineCode>layer1</InlineCode> (ETH/SUI), <InlineCode>sui-heavy</InlineCode> (80% SUI). Create custom strategies with <InlineCode>invest strategy create</InlineCode>.</p>
      <CodeBlock lang="bash">
        t2000 invest strategy buy &lt;name&gt; &lt;amount&gt;{"\n"}
        t2000 invest strategy sell &lt;name&gt;{"\n"}
        t2000 invest strategy list{"\n"}
        t2000 invest strategy status &lt;name&gt;{"\n\n"}
        t2000 invest strategy buy bluechip {S.a("10")}   {S.c("# $10 split across BTC/ETH/SUI")}{"\n"}
        t2000 invest strategy sell bluechip     {S.c("# sell all strategy positions")}
      </CodeBlock>
      <CodeBlock lang="output">
        {"  "}{S.g("✓")} Invested {S.a("$10.00")} in bluechip strategy{"\n"}
        {"  "}BTC:  {S.a("0.00003505")} @ {S.a("$71,326")}{"\n"}
        {"  "}ETH:  {S.a("0.000708")} @ {S.a("$2,119")}{"\n"}
        {"  "}SUI:  {S.a("0.9783")} @ {S.a("$1.02")}{"\n"}
        {"  "}Total invested:  {S.a("$10.00")}
      </CodeBlock>

      <h2 id="cmd-auto-invest">invest auto (DCA)</h2>
      <p>Dollar-cost averaging — schedule recurring investments.</p>
      <CodeBlock lang="bash">
        t2000 invest auto setup &lt;amount&gt; &lt;frequency&gt; &lt;strategy&gt;{"\n"}
        t2000 invest auto status{"\n"}
        t2000 invest auto run{"\n"}
        t2000 invest auto stop{"\n\n"}
        t2000 invest auto setup {S.a("50")} weekly bluechip   {S.c("# $50/week into bluechip")}{"\n"}
        t2000 invest auto run                     {S.c("# execute pending DCA")}
      </CodeBlock>

      <h2 id="cmd-portfolio">t2000 portfolio</h2>
      <p>View your investment portfolio with cost-basis P&L, strategy grouping, and earning status.</p>
      <CodeBlock lang="bash">
        t2000 portfolio [--json]
      </CodeBlock>
      <CodeBlock lang="output">
        {"  "}Investment Portfolio{"\n\n"}
        {"    "}▸ Bluechip / Large-Cap{"\n"}
        {"  "}{S.m("──────────────────────────────────────")}{"\n"}
        {"  "}BTC:  {S.a("0.00003500")}    Avg: $71,000    Now: $71,200    {S.g("+$0.01 (+0.3%)")}{"\n"}
        {"  "}ETH:  {S.a("0.000700")}    Avg: $2,100    Now: $2,120    {S.g("+$0.01 (+1.0%)")}{"\n"}
        {"  "}SUI:  {S.a("0.9700")}    Avg: $1.03    Now: $1.03    {S.g("+$0.00 (+0.1%)")}{"\n"}
        {"    "}Subtotal: {S.a("$5.01")}{"\n\n"}
        {"    "}▸ Direct{"\n"}
        {"  "}{S.m("──────────────────────────────────────")}{"\n"}
        {"  "}ETH:  {S.a("0.000950")}    Avg: $2,115    Now: $2,120    {S.g("+$0.00 (+0.2%)")}{"\n"}
        {"    "}Subtotal: {S.a("$2.01")}{"\n"}
        {"  "}{S.m("──────────────────────────────────────")}{"\n"}
        {"  "}Total invested:  {S.a("$7.00")}{"\n"}
        {"  "}Current value:  {S.a("$7.02")}{"\n"}
        {"  "}Unrealized P&L:  {S.g("+$0.02 (+0.3%)")}{"\n"}
        {"  "}Realized P&L:  {S.a("+$0.00")}
      </CodeBlock>
    </>
  );
}

function CliMoreSection() {
  return (
    <>
      <div className="text-[11px] tracking-[0.12em] uppercase text-accent mb-3">
        CLI
      </div>
      <h1 className="font-serif text-[28px] sm:text-4xl font-normal leading-[1.2] text-white/95 mb-4">
        Exchange <em className="italic text-accent">& More</em>
      </h1>
      <p className="text-[13px] sm:text-[14.5px] text-white/55 leading-[1.7] mb-8 sm:mb-10 max-w-[580px]">
        Currency exchange, MPP payments, AI sentinels, MCP integration,
        and agent safeguards.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-3 my-4 mb-7">
        <CmdCard name="t2000 exchange" desc="Swap tokens (USDC ⇌ SUI)" onClick={() => scrollTo("cmd-exchange")} />
        <CmdCard name="t2000 pay" desc="Pay for MPP-protected APIs" badge="addon" onClick={() => scrollTo("cmd-pay")} />
        <CmdCard name="t2000 sentinel" desc="Attack AI sentinels, earn bounties" badge="partner" onClick={() => scrollTo("cmd-sentinel")} />
        <CmdCard name="t2000 mcp" desc="MCP server for AI platforms" badge="NEW" onClick={() => scrollTo("cmd-mcp")} />
        <CmdCard name="t2000 safeguards" desc="Spending limits, lock/unlock" onClick={() => scrollTo("cmd-safeguards")} />
      </div>

      <h2 id="cmd-exchange">t2000 exchange</h2>
      <p>Exchange tokens via Cetus DEX with on-chain slippage protection. Supports USDC ⇌ SUI and stablecoin pairs.</p>
      <CodeBlock lang="bash">
        t2000 exchange &lt;amount&gt; &lt;from&gt; &lt;to&gt; [--slippage &lt;pct&gt;]{"\n\n"}
        t2000 exchange 5 USDC SUI            {S.c("# buy SUI with USDC")}{"\n"}
        t2000 exchange 2 SUI USDC            {S.c("# sell SUI for USDC")}{"\n"}
        t2000 exchange 10 USDC suiUSDT --slippage 0.5
      </CodeBlock>
      <CodeBlock lang="output">
        {"  "}{S.g("✓")} Exchanged {S.a("$5.00")} USDC → {S.a("4.8500")} SUI{"\n"}
        {"  "}Tx:  {S.b("https://suiscan.xyz/mainnet/tx/...")}{"\n"}
        {"  "}Gas:  {S.a("0.0050")} SUI (self-funded)
      </CodeBlock>

      <h2 id="cmd-pay">
        t2000 pay <Badge color="amber">MPP</Badge>
      </h2>
      <p>
        Pay for MPP-protected API resources with USDC micropayments.
        35 services available at{" "}
        <a href="https://mpp.t2000.ai" className="text-accent hover:underline" target="_blank" rel="noopener noreferrer">mpp.t2000.ai</a>.
        See the{" "}
        <a onClick={() => document.getElementById("mpp")?.scrollIntoView({ behavior: "smooth" })} className="text-accent hover:underline cursor-pointer">MPP Payments guide</a>{" "}
        for the full service catalog.
      </p>
      <CodeBlock lang="bash">
        t2000 pay &lt;url&gt; [options]{"\n\n"}
        {"  "}{S.a("--method")}     GET | POST | PUT  (default: POST){"\n"}
        {"  "}{S.a("--data")}       JSON body for POST/PUT{"\n"}
        {"  "}{S.a("--max-price")}  Max USDC to auto-approve (default: 1.00){"\n"}
        {"  "}{S.a("--dry-run")}    Preview without paying{"\n\n"}
        {S.c("# Ask ChatGPT")}{"\n"}
        t2000 pay https://mpp.t2000.ai/openai/v1/chat/completions \{"\n"}
        {"  "}--data {S.s("'{\"model\":\"gpt-4o\",\"messages\":[...]}'")}{"\n\n"}
        {S.c("# Search the web")}{"\n"}
        t2000 pay https://mpp.t2000.ai/brave/v1/web/search \{"\n"}
        {"  "}--data {S.s("'{\"q\":\"latest Sui news\"}'")}{"\n\n"}
        {S.c("# Buy a gift card (set higher max-price)")}{"\n"}
        t2000 pay https://mpp.t2000.ai/reloadly/v1/order \{"\n"}
        {"  "}--max-price {S.a("25")} --data {S.s("'{\"productId\":120,\"unitPrice\":20,...}'")}
      </CodeBlock>
      <CodeBlock lang="output">
        {"  "}→ POST https://mpp.t2000.ai/openai/v1/chat/completions{"\n"}
        {"  "}← {S.a("402 Payment Required:")} $0.01 USDC (Sui){"\n"}
        {"  "}{S.g("✓")} Paid $0.01 USDC {S.m("(tx: 0x9f2c...a801)")}{"\n"}
        {"  "}← {S.g("200 OK")}  {S.m("[820ms]")}
      </CodeBlock>

      <h2 id="cmd-sentinel">
        t2000 sentinel <Badge color="amber">partner</Badge>
      </h2>
      <p>Browse and attack AI sentinels on <a href="https://suisentinel.xyz" target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">Sui Sentinel</a>. Earn bounties by finding vulnerabilities via adversarial prompts.</p>
      <CodeBlock lang="bash">
        t2000 sentinel list{"\n"}
        t2000 sentinel info &lt;id&gt;{"\n"}
        t2000 sentinel attack &lt;id&gt; {S.s('"Your attack prompt"')}{"\n\n"}
        {"  "}{S.a("--fee")}    Override attack fee in SUI (default: sentinel&apos;s min)
      </CodeBlock>

      <h2 id="cmd-mcp">
        t2000 mcp <Badge color="green">NEW</Badge>
      </h2>
      <p>MCP server for AI platform integration. 35 tools, 20 prompts, safeguard enforced.</p>
      <DocTable
        headers={["Command", "Description"]}
        rows={[
          [<InlineCode key="k">t2000 mcp install</InlineCode>, "Reconfigure MCP for Claude Desktop, Cursor, Windsurf (also done during init)"],
          [<InlineCode key="k">t2000 mcp uninstall</InlineCode>, "Remove MCP config from platforms"],
          [<InlineCode key="k">t2000 mcp</InlineCode>, "Start MCP server (used by AI platforms)"],
        ]}
      />
      <CodeBlock lang="bash">
        {S.g("$")} t2000 mcp install{"\n\n"}
        {"  "}{S.b("✓")} Claude Desktop  configured{"\n"}
        {"  "}{S.b("✓")} Cursor (global)  configured{"\n\n"}
        {"  "}Restart your AI platform to activate.{"\n"}
        {"  "}Then ask: {S.b("\"what's my t2000 balance?\"")}
      </CodeBlock>

      <h2 id="cmd-safeguards">Agent Safeguards</h2>
      <p>
        Control spending limits and lock the agent to prevent unauthorized operations.
      </p>
      <DocTable
        headers={["Command", "Description"]}
        rows={[
          [<InlineCode key="k">t2000 config show</InlineCode>, "View safeguard settings"],
          [<InlineCode key="k">t2000 config set maxPerTx 500</InlineCode>, "Set per-transaction limit ($500/tx)"],
          [<InlineCode key="k">t2000 config set maxDailySend 1000</InlineCode>, "Set daily send limit ($1000/day)"],
          [<InlineCode key="k">t2000 lock</InlineCode>, "Lock agent (freeze all operations)"],
          [<InlineCode key="k">t2000 unlock</InlineCode>, "Unlock agent (requires PIN)"],
        ]}
      />
      <CodeBlock lang="bash">
        {S.g("$")} t2000 config show{"\n\n"}
        maxPerTx:     {S.a("500")}{"\n"}
        maxDailySend: {S.a("1000")}{"\n"}
        locked:       {S.a("false")}{"\n\n"}
        {S.g("$")} t2000 lock{"\n"}
        {S.g("✓")} Agent locked
      </CodeBlock>
    </>
  );
}

function SdkSection() {
  return (
    <>
      <div className="text-[11px] tracking-[0.12em] uppercase text-accent mb-3">
        Reference
      </div>
      <h1 className="font-serif text-[28px] sm:text-4xl font-normal leading-[1.2] text-white/95 mb-4">
        SDK <em className="italic text-accent">/ API</em>
      </h1>
      <p className="text-[13px] sm:text-[14.5px] text-white/55 leading-[1.7] mb-8 sm:mb-10 max-w-[580px]">
        Use t2000 programmatically inside your agent code. The SDK wraps every
        CLI command as a typed async function.
      </p>

      <h2 id="sdk-install">Install</h2>
      <CodeBlock lang="bash">
        {S.g("$")} npm install @t2000/sdk
      </CodeBlock>

      <h2 id="sdk-init">Initialize</h2>
      <CodeBlock lang="typescript" filename="agent.ts">
        {S.p("import")} {"{ T2000 }"} {S.p("from")} {S.s("'@t2000/sdk'")};{"\n\n"}
        {S.p("const")} agent = {S.p("await")} {S.b("T2000")}.{S.g("create")}({"{"}
        {"\n"}{"  "}pin: process.env.{S.a("T2000_PIN")},{"\n"}
        {"  "}network: {S.s("'mainnet'")},{"\n"}
        {"}"});{"\n\n"}
        {S.c("// Check balance")}{"\n"}
        {S.p("const")} balance = {S.p("await")} agent.{S.g("balance")}();{"\n"}
        console.log(balance.available); {S.c("// 78.91")}{"\n\n"}
        {S.c("// Send")}{"\n"}
        {S.p("await")} agent.{S.g("send")}({`{ to: `}{S.s("'0x8b3e...d412'")}{`, amount: 10 }`});{"\n\n"}
        {S.c("// Save all")}{"\n"}
        {S.p("await")} agent.{S.g("save")}({`{ amount: 100 }`});
      </CodeBlock>

      <h2 id="sdk-types">Response types</h2>
      <CodeBlock lang="typescript">
        {S.p("interface")} {S.b("BalanceResponse")} {"{"}{"\n"}
        {"  "}available:    {S.a("number")};  {S.c("// USDC")}{"\n"}
        {"  "}savings:      {S.a("number")};  {S.c("// USDC across lending protocols")}{"\n"}
        {"  "}gasReserve:   {"{ "}{S.a("sui")}: number; {S.a("usdEquiv")}: number {"}"}; {S.c("// SUI reserve")}{"\n"}
        {"  "}total:        {S.a("number")};{"\n"}
        {"  "}assets:       Record{S.a("<string, number>")};{"\n"}
        {"}"}{"\n\n"}
        {S.p("interface")} {S.b("SendResult")} {"{"}{"\n"}
        {"  "}success:   {S.a("boolean")};{"\n"}
        {"  "}tx:        {S.a("string")};{"\n"}
        {"  "}amount:    {S.a("number")};{"\n"}
        {"  "}to:        {S.a("string")};{"\n"}
        {"  "}gasCost:   {S.a("number")};{"\n"}
        {"  "}gasCostUnit: {S.a("string")};{"\n"}
        {"  "}gasMethod: {S.a("GasMethod")};  {S.c("// 'self-funded' | 'auto-topup' | 'sponsored'")}{"\n"}
        {"  "}balance:   {S.a("BalanceResponse")};{"\n"}
        {"}"}
      </CodeBlock>

      <h2 id="sdk-errors">Error handling</h2>
      <CodeBlock lang="typescript">
        {S.p("import")} {"{ T2000Error }"} {S.p("from")} {S.s("'@t2000/sdk'")};{"\n\n"}
        {S.p("try")} {"{"}{"\n"}
        {"  "}{S.p("await")} agent.{S.g("borrow")}({`{ amount: 100 }`});{"\n"}
        {"}"} {S.p("catch")} (err) {"{"}{"\n"}
        {"  "}{S.p("if")} (err {S.p("instanceof")} {S.b("T2000Error")}) {"{"}{"\n"}
        {"    "}{S.c("// err.code   → 'HEALTH_FACTOR_TOO_LOW'")}{"\n"}
        {"    "}{S.c("// err.data   → { maxBorrow: 40 }")}{"\n"}
        {"    "}{S.c("// err.message → human-readable explanation")}{"\n"}
        {"  }"}{"\n"}
        {"}"}
      </CodeBlock>
    </>
  );
}

function ConfigSection() {
  return (
    <>
      <div className="text-[11px] tracking-[0.12em] uppercase text-accent mb-3">
        Reference
      </div>
      <h1 className="font-serif text-[28px] sm:text-4xl font-normal leading-[1.2] text-white/95 mb-4">
        <em className="italic text-accent">Configuration</em>
      </h1>
      <p className="text-[13px] sm:text-[14.5px] text-white/55 leading-[1.7] mb-8 sm:mb-10 max-w-[580px]">
        t2000 reads from <InlineCode>~/.t2000/config.json</InlineCode> by
        default. All fields can be overridden with environment variables.
      </p>

      <h2 id="cfg-fields">Config fields</h2>
      <DocTable
        headers={["Field", "Type", "Default", "Description"]}
        rows={[
          [<InlineCode key="k">network</InlineCode>, "string", <InlineCode key="v">mainnet</InlineCode>, <><InlineCode>mainnet</InlineCode> | <InlineCode>testnet</InlineCode></>],
          [<InlineCode key="k">rpcUrl</InlineCode>, "string", "Mysten public", "Sui RPC endpoint"],
        ]}
      />
    </>
  );
}

function ErrorsSection() {
  return (
    <>
      <div className="text-[11px] tracking-[0.12em] uppercase text-accent mb-3">
        Reference
      </div>
      <h1 className="font-serif text-[28px] sm:text-4xl font-normal leading-[1.2] text-white/95 mb-4">
        Error <em className="italic text-accent">Codes</em>
      </h1>
      <p className="text-[13px] sm:text-[14.5px] text-white/55 leading-[1.7] mb-8 sm:mb-10 max-w-[580px]">
        Every error has a <InlineCode>code</InlineCode>, a human-readable{" "}
        <InlineCode>message</InlineCode>, and structured{" "}
        <InlineCode>data</InlineCode> that tells the agent exactly what to do
        next.
      </p>

      <h2 id="err-core">Core errors</h2>
      <DocTable
        headers={["Code", "Data", "Cause"]}
        rows={[
          [<InlineCode key="k">INSUFFICIENT_BALANCE</InlineCode>, <InlineCode key="d">{`{ required, available }`}</InlineCode>, "Not enough USDC in checking"],
          [<InlineCode key="k">INVALID_ADDRESS</InlineCode>, <InlineCode key="d">{`{ address }`}</InlineCode>, "Invalid Sui address format"],
          [<InlineCode key="k">SIMULATION_FAILED</InlineCode>, <InlineCode key="d">{`{ reason }`}</InlineCode>, "Tx would fail on-chain"],
          [<InlineCode key="k">HEALTH_FACTOR_TOO_LOW</InlineCode>, <InlineCode key="d">{`{ maxBorrow, currentHF }`}</InlineCode>, "Borrow drops HF below 1.5"],
          [<InlineCode key="k">WITHDRAW_WOULD_LIQUIDATE</InlineCode>, <InlineCode key="d">{`{ safeWithdrawAmount }`}</InlineCode>, "Withdrawal drops HF below 1.5"],
          [<InlineCode key="k">NO_COLLATERAL</InlineCode>, "—", "No savings to borrow against"],
          [<InlineCode key="k">SLIPPAGE_EXCEEDED</InlineCode>, "—", "Swap price moved beyond tolerance"],
          [<InlineCode key="k">PROTOCOL_PAUSED</InlineCode>, "—", "Protocol is temporarily paused"],
        ]}
      />

      <h2 id="err-mpp">MPP errors</h2>
      <DocTable
        headers={["Code", "Layer", "Cause"]}
        rows={[
          [<InlineCode key="k">PRICE_EXCEEDS_LIMIT</InlineCode>, "client", <>API price &gt; <InlineCode>--max-price</InlineCode></>],
          [<InlineCode key="k">UNSUPPORTED_NETWORK</InlineCode>, "client", "402 requires non-Sui chain"],
          [<InlineCode key="k">PAYMENT_EXPIRED</InlineCode>, "client", "402 challenge window elapsed"],
          [<InlineCode key="k">DUPLICATE_PAYMENT</InlineCode>, "Move", <>
            <InlineCode>EDuplicatePayment</InlineCode> — rejected on-chain
          </>],
          [<InlineCode key="k">FACILITATOR_REJECTION</InlineCode>, "facilitator", "Payment verification failed"],
        ]}
      />
    </>
  );
}

/* GatewaySection removed — replaced by MCP Server (see McpSection) */

/* TelegramSection removed — replaced by MCP-first setup (see McpSection) */

function InitWizardSection() {
  return (
    <>
      <div className="text-[11px] tracking-[0.12em] uppercase text-accent mb-3">
        AI Advisor
      </div>
      <h1 className="font-serif text-[28px] sm:text-4xl font-normal leading-[1.2] text-white/95 mb-4">
        Init <em className="italic text-accent">Wizard</em>
      </h1>
      <p className="text-[13px] sm:text-[14.5px] text-white/55 leading-[1.7] mb-8 sm:mb-10 max-w-[580px]">
        Guided setup: wallet, MCP platforms, safeguards — all in one command.
        Auto-configures Claude Desktop, Cursor, and Windsurf.
      </p>

      <h2 id="init-wizard-run">Run the wizard</h2>
      <CodeBlock lang="bash">
        {S.g("$")} t2000 init
      </CodeBlock>

      <h2 id="init-wizard-steps">What it does</h2>
      <DocTable
        headers={["Step", "What happens"]}
        rows={[
          ["1. Create wallet", "Create PIN, generate Ed25519 keypair (AES-256-GCM encrypted), create 5 bank accounts on Sui with gas sponsorship"],
          ["2. Connect AI platforms", "Multi-select checkbox: Claude Desktop, Cursor, Windsurf. Auto-writes MCP configs for selected platforms."],
          ["3. Set safeguards", "Per-transaction and daily send limits"],
        ]}
      />

      <h2 id="init-wizard-flow">Full wizard output</h2>
      <CodeBlock lang="bash">
        {S.g("$")} t2000 init{"\n\n"}
        {"  ┌─────────────────────────────────────────┐\n"}
        {"  │  "}{S.b("Welcome to t2000")}{"                       │\n"}
        {"  │  A bank account for AI agents           │\n"}
        {"  └─────────────────────────────────────────┘\n\n"}
        {"  "}{S.b("Step 1 of 3")} — Create wallet{"\n"}
        {"  Create PIN (min 4 chars): ****\n"}
        {"  Confirm PIN: ****\n\n"}
        {"  "}{S.m("Creating agent wallet...")}{"\n"}
        {"  "}{S.g("✓")} Keypair generated{"\n"}
        {"  "}{S.g("✓")} Network {S.m("Sui mainnet")}{"\n"}
        {"  "}{S.g("✓")} Gas sponsorship {S.m("enabled")}{"\n\n"}
        {"  "}{S.m("Setting up accounts...")}{"\n"}
        {"  "}{S.g("✓")} Checking  {S.g("✓")} Savings  {S.g("✓")} Credit  {S.g("✓")} Exchange  {S.g("✓")} Investment{"\n\n"}
        {"  "}🎉 {S.g("Bank account created")}{"\n"}
        {"  "}Address: {S.a("0x8b3e...d412")}{"\n\n"}
        {"  "}{S.b("Step 2 of 3")} — Connect AI platforms{"\n"}
        {"  Which AI platforms do you use? (space to select)\n"}
        {"  "}{S.g("◉")} Claude Desktop{"\n"}
        {"  "}{S.g("◉")} Cursor{"\n"}
        {"  ◯ Windsurf\n\n"}
        {"  "}{S.m("Adding t2000 to your AI platforms...")}{"\n"}
        {"  "}{S.g("✓")} Claude Desktop  configured{"\n"}
        {"  "}{S.g("✓")} Cursor  configured{"\n\n"}
        {"  "}{S.b("Step 3 of 3")} — Set safeguards{"\n"}
        {"  Max per transaction ($): 500\n"}
        {"  Max daily sends ($): 1000\n"}
        {"  "}{S.g("✓")} Safeguards configured{"\n\n"}
        {"  ┌─────────────────────────────────────────┐\n"}
        {"  │  "}{S.g("✓ You're all set")}{"                        │\n"}
        {"  │                                         │\n"}
        {"  │  Next steps:                             │\n"}
        {"  │    1. Restart Claude Desktop / Cursor    │\n"}
        {"  │    2. Ask: "}{S.b("\"What's my t2000 balance?\"")}{" │\n"}
        {"  │                                         │\n"}
        {"  │  Deposit USDC to get started:           │\n"}
        {"  │    "}{S.a("0x8b3e...d412")}{"                     │\n"}
        {"  └─────────────────────────────────────────┘"}
      </CodeBlock>

      <h2 id="init-wizard-returning">Returning users</h2>
      <p>
        If a wallet is detected, the wizard skips wallet creation (Step 1)
        and goes directly to MCP + safeguards setup (2 steps total).
      </p>

      <h2 id="init-wizard-after">After init</h2>
      <CodeBlock lang="bash">
        {S.g("$")} t2000 balance{S.c("   # use CLI directly, or ask your AI")}
      </CodeBlock>
    </>
  );
}

function McpSection() {
  return (
    <>
      <div className="text-[11px] tracking-[0.12em] uppercase text-accent mb-3">
        AI Advisor
      </div>
      <h1 className="font-serif text-[28px] sm:text-4xl font-normal leading-[1.2] text-white/95 mb-4">
        MCP <em className="italic text-accent">Server</em>
      </h1>
      <p className="text-[13px] sm:text-[14.5px] text-white/55 leading-[1.7] mb-8 sm:mb-10 max-w-[580px]">
        Connect Claude Desktop, Cursor, or any MCP client to your t2000 agent.
        35 tools, 20 prompts, stdio transport — your AI operates a full bank account.
      </p>

      <h2 id="mcp-setup">Setup — 2 commands</h2>
      <CodeBlock lang="bash">
        {S.g("$")} npm i -g @t2000/cli{S.c("   # install")}{"\n"}
        {S.g("$")} t2000 init{S.c("             # wallet + MCP + safeguards")}
      </CodeBlock>
      <p>
        The init wizard configures MCP for your AI platforms automatically.
        Restart your AI platform, then ask: <strong>&quot;What&apos;s my t2000 balance?&quot;</strong>
      </p>
      <Callout type="tip" label="Zero config">
        <InlineCode>t2000 init</InlineCode> auto-writes MCP configs
        for Claude Desktop, Cursor, and Windsurf. No JSON to paste, no files to find.
        Run <InlineCode>t2000 mcp uninstall</InlineCode> to remove later.
      </Callout>
      <p>
        For other platforms, paste manually:
      </p>
      <CodeBlock lang="json" filename="MCP Config">
        {`{\n  "mcpServers": {\n    "t2000": {\n      "command": "t2000",\n      "args": ["mcp"]\n    }\n  }\n}`}
      </CodeBlock>

      <h2 id="mcp-tools">Available tools (33)</h2>

      <h3 id="mcp-tools-read">Read-only (17)</h3>
      <DocTable
        headers={["Tool", "Description"]}
        rows={[
          [<InlineCode key="k">t2000_overview</InlineCode>, "Complete account snapshot — balance, positions, portfolio, health, earnings, rewards in one call"],
          [<InlineCode key="k">t2000_balance</InlineCode>, "Current balance — checking, savings, gas, total"],
          [<InlineCode key="k">t2000_address</InlineCode>, "Agent's Sui wallet address"],
          [<InlineCode key="k">t2000_positions</InlineCode>, "Lending positions across protocols"],
          [<InlineCode key="k">t2000_rates</InlineCode>, "Best interest rates per asset"],
          [<InlineCode key="k">t2000_all_rates</InlineCode>, "Per-protocol rate comparison (NAVI vs Suilend)"],
          [<InlineCode key="k">t2000_health</InlineCode>, "Health factor for borrows"],
          [<InlineCode key="k">t2000_history</InlineCode>, "Recent transactions"],
          [<InlineCode key="k">t2000_earnings</InlineCode>, "Yield earnings from savings"],
          [<InlineCode key="k">t2000_fund_status</InlineCode>, "Savings fund status — supplied, APY, projections"],
          [<InlineCode key="k">t2000_pending_rewards</InlineCode>, "Pending protocol rewards"],
          [<InlineCode key="k">t2000_deposit_info</InlineCode>, "Deposit instructions — address, network, supported assets"],
          [<InlineCode key="k">t2000_sentinel_list</InlineCode>, "List active sentinels with prize pools"],
          [<InlineCode key="k">t2000_sentinel_info</InlineCode>, "Sentinel details — model, system prompt, attack history"],
          [<InlineCode key="k">t2000_contacts</InlineCode>, "List and resolve named contacts"],
          [<InlineCode key="k">t2000_portfolio</InlineCode>, "View investment portfolio with cost-basis P&L"],
          [<InlineCode key="k">t2000_services</InlineCode>, "Discover all MPP services, endpoints, and prices"],
        ]}
      />

      <h3 id="mcp-tools-write">State-changing (16)</h3>
      <p>
        All support <InlineCode>dryRun: true</InlineCode> for previews without signing.
        Subject to safeguard enforcement.
      </p>
      <DocTable
        headers={["Tool", "Description"]}
        rows={[
          [<InlineCode key="k">t2000_send</InlineCode>, "Send USDC to a Sui address or contact"],
          [<InlineCode key="k">t2000_save</InlineCode>, "Deposit to savings (earn yield)"],
          [<InlineCode key="k">t2000_withdraw</InlineCode>, "Withdraw from savings"],
          [<InlineCode key="k">t2000_borrow</InlineCode>, "Borrow against collateral"],
          [<InlineCode key="k">t2000_repay</InlineCode>, "Repay borrowed USDC"],
          [<InlineCode key="k">t2000_exchange</InlineCode>, "Swap assets via DEX"],
          [<InlineCode key="k">t2000_rebalance</InlineCode>, "Optimize yield across protocols"],
          [<InlineCode key="k">t2000_invest</InlineCode>, "Buy, sell, earn, or unearn SUI, BTC, ETH, GOLD"],
          [<InlineCode key="k">t2000_invest_rebalance</InlineCode>, "Move earning positions to better-rate protocols"],
          [<InlineCode key="k">t2000_strategy</InlineCode>, "Manage strategies — list, buy, sell, status, rebalance, create"],
          [<InlineCode key="k">t2000_auto_invest</InlineCode>, "DCA scheduling — setup, status, run, stop"],
          [<InlineCode key="k">t2000_claim_rewards</InlineCode>, "Claim protocol rewards and auto-convert to USDC"],
          [<InlineCode key="k">t2000_sentinel_attack</InlineCode>, "Attack a sentinel to win its prize pool"],
          [<InlineCode key="k">t2000_pay</InlineCode>, "Pay for an MPP-protected API (handles 402 challenge automatically)"],
          [<InlineCode key="k">t2000_contact_add</InlineCode>, "Save a contact name → Sui address"],
          [<InlineCode key="k">t2000_contact_remove</InlineCode>, "Remove a saved contact"],
        ]}
      />

      <h3 id="mcp-tools-safety">Safety (2)</h3>
      <DocTable
        headers={["Tool", "Description"]}
        rows={[
          [<InlineCode key="k">t2000_config</InlineCode>, "View/set safeguard limits (maxPerTx, maxDailySend)"],
          [<InlineCode key="k">t2000_lock</InlineCode>, "Emergency freeze all operations"],
        ]}
      />
      <Callout type="warn" label="Security">
        <InlineCode>unlock</InlineCode> is intentionally <strong>not</strong> exposed
        as an MCP tool. Only a human can unlock the agent via{" "}
        <InlineCode>t2000 unlock</InlineCode> in the terminal.
      </Callout>

      <h2 id="mcp-prompts">Prompts (20)</h2>
      <p>
        Reusable conversation templates that help AI assistants interact with t2000 effectively.
      </p>
      <DocTable
        headers={["Prompt", "Description"]}
        rows={[
          [<InlineCode key="k">financial-report</InlineCode>, "Comprehensive financial summary — balance, positions, health, earnings"],
          [<InlineCode key="k">optimize-yield</InlineCode>, "Yield optimization analysis with rebalance recommendations"],
          [<InlineCode key="k">send-money</InlineCode>, "Guided send flow — validate, preview, confirm, execute"],
          [<InlineCode key="k">budget-check</InlineCode>, "Can I afford $X? — checks balance, daily limit, spending impact"],
          [<InlineCode key="k">savings-strategy</InlineCode>, "Analyze idle funds, recommend how much to save and where"],
          [<InlineCode key="k">investment-strategy</InlineCode>, "Portfolio analysis — allocation, P&L, buy/sell recommendations"],
          [<InlineCode key="k">morning-briefing</InlineCode>, "Daily snapshot — balances, yield earned, portfolio movement, alerts"],
          [<InlineCode key="k">what-if</InlineCode>, "Scenario planning — model the impact of invest/save/borrow decisions"],
          [<InlineCode key="k">sweep</InlineCode>, "Find idle checking funds and route to optimal earning positions"],
          [<InlineCode key="k">risk-check</InlineCode>, "Full risk analysis — health factor, concentration, liquidation proximity"],
          [<InlineCode key="k">weekly-recap</InlineCode>, "Week in review — activity, yield earned, portfolio P&L, highlights"],
          [<InlineCode key="k">dca-advisor</InlineCode>, "Personalized DCA setup — budget → strategy, frequency, projected growth"],
          [<InlineCode key="k">claim-rewards</InlineCode>, "Check and claim pending protocol rewards — auto-converts to USDC"],
          [<InlineCode key="k">safeguards</InlineCode>, "Review safety settings — per-tx limits, daily caps, emergency lock"],
          [<InlineCode key="k">quick-exchange</InlineCode>, "Guided token swap — preview rate, slippage, impact before executing"],
          [<InlineCode key="k">sentinel-hunt</InlineCode>, "Guided bounty hunting — find targets, craft attacks, win prizes"],
          [<InlineCode key="k">onboarding</InlineCode>, "New user setup — deposit, first save, explore features"],
          [<InlineCode key="k">emergency</InlineCode>, "Lock account, assess damage, recovery guidance"],
          [<InlineCode key="k">optimize-all</InlineCode>, "One-shot full optimization — sweep, rebalance, claim, earn"],
          [<InlineCode key="k">savings-goal</InlineCode>, "Goal-based savings — save $X by date Y with yield projections"],
        ]}
      />

      <h2 id="mcp-dryrun">dryRun previews</h2>
      <p>
        Every state-changing tool accepts <InlineCode>dryRun: true</InlineCode>.
        This returns a preview of what would happen — amount, fees, balance after,
        safeguard status — without signing any transaction. The AI can inspect the
        preview, explain it to the user, and only execute when confirmed.
      </p>
      <CodeBlock lang="json">
        {S.c("// t2000_send with dryRun: true")}{"\n"}
        {`{\n  "preview": true,\n  "canSend": true,\n  "amount": 10,\n  "to": "0x40cd...3e62",\n  "currentBalance": 96.81,\n  "balanceAfter": 86.81,\n  "safeguards": { "dailyUsedAfter": 10, "dailyLimit": 1000 }\n}`}
      </CodeBlock>

      <h2 id="mcp-platforms">Platform configs</h2>
      <Callout type="tip" label="Auto-configured">
        <InlineCode>t2000 init</InlineCode> configures MCP for Claude Desktop,
        Cursor, and Windsurf automatically. Use <InlineCode>t2000 mcp install</InlineCode> to
        reconfigure later if needed.
      </Callout>
      <p>
        For manual setup or other platforms, use this config:
      </p>
      <CodeBlock lang="json">
        {`{\n  "mcpServers": {\n    "t2000": {\n      "command": "t2000",\n      "args": ["mcp"]\n    }\n  }\n}`}
      </CodeBlock>
      <DocTable
        headers={["Platform", "Config location"]}
        rows={[
          ["Claude Desktop", <><InlineCode key="k">~/Library/Application Support/Claude/claude_desktop_config.json</InlineCode> (macOS)</>],
          ["Cursor", <><InlineCode key="k">~/.cursor/mcp.json</InlineCode> (global) or <InlineCode key="k2">.cursor/mcp.json</InlineCode> (project)</>],
        ]}
      />

      <h2 id="mcp-security">Security</h2>
      <DocTable
        headers={["Control", "How it works"]}
        rows={[
          ["Safeguard gate", "MCP server refuses to start without configured limits"],
          ["Per-transaction limits", "Cap individual transaction amounts via maxPerTx"],
          ["Daily send limits", "Cap total daily outbound transfers via maxDailySend"],
          ["Lock / unlock", "AI can lock; only humans can unlock via CLI"],
          ["dryRun previews", "Preview any operation before signing"],
          ["Local-only", "stdio transport — private key never leaves the machine"],
        ]}
      />
    </>
  );
}

function SkillsSection() {
  return (
    <>
      <div className="text-[11px] tracking-[0.12em] uppercase text-accent mb-3">
        Guides
      </div>
      <h1 className="font-serif text-[28px] sm:text-4xl font-normal leading-[1.2] text-white/95 mb-4">
        Agent <em className="italic text-accent">Skills</em>
      </h1>
      <p className="text-[13px] sm:text-[14.5px] text-white/55 leading-[1.7] mb-8 sm:mb-10 max-w-[580px]">
        Install once and any Claude, Codex, or Copilot agent discovers t2000
        automatically — no manual wiring.
      </p>

      <h2 id="sk-install">Install</h2>
      <TryIt cmd="npx skills add mission69b/t2000-skills" />
      <p>
        Works with Claude Code, OpenAI Codex, GitHub Copilot, Cursor, VS Code,
        and any platform implementing the{" "}
        <a href="https://agentskills.io" target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">
          Agent Skills standard
        </a>.
      </p>

      <h2 id="sk-list">Available skills</h2>
      <DocTable
        headers={["Skill", "Triggers", "Status"]}
        skillRow
        rows={[
          [<InlineCode key="k">t2000-check-balance</InlineCode>, <>&#34;check balance&#34;, &#34;how much USDC do I have&#34;</>, <Badge color="green" key="b">live</Badge>],
          [<InlineCode key="k">t2000-send</InlineCode>, <>&#34;send 10 USDC to...&#34;, &#34;pay X&#34;</>, <Badge color="green" key="b">live</Badge>],
          [<InlineCode key="k">t2000-save</InlineCode>, <>&#34;deposit to savings&#34;, &#34;earn yield on...&#34;</>, <Badge color="green" key="b">live</Badge>],
          [<InlineCode key="k">t2000-withdraw</InlineCode>, <>&#34;withdraw from savings&#34;, &#34;access deposits&#34;</>, <Badge color="green" key="b">live</Badge>],
          [<InlineCode key="k">t2000-borrow</InlineCode>, <>&#34;borrow 40 USDC&#34;, &#34;take out a loan&#34;</>, <Badge color="green" key="b">live</Badge>],
          [<InlineCode key="k">t2000-repay</InlineCode>, <>&#34;repay my loan&#34;, &#34;pay back...&#34;</>, <Badge color="green" key="b">live</Badge>],
          [<InlineCode key="k">t2000-exchange</InlineCode>, <>&#34;swap USDC to SUI&#34;, &#34;exchange tokens&#34;, &#34;convert to...&#34;</>, <Badge color="green" key="b">live</Badge>],
          [<InlineCode key="k">t2000-pay</InlineCode>, <>&#34;search the web&#34;, &#34;generate an image&#34;, &#34;buy a gift card&#34;, &#34;send mail&#34;</>, <Badge color="green" key="b">live</Badge>],
          [<InlineCode key="k">t2000-sentinel</InlineCode>, <>&#34;attack a sentinel&#34;, &#34;earn bounties&#34;, &#34;red team&#34;</>, <Badge color="green" key="b">live</Badge>],
          [<InlineCode key="k">t2000-rebalance</InlineCode>, <>&#34;optimize yield&#34;, &#34;rebalance savings&#34;, &#34;find better rate&#34;</>, <Badge color="green" key="b">live</Badge>],
          [<InlineCode key="k">t2000-invest</InlineCode>, <>&#34;buy SUI&#34;, &#34;invest $100 in BTC&#34;, &#34;sell my ETH&#34;, &#34;show portfolio&#34;</>, <Badge color="green" key="b">live</Badge>],
        ]}
      />

      <h2 id="sk-how">How it works</h2>
      <p>
        Each skill is a <InlineCode>SKILL.md</InlineCode> file with YAML
        frontmatter. The agent loads a ~30-token summary at startup, and the full
        instructions only when that skill is triggered. Zero overhead when the
        skill isn&#39;t being used.
      </p>
      <CodeBlock lang="yaml" filename="skills/t2000-save/SKILL.md">
        {S.m("---")}{"\n"}
        {S.a("name")}: t2000-save{"\n"}
        {S.a("description")}: {S.s(`>-\n  Deposit USDC into savings to earn yield on Sui.\n  Auto-routes to best rate across NAVI and Suilend.\n  Use when asked to save money, earn interest, or maximize yield.`)}{"\n"}
        {S.m("---")}{"\n"}
        {S.c("# Full instructions follow below...")}
      </CodeBlock>
    </>
  );
}

function MppSection() {
  return (
    <>
      <div className="text-[11px] tracking-[0.12em] uppercase text-accent mb-3">
        Guides
      </div>
      <h1 className="font-serif text-[28px] sm:text-4xl font-normal leading-[1.2] text-white/95 mb-4">
        MPP <em className="italic text-accent">Payments</em>
      </h1>
      <p className="text-[13px] sm:text-[14.5px] text-white/55 leading-[1.7] mb-8 sm:mb-10 max-w-[580px]">
        t2000 is the first{" "}
        <a href="https://mpp.dev" className="text-accent hover:underline" target="_blank" rel="noopener noreferrer">MPP</a>{" "}
        implementation on Sui. Your agent can pay for 17 API services
        across AI, search, media, commerce, and more — all with USDC micropayments.
      </p>

      <Callout type="tip" label="MPP Gateway">
        Browse all available services at{" "}
        <a href="https://mpp.t2000.ai" className="text-accent hover:underline" target="_blank" rel="noopener noreferrer">mpp.t2000.ai</a>.
        Machine-readable catalog at{" "}
        <a href="https://mpp.t2000.ai/llms.txt" className="text-accent hover:underline" target="_blank" rel="noopener noreferrer">/llms.txt</a>{" "}
        and{" "}
        <a href="https://mpp.t2000.ai/api/services" className="text-accent hover:underline" target="_blank" rel="noopener noreferrer">/api/services</a>.
      </Callout>

      <h2 id="mpp-services">Available services</h2>
      <p>35 services, 79 endpoints. No API keys, no accounts — just USDC on Sui.</p>
      <DocTable
        headers={["Category", "Services", "From"]}
        rows={[
          ["AI & ML", "OpenAI, Anthropic, Gemini, DeepSeek, Groq, Together AI, Perplexity, Replicate, Stability AI", "$0.005"],
          ["Media", "Fal.ai (Flux), ElevenLabs (TTS, SFX), AssemblyAI (transcription)", "$0.02"],
          ["Search", "Brave Search, Exa, Serper, SerpAPI, NewsAPI", "$0.005"],
          ["Data", "OpenWeather, Google Maps, CoinGecko, Alpha Vantage, IPinfo, Hunter.io", "$0.005"],
          ["Web", "Firecrawl, Jina Reader, ScreenshotOne, PDFShift, QR Code", "$0.005"],
          ["Translation", "DeepL, Google Translate (130+ languages)", "$0.005"],
          ["Compute", "Judge0", "$0.005"],
          ["Communication", "Resend (email)", "$0.005"],
          [<><strong key="c">Commerce</strong></>, <>Reloadly (gift cards), Lob (physical mail), Printful (print-on-demand)</>, "$0.005"],
        ]}
      />

      <h2 id="mpp-how">How the handshake works</h2>
      <div className="flex flex-col border border-[var(--border)] rounded-lg overflow-hidden my-5 mb-7">
        {[
          { num: "1", dir: "→ POST", dirClass: "text-warning", desc: <>Agent requests an endpoint — no payment header</> },
          { num: "2", dir: "← 402", dirClass: "text-accent", desc: <>Server returns <InlineCode>402 Payment Required</InlineCode> with MPP challenge: amount, currency, recipient</> },
          { num: "3", dir: "→ TX", dirClass: "text-warning", desc: <>mppx builds a USDC transfer on Sui, signs with agent keypair, broadcasts — settles in ~400ms</> },
          { num: "4", dir: "→ POST", dirClass: "text-warning", desc: <>Retries with <InlineCode>x-payment-credential</InlineCode> containing the Sui transaction digest</> },
          { num: "5", dir: "← 200", dirClass: "text-accent", desc: <>Server verifies the transaction on-chain via RPC → returns the response</> },
        ].map((step, i, arr) => (
          <div key={i} className={`flex items-start gap-2.5 sm:gap-3.5 px-3 sm:px-4.5 py-3 sm:py-3.5 bg-[var(--surface)] transition-colors hover:bg-white/[0.02] ${i < arr.length - 1 ? "border-b border-[var(--border)]" : ""}`}>
            <span className="text-[11px] text-[var(--doc-muted)] shrink-0 mt-0.5 w-4">{step.num}</span>
            <span className={`text-[11px] font-semibold shrink-0 mt-0.5 w-10 ${step.dirClass}`}>{step.dir}</span>
            <span className="text-[12px] sm:text-[12.5px] text-white/60 leading-[1.6] min-w-0">{step.desc}</span>
          </div>
        ))}
      </div>

      <h2 id="mpp-cli">CLI usage</h2>
      <CodeBlock lang="bash">
        {S.g("$")} t2000 pay https://mpp.t2000.ai/openai/v1/chat/completions \{"\n"}
        {"  "}--data {S.s("'{\"model\":\"gpt-4o\",\"messages\":[{\"role\":\"user\",\"content\":\"Hello\"}]}'")}{"\n\n"}
        → POST https://mpp.t2000.ai/openai/v1/chat/completions{"\n"}
        ← {S.a("402 Payment Required:")} $0.01 USDC (Sui){"\n"}
        {S.g("✓")} Paid $0.01 USDC {S.m("(tx: 0x9f2c...a801)")}{"\n"}
        ← {S.g("200 OK")}  {S.m("[820ms]")}
      </CodeBlock>
      <p>More examples:</p>
      <CodeBlock lang="bash">
        {S.c("# Search the web")}{"\n"}
        t2000 pay https://mpp.t2000.ai/brave/v1/web/search \{"\n"}
        {"  "}--data {S.s("'{\"q\":\"Sui blockchain news\"}'")}{"\n\n"}
        {S.c("# Buy a gift card")}{"\n"}
        t2000 pay https://mpp.t2000.ai/reloadly/v1/order \{"\n"}
        {"  "}--max-price {S.a("25")} \{"\n"}
        {"  "}--data {S.s("'{\"productId\":120,\"unitPrice\":20,\"recipientEmail\":\"...\"}'")}{"\n\n"}
        {S.c("# Send physical mail")}{"\n"}
        t2000 pay https://mpp.t2000.ai/lob/v1/postcards \{"\n"}
        {"  "}--max-price {S.a("2")} \{"\n"}
        {"  "}--data {S.s("'{\"to\":{\"name\":\"...\",\"address_line1\":\"...\"},\"from\":{...}}'")}{"\n\n"}
        {S.c("# Check weather")}{"\n"}
        t2000 pay https://mpp.t2000.ai/openweather/v1/weather \{"\n"}
        {"  "}--data {S.s("'{\"q\":\"Tokyo\"}'")}{"\n\n"}
        {S.c("# Execute code")}{"\n"}
        t2000 pay https://mpp.t2000.ai/judge0/v1/submissions \{"\n"}
        {"  "}--data {S.s("'{\"source_code\":\"print(42)\",\"language_id\":71}'")}
      </CodeBlock>

      <h2 id="mpp-sdk">SDK usage</h2>
      <CodeBlock lang="typescript">
        {S.p("const")} result = {S.p("await")} agent.{S.g("pay")}({"{"}{"\n"}
        {"  "}url: {S.s("'https://mpp.t2000.ai/openai/v1/chat/completions'")},{"\n"}
        {"  "}body: JSON.{S.g("stringify")}({"{"} model: {S.s("'gpt-4o'")}, messages: [...] {"}"}),{"\n"}
        {"  "}maxPrice: {S.a("0.05")},{"\n"}
        {"}"});{"\n\n"}
        {S.p("const")} data = result.{S.a("body")};  {S.c("// API response")}
      </CodeBlock>

      <h2 id="mpp-mcp">MCP tools</h2>
      <p>
        When using t2000 via MCP (Claude Desktop, Cursor, Windsurf), your agent
        has two tools for MPP:
      </p>
      <DocTable
        headers={["Tool", "Description"]}
        rows={[
          [<InlineCode key="k">t2000_services</InlineCode>, "Discover all available MPP services, endpoints, and prices. Call this first."],
          [<InlineCode key="k">t2000_pay</InlineCode>, "Make a paid API request. Handles the 402 challenge automatically."],
        ]}
      />
      <p>
        Just ask naturally — your AI will discover the right service and pay for it:
      </p>
      <CodeBlock lang="output">
        {S.m("You:")} Generate an image of a sunset using Fal.ai{"\n"}
        {S.m("Claude:")} {S.c("→ t2000_services (discovers fal.ai endpoints)")}{"\n"}
        {S.m("Claude:")} {S.c("→ t2000_pay (POST mpp.t2000.ai/fal/fal-ai/flux/dev)")}{"\n"}
        {S.g("✓")} Image generated — paid $0.03 USDC
      </CodeBlock>

      <h2 id="mpp-why-sui">Why Sui MPP is different</h2>
      <p>
        EVM MPP typically uses signed transfers verified by a facilitator.
        On Sui, <InlineCode>@t2000/mpp-sui</InlineCode> uses direct USDC
        transfers verified peer-to-peer via Sui RPC — no intermediary needed.
      </p>
      <p>
        Sui transactions are final in ~400ms, gas costs are under $0.001,
        and USDC is Circle-issued natively on Sui. The server verifies
        the transaction digest on-chain: correct recipient, correct amount,
        success status.{" "}
        <strong>No facilitator. No webhook. Just on-chain proof.</strong>
      </p>

      <h2 id="mpp-links">Links</h2>
      <DocTable
        headers={["Resource", "URL"]}
        rows={[
          ["MPP Gateway (service directory)", <a key="l" href="https://mpp.t2000.ai" className="text-accent hover:underline" target="_blank" rel="noopener noreferrer">mpp.t2000.ai</a>],
          ["MPP Standard", <a key="l" href="https://mpp.dev" className="text-accent hover:underline" target="_blank" rel="noopener noreferrer">mpp.dev</a>],
          ["Sui payment method (npm)", <a key="l" href="https://www.npmjs.com/package/@t2000/mpp-sui" className="text-accent hover:underline" target="_blank" rel="noopener noreferrer">@t2000/mpp-sui</a>],
          ["Agent discovery", <a key="l" href="https://mpp.t2000.ai/llms.txt" className="text-accent hover:underline" target="_blank" rel="noopener noreferrer">mpp.t2000.ai/llms.txt</a>],
          ["JSON service catalog", <a key="l" href="https://mpp.t2000.ai/api/services" className="text-accent hover:underline" target="_blank" rel="noopener noreferrer">mpp.t2000.ai/api/services</a>],
        ]}
      />
    </>
  );
}

function DefiSection() {
  return (
    <>
      <div className="text-[11px] tracking-[0.12em] uppercase text-accent mb-3">
        Guides
      </div>
      <h1 className="font-serif text-[28px] sm:text-4xl font-normal leading-[1.2] text-white/95 mb-4">
        DeFi <em className="italic text-accent">& Yield</em>
      </h1>
      <p className="text-[13px] sm:text-[14.5px] text-white/55 leading-[1.7] mb-8 sm:mb-10 max-w-[580px]">
        t2000 integrates NAVI Protocol and Suilend for savings and borrowing, and Cetus DEX
        for token exchange. All protocols are composed atomically via PTBs using direct Move contract calls — no external SDK dependencies.
      </p>

      <h2 id="defi-navi">Lending protocol integration</h2>
      <p>
        t2000 supports multiple lending protocols on Sui. When you call{" "}
        <InlineCode>t2000 save</InlineCode>, your USDC is auto-routed to the protocol
        offering the best APY (currently NAVI and Suilend). You can also target a specific
        protocol with <InlineCode>--protocol navi</InlineCode> or{" "}
        <InlineCode>--protocol suilend</InlineCode>. You earn yield continuously as each
        pool&#39;s interest accrues.
      </p>
      <Callout type="tip" label="Tip">
        APY is variable and changes with utilization. Higher utilization (more
        borrowers) = higher yield for depositors. Check live APY with{" "}
        <InlineCode>t2000 balance</InlineCode>.
      </Callout>

      <h2 id="defi-cetus">Cetus DEX integration</h2>
      <p>
        Token swaps route through Cetus DEX with on-chain slippage protection.
        The <InlineCode>amount_limit</InlineCode> parameter ensures the
        transaction reverts automatically if the received amount falls below
        your tolerance — no partial fills, no silent slippage.
      </p>

      <h2 id="defi-borrow">Collateralized borrowing</h2>
      <p>
        You can borrow USDC against your savings collateral. t2000 enforces a health
        factor floor of 1.5 — more conservative than the protocol&#39;s liquidation
        threshold of 1.0 — to give your agent a safety buffer before liquidation
        risk.
      </p>
      <CodeBlock lang="bash">
        {S.c("# Typical leverage loop for an agent:")}{"\n"}
        {S.g("$")} t2000 save all                   {S.c("# deposit to savings")}{"\n"}
        {S.g("$")} t2000 balance --show-limits      {S.c("# check maxBorrow")}{"\n"}
        {S.g("$")} t2000 borrow {S.a("40")}                   {S.c("# borrow against collateral")}{"\n"}
        {S.g("$")} t2000 save {S.a("40")}                     {S.c("# deposit borrowed USDC for more yield")}
      </CodeBlock>
    </>
  );
}

function GasSection() {
  return (
    <>
      <div className="text-[11px] tracking-[0.12em] uppercase text-accent mb-3">
        Guides
      </div>
      <h1 className="font-serif text-[28px] sm:text-4xl font-normal leading-[1.2] text-white/95 mb-4">
        Gas <em className="italic text-accent">Management</em>
      </h1>
      <p className="text-[13px] sm:text-[14.5px] text-white/55 leading-[1.7] mb-8 sm:mb-10 max-w-[580px]">
        t2000 manages gas completely autonomously. You never need to manually
        fund SUI — the gas manager handles it.
      </p>

      <h2 id="gas-auto">Automatic top-up</h2>
      <p>
        Before every transaction, t2000 checks the SUI reserve. If it&#39;s
        below the configured minimum (default: 0.05 SUI), the gas manager
        converts USDC → SUI atomically in the same PTB as your intended
        operation. From the agent&#39;s perspective, gas is invisible.
      </p>

      <h2 id="gas-save-all">
        How this interacts with <InlineCode>save all</InlineCode>
      </h2>
      <p>This is the most important thing to understand about gas management:</p>
      <Callout type="note" label="Important">
        <InlineCode>save all</InlineCode> does <strong>not</strong> simply
        reserve $1 USDC. If the SUI gas reserve is low, the gas manager may
        auto-convert up to $1 USDC → SUI before the deposit. The exact USDC
        deposited equals your available balance minus any gas conversion. Factor
        this into expected output when building agents.
      </Callout>

      <h2 id="gas-config">Thresholds</h2>
      <p>
        Gas thresholds are SDK constants — not user-configurable. This prevents
        agents from accidentally setting values that would cause transactions to
        fail.
      </p>
      <DocTable
        headers={["Constant", "Value", "Purpose"]}
        rows={[
          [<InlineCode key="k">AUTO_TOPUP_THRESHOLD</InlineCode>, "0.05 SUI", "Trigger auto-topup when SUI balance falls below this"],
          [<InlineCode key="k">AUTO_TOPUP_AMOUNT</InlineCode>, "$1 USDC", "Max USDC converted to SUI per top-up"],
          [<InlineCode key="k">GAS_FEE_CEILING_USD</InlineCode>, "$0.05", "Refuse to execute if estimated gas exceeds this"],
        ]}
      />
    </>
  );
}

function ChangelogSection() {
  return (
    <>
      <div className="text-[11px] tracking-[0.12em] uppercase text-accent mb-3">
        More
      </div>
      <h1 className="font-serif text-[28px] sm:text-4xl font-normal leading-[1.2] text-white/95 mb-4">
        <em className="italic text-accent">Changelog</em>
      </h1>

      <h2 id="cl-current">
        v0.20.0 <Badge color="green">current</Badge>
      </h2>
      <p>
        MCP-first AI advisor — connect Claude Desktop, Cursor, or Windsurf to your
        t2000 agent. <InlineCode>t2000 init</InlineCode> walks you through setup (wallet, MCP
        platforms, safeguards) and auto-configures your AI platform.
        35 tools, 20 prompts, stdio transport. <InlineCode>@t2000/mcp</InlineCode> package.
      </p>

      <h2 id="cl-0170">
        v0.17.0
      </h2>
      <p>
        Gold (XAUm) — tokenized physical gold is now the fourth investment asset. New built-in strategies: all-weather (BTC/ETH/SUI/GOLD) and safe-haven (BTC/GOLD). GOLD earns yield via NAVI and Suilend. Crypto and commodities in one portfolio.
      </p>

      <h2 id="cl-0163">
        v0.16.30
      </h2>
      <p>
        Strategies + Auto-Invest — <InlineCode>t2000 invest strategy buy bluechip 200</InlineCode> splits investment across a themed allocation in a single transaction. Built-in strategies: bluechip (BTC/ETH/SUI), layer1 (ETH/SUI), sui-heavy. Custom strategies via <InlineCode>t2000 invest strategy create</InlineCode>. Dollar-cost averaging with <InlineCode>t2000 invest auto setup 50 weekly bluechip</InlineCode>. Strategy rebalancing, portfolio grouping by strategy, 21 MCP tools.
      </p>

      <h2 id="cl-0150">
        v0.15.0
      </h2>
      <p>
        Investment yield — <InlineCode>t2000 invest earn &lt;asset&gt;</InlineCode> deposits SUI or ETH into best-rate lending (NAVI/Suilend) for yield while keeping price exposure. <InlineCode>t2000 invest unearn &lt;asset&gt;</InlineCode> withdraws from lending. <InlineCode>t2000 invest rebalance</InlineCode> moves earning positions to better-rate protocols. Auto-withdraw on sell, portfolio yield column, borrow guard, rebalance guard.
      </p>

      <h2 id="cl-0141">
        v0.14.1
      </h2>
      <p>
        Multi-asset investing — BTC and ETH via SuiBridge. Asset-aware decimal display
        with <InlineCode>formatAssetAmount()</InlineCode> (8 decimals for BTC/ETH, 9 for SUI, 6 for stablecoins).
      </p>

      <h2 id="cl-0140">
        v0.14.0
      </h2>
      <p>
        Investment account: buy/sell SUI, BTC, ETH, GOLD with portfolio tracking, cost-basis P&L,
        and investment locking guard. 19 MCP tools, 6 prompts, 14 agent skills.
      </p>

      <h2 id="cl-0130">
        v0.13.0
      </h2>
      <p>
        17 tools, contacts — send by name instead of raw addresses.
      </p>

      <h2 id="cl-0120">
        v0.12.0
      </h2>
      <p>
        MCP Server — connect Claude Desktop, Cursor, or any MCP client to your
        t2000 agent. 23 tools with <InlineCode>dryRun</InlineCode> previews, 6
        prompts, safeguard enforcement, and stdio transport. New{" "}
        <InlineCode>@t2000/mcp</InlineCode> package and{" "}
        <InlineCode>t2000 mcp</InlineCode> CLI command. Setup in 3 steps, zero
        friction.
      </p>

      <h2 id="cl-0110">
        v0.11.0
      </h2>
      <p>
        Agent Safeguards — spending limits, daily caps, and lock/unlock for autonomous agents.
        New <InlineCode>t2000 config show</InlineCode>, <InlineCode>t2000 lock</InlineCode>,
        and <InlineCode>t2000 unlock</InlineCode> commands. SDK{" "}
        <InlineCode>SafeguardEnforcer</InlineCode> class enforces limits before signing.
      </p>

      <h2 id="cl-0103">
        v0.10.3
      </h2>
      <p>
        Fix health factor display showing large numbers instead of ∞ when no
        active borrows. Fix asset display names in rates output (suiUSDT, suiUSDe, USDsui).
      </p>

      <h2 id="cl-0102">
        v0.10.2
      </h2>
      <p>
        CLI UX polish — standardized dollar formatting, APY precision (2 decimal places),
        consistent output helpers across all commands. Added{" "}
        <InlineCode>(earning X% APY)</InlineCode> and daily earnings to{" "}
        <InlineCode>t2000 balance</InlineCode> output.
      </p>

      <h2 id="cl-0101">
        v0.10.1
      </h2>
      <p>
        New <InlineCode>t2000 exchange</InlineCode> command for token swaps via
        Cetus DEX with on-chain slippage protection. Public SDK methods{" "}
        <InlineCode>exchange()</InlineCode> and{" "}
        <InlineCode>exchangeQuote()</InlineCode>.
      </p>

      <h2 id="cl-0100">
        v0.10.0
      </h2>
      <p>
        Removed Pyth oracle dependency — simplified to NAVI native oracle
        updates. Cleaner install with no engine warnings. Reduced dependency
        footprint.
      </p>

      <h2 id="cl-099">
        v0.9.9
      </h2>
      <p>
        Fixed <InlineCode>withdraw all</InlineCode> failing on dust positions.
        Graceful zero-amount handling in PTBs instead of transaction abortion.
        Per-asset max withdrawal cap for accurate multi-position withdrawals.
      </p>

      <h2 id="cl-063">
        v0.6.3
      </h2>
      <p>
        Multi-protocol lending: NAVI + Suilend with auto-routing to best APY.
        Contract-first architecture — no external SDK dependencies. Migrated to{" "}
        <InlineCode>@mysten/sui@2.x</InlineCode>. Dynamic package ID resolution
        for NAVI contract upgrades. Oracle price updates for withdraw/borrow.
      </p>

      <h2 id="cl-033">
        v0.3.3
      </h2>
      <p>
        On-chain fee collection via Move contracts v2. AdminCap enforcement on
        treasury operations. Fresh contract deploy with proper PTB-based fee
        collection for save and borrow. SDK v0.3.0 with addCollectFeeToTx.
      </p>

      <h2 id="cl-0212">
        v0.2.12
      </h2>
      <p>
        Full bank account model: checking, savings, credit, and currency
        exchange. Programmable Transaction Block architecture for atomic
        multi-step operations. Gas manager with auto-topup. MPP payment support
        on Sui. Agent Skills integration.
      </p>
    </>
  );
}

/* ─── Main page ─── */

export default function DocsPage() {
  const [activeSection, setActiveSection] = useState("quickstart");
  const [tocItems, setTocItems] = useState<{ id: string; text: string; level: number }[]>([]);
  const [activeTocId, setActiveTocId] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const mainRef = useRef<HTMLElement>(null);

  const goTo = useCallback(
    (id: string, anchor?: string) => {
      if (id.startsWith("_")) return;
      setActiveSection(id);
      setMobileMenuOpen(false);
      if (anchor) {
        setTimeout(() => {
          document.getElementById(anchor)?.scrollIntoView({ behavior: "smooth", block: "start" });
        }, 100);
      } else {
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
    },
    [],
  );

  // Build TOC when section changes
  useEffect(() => {
    if (!mainRef.current) return;
    const headings = mainRef.current.querySelectorAll("h2[id], h3[id]");
    const items: { id: string; text: string; level: number }[] = [];
    headings.forEach((h) => {
      const text = (h.textContent ?? "")
        .replace(/\s*(NEW|live|current|addon|TS|MPP|optional)\s*/g, "")
        .trim();
      items.push({ id: h.id, text, level: h.tagName === "H3" ? 3 : 2 });
    });
    setTocItems(items);
  }, [activeSection]);

  // Scroll spy for TOC
  useEffect(() => {
    const handleScroll = () => {
      if (!mainRef.current) return;
      const headings = mainRef.current.querySelectorAll("h2[id], h3[id]");
      let current = "";
      headings.forEach((h) => {
        if (h.getBoundingClientRect().top < 120) current = h.id;
      });
      setActiveTocId(current);
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, [activeSection]);

  // Lock body scroll when mobile menu is open
  useEffect(() => {
    document.body.style.overflow = mobileMenuOpen ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [mobileMenuOpen]);

  // Cmd+K search shortcut
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        document.getElementById("docs-search")?.focus();
      }
      if (e.key === "Escape") {
        (document.getElementById("docs-search") as HTMLInputElement | null)?.blur();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const filteredNav = searchQuery
    ? NAV.map((g) => ({
        ...g,
        items: g.items.filter((i) =>
          i.name.toLowerCase().includes(searchQuery.toLowerCase()),
        ),
      })).filter((g) => g.items.length > 0)
    : NAV;

  const currentSectionName =
    NAV.flatMap((g) => g.items).find((i) => i.id === activeSection)?.name ??
    "Docs";

  return (
    <>
      {/* ── Topbar — direct child of <body> for reliable fixed positioning ── */}
      <header className="fixed top-0 inset-x-0 z-50 h-[var(--topbar-h)] bg-background border-b border-[var(--border)] flex items-center px-4 sm:px-5">
        {/* Hamburger — mobile only */}
        <button
          onClick={() => setMobileMenuOpen((v) => !v)}
          className="md:hidden mr-3 text-white/80 cursor-pointer p-1"
          aria-label="Toggle menu"
        >
          {mobileMenuOpen ? (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          ) : (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="18" x2="21" y2="18" /></svg>
          )}
        </button>

        <Link href="/" className="flex items-center gap-2.5 md:w-[var(--sidebar-w)] shrink-0 no-underline">
          <div className="h-[26px] px-1.5 border-[1.5px] border-accent rounded-[5px] flex items-center justify-center text-[10px] font-semibold text-accent shadow-[0_0_8px_var(--accent-glow)] shrink-0">
            t2000
          </div>
          <div className="text-[14px] font-semibold text-white/90 tracking-[0.04em]">
            t2000{" "}
            <span className="text-white/35 font-normal ml-1.5 text-[11px]">
              / docs
            </span>
          </div>
        </Link>

        <div className="flex-1 max-w-[340px] mx-6 relative hidden md:block">
          <span className="absolute left-[11px] top-1/2 -translate-y-1/2 text-white/35 text-xs">
            ⌕
          </span>
          <input
            id="docs-search"
            type="text"
            placeholder="Search docs..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-[var(--surface)] border border-[var(--border)] rounded-md py-1.5 pl-[34px] pr-12 text-xs text-white/80 outline-none focus:border-[rgba(0,214,143,0.4)] transition-colors placeholder:text-white/35"
          />
          <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] text-white/35 bg-[#0d1117] border border-[var(--border)] rounded-[3px] px-1.5 py-px">
            ⌘K
          </span>
        </div>

        <div className="ml-auto flex items-center gap-3 sm:gap-4">
          <span className="text-[11px] text-warning bg-[rgba(245,166,35,0.10)] border border-[rgba(245,166,35,0.2)] rounded px-2 py-px tracking-[0.05em] hidden sm:inline">
            v0.20.0
          </span>
          <Link href="/" className="text-xs text-white/35 no-underline hover:text-white/80 transition-colors hidden sm:inline">
            Home
          </Link>
          <a
            href={GITHUB_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 border border-[var(--border)] rounded-[5px] text-xs text-white/80 no-underline transition-colors hover:border-[rgba(255,255,255,0.12)] hover:bg-[var(--surface)]"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z" />
            </svg>
            <span className="hidden sm:inline">GitHub</span>
          </a>
        </div>
      </header>

      {/* ── Mobile sidebar drawer ── */}
      {mobileMenuOpen && (
        <>
          <div
            className="fixed inset-0 bg-black/60 z-[90] md:hidden"
            onClick={() => setMobileMenuOpen(false)}
          />
          <nav className="fixed top-[var(--topbar-h)] left-0 bottom-0 w-[280px] overflow-y-auto border-r border-[var(--border)] py-6 bg-background sidebar-scroll z-[95] md:hidden animate-doc-fade-in">
            {/* Mobile search */}
            <div className="px-4 mb-4">
              <input
                type="text"
                placeholder="Search..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-[var(--surface)] border border-[var(--border)] rounded-md py-1.5 px-3 text-xs text-white/80 outline-none focus:border-[rgba(0,214,143,0.4)] transition-colors placeholder:text-white/35"
              />
            </div>
            <SidebarNav
              nav={filteredNav}
              activeSection={activeSection}
              onSelect={(id) => goTo(id)}
            />
          </nav>
        </>
      )}

      {/* ── Mobile section breadcrumb ── */}
      <div className="fixed top-[var(--topbar-h)] inset-x-0 h-10 bg-background border-b border-[var(--border)] flex items-center px-4 z-40 md:hidden">
        <span className="text-[10px] tracking-[0.08em] uppercase text-white/35 mr-1.5">
          {NAV.find((g) => g.items.some((i) => i.id === activeSection))?.label}
        </span>
        <span className="text-white/35 text-[10px] mx-1">/</span>
        <span className="text-[11px] text-accent font-medium truncate">
          {currentSectionName}
        </span>
      </div>

    <div className="docs-page min-h-screen bg-background text-[var(--doc-text)]">
      {/* ── Layout ── */}
      <div className="flex pt-[var(--topbar-h)] min-h-screen">
        {/* ── Desktop sidebar ── */}
        <nav className="fixed top-[var(--topbar-h)] left-0 bottom-0 w-[var(--sidebar-w)] overflow-y-auto border-r border-[var(--border)] py-6 bg-[rgba(4,4,6,0.6)] sidebar-scroll hidden md:block">
          <SidebarNav
            nav={filteredNav}
            activeSection={activeSection}
            onSelect={(id) => goTo(id)}
          />
        </nav>

        {/* ── Main content ── */}
        <main
          ref={mainRef}
          className="md:ml-[var(--sidebar-w)] flex-1 min-w-0 overflow-x-hidden px-4 sm:px-8 lg:px-12 pt-14 md:pt-12 pb-12 lg:pb-20 max-w-[860px]"
        >
          <div className="animate-doc-fade-in" key={activeSection}>
            {activeSection === "quickstart" && <QuickStart goTo={goTo} />}
            {activeSection === "install" && <InstallSection />}
            {activeSection === "concepts" && <ConceptsSection />}
            {activeSection === "cli-wallet" && <CliWalletSection />}
            {activeSection === "cli-savings" && <CliSavingsSection />}
            {activeSection === "cli-invest" && <CliInvestSection />}
            {activeSection === "cli-more" && <CliMoreSection />}
            {activeSection === "sdk" && <SdkSection />}
            {activeSection === "config" && <ConfigSection />}
            {activeSection === "errors" && <ErrorsSection />}
            {activeSection === "init-wizard" && <InitWizardSection />}
            {activeSection === "mcp" && <McpSection />}
            {activeSection === "skills" && <SkillsSection />}
            {activeSection === "mpp" && <MppSection />}
            {activeSection === "defi" && <DefiSection />}
            {activeSection === "gas" && <GasSection />}
            {activeSection === "changelog" && <ChangelogSection />}
          </div>

          {/* Footer */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-2 mt-16 pt-6 border-t border-[var(--border)] text-xs text-[var(--doc-muted)]">
            <span>
              © 2026 t2000 ·{" "}
              <a href="https://t2000.ai" target="_blank" rel="noopener noreferrer" className="text-[var(--doc-muted)] hover:text-[var(--doc-text)] no-underline">
                t2000.ai
              </a>
            </span>
            <span>
              Built on Sui ·{" "}
              <a href={GITHUB_URL} target="_blank" rel="noopener noreferrer" className="text-[var(--doc-muted)] hover:text-[var(--doc-text)] no-underline">
                GitHub
              </a>{" "}
              · MIT License
            </span>
          </div>
        </main>

        {/* ── TOC ── */}
        <aside className="fixed top-[calc(var(--topbar-h)+40px)] right-6 w-[var(--toc-w)] text-[11.5px] hidden xl:block">
          <div className="text-[10px] font-semibold tracking-[0.12em] uppercase text-[var(--doc-muted)] mb-2.5">
            On this page
          </div>
          {tocItems.map((item) => (
            <a
              key={item.id}
              href={`#${item.id}`}
              onClick={(e) => {
                e.preventDefault();
                document.getElementById(item.id)?.scrollIntoView({ behavior: "smooth", block: "start" });
              }}
              className={`block py-1 border-l-2 leading-[1.4] text-[11.5px] no-underline transition-colors ${
                item.level === 3 ? "pl-5" : "pl-2.5"
              } ${
                activeTocId === item.id
                  ? "text-accent border-l-accent"
                  : "text-[var(--doc-muted)] border-l-[var(--border)] hover:text-[var(--doc-text)] hover:border-l-[var(--border-mid)]"
              }`}
            >
              {item.text}
            </a>
          ))}
        </aside>
      </div>
    </div>
    </>
  );
}
