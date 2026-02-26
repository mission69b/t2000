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
    label: "Reference",
    items: [
      { id: "cli", name: "CLI Commands", badge: "12" },
      { id: "sdk", name: "SDK / API", badge: "TS", badgeGreen: true },
      { id: "config", name: "Configuration" },
      { id: "errors", name: "Error Codes" },
    ],
  },
  {
    label: "Guides",
    items: [
      { id: "skills", name: "Agent Skills" },
      { id: "x402", name: "x402 Payments", badge: "NEW", badgeGreen: true },
      { id: "defi", name: "DeFi & Yield" },
      { id: "gas", name: "Gas Management" },
    ],
  },
  {
    label: "More",
    items: [
      { id: "changelog", name: "Changelog" },
      { id: "_github", name: "GitHub ↗", href: GITHUB_URL },
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
        t2000 is a full bank account for AI agents on Sui — checking, savings,
        credit, and currency exchange in one CLI command.
      </p>

      <h2 id="qs-install">1. Create your bank account</h2>
      <TryIt cmd="npx @t2000/cli init" note="Node.js 18+ required" />
      <p className="text-[12.5px] text-white/45 mt-2">
        For persistent use, install globally: <InlineCode>npm install -g @t2000/cli</InlineCode>
      </p>

      <h2 id="qs-init">2. What happens</h2>
      <p>
        The init command generates a new Sui keypair, encrypts it,
        and configures your bank account.
      </p>
      <CodeBlock lang="bash">
        {S.g("$")} npx @t2000/cli init{"\n\n"}
        {"  "}{S.b("Create PIN (min 4 chars):")} ****{"\n"}
        {"  "}{S.b("Confirm PIN:")} ****{"\n\n"}
        {"  "}{S.m("Creating agent wallet...")}{"\n"}
        {"  "}{S.g("✓")} Keypair generated{"\n"}
        {"  "}{S.g("✓")} Network {S.m("Sui mainnet")}{"\n"}
        {"  "}{S.g("✓")} Gas sponsorship {S.m("enabled")}{"\n\n"}
        {"  "}{S.m("Setting up accounts...")}{"\n"}
        {"  "}{S.g("✓")} Checking  {S.g("✓")} Savings  {S.g("✓")} Credit  {S.g("✓")} Exchange  {S.g("✓")} 402 Pay{"\n\n"}
        {"  "}🎉 {S.g("Bank account created")}{"\n"}
        {"  "}Address:  {S.a("0x8b3e4f2a1c9d7b5e3f1a8c2d4e6f9b0a1c2d3e4f...")}{"\n\n"}
        {"  "}Deposit USDC on Sui network only.{"\n"}
        {"  "}{S.m("───────────────────────────────────")}{"\n\n"}
        {"  "}{S.m("Install globally for persistent use:")}{"\n"}
        {"  "}{S.b("npm install -g @t2000/cli")}{"\n\n"}
        {"  "}{S.b("t2000 balance")}    check for funds{"\n"}
        {"  "}{S.b("t2000 save all")}   start earning yield{"\n"}
        {"  "}{S.b("t2000 address")}    show address again
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
              Available:  {S.a("$100.00")} USDC  {S.c("(checking — spendable)")}{"\n"}
              Savings:    {S.a("$0.00")} USDC{"\n"}
              Gas:        {S.a("0.05")} SUI    {S.c("(~$0.18)")}{"\n"}
              {S.m("──────────────────────")}{"\n"}
              Total:      {S.a("$100.18")} USDC
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
              {S.g("✓")} Saved {S.a("$99.00")} USDC to NAVI{"\n"}
              {S.g("✓")} Protocol fee: {S.m("$0.099 USDC (0.1%)")}{"\n"}
              {S.g("✓")} Current APY: {S.g("4.21%")}{"\n"}
              {S.g("✓")} Savings balance: {S.a("$98.90")} USDC{"\n"}
              {"  "}Tx: {S.b("https://suiscan.xyz/mainnet/tx/0x9f2c...")}
            </CodeBlock>
          </div>
        </li>
        <li className="flex gap-4 mb-6 relative">
          <div className="w-8 h-8 border border-accent rounded-md flex items-center justify-center text-xs text-accent bg-accent-dim shrink-0 relative z-1 shadow-[0_0_8px_var(--accent-glow)]">
            ✓
          </div>
          <div className="flex-1 min-w-0 pt-1">
            <div className="text-[13.5px] font-medium text-white/85 mb-1.5">
              Install agent skills <Badge color="muted">optional</Badge>
            </div>
            <p>
              Let any Claude, Codex, or Copilot agent discover and use t2000
              automatically.
            </p>
            <CodeBlock lang="bash">
              {S.g("$")} npx skills add t2000/t2000-skills{"\n\n"}
              {S.g("✓")} Installed 8 skills{"\n"}
              {S.m("  t2000-check-balance, t2000-send, t2000-save,")}{"\n"}
              {S.m("  t2000-withdraw, t2000-swap, t2000-borrow,")}{"\n"}
              {S.m("  t2000-repay, t2000-pay")}{"\n\n"}
              {S.c("# Your agent now knows how to use t2000 automatically.")}
            </CodeBlock>
          </div>
        </li>
      </ol>

      <Callout type="note" label="Next step">
        Want your agent to pay for APIs autonomously? See the{" "}
        <a
          onClick={() => goTo("x402")}
          className="text-accent cursor-pointer hover:underline"
        >
          x402 Payments guide
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

      <h2 id="inst-global">Global install</h2>
      <CodeBlock lang="bash">
        {S.g("$")} npx @t2000/cli init{"\n\n"}
        {S.c("# Verify")}{"\n"}
        {S.g("$")} t2000 --version{"\n"}
        {S.a("0.1.4")}
      </CodeBlock>

      <h2 id="inst-config">Config file</h2>
      <p>
        On first <InlineCode>t2000 init</InlineCode>, a config file is written
        to <InlineCode>~/.t2000/config.json</InlineCode>. You can override the
        path with the <InlineCode>T2000_CONFIG</InlineCode> environment variable
        — useful for running multiple agents simultaneously.
      </p>
      <CodeBlock lang="json" filename="~/.t2000/config.json">
        {"{\n"}
        {"  "}{S.s('"network"')}:    {S.s('"mainnet"')},{"\n"}
        {"  "}{S.s('"rpcUrl"')}:     {S.s('"https://fullnode.mainnet.sui.io"')},{"\n"}
        {"  "}{S.s('"privateKey"')}: {S.s('"suiprivkey1..."')},{"\n"}
        {"  "}{S.s('"address"')}:    {S.s('"0x8b3e...d412"')}{"\n"}
        {"}"}
      </CodeBlock>
      <Callout type="warn" label="Security">
        Never commit your config file. Add <InlineCode>~/.t2000/</InlineCode> or{" "}
        <InlineCode>.t2000/</InlineCode> to your{" "}
        <InlineCode>.gitignore</InlineCode>. For CI/CD, use the{" "}
        <InlineCode>T2000_PRIVATE_KEY</InlineCode> environment variable instead.
      </Callout>

      <h2 id="inst-env">Environment variables</h2>
      <DocTable
        headers={["Variable", "Description"]}
        rows={[
          [<InlineCode key="k">T2000_PIN</InlineCode>, "Bank account PIN (skip interactive prompt)"],
          [<InlineCode key="k">T2000_PRIVATE_KEY</InlineCode>, <>Overrides <InlineCode>privateKey</InlineCode> in config. Use in CI/CD.</>],
          [<InlineCode key="k">T2000_CONFIG</InlineCode>, <>Path to config file. Default: <InlineCode>~/.t2000/config.json</InlineCode></>],
          [<InlineCode key="k">T2000_NETWORK</InlineCode>, <><InlineCode>mainnet</InlineCode> | <InlineCode>testnet</InlineCode></>],
          [<InlineCode key="k">T2000_RPC_URL</InlineCode>, "Custom Sui RPC endpoint"],
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
        Four accounts, one wallet. Everything runs on Sui via atomic
        Programmable Transaction Blocks.
      </p>

      <h2 id="con-accounts">The four accounts</h2>
      <DocTable
        headers={["Account", "What it is", "CLI"]}
        rows={[
          [<InlineCode key="k">checking</InlineCode>, "USDC available for immediate use. Shown as Available in balance output.", <InlineCode key="v">t2000 send</InlineCode>],
          [<InlineCode key="k">savings</InlineCode>, "USDC deposited to NAVI, earning variable APY. Withdrawable any time.", <><InlineCode>t2000 save</InlineCode> / <InlineCode>withdraw</InlineCode></>],
          [<InlineCode key="k">credit</InlineCode>, "USDC borrowed against savings collateral. Health factor enforced on-chain.", <><InlineCode>t2000 borrow</InlineCode> / <InlineCode>repay</InlineCode></>],
          [<InlineCode key="k">exchange</InlineCode>, "Token swaps via Cetus DEX. Any Cetus-listed pair, with on-chain slippage protection.", <InlineCode key="v">t2000 swap</InlineCode>],
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

      <h2 id="con-hf">Health factor</h2>
      <p>
        If you have an active borrow, t2000 enforces a minimum health factor of{" "}
        <strong>1.5</strong> on all withdrawal and borrow operations. Health
        factor is calculated as:
      </p>
      <CodeBlock lang="formula">
        HF = (collateral_value × liquidation_threshold) / borrowed_value{"\n\n"}
        {S.c("# HF ≥ 1.5  →  safe to operate")}{"\n"}
        {S.c("# HF  < 1.0  →  position eligible for liquidation on NAVI")}
      </CodeBlock>
    </>
  );
}

function CliSection({ scrollToCmd }: { scrollToCmd: (id: string) => void }) {
  return (
    <>
      <div className="text-[11px] tracking-[0.12em] uppercase text-accent mb-3">
        Reference
      </div>
      <h1 className="font-serif text-[28px] sm:text-4xl font-normal leading-[1.2] text-white/95 mb-4">
        CLI <em className="italic text-accent">Commands</em>
      </h1>
      <p className="text-[13px] sm:text-[14.5px] text-white/55 leading-[1.7] mb-8 sm:mb-10 max-w-[580px]">
        All commands follow the same output contract: structured key-value
        output for state changes, <InlineCode>--json</InlineCode> for agent
        consumption.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-3 my-4 mb-7">
        <CmdCard name="t2000 init" desc="Generate keypair, write config" onClick={() => scrollToCmd("init")} />
        <CmdCard name="t2000 balance" desc="View all accounts + limits" onClick={() => scrollToCmd("balance")} />
        <CmdCard name="t2000 send" desc="Transfer USDC to any address" onClick={() => scrollToCmd("send")} />
        <CmdCard name="t2000 save" desc="Deposit to NAVI savings" onClick={() => scrollToCmd("save")} />
        <CmdCard name="t2000 withdraw" desc="Pull funds from savings" onClick={() => scrollToCmd("withdraw")} />
        <CmdCard name="t2000 borrow" desc="Borrow against collateral" onClick={() => scrollToCmd("borrow")} />
        <CmdCard name="t2000 repay" desc="Repay outstanding loan" onClick={() => scrollToCmd("repay")} />
        <CmdCard name="t2000 swap" desc="Exchange tokens via Cetus" onClick={() => scrollToCmd("swap")} />
        <CmdCard name="t2000 pay" desc="Pay for x402-protected APIs" badge="addon" onClick={() => scrollToCmd("pay")} />
        <CmdCard name="t2000 health" desc="Check system + protocol status" onClick={() => scrollToCmd("health")} />
        <CmdCard name="t2000 positions" desc="View DeFi positions detail" onClick={() => scrollToCmd("positions")} />
        <CmdCard name="t2000 history" desc="Transaction history" onClick={() => scrollToCmd("history")} />
      </div>

      <h2 id="cmd-init">t2000 init</h2>
      <p>Generate a new Ed25519 keypair, encrypt it with AES-256-GCM, and set up all accounts.</p>
      <CodeBlock lang="bash">
        t2000 init [--key &lt;path&gt;]
      </CodeBlock>
      <CodeBlock lang="output">
        {S.b("Create PIN (min 4 chars):")} ****{"\n"}
        {S.b("Confirm PIN:")} ****{"\n\n"}
        {S.m("Creating agent wallet...")}{"\n"}
        {S.g("✓")} Keypair generated{"\n"}
        {S.g("✓")} Network {S.m("Sui mainnet")}{"\n"}
        {S.g("✓")} Gas sponsorship {S.m("enabled")}{"\n\n"}
        {S.m("Setting up accounts...")}{"\n"}
        {S.g("✓")} Checking  {S.g("✓")} Savings  {S.g("✓")} Credit  {S.g("✓")} Exchange  {S.g("✓")} 402 Pay{"\n\n"}
        🎉 {S.g("Bank account created")}{"\n"}
        Address:  {S.a("0x8b3e4f2a1c9d7b5e3f1a8c2d4e6f9b0a...")}{"\n\n"}
        Deposit USDC on Sui network only.{"\n"}
        {S.m("───────────────────────────────────")}{"\n\n"}
        {S.m("Install globally for persistent use:")}{"\n"}
        {S.b("npm install -g @t2000/cli")}{"\n\n"}
        {S.b("t2000 balance")}    check for funds{"\n"}
        {S.b("t2000 save all")}   start earning yield{"\n"}
        {S.b("t2000 address")}    show address again
      </CodeBlock>

      <h2 id="cmd-balance">t2000 balance</h2>
      <p>Returns balances across all four accounts. Use <InlineCode>--show-limits</InlineCode> before any borrow or withdrawal with an active loan.</p>
      <CodeBlock lang="bash">
        t2000 balance [flags]{"\n\n"}
        {"  "}{S.a("--show-limits")}   Include maxWithdraw, maxBorrow, healthFactor{"\n"}
        {"  "}{S.a("--json")}          Machine-readable JSON output
      </CodeBlock>
      <CodeBlock lang="output">
        Available:  {S.a("$78.91")} USDC  {S.c("(checking — spendable)")}{"\n"}
        Savings:    {S.a("$80.00")} USDC  {S.c("(earning 4.21% APY)")}{"\n"}
        Gas:        {S.a("0.12")} SUI    {S.c("(~$0.11)")}{"\n"}
        {S.m("──────────────────────")}{"\n"}
        Total:      {S.a("$159.02")} USDC{"\n\n"}
        {S.c("# With --show-limits:")}{"\n"}
        Limits:{"\n"}
        {"  "}Max withdraw:   {S.a("$80.00")} USDC{"\n"}
        {"  "}Max borrow:     {S.a("$40.00")} USDC{"\n"}
        {"  "}Health factor:  {S.g("∞")}  {S.c("(no active loan)")}
      </CodeBlock>

      <h2 id="cmd-send">t2000 send</h2>
      <p>Transfer USDC to any Sui address.</p>
      <CodeBlock lang="bash">
        t2000 send &lt;amount&gt; USDC to &lt;address&gt;{"\n\n"}
        t2000 send {S.a("10")} USDC to {S.a("0x8b3e...d412")}{"\n"}
        t2000 send {S.a("50")} USDC to {S.a("0xabcd...1234")} --json
      </CodeBlock>
      <CodeBlock lang="output">
        {S.g("✓")} Sent {S.a("$10.00")} USDC → 0x8b3e...d412{"\n"}
        Balance:  {S.a("$90.00")} USDC{"\n"}
        Tx:  {S.b("https://suiscan.xyz/mainnet/tx/0xa1b2...")}
      </CodeBlock>

      <h2 id="cmd-save">t2000 save</h2>
      <p>Deposit USDC into NAVI Protocol to earn variable APY.</p>
      <CodeBlock lang="bash">
        t2000 save &lt;amount&gt;{"\n"}
        t2000 save all              {S.c("# saves everything; gas manager runs first if needed")}{"\n\n"}
        t2000 save {S.a("80")}{"\n"}
        t2000 save all
      </CodeBlock>
      <CodeBlock lang="output">
        {S.g("✓")} Saved {S.a("$80.00")} USDC to NAVI{"\n"}
        {S.g("✓")} Protocol fee: {S.m("$0.08 USDC (0.1%)")}{"\n"}
        {S.g("✓")} Current APY: {S.g("4.21%")}{"\n"}
        {S.g("✓")} Savings balance: {S.a("$79.92")} USDC{"\n"}
        Tx:  {S.b("https://suiscan.xyz/mainnet/tx/0x9f2c...")}
      </CodeBlock>
      <Callout type="note" label="Fee">
        A <strong>0.1% protocol fee</strong> applies to every deposit.{" "}
        <InlineCode>save all</InlineCode> may also trigger the gas manager,
        auto-converting up to $1 USDC → SUI before depositing the remainder.
      </Callout>

      <h2 id="cmd-withdraw">t2000 withdraw</h2>
      <p>Pull USDC from savings back to checking. Risk-checked if you have an active loan.</p>
      <CodeBlock lang="bash">
        t2000 withdraw &lt;amount&gt;{"\n"}
        t2000 withdraw all{"\n\n"}
        {S.c("# Check safe limits first if you have an active loan:")}{"\n"}
        t2000 balance --show-limits
      </CodeBlock>
      <CodeBlock lang="output">
        {S.g("✓")} Withdrew {S.a("$50.00")} USDC{"\n"}
        Tx:  {S.b("https://suiscan.xyz/mainnet/tx/0xc3d4...")}
      </CodeBlock>

      <h2 id="cmd-borrow">t2000 borrow</h2>
      <p>Borrow USDC against your savings collateral. Health factor must stay above 1.5.</p>
      <CodeBlock lang="bash">
        t2000 borrow &lt;amount&gt;{"\n\n"}
        t2000 borrow {S.a("40")}    {S.c("# health factor enforced — must stay ≥ 1.5")}
      </CodeBlock>
      <CodeBlock lang="output">
        {S.g("✓")} Borrowed {S.a("$40.00")} USDC{"\n"}
        Health Factor:  {S.a("2.15")}{"\n"}
        Tx:  {S.b("https://suiscan.xyz/mainnet/tx/0xd5e6...")}
      </CodeBlock>

      <h2 id="cmd-repay">t2000 repay</h2>
      <p>Repay outstanding borrows. Use <InlineCode>all</InlineCode> to clear the full debt including accrued interest.</p>
      <CodeBlock lang="bash">
        t2000 repay &lt;amount&gt;{"\n"}
        t2000 repay all             {S.c("# includes accrued interest")}
      </CodeBlock>
      <CodeBlock lang="output">
        {S.g("✓")} Repaid {S.a("$40.00")} USDC{"\n"}
        Remaining Debt:  {S.a("$0.00")}{"\n"}
        Tx:  {S.b("https://suiscan.xyz/mainnet/tx/0xe7f8...")}
      </CodeBlock>

      <h2 id="cmd-swap">t2000 swap</h2>
      <p>Swap between tokens via Cetus DEX with on-chain slippage protection.</p>
      <CodeBlock lang="bash">
        t2000 swap &lt;amount&gt; &lt;from&gt; &lt;to&gt; [--slippage &lt;pct&gt;]{"\n\n"}
        t2000 swap {S.a("5")} USDC SUI{"\n"}
        t2000 swap {S.a("100")} USDC SUI --slippage {S.a("0.5")}   {S.c("# default: 3%")}
      </CodeBlock>
      <CodeBlock lang="output">
        {S.g("✓")} Swapped {S.a("5")} USDC → {S.a("5.8300")} SUI{"\n"}
        Tx:  {S.b("https://suiscan.xyz/mainnet/tx/0xf9a0...")}
      </CodeBlock>

      <h2 id="cmd-pay">
        t2000 pay <Badge color="amber">x402 addon</Badge>
      </h2>
      <CodeBlock lang="bash">
        t2000 pay &lt;url&gt; [options]{"\n\n"}
        {"  "}{S.a("--method")}     GET | POST | PUT  (default: GET){"\n"}
        {"  "}{S.a("--data")}       JSON body for POST/PUT{"\n"}
        {"  "}{S.a("--max-price")}  Max USDC to auto-approve (default: 1.00){"\n"}
        {"  "}{S.a("--dry-run")}    Preview without paying{"\n\n"}
        t2000 pay https://api.weather.com/forecast{"\n"}
        t2000 pay https://api.ai.com/analyze --method POST --data {S.s("'{\"text\":\"hello\"}'")}{"\n"}
        t2000 pay https://api.data.com/prices --max-price {S.a("0.05")}
      </CodeBlock>
      <CodeBlock lang="output">
        → GET https://api.weather.com/forecast{"\n"}
        ← {S.a("402 Payment Required:")} $0.01 USDC (Sui){"\n"}
        {S.g("✓")} Paid $0.01 USDC {S.m("(tx: 0x9f2c...a801)")}{"\n"}
        ← {S.g("200 OK")}  {S.m("[342ms]")}{"\n\n"}
        {`{"city":"Sydney","temp":22,"condition":"partly cloudy"}`}
      </CodeBlock>

      <h2 id="cmd-health">t2000 health</h2>
      <p>Check your lending health factor. Color-coded by severity — green (healthy), yellow (moderate/low), red (critical).</p>
      <CodeBlock lang="bash">
        t2000 health
      </CodeBlock>
      <CodeBlock lang="output">
        {S.g("✓")} Health Factor: {S.g("2.50")} {S.c("(healthy)")}{"\n\n"}
        Supplied:    {S.a("$500.00")} USDC{"\n"}
        Borrowed:    {S.a("$200.00")} USDC{"\n"}
        Max Borrow:  {S.a("$133.33")} USDC
      </CodeBlock>

      <h2 id="cmd-positions">t2000 positions</h2>
      <p>View all open DeFi positions across protocols.</p>
      <CodeBlock lang="bash">
        t2000 positions
      </CodeBlock>
      <CodeBlock lang="output">
        📈 Saving:     {S.a("$500.00")} USDC {S.m("(NAVI)")}{"\n"}
        📉 Borrowing:  {S.a("$200.00")} USDC {S.m("(NAVI)")}
      </CodeBlock>

      <h2 id="cmd-history">t2000 history</h2>
      <p>Show recent transaction history with action type and timestamp.</p>
      <CodeBlock lang="bash">
        t2000 history
      </CodeBlock>
      <CodeBlock lang="output">
        {S.b("Transaction History")}{"\n\n"}
        0x9f2c...a801  save {S.m("(sponsor)")}     2/19/2026, 3:45 PM{"\n"}
        0xa1b2...c3d4  send {S.m("(self-funded)")}  2/19/2026, 2:30 PM{"\n"}
        0xd5e6...f7a8  swap {S.m("(auto-topup)")}   2/18/2026, 1:15 PM
      </CodeBlock>

      <h2 id="cmd-more">More commands</h2>
      <DocTable
        headers={["Command", "Description"]}
        rows={[
          [<InlineCode key="k">t2000 address</InlineCode>, "Print wallet address"],
          [<InlineCode key="k">t2000 deposit</InlineCode>, "Show step-by-step funding instructions"],
          [<InlineCode key="k">t2000 earnings</InlineCode>, "Yield earned to date, daily rate, APY"],
          [<InlineCode key="k">t2000 fund-status</InlineCode>, "Full savings summary with monthly projection"],
          [<InlineCode key="k">t2000 rates</InlineCode>, "Live save & borrow APYs from NAVI"],
          [<InlineCode key="k">t2000 import &lt;key&gt;</InlineCode>, <>Import wallet from private key (<InlineCode>suiprivkey1...</InlineCode> or hex)</>],
          [<InlineCode key="k">t2000 export</InlineCode>, "Export private key (Ed25519, hex)"],
          [<InlineCode key="k">t2000 config get|set</InlineCode>, <>Read or write <InlineCode>~/.t2000/config.json</InlineCode></>],
        ]}
      />
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
        {"  "}savings:      {S.a("number")};  {S.c("// USDC in NAVI")}{"\n"}
        {"  "}gasReserve:   {S.a("number")};  {S.c("// SUI")}{"\n"}
        {"  "}total:        {S.a("number")};{"\n"}
        {"}"}{"\n\n"}
        {S.p("interface")} {S.b("SendResult")} {"{"}{"\n"}
        {"  "}tx:        {S.a("string")};{"\n"}
        {"  "}amount:    {S.a("number")};{"\n"}
        {"  "}gasMethod: {S.a("string")};  {S.c("// 'self-funded' | 'auto-topup' | 'sponsored'")}{"\n"}
        {"  "}balance:   {S.a("number")};  {S.c("// remaining USDC")}{"\n"}
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
          [<InlineCode key="k">privateKey</InlineCode>, "string", "—", <>Sui private key (<InlineCode>suiprivkey1...</InlineCode>)</>],
          [<InlineCode key="k">address</InlineCode>, "string", "derived", "Auto-derived from privateKey"],
          [<InlineCode key="k">slippage</InlineCode>, "number", <InlineCode key="v">3</InlineCode>, "Default swap slippage % (overridable per-swap)"],
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
          [<InlineCode key="k">HEALTH_FACTOR_TOO_LOW</InlineCode>, <InlineCode key="d">{`{ maxBorrow }`}</InlineCode>, "Borrow drops HF below 1.5"],
          [<InlineCode key="k">WITHDRAW_WOULD_LIQUIDATE</InlineCode>, <InlineCode key="d">{`{ maxWithdraw }`}</InlineCode>, "Withdrawal drops HF below 1.5"],
          [<InlineCode key="k">NO_COLLATERAL</InlineCode>, "—", "No savings to borrow against"],
          [<InlineCode key="k">SLIPPAGE_EXCEEDED</InlineCode>, "—", "Swap price moved beyond tolerance"],
          [<InlineCode key="k">PROTOCOL_PAUSED</InlineCode>, "—", "Protocol is temporarily paused"],
        ]}
      />

      <h2 id="err-x402">x402 errors</h2>
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
      <TryIt cmd="npx skills add t2000/t2000-skills" />
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
          [<InlineCode key="k">t2000-swap</InlineCode>, <>&#34;swap USDC for SUI&#34;, &#34;convert...&#34;</>, <Badge color="green" key="b">live</Badge>],
          [<InlineCode key="k">t2000-borrow</InlineCode>, <>&#34;borrow 40 USDC&#34;, &#34;take out a loan&#34;</>, <Badge color="green" key="b">live</Badge>],
          [<InlineCode key="k">t2000-repay</InlineCode>, <>&#34;repay my loan&#34;, &#34;pay back...&#34;</>, <Badge color="green" key="b">live</Badge>],
          [<InlineCode key="k">t2000-pay</InlineCode>, <>&#34;call that paid API&#34;, &#34;pay for x402 service&#34;</>, <Badge color="green" key="b">live</Badge>],
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
        {S.a("description")}: {S.s(`>-\n  Deposit USDC into savings to earn yield on Sui via NAVI.\n  Use when asked to save money, earn interest, deposit to savings,\n  put funds to work, or maximize yield on idle USDC.`)}{"\n"}
        {S.m("---")}{"\n"}
        {S.c("# Full instructions follow below...")}
      </CodeBlock>
    </>
  );
}

function X402Section() {
  return (
    <>
      <div className="text-[11px] tracking-[0.12em] uppercase text-accent mb-3">
        Guides
      </div>
      <h1 className="font-serif text-[28px] sm:text-4xl font-normal leading-[1.2] text-white/95 mb-4">
        x402 <em className="italic text-accent">Payments</em>
      </h1>
      <p className="text-[13px] sm:text-[14.5px] text-white/55 leading-[1.7] mb-8 sm:mb-10 max-w-[580px]">
        t2000 is the first x402 implementation on Sui. Your agent can
        autonomously pay for API services using USDC micropayments.
      </p>

      <h2 id="x402-how">How the handshake works</h2>
      <div className="flex flex-col border border-[var(--border)] rounded-lg overflow-hidden my-5 mb-7">
        {[
          { num: "1", dir: "→ GET", dirClass: "text-warning", desc: <>Agent requests <InlineCode>/api/resource</InlineCode> — no payment header</> },
          { num: "2", dir: "← 402", dirClass: "text-accent", desc: <>Server returns <InlineCode>402 Payment Required</InlineCode> with amount, payTo, nonce, expiresAt</> },
          { num: "3", dir: "→ PTB", dirClass: "text-warning", desc: <>t2000 calls <InlineCode>process_registry_payment</InlineCode> via Sui Payment Kit — nonce enforced by Move, replay impossible</> },
          { num: "4", dir: "→ GET", dirClass: "text-warning", desc: <>Retries with <InlineCode>X-PAYMENT: &#123;txHash, nonce&#125;</InlineCode> header</> },
          { num: "5", dir: "← 200", dirClass: "text-accent", desc: <>Facilitator verifies <InlineCode>PaymentEvent</InlineCode> on-chain → server returns the resource</> },
        ].map((step, i, arr) => (
          <div key={i} className={`flex items-start gap-2.5 sm:gap-3.5 px-3 sm:px-4.5 py-3 sm:py-3.5 bg-[var(--surface)] transition-colors hover:bg-white/[0.02] ${i < arr.length - 1 ? "border-b border-[var(--border)]" : ""}`}>
            <span className="text-[11px] text-[var(--doc-muted)] shrink-0 mt-0.5 w-4">{step.num}</span>
            <span className={`text-[11px] font-semibold shrink-0 mt-0.5 w-10 ${step.dirClass}`}>{step.dir}</span>
            <span className="text-[12px] sm:text-[12.5px] text-white/60 leading-[1.6] min-w-0">{step.desc}</span>
          </div>
        ))}
      </div>

      <h2 id="x402-cli">CLI usage</h2>
      <CodeBlock lang="bash">
        {S.g("$")} t2000 pay https://weather.api.com/forecast{"\n\n"}
        → GET https://weather.api.com/forecast{"\n"}
        ← {S.a("402 Payment Required:")} $0.01 USDC (Sui){"\n"}
        {S.g("✓")} Paid $0.01 USDC {S.m("(tx: 0x9f2c...a801)")}{"\n"}
        ← {S.g("200 OK")}  {S.m("[342ms]")}{"\n\n"}
        {`{"city":"Sydney","temp":22,"condition":"partly cloudy"}`}
      </CodeBlock>

      <h2 id="x402-sdk">SDK usage</h2>
      <CodeBlock lang="typescript">
        {S.p("import")} {"{ x402Client }"} {S.p("from")} {S.s("'@t2000/x402'")};{"\n\n"}
        {S.p("const")} client = {S.p("new")} {S.b("x402Client")}(agent);{"\n\n"}
        {S.p("const")} res = {S.p("await")} client.{S.g("fetch")}({S.s("'https://api.example.com/data'")}, {"{"}{"\n"}
        {"  "}maxPrice: {S.a("0.05")},        {S.c("// refuse if price > $0.05 USDC")}{"\n"}
        {"}"});{"\n\n"}
        {S.p("const")} data = {S.p("await")} res.{S.g("json")}();
      </CodeBlock>

      <h2 id="x402-why-sui">Why Sui x402 is different</h2>
      <p>
        EVM x402 uses plain signed transfers. Duplicate prevention is handled in
        the facilitator database — which has a race condition window between the
        check and write.
      </p>
      <p>
        On Sui, t2000 calls <InlineCode>process_registry_payment</InlineCode>{" "}
        from the Sui Payment Kit. The nonce is part of a composite key enforced
        at the Move contract level. If a duplicate nonce is attempted, the
        contract throws <InlineCode>EDuplicatePayment</InlineCode> and the
        transaction fails before landing on-chain.{" "}
        <strong>Replay attacks are structurally impossible.</strong>
      </p>
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
        t2000 integrates NAVI Protocol for savings and borrowing, and Cetus DEX
        for token exchange. Both are composed atomically via PTBs.
      </p>

      <h2 id="defi-navi">NAVI Protocol integration</h2>
      <p>
        NAVI is a non-custodial lending protocol on Sui. When you call{" "}
        <InlineCode>t2000 save</InlineCode>, your USDC is deposited directly
        into NAVI&#39;s USDC lending pool. You earn yield continuously as the
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
        The <InlineCode>sqrt_price_limit</InlineCode> parameter ensures the
        transaction reverts automatically if the market moves beyond your
        tolerance — no partial fills, no silent slippage.
      </p>

      <h2 id="defi-borrow">Collateralized borrowing</h2>
      <p>
        You can borrow USDC against your NAVI deposit. t2000 enforces a health
        factor floor of 1.5 — more conservative than NAVI&#39;s liquidation
        threshold of 1.0 — to give your agent a safety buffer before liquidation
        risk.
      </p>
      <CodeBlock lang="bash">
        {S.c("# Typical leverage loop for an agent:")}{"\n"}
        {S.g("$")} t2000 save all                  {S.c("# deposit to savings")}{"\n"}
        {S.g("$")} t2000 balance --show-limits      {S.c("# check maxBorrow")}{"\n"}
        {S.g("$")} t2000 borrow {S.a("40")}                  {S.c("# borrow against collateral")}{"\n"}
        {S.g("$")} t2000 save {S.a("40")}                    {S.c("# deposit borrowed USDC for more yield")}
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
        v0.1.4 <Badge color="green">current</Badge>
      </h2>
      <p>
        Full bank account model: checking, savings, credit, and currency
        exchange. Programmable Transaction Block architecture for atomic
        multi-step operations. Gas manager with auto-topup. x402 payment support
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

  const scrollToCmd = useCallback(
    (name: string) => {
      setActiveSection("cli");
      setTimeout(() => {
        document.getElementById("cmd-" + name)?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 100);
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
        .replace(/\s*(NEW|live|current|addon|TS|x402 addon|optional)\s*/g, "")
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
          <div className="w-[26px] h-[26px] border-[1.5px] border-accent rounded-[5px] flex items-center justify-center text-[11px] font-semibold text-accent shadow-[0_0_8px_var(--accent-glow)] shrink-0">
            t2
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
            v0.1.4
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
            {activeSection === "cli" && <CliSection scrollToCmd={scrollToCmd} />}
            {activeSection === "sdk" && <SdkSection />}
            {activeSection === "config" && <ConfigSection />}
            {activeSection === "errors" && <ErrorsSection />}
            {activeSection === "skills" && <SkillsSection />}
            {activeSection === "x402" && <X402Section />}
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
