import { discover } from './discover.js';
import { check } from './check.js';
import type { ValidationIssue } from './types.js';

const BOLD = '\x1b[1m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const GREEN = '\x1b[32m';
const DIM = '\x1b[2m';
const RESET = '\x1b[0m';

function icon(severity: string): string {
  if (severity === 'error') return `${RED}✗${RESET}`;
  if (severity === 'warning') return `${YELLOW}⚠${RESET}`;
  return `${DIM}ℹ${RESET}`;
}

function printIssues(issues: ValidationIssue[]): void {
  for (const issue of issues) {
    const loc = issue.path ? ` ${DIM}${issue.method ?? ''} ${issue.path}${RESET}` : '';
    console.log(`  ${icon(issue.severity)} ${issue.message}${loc}`);
  }
}

async function runDiscover(target: string, json: boolean): Promise<void> {
  const result = await discover(target);

  if (json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  console.log();
  console.log(`${BOLD}${result.title}${RESET} ${DIM}v${result.version}${RESET}`);
  console.log(`${DIM}${result.specUrl}${RESET}`);
  console.log();
  console.log(`  Endpoints: ${result.totalEndpoints} total, ${result.paidEndpoints} paid`);
  console.log();

  if (result.endpoints.length > 0) {
    for (const ep of result.endpoints) {
      const price = ep.paymentInfo.price ?? ep.paymentInfo.amount ?? 'dynamic';
      console.log(`  ${DIM}${ep.method.padEnd(6)}${RESET} ${ep.path}  ${DIM}${price}${RESET}`);
    }
    console.log();
  }

  if (result.issues.length > 0) {
    printIssues(result.issues);
    console.log();
  }

  const status = result.ok ? `${GREEN}✓ Valid${RESET}` : `${RED}✗ Issues found${RESET}`;
  console.log(`  ${status}`);
  console.log();
}

async function runCheck(target: string, json: boolean): Promise<void> {
  const result = await check(target);

  if (json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  console.log();
  console.log(`${BOLD}${result.discovery.title}${RESET} ${DIM}v${result.discovery.version}${RESET}`);
  console.log(`${DIM}${result.origin}${RESET}`);
  console.log();

  console.log(`  ${BOLD}Discovery${RESET}`);
  console.log(`  Endpoints: ${result.discovery.totalEndpoints} total, ${result.discovery.paidEndpoints} paid`);

  if (result.discovery.issues.length > 0) {
    printIssues(result.discovery.issues);
  } else {
    console.log(`  ${GREEN}✓ OpenAPI valid${RESET}`);
  }
  console.log();

  if (result.probe) {
    console.log(`  ${BOLD}Probe${RESET} ${DIM}${result.probe.url}${RESET}`);
    if (result.probe.hasSuiPayment) {
      console.log(`  ${GREEN}✓${RESET} 402 with Sui payment challenge`);
      if (result.probe.recipient) console.log(`    Recipient: ${DIM}${result.probe.recipient}${RESET}`);
      if (result.probe.currency) console.log(`    Currency:  ${DIM}${result.probe.currency}${RESET}`);
      if (result.probe.realm) console.log(`    Realm:     ${DIM}${result.probe.realm}${RESET}`);
    }
    if (result.probe.issues.length > 0) {
      printIssues(result.probe.issues);
    }
    console.log();
  }

  const { errors, warnings } = result.summary;
  if (errors === 0 && warnings === 0) {
    console.log(`  ${GREEN}${BOLD}✓ All checks passed${RESET}`);
  } else if (errors === 0) {
    console.log(`  ${YELLOW}${BOLD}⚠ Passed with ${warnings} warning(s)${RESET}`);
  } else {
    console.log(`  ${RED}${BOLD}✗ ${errors} error(s), ${warnings} warning(s)${RESET}`);
  }
  console.log();

  if (errors > 0) process.exit(1);
}

export async function run(): Promise<void> {
  const args = process.argv.slice(2);
  const json = args.includes('--json');
  const filtered = args.filter(a => !a.startsWith('-'));

  const command = filtered[0];
  const target = filtered[1] ?? filtered[0];

  if (!target || args.includes('--help') || args.includes('-h')) {
    console.log(`
${BOLD}@mppsui/discovery${RESET} — Sui MPP server validation

${BOLD}Usage:${RESET}
  npx @mppsui/discovery check <url>       Full validation (OpenAPI + probe)
  npx @mppsui/discovery discover <url>    List paid endpoints
  npx @mppsui/discovery <url>             Alias for check

${BOLD}Flags:${RESET}
  --json    Machine-readable JSON output
  --help    Show this help
`);
    return;
  }

  if (command === 'discover') {
    await runDiscover(target, json);
  } else {
    const checkTarget = command === 'check' ? (filtered[1] ?? command) : command;
    await runCheck(checkTarget, json);
  }
}
