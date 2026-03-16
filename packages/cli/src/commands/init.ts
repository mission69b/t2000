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
import { exec } from 'node:child_process';

const LLM_KEY_URLS: Record<string, string> = {
  anthropic: 'https://console.anthropic.com/settings/keys',
  openai: 'https://platform.openai.com/api-keys',
};

function openBrowser(url: string): void {
  const cmd = platform() === 'darwin' ? 'open' : platform() === 'win32' ? 'start' : 'xdg-open';
  exec(`${cmd} "${url}"`, () => {});
}

const CONFIG_DIR = join(homedir(), '.t2000');
const CONFIG_PATH = join(CONFIG_DIR, 'config.json');

function loadConfig(): Record<string, unknown> {
  try { return JSON.parse(readFileSync(CONFIG_PATH, 'utf-8')); } catch { return {}; }
}

function saveConfig(config: Record<string, unknown>): void {
  if (!existsSync(CONFIG_DIR)) mkdirSync(CONFIG_DIR, { recursive: true });
  writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2) + '\n');
}

type ChannelChoice = 'mcp' | 'telegram' | 'both' | 'cli';

async function installMcp(): Promise<void> {
  const mcpConfig = { command: 't2000', args: ['mcp'] };

  const platforms = [
    {
      name: 'Claude Desktop',
      path: join(homedir(), 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json'),
    },
    {
      name: 'Cursor',
      path: join(homedir(), '.cursor', 'mcp.json'),
    },
  ];

  for (const p of platforms) {
    let config: Record<string, unknown> = {};
    try {
      config = JSON.parse(await readFile(p.path, 'utf-8'));
    } catch { /* file doesn't exist yet */ }

    const servers = (config.mcpServers as Record<string, unknown>) ?? {};
    if (servers['t2000']) {
      printInfo(`${p.name}  already configured`);
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
    .description('Create a new agent bank account — guided setup with AI + Telegram + safeguards')
    .option('--key <path>', 'Key file path')
    .option('--no-sponsor', 'Skip gas sponsorship')
    .action(async (opts: { key?: string; sponsor?: boolean }) => {
      try {
        const { select, input, password, confirm } = await import('@inquirer/prompts');

        console.log('');
        console.log(`  ┌─────────────────────────────────────────┐`);
        console.log(`  │  ${pc.bold('Welcome to t2000')}                       │`);
        console.log(`  │  Your personal AI financial advisor     │`);
        console.log(`  └─────────────────────────────────────────┘`);
        console.log('');

        const hasWallet = await walletExists(opts.key);
        let address = '';
        const isReturning = hasWallet;
        let step = 1;
        const totalSteps = isReturning ? 3 : 5;

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

          const { agent, address: addr, sponsored } = await T2000.init({ pin, keyPath: opts.key, sponsored: opts.sponsor });
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
            `${pc.green('✓')} Credit  ` +
            `${pc.green('✓')} Exchange  ` +
            `${pc.green('✓')} Investment`
          );

          printBlank();
          printLine(`  🎉 ${pc.green('Bank account created')}`);
          printLine(`  Address: ${pc.yellow(address.slice(0, 6) + '...' + address.slice(-4))}`);
          printBlank();
        }

        step++;

        // ── Step 2: Channel choice ──
        console.log(`  ${pc.bold(`Step ${step} of ${totalSteps}`)} — How to talk to your agent`);
        printBlank();

        const channelChoice = await select({
          message: 'How do you want to use t2000?',
          choices: [
            { name: `${pc.bold('Claude Desktop / Cursor')} (MCP) — smartest AI, no API key needed`, value: 'mcp' },
            { name: `${pc.bold('Telegram')} — mobile, message your agent anywhere`, value: 'telegram' },
            { name: `${pc.bold('Both')} — MCP + Telegram`, value: 'both' },
            { name: `${pc.bold('CLI only')} — just use commands`, value: 'cli' },
          ],
        }) as ChannelChoice;

        const wantsMcp = channelChoice === 'mcp' || channelChoice === 'both';
        const wantsGateway = channelChoice === 'telegram' || channelChoice === 'both';
        let llmProvider: 'anthropic' | 'openai' | 'skip' = 'skip';

        printBlank();
        step++;

        // ── Step 3: LLM (only if Gateway) ──
        if (wantsGateway) {
          console.log(`  ${pc.bold(`Step ${step} of ${totalSteps}`)} — Connect AI for Telegram`);
          printBlank();

          llmProvider = await select({
            message: 'Which LLM provider for Telegram?',
            choices: [
              { name: 'Claude (Anthropic)', value: 'anthropic' },
              { name: 'GPT (OpenAI)', value: 'openai' },
            ],
          }) as 'anthropic' | 'openai';

          const providerName = llmProvider === 'anthropic' ? 'Anthropic' : 'OpenAI';
          const keyUrl = LLM_KEY_URLS[llmProvider];

          printBlank();
          printInfo(`Opening ${providerName} API keys page in your browser...`);
          openBrowser(keyUrl);
          printLine(`  ${pc.dim(keyUrl)}`);
          printBlank();

          const apiKey = await password({
            message: `Paste your ${providerName} API key:`,
          });

          if (!apiKey) throw new Error('API key is required');

          const config = loadConfig();
          config.llm = { provider: llmProvider, apiKey };
          saveConfig(config);

          const modelName = llmProvider === 'anthropic' ? 'claude-sonnet-4-20250514' : 'gpt-4o';
          printSuccess(`${providerName} connected — model: ${modelName}`);
          printBlank();
          step++;

          // ── Telegram setup ──
          console.log(`  ${pc.bold(`Step ${step} of ${totalSteps}`)} — Connect Telegram`);
          printBlank();

          printInfo('Opening BotFather in Telegram...');
          openBrowser('https://t.me/BotFather');
          printBlank();
          printLine(`1. Send ${pc.cyan('/newbot')} to BotFather`);
          printLine(`2. Pick a name (e.g. "My t2000 Agent")`);
          printLine(`3. Copy the bot token`);
          printBlank();

          const botToken = await input({ message: 'Paste the bot token:' });
          if (!botToken) throw new Error('Bot token is required');

          printBlank();
          printInfo('Opening @userinfobot to get your Telegram user ID...');
          openBrowser('https://t.me/userinfobot');
          printBlank();
          printLine(`Send any message to ${pc.cyan('@userinfobot')} — it will reply with your ID.`);
          printBlank();

          const userId = await input({ message: 'Paste your Telegram user ID:' });

          const config2 = loadConfig();
          config2.channels = {
            ...(config2.channels as Record<string, unknown> ?? {}),
            telegram: {
              enabled: true,
              botToken,
              allowedUsers: userId ? [userId] : [],
            },
            webchat: { enabled: true, port: 2000 },
          };
          saveConfig(config2);

          printSuccess('Telegram connected');
          printBlank();
          step++;
        }

        // ── MCP install ──
        if (wantsMcp) {
          console.log(`  ${pc.bold(`Step ${step} of ${totalSteps}`)} — Install MCP`);
          printBlank();
          printInfo('Adding t2000 to your AI platforms...');
          printBlank();

          await installMcp();

          printBlank();
          step++;
        }

        // ── Safeguards ──
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
        console.log(`  ┌─────────────────────────────────────────┐`);
        console.log(`  │  ${pc.green('✓ You\'re all set')}                        │`);
        console.log(`  │                                         │`);

        if (wantsMcp) {
          console.log(`  │  ${pc.bold('MCP (Claude Desktop / Cursor):')}          │`);
          console.log(`  │    Restart your AI platform, then ask: │`);
          console.log(`  │    ${pc.cyan('"What\'s my t2000 balance?"')}             │`);
          console.log(`  │                                         │`);
        }

        if (wantsGateway) {
          console.log(`  │  ${pc.bold('Telegram:')}                               │`);
          console.log(`  │    ${pc.cyan('t2000 gateway')}                        │`);
          console.log(`  │                                         │`);
        }

        if (!wantsMcp && !wantsGateway) {
          console.log(`  │  Use the CLI directly:                 │`);
          console.log(`  │    ${pc.cyan('t2000 balance')}                        │`);
          console.log(`  │    ${pc.cyan('t2000 invest buy 100 SUI')}             │`);
          console.log(`  │                                         │`);
        }

        console.log(`  │  Deposit USDC to get started:           │`);
        console.log(`  │    ${pc.yellow(address)}  │`);
        console.log(`  └─────────────────────────────────────────┘`);
        console.log('');
      } catch (error) {
        handleError(error);
      }
    });
}
