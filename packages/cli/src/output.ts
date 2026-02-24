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
