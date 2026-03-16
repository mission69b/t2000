import type { Command } from 'commander';
import pc from 'picocolors';
import { T2000, walletExists, SafeguardEnforcer } from '@t2000/sdk';
import { saveSession } from '../prompts.js';
import {
  printSuccess, printBlank, printInfo, printLine, handleError,
} from '../output.js';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
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
        const skipWallet = hasWallet;

        // ── Step 1: Wallet ──
        if (skipWallet) {
          printSuccess('Existing wallet detected');

          const pin = await password({ message: 'Enter your PIN:' });
          if (!pin || pin.length < 4) throw new Error('PIN must be at least 4 characters');

          const agent = await T2000.create({ pin, keyPath: opts.key });
          address = agent.address();
          await saveSession(pin);
          printSuccess(`Wallet unlocked (${address.slice(0, 6)}...${address.slice(-4)})`);
        } else {
          console.log(`  ${pc.bold('Step 1 of 5')} — Create wallet`);
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

        // ── Step 2: LLM ──
        const stepNum = skipWallet ? 1 : 3;
        console.log(`  ${pc.bold(`Step ${stepNum} of ${skipWallet ? 3 : 5}`)} — Connect AI`);
        printBlank();

        const llmProvider = await select({
          message: 'Which LLM provider?',
          choices: [
            { name: 'Claude (Anthropic)', value: 'anthropic' },
            { name: 'GPT (OpenAI)', value: 'openai' },
            { name: 'Skip (CLI only, no chat)', value: 'skip' },
          ],
        }) as 'anthropic' | 'openai' | 'skip';

        if (llmProvider !== 'skip') {
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
        } else {
          printSuccess('Skipped — use CLI commands directly');
        }
        printBlank();

        // ── Step 3: Telegram ──
        const telegramStepNum = skipWallet ? 2 : 4;
        console.log(`  ${pc.bold(`Step ${telegramStepNum} of ${skipWallet ? 3 : 5}`)} — Connect Telegram ${pc.dim('(optional)')}`);
        printBlank();

        const wantsTelegram = await confirm({
          message: 'Want to chat with your agent on Telegram?',
          default: true,
        });

        if (wantsTelegram) {
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

          const config = loadConfig();
          config.channels = {
            ...(config.channels as Record<string, unknown> ?? {}),
            telegram: {
              enabled: true,
              botToken,
              allowedUsers: userId ? [userId] : [],
            },
            webchat: { enabled: true, port: 2000 },
          };
          saveConfig(config);

          printSuccess('Telegram connected');
        } else {
          printSuccess('Skipped — you can add Telegram later');
        }
        printBlank();

        // ── Step 4: Safeguards ──
        const safeguardStepNum = skipWallet ? 3 : 5;
        console.log(`  ${pc.bold(`Step ${safeguardStepNum} of ${skipWallet ? 3 : 5}`)} — Set safeguards`);
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
        if (llmProvider !== 'skip') {
          console.log(`  │  Start your agent:                      │`);
          console.log(`  │    ${pc.cyan('t2000 gateway')}                        │`);
          console.log(`  │                                         │`);
        }
        console.log(`  │  Or use the CLI directly:               │`);
        console.log(`  │    ${pc.cyan('t2000 balance')}                        │`);
        console.log(`  │    ${pc.cyan('t2000 invest buy 100 SUI')}             │`);
        console.log(`  │                                         │`);
        console.log(`  │  Deposit USDC to get started:           │`);
        console.log(`  │    ${pc.yellow(address)}  │`);
        console.log(`  └─────────────────────────────────────────┘`);
        console.log('');
      } catch (error) {
        handleError(error);
      }
    });
}
