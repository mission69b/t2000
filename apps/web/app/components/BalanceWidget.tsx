"use client";

import { useEffect, useState } from "react";

export function BalanceWidget() {
  const [savings, setSavings] = useState(80.0);

  useEffect(() => {
    const interval = setInterval(() => {
      setSavings((s) => Math.round((s + 0.0001) * 10000) / 10000);
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  const investment = 5.02;
  const credit = -20.0;
  const total = (68.91 + savings + investment + credit).toFixed(2);

  return (
    <div className="absolute -right-5 bottom-20 bg-panel border border-border-bright rounded-sm p-4 px-5 w-[220px] shadow-[0_20px_40px_rgba(0,0,0,0.4)] animate-float hidden lg:block">
      <div className="text-[10px] tracking-[0.1em] uppercase text-dim mb-3">
        Agent_0x8b3e · Portfolio
      </div>
      <div className="flex justify-between items-center py-1.5 border-b border-border text-xs">
        <span className="text-muted">Checking</span>
        <span className="text-foreground">$68.91</span>
      </div>
      <div className="flex justify-between items-center py-1.5 border-b border-border text-xs">
        <span className="text-muted">Savings</span>
        <span className="text-accent">${savings.toFixed(2)}</span>
      </div>
      <div className="flex justify-between items-center py-1.5 border-b border-border text-xs">
        <span className="text-muted">Credit</span>
        <span className="text-danger">-$20.00</span>
      </div>
      <div className="flex justify-between items-center py-1.5 border-b border-border text-xs">
        <span className="text-muted">Investment</span>
        <span className="text-foreground">${investment.toFixed(2)} <span className="text-accent text-[10px]">+0.4%</span></span>
      </div>
      <div className="mt-3 pt-3 border-t border-border-bright flex justify-between text-[13px] font-medium">
        <span className="text-muted">Total</span>
        <span className="text-accent">${total}</span>
      </div>
    </div>
  );
}
