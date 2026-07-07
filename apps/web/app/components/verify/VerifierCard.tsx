"use client";

import { useState } from "react";
import { VERIFY_URL } from "../../data/t2k";

// The hero verifier (t2000-design/t2000/VerifyPage.jsx §Verifier card) —
// the product page carries the SAME entry affordance as the explorer:
// paste a receipt, hit Verify, land on verify.t2000.ai with the check
// already running (?rcpt= deep link). No duplicate verifier logic here.
const SAMPLE = "rcpt-c85d927ee9c67753d2876d78";

export function VerifierCard() {
  const [value, setValue] = useState("");

  function run() {
    const rcpt = value.trim() || SAMPLE;
    window.open(
      `${VERIFY_URL}/?rcpt=${encodeURIComponent(rcpt)}`,
      "_blank",
      "noopener,noreferrer"
    );
  }

  return (
    <div className="t2k-card overflow-hidden p-0">
      <div
        className="flex flex-wrap gap-2.5 border-b p-3.5"
        style={{ borderBottomColor: "var(--ds-gray-alpha-300)" }}
      >
        <div
          className="flex min-w-[220px] flex-1 items-center gap-2.5 rounded-[7px] border px-3.5"
          style={{
            background: "var(--ds-background-200)",
            borderColor: "var(--ds-gray-alpha-300)",
          }}
        >
          <span
            className="font-mono text-[12px]"
            style={{ color: "var(--fg-subtle)" }}
          >
            receipt
          </span>
          <input
            className="min-w-0 flex-1 border-0 bg-transparent py-3 font-mono text-[12.5px] outline-none"
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                run();
              }
            }}
            placeholder={SAMPLE}
            spellCheck={false}
            style={{ color: "var(--fg)" }}
            value={value}
          />
        </div>
        <button
          className="t2k-btn t2k-btn--blue whitespace-nowrap"
          onClick={run}
          type="button"
        >
          Verify →
        </button>
      </div>
      <div className="p-[18px] font-mono text-[12px] leading-[1.8]">
        <div style={{ color: "var(--fg-subtle)" }}>
          opens verify.t2000.ai with the checks running:
        </div>
        {(
          [
            ["Sui anchor", "read straight from a fullnode", true],
            ["Receipt signature", "attested receipt key", true],
            ["TDX quote (DCAP)", "client-side via the CLI", true],
          ] as const
        ).map(([name, sub, trustless]) => (
          <div className="flex items-baseline gap-2.5" key={name}>
            <span style={{ color: "var(--t2k-success)" }}>✓</span>
            <span style={{ color: "var(--fg)" }}>{name}</span>
            <span className="text-[11px]" style={{ color: "var(--fg-subtle)" }}>
              {sub}
            </span>
            {trustless && (
              <span
                className="ml-auto rounded border px-1.5 text-[9.5px] tracking-[0.04em]"
                style={{
                  color: "var(--t2k-success)",
                  background: "rgba(29,168,96,0.12)",
                  borderColor: "rgba(29,168,96,0.28)",
                }}
              >
                trustless
              </span>
            )}
          </div>
        ))}
        <div className="mt-3 border-t pt-3" style={{ borderTopColor: "var(--ds-gray-alpha-300)" }}>
          <span style={{ color: "var(--fg-subtle)" }}>$ </span>
          <span style={{ color: "var(--t2k-success)" }}>t2 verify</span>{" "}
          <span style={{ color: "var(--fg)" }}>rcpt-…</span>
          <span className="ml-2 text-[11px]" style={{ color: "var(--fg-subtle)" }}>
            full check on your machine · no key · fails closed
          </span>
        </div>
      </div>
    </div>
  );
}
