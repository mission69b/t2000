#!/usr/bin/env node
// Confidential coding probe (SPEC_INFERENCE_DEMAND Step-1 item 7).
//
// Drives `zero exec` against phala/* (GPU-TEE) models + un-TEE'd baselines
// through api.t2000.ai and measures the four killers:
//   tool-call fidelity · latency per step · quality (task success) vs the
//   same model un-TEE'd · cost at the confidential margin.
//
// Usage: node .smoke-tee-probe.mjs [--models a,b,c] [--tasks t1,t2,t3]
// Results: table on stdout + JSONL transcripts in .smoke-logs/tee-probe/.

import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const MODELS = (getArg("--models") ?? [
  "phala/glm-5.2",
  "phala/kimi-k2.6",
  "phala/deepseek-v4-flash",
  "zai/glm-5.2",             // un-TEE'd twin of phala/glm-5.2 (apples-to-apples)
  "moonshotai/kimi-k2.7-code", // open ZDR baseline
].join(",")).split(",").map((s) => s.trim()).filter(Boolean);

const RUN_TIMEOUT_MS = 8 * 60 * 1000;
const LOG_DIR = join(process.cwd(), ".smoke-logs", "tee-probe");
mkdirSync(LOG_DIR, { recursive: true });

// USD per 1M tok from the live catalog — cost is computed per run.
const pricing = await fetch("https://api.t2000.ai/v1/models")
  .then((r) => r.json())
  .then((j) => Object.fromEntries(j.data.map((m) => [m.id, m.pricing ?? {}])))
  .catch(() => ({}));

function getArg(name) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

// ── Fixed task set ──────────────────────────────────────────────────────────
// Each task: seed files into a scratch dir, one prompt, one machine check.
const TASKS = [
  {
    id: "t1-write",
    prompt:
      "Create a file fizzbuzz.js exporting a function fizzbuzz(n) that returns 'Fizz' for multiples of 3, 'Buzz' for 5, 'FizzBuzz' for both, else String(n). Then run `node -e \"const{fizzbuzz}=require('./fizzbuzz.js');console.log(fizzbuzz(15),fizzbuzz(3),fizzbuzz(5),fizzbuzz(7))\"` to prove it works.",
    seed() {},
    check(dir) {
      if (!existsSync(join(dir, "fizzbuzz.js"))) return "fizzbuzz.js missing";
      const r = spawnSync(
        "node",
        ["-e", "const{fizzbuzz}=require('./fizzbuzz.js');if(fizzbuzz(15)!=='FizzBuzz'||fizzbuzz(3)!=='Fizz'||fizzbuzz(5)!=='Buzz'||fizzbuzz(7)!=='7')process.exit(1)"],
        { cwd: dir, timeout: 10_000 }
      );
      return r.status === 0 ? null : "fizzbuzz behavior wrong";
    },
  },
  {
    id: "t2-fix",
    prompt:
      "test.js is failing. Run `node test.js`, find the bug in calc.js, fix it, and re-run the test until it passes.",
    seed(dir) {
      writeFileSync(
        join(dir, "calc.js"),
        "// order total with percentage discount\nfunction total(items, discountPct) {\n  const sum = items.reduce((a, b) => a + b.price * b.qty, 0);\n  // BUG: discount applied as absolute, not percentage\n  return sum - discountPct;\n}\nmodule.exports = { total };\n"
      );
      writeFileSync(
        join(dir, "test.js"),
        "const { total } = require('./calc.js');\nconst got = total([{ price: 10, qty: 2 }, { price: 5, qty: 2 }], 10);\nif (got !== 27) { console.error(`FAIL: expected 27 (10% off 30), got ${got}`); process.exit(1); }\nconsole.log('PASS');\n"
      );
    },
    check(dir) {
      const r = spawnSync("node", ["test.js"], { cwd: dir, timeout: 10_000 });
      return r.status === 0 ? null : "test.js still failing";
    },
  },
  {
    id: "t3-read",
    prompt:
      "Find where TAX_RATE is defined in this repo and reply with exactly: TAX_RATE=<value>",
    seed(dir) {
      mkdirSync(join(dir, "src", "config"), { recursive: true });
      writeFileSync(join(dir, "src", "index.js"), "const { checkout } = require('./checkout.js');\nmodule.exports = { checkout };\n");
      writeFileSync(join(dir, "src", "checkout.js"), "const { TAX_RATE } = require('./config/constants.js');\nfunction checkout(subtotal) { return subtotal * (1 + TAX_RATE); }\nmodule.exports = { checkout };\n");
      writeFileSync(join(dir, "src", "config", "constants.js"), "const TAX_RATE = 0.0825;\nmodule.exports = { TAX_RATE };\n");
      writeFileSync(join(dir, "README.md"), "# scratch\nA tiny checkout lib.\n");
    },
    check(_dir, finalText) {
      return /TAX_RATE\s*=\s*0\.0825/.test(finalText ?? "") ? null : "final answer missing TAX_RATE=0.0825";
    },
  },
];

const taskFilter = getArg("--tasks")?.split(",").map((s) => s.trim());
const tasks = taskFilter ? TASKS.filter((t) => taskFilter.includes(t.id)) : TASKS;

// ── Runner ──────────────────────────────────────────────────────────────────
function runOne(model, task) {
  const dir = mkdtempSync(join(tmpdir(), "tee-probe-"));
  task.seed(dir);
  spawnSync("git", ["init", "-q"], { cwd: dir });

  const t0 = Date.now();
  const r = spawnSync(
    "zero",
    // --auto high + skip-permissions: scratch dirs are throwaway; without this,
    // zero gates write/exec tools behind interactive approval and the run
    // fails on "no tools available" — a harness artifact, not a model result.
    ["exec", "-m", model, "--auto", "high", "--skip-permissions-unsafe", "--max-turns", "16", "-o", "json", "-C", dir, task.prompt],
    { timeout: RUN_TIMEOUT_MS, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }
  );
  const wallMs = Date.now() - t0;
  const raw = (r.stdout ?? "") + (r.stderr ?? "");
  const slug = `${model.replace(/\//g, "_")}-${task.id}`;
  writeFileSync(join(LOG_DIR, `${slug}.jsonl`), raw);

  // Parse the JSONL stream: usage, tool events, final text.
  let usage = null;
  let finalText = "";
  let toolEvents = 0;
  const eventTypes = {};
  for (const line of (r.stdout ?? "").split("\n")) {
    if (!line.trim()) continue;
    let ev;
    try { ev = JSON.parse(line); } catch { continue; }
    eventTypes[ev.type] = (eventTypes[ev.type] ?? 0) + 1;
    if (ev.type === "usage") {
      usage = usage ?? { prompt: 0, completion: 0 };
      usage.prompt += ev.prompt_tokens ?? 0;
      usage.completion += ev.completion_tokens ?? 0;
    }
    if (/tool/.test(ev.type)) toolEvents += 1;
    if (ev.type === "final") finalText = ev.text ?? "";
  }

  const timedOut = r.error?.code === "ETIMEDOUT" || (r.signal != null && wallMs >= RUN_TIMEOUT_MS - 1000);
  const failReason = timedOut ? "TIMEOUT" : task.check(dir, finalText);
  const p = pricing[model] ?? {};
  const costUsd = usage
    ? (usage.prompt * (p.input_per_1m ?? 0) + usage.completion * (p.output_per_1m ?? 0)) / 1e6
    : null;

  return {
    model,
    task: task.id,
    ok: !failReason,
    failReason: failReason ?? "",
    wallS: Math.round(wallMs / 100) / 10,
    toolEvents,
    promptTok: usage?.prompt ?? null,
    completionTok: usage?.completion ?? null,
    costUsd: costUsd == null ? null : Math.round(costUsd * 10000) / 10000,
    eventTypes,
  };
}

// ── Main ────────────────────────────────────────────────────────────────────
const results = [];
for (const model of MODELS) {
  for (const task of tasks) {
    process.stderr.write(`→ ${model} × ${task.id} … `);
    const res = runOne(model, task);
    process.stderr.write(res.ok ? `PASS ${res.wallS}s\n` : `FAIL (${res.failReason}) ${res.wallS}s\n`);
    results.push(res);
  }
}

writeFileSync(join(LOG_DIR, "results.json"), JSON.stringify(results, null, 2));
console.log("\nmodel | task | ok | wall s | tool evts | tok in/out | cost $");
console.log("---|---|---|---|---|---|---");
for (const r of results) {
  console.log(
    `${r.model} | ${r.task} | ${r.ok ? "✓" : `✗ ${r.failReason}`} | ${r.wallS} | ${r.toolEvents} | ${r.promptTok}/${r.completionTok} | ${r.costUsd ?? "?"}`
  );
}
