import type { Command } from 'commander';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { printKeyValue, printBlank, printJson, isJsonMode, handleError } from '../output.js';

const CONFIG_DIR = join(homedir(), '.t2000');
const CONFIG_PATH = join(CONFIG_DIR, 'config.json');

function loadConfig(): Record<string, unknown> {
  try {
    return JSON.parse(readFileSync(CONFIG_PATH, 'utf-8'));
  } catch {
    return {};
  }
}

function saveConfig(config: Record<string, unknown>): void {
  if (!existsSync(CONFIG_DIR)) {
    mkdirSync(CONFIG_DIR, { recursive: true });
  }
  writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2) + '\n');
}

export function registerConfig(program: Command) {
  const configCmd = program
    .command('config')
    .description('Show or set configuration');

  configCmd
    .command('get')
    .argument('[key]', 'Config key to get (omit for all)')
    .action((key?: string) => {
      try {
        const config = loadConfig();

        if (isJsonMode()) {
          printJson(key ? { [key]: config[key] } : config);
          return;
        }

        printBlank();
        if (key) {
          printKeyValue(key, String(config[key] ?? '(not set)'));
        } else {
          if (Object.keys(config).length === 0) {
            console.log('  No configuration set.');
          } else {
            for (const [k, v] of Object.entries(config)) {
              printKeyValue(k, String(v));
            }
          }
        }
        printBlank();
      } catch (error) {
        handleError(error);
      }
    });

  configCmd
    .command('set')
    .argument('<key>', 'Config key')
    .argument('<value>', 'Config value')
    .action((key: string, value: string) => {
      try {
        const config = loadConfig();

        // Parse booleans and numbers
        let parsed: unknown = value;
        if (value === 'true') parsed = true;
        else if (value === 'false') parsed = false;
        else if (!isNaN(Number(value)) && value.trim() !== '') parsed = Number(value);

        config[key] = parsed;
        saveConfig(config);

        if (isJsonMode()) {
          printJson({ [key]: parsed });
          return;
        }

        console.log(`  Set ${key} = ${String(parsed)}`);
      } catch (error) {
        handleError(error);
      }
    });
}
