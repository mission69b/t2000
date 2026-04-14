import type { Command } from 'commander';
import pc from 'picocolors';
import { T2000, walletExists, SafeguardEnforcer } from '@t2000/sdk';
import { saveSession } from '../prompts.js';
import {
  printSuccess, printBlank, printInfo, printLine, handleError,
} from '../output.js';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { homedir, platform } from 'node:os';

const CONFIG_DIR = join(homedir(), '.t2000');
const CONFIG_PATH = join(CONFIG_DIR, 'config.json');

function loadConfig(): Record<string, unknown> {
  try { return JSON.parse(readFileSync(CONFIG_PATH, 'utf-8')); } catch { return {}; }
}

function saveConfig(config: Record<string, unknown>): void {
  if (!existsSync(CONFIG_DIR)) mkdirSync(CONFIG_DIR, { recursive: true });
  writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2) + '\n');
}

interface McpPlatform {
  name: string;
  path: string;
}

function getMcpPlatforms(): McpPlatform[] {
  const home = homedir();
  const isMac = platform() === 'darwin';
  return [
    {
      name: 'Claude Desktop',
      path: isMac
        ? join(home, 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json')
        : join(home, 'AppData', 'Roaming', 'Claude', 'claude_desktop_config.json'),
    },
    {
      name: 'Cursor',
      path: join(home, '.cursor', 'mcp.json'),
    },
    {
      name: 'Windsurf',
      path: join(home, '.codeium', 'windsurf', 'mcp_config.json'),
    },
  ];
}

async function installMcpForPlatforms(platforms: McpPlatform[]): Promise<void> {
  const mcpConfig = { command: 't2000', args: ['mcp'] };

  for (const p of platforms) {
    let config: Record<string, unknown> = {};
    try {
      config = JSON.parse(await readFile(p.path, 'utf-8'));
    } catch { /* file doesn't exist yet */ }

    const servers = (config.mcpServers as Record<string, unknown>) ?? {};
    if (servers['t2000']) {
      printSuccess(`${p.name}  already configured`);
      continue;
    }

    config.mcpServers = { ...servers, t2000: mcpConfig };
    const dir = dirname(p.path);
    if (!existsSync(dir)) await mkdir(dir, { recursive: true });
    await writeFile(p.path, JSON.stringify(config, null, 2) + '\n', 'utf-8');
    printSuccess(`${p.name}  configured`);
  }
}

export function registerInit(program: Command) {
  program
    .command('init')
    .description('Create a new agent bank account — guided setup with MCP + safeguards')
    .option('--key <path>', 'Key file path')
    .option('--no-sponsor', 'Skip gas sponsorship')
    .action(async (opts: { key?: string; sponsor?: boolean }) => {
      try {
        const { checkbox, input, password } = await import('@inquirer/prompts');

        console.log('');
        console.log(`  ┌─────────────────────────────────────────┐`);
        console.log(`  │  ${pc.bold('Welcome to t2000')}                       │`);
        console.log(`  │  A bank account for AI agents           │`);
        console.log(`  └─────────────────────────────────────────┘`);
        console.log('');

        const hasWallet = await walletExists(opts.key);
        let address = '';
        const isReturning = hasWallet;
        const totalSteps = isReturning ? 2 : 3;
        let step = 1;

        // ── Step 1: Wallet ──
        if (isReturning) {
          printSuccess('Existing wallet detected');

          const pin = await password({ message: 'Enter your PIN:' });
          if (!pin || pin.length < 4) throw new Error('PIN must be at least 4 characters');

          const agent = await T2000.create({ pin, keyPath: opts.key });
          address = agent.address();
          await saveSession(pin);
          printSuccess(`Wallet unlocked (${address.slice(0, 6)}...${address.slice(-4)})`);
        } else {
          console.log(`  ${pc.bold(`Step ${step} of ${totalSteps}`)} — Create wallet`);
          printBlank();

          const pin = await password({ message: `Create PIN (min 4 chars):` });
          if (!pin || pin.length < 4) throw new Error('PIN must be at least 4 characters');
          const pinConfirm = await password({ message: 'Confirm PIN:' });
          if (pin !== pinConfirm) throw new Error('PINs do not match');

          printBlank();
          printInfo('Creating agent wallet...');

          const { address: addr, sponsored } = await T2000.init({ pin, keyPath: opts.key, sponsored: opts.sponsor });
          address = addr;
          await saveSession(pin);

          printSuccess('Keypair generated');
          printSuccess(`Network ${pc.dim('Sui mainnet')}`);
          printSuccess(`Gas sponsorship ${pc.dim(sponsored ? 'enabled' : 'disabled')}`);

          printBlank();
          printInfo('Setting up accounts...');
          printLine(
            `  ${pc.green('✓')} Checking  ` +
            `${pc.green('✓')} Savings  ` +
            `${pc.green('✓')} Credit`
          );

          printBlank();
          printLine(`  🎉 ${pc.green('Bank account created')}`);
          printLine(`  Address: ${pc.yellow(address.slice(0, 6) + '...' + address.slice(-4))}`);
          printBlank();
          step++;
        }

        // ── Step 2: MCP platforms ──
        console.log(`  ${pc.bold(`Step ${step} of ${totalSteps}`)} — Connect AI platforms`);
        printBlank();

        const allPlatforms = getMcpPlatforms();

        const selectedNames = await checkbox({
          message: 'Which AI platforms do you use? (space to select)',
          choices: allPlatforms.map(p => ({
            name: p.name,
            value: p.name,
            checked: p.name !== 'Windsurf',
          })),
        });

        const selectedPlatforms = allPlatforms.filter(p => selectedNames.includes(p.name));

        printBlank();
        if (selectedPlatforms.length > 0) {
          printInfo('Adding t2000 to your AI platforms...');
          printBlank();
          await installMcpForPlatforms(selectedPlatforms);
        } else {
          printInfo('Skipped — you can add MCP later with: t2000 mcp install');
        }

        printBlank();
        step++;

        // ── Step 3: Safeguards ──
        console.log(`  ${pc.bold(`Step ${step} of ${totalSteps}`)} — Set safeguards`);
        printBlank();

        const maxPerTx = await input({
          message: 'Max per transaction ($):',
          default: '500',
        });
        const maxDaily = await input({
          message: 'Max daily sends ($):',
          default: '1000',
        });

        const enforcer = new SafeguardEnforcer(CONFIG_DIR);
        enforcer.load();
        enforcer.set('maxPerTx', Number(maxPerTx));
        enforcer.set('maxDailySend', Number(maxDaily));

        printSuccess('Safeguards configured');
        printBlank();

        // ── Done ──
        const platformList = selectedPlatforms.map(p => p.name).join(' / ');

        console.log(`  ┌─────────────────────────────────────────┐`);
        console.log(`  │  ${pc.green('✓ You\'re all set')}                        │`);
        console.log(`  │                                         │`);

        if (selectedPlatforms.length > 0) {
          console.log(`  │  ${pc.bold('Next steps:')}                             │`);
          console.log(`  │    1. Restart ${platformList.length > 20 ? 'your AI platform' : platformList}${' '.repeat(Math.max(0, 23 - Math.min(platformList.length, 20)))}│`);
          console.log(`  │    2. Ask: ${pc.cyan('"What\'s my t2000 balance?"')}   │`);
          console.log(`  │                                         │`);
        } else {
          console.log(`  │  Use the CLI directly:                 │`);
          console.log(`  │    ${pc.cyan('t2000 balance')}                        │`);
          console.log(`  │    ${pc.cyan('t2000 save 100')}                      │`);
          console.log(`  │                                         │`);
        }

        console.log(`  │  Your address:                          │`);
        console.log(`  │    ${pc.yellow(address)}  │`);
        console.log(`  └─────────────────────────────────────────┘`);
        console.log('');
      } catch (error) {
        handleError(error);
      }
    });
}
