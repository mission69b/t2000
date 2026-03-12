import type { Command } from 'commander';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { SafeguardEnforcer } from '@t2000/sdk';
import { printKeyValue, printBlank, printJson, isJsonMode, handleError, printSuccess, printInfo, printHeader, printDivider } from '../output.js';

const CONFIG_DIR = join(homedir(), '.t2000');
const CONFIG_PATH = join(CONFIG_DIR, 'config.json');

const SAFEGUARD_KEYS = new Set(['locked', 'maxPerTx', 'maxDailySend', 'dailyUsed', 'dailyResetDate', 'alertThreshold', 'maxLeverage', 'maxPositionSize']);

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

function formatUsd(amount: number): string {
  return `$${amount.toFixed(2)}`;
}

export function registerConfig(program: Command) {
  const configCmd = program
    .command('config')
    .description('Show or set configuration');

  configCmd
    .command('show')
    .description('Show safeguard settings')
    .action(() => {
      try {
        const enforcer = new SafeguardEnforcer(CONFIG_DIR);
        enforcer.load();
        const config = enforcer.getConfig();

        if (isJsonMode()) {
          printJson({
            locked: config.locked,
            maxPerTx: config.maxPerTx,
            maxDailySend: config.maxDailySend,
            dailyUsed: config.dailyUsed,
          });
          return;
        }

        printHeader('Agent Safeguards');
        printDivider();
        printKeyValue('Locked', config.locked ? 'Yes' : 'No');
        printKeyValue('Per-transaction', config.maxPerTx > 0 ? formatUsd(config.maxPerTx) : 'Unlimited');
        printKeyValue('Daily send limit', config.maxDailySend > 0
          ? `${formatUsd(config.maxDailySend)} (${formatUsd(config.dailyUsed)} used today)`
          : 'Unlimited');
        printBlank();
      } catch (error) {
        handleError(error);
      }
    });

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
            printInfo('No configuration set.');
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
        if (SAFEGUARD_KEYS.has(key)) {
          const enforcer = new SafeguardEnforcer(CONFIG_DIR);
          enforcer.load();

          let parsed: unknown = value;
          if (value === 'true') parsed = true;
          else if (value === 'false') parsed = false;
          else if (!isNaN(Number(value)) && value.trim() !== '') parsed = Number(value);

          enforcer.set(key, parsed);

          if (isJsonMode()) {
            printJson({ [key]: parsed });
            return;
          }

          printBlank();
          printSuccess(`Set ${key} = ${String(parsed)}`);
          printBlank();
          return;
        }

        const config = loadConfig();

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

        printBlank();
        printSuccess(`Set ${key} = ${String(parsed)}`);
        printBlank();
      } catch (error) {
        handleError(error);
      }
    });
}
