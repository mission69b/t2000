"use client";

import { useEffect, useRef, useState } from "react";

interface Parsed {
  prefix: string;
  numeric: number | null;
  suffix: string;
}

function parse(value: string): Parsed {
  const match = String(value).match(/^(\D*)(\d[\d.,]*)(\D*)$/);
  if (!match) return { prefix: "", numeric: null, suffix: value };
  const numeric = parseFloat(match[2].replace(/,/g, ""));
  return {
    prefix: match[1],
    numeric: Number.isFinite(numeric) ? numeric : null,
    suffix: match[3],
  };
}

interface CountUpProps {
  value: string;
  duration?: number;
}

export function CountUp(props: CountUpProps) {
  // Re-mount when value changes so that all derivations stay pure inside
  // CountUpInner and the only setState happens from the IntersectionObserver
  // callback (an external system) per the react-hooks/set-state-in-effect rule.
  return <CountUpInner key={props.value} {...props} />;
}

function CountUpInner({ value, duration = 1100 }: CountUpProps) {
  const { prefix, numeric, suffix } = parse(value);
  const animatable = numeric !== null;

  const ref = useRef<HTMLSpanElement | null>(null);
  const started = useRef(false);
  // For non-animatable values we render the value directly; for animatable
  // values we start at "<prefix>0<suffix>" and let the observer animate up.
  const [display, setDisplay] = useState<string>(
    animatable ? `${prefix}0${suffix}` : value,
  );

  useEffect(() => {
    if (!animatable || numeric === null) return;
    const reduce = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;

    const node = ref.current;
    if (!node) return;

    if (reduce) {
      // jump to final value via a microtask so we treat the platform
      // preference as an external input, not a render-time derivation
      queueMicrotask(() => setDisplay(value));
      return;
    }

    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting && !started.current) {
            started.current = true;
            const t0 = performance.now();
            const tick = (t: number) => {
              const k = Math.min(1, (t - t0) / duration);
              const eased = 1 - Math.pow(1 - k, 3);
              const n = numeric * eased;
              const formatted =
                numeric % 1 === 0
                  ? Math.round(n).toString()
                  : n.toFixed(2);
              setDisplay(prefix + formatted + suffix);
              if (k < 1) requestAnimationFrame(tick);
            };
            requestAnimationFrame(tick);
          }
        });
      },
      { threshold: 0.4 },
    );
    io.observe(node);
    return () => io.disconnect();
  }, [animatable, duration, numeric, prefix, suffix, value]);

  return <span ref={ref}>{display}</span>;
}
