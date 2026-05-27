import { Fragment } from "react";

export interface CodeToken {
  p?: string;
  s?: string;
  n?: string;
  co?: string;
  type?: string;
  fn?: string;
  c?: string;
}

export function CodeTokens({ tokens }: { tokens: CodeToken[] }) {
  return (
    <>
      {tokens.map((token, i) => {
        if (token.p) {
          return (
            <Fragment key={i}>
              <span style={{ color: "var(--ds-blue-700)" }}>{token.p}</span>
              {token.c}
            </Fragment>
          );
        }
        if (token.s) {
          return (
            <span key={i} style={{ color: "var(--t2k-success)" }}>
              {token.s}
            </span>
          );
        }
        if (token.n) {
          return (
            <span key={i} style={{ color: "var(--ds-amber-700)" }}>
              {token.n}
            </span>
          );
        }
        if (token.co) {
          return (
            <span
              key={i}
              style={{ color: "var(--fg-subtle)", fontStyle: "italic" }}
            >
              {token.co}
            </span>
          );
        }
        if (token.type) {
          return (
            <Fragment key={i}>
              <span style={{ color: "var(--ds-teal-700)" }}>{token.type}</span>
              {token.c}
            </Fragment>
          );
        }
        if (token.fn) {
          return (
            <Fragment key={i}>
              <span style={{ color: "var(--ds-teal-700)" }}>{token.fn}</span>
              {token.c}
            </Fragment>
          );
        }
        return <span key={i}>{token.c}</span>;
      })}
    </>
  );
}
