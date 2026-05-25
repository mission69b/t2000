import pc from 'picocolors';

let jsonMode = false;

export function setJsonMode(enabled: boolean) {
  jsonMode = enabled;
}

export function isJsonMode(): boolean {
  return jsonMode;
}

export function printJson(data: unknown) {
  console.log(JSON.stringify(data, null, 2));
}

export function printSuccess(message: string) {
  if (jsonMode) return;
  console.log(`  ${pc.green('✓')} ${message}`);
}

export function printError(message: string) {
  if (jsonMode) return;
  console.error(`  ${pc.red('✗')} ${message}`);
}

export function printWarning(message: string) {
  if (jsonMode) return;
  console.log(`  ${pc.yellow('⚠')} ${message}`);
}

export function printInfo(message: string) {
  if (jsonMode) return;
  console.log(`  ${pc.dim(message)}`);
}

export function printHeader(title: string) {
  if (jsonMode) return;
  console.log();
  console.log(`  ${pc.bold(title)}`);
  console.log();
}

export function printKeyValue(key: string, value: string, indent = 2) {
  if (jsonMode) return;
  const pad = ' '.repeat(indent);
  console.log(`${pad}${pc.dim(key + ':')}  ${value}`);
}

export function printBlank() {
  if (jsonMode) return;
  console.log();
}

export function printDivider(width = 53) {
  if (jsonMode) return;
  console.log(`  ${pc.dim('─'.repeat(width))}`);
}

export function printLine(text: string) {
  if (jsonMode) return;
  console.log(`  ${text}`);
}


export function printSeparator() {
  if (jsonMode) return;
  console.log(`  ${pc.dim('──────────────────────────────────────')}`);
}

/**
 * Format an APY value for display.
 *
 * The SDK returns APYs in **decimal form** — e.g. `agent.rates()` returns
 * `{ USDC: { saveApy: 0.0473 } }` meaning 4.73%. Every consumer that wants
 * to render `4.73%` must multiply by 100 first.
 *
 * Use this helper at EVERY APY display site to keep the conversion in one
 * place. Without it the CLI accumulates off-by-100x bugs (S.318).
 */
export function formatApyPercent(decimal: number, digits = 2): string {
  return `${(decimal * 100).toFixed(digits)}%`;
}

export function explorerUrl(txHash: string, network = 'mainnet'): string {
  const base = network === 'testnet'
    ? 'https://suiscan.xyz/testnet/tx'
    : 'https://suiscan.xyz/mainnet/tx';
  const suffix = '';
  return `${base}/${txHash}${suffix}`;
}

export function handleError(error: unknown) {
  if (jsonMode) {
    const data = error instanceof Error && 'toJSON' in error
      ? (error as { toJSON(): unknown }).toJSON()
      : { error: 'UNKNOWN', message: String(error) };
    printJson(data);
  } else {
    const msg = error instanceof Error ? error.message : String(error);
    printError(msg);
  }
  process.exit(1);
}
