import { Command } from 'commander';
import pc from 'picocolors';
import { T2000 } from '@t2000/sdk';
import { resolvePin } from '../prompts.js';
import { handleError, printSuccess, printBlank, printLine, printWarning, printInfo } from '../output.js';
import { existsSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { homedir, platform } from 'node:os';
import { execSync } from 'node:child_process';

const PLIST_LABEL = 'com.t2000.gateway';
const SYSTEMD_UNIT = 't2000-gateway';

function getLaunchAgentPath(): string {
  return join(homedir(), 'Library', 'LaunchAgents', `${PLIST_LABEL}.plist`);
}

function getSystemdPath(): string {
  return join(homedir(), '.config', 'systemd', 'user', `${SYSTEMD_UNIT}.service`);
}

function getLogDir(): string {
  return join(homedir(), '.t2000', 'logs');
}

function getT2000Bin(): string {
  try {
    return execSync('which t2000', { encoding: 'utf-8' }).trim();
  } catch {
    return 'npx t2000';
  }
}

export function registerGateway(program: Command) {
  const gw = program
    .command('gateway')
    .description('Start AI financial advisor gateway');

  gw
    .command('start', { isDefault: true })
    .description('Start the gateway (foreground)')
    .option('--port <port>', 'WebChat port', '2000')
    .option('--no-telegram', 'Skip Telegram channel')
    .option('--no-heartbeat', 'Skip heartbeat daemon')
    .option('--verbose', 'Debug logging')
    .option('--key <path>', 'Key file path')
    .action(async (opts: {
      port: string;
      telegram: boolean;
      heartbeat: boolean;
      verbose: boolean;
      key?: string;
    }) => {
      try {
        const pin = await resolvePin();
        const agent = await T2000.create({ pin, keyPath: opts.key });

        console.log('');
        console.log(`  ${pc.bold('t2000 gateway')}`);
        console.log('');

        const { Gateway } = await import('@t2000/gateway');
        const gateway = await Gateway.create({
          agent,
          port: parseInt(opts.port, 10),
          noTelegram: !opts.telegram,
          noHeartbeat: !opts.heartbeat,
          verbose: opts.verbose,
        });

        const info = await gateway.start();

        console.log('');
        const truncAddr = info.address.slice(0, 6) + '...' + info.address.slice(-4);
        printSuccess(`Agent: ${truncAddr}`);
        printSuccess(`LLM: ${info.llmProvider === 'anthropic' ? 'Claude' : 'GPT'} (${info.llmModel})`);
        if (info.webchatUrl) printSuccess(`WebChat: ${pc.underline(info.webchatUrl)}`);
        if (info.telegramConnected) printSuccess('Telegram: connected');
        if (info.heartbeatTasks > 0) printSuccess(`Heartbeat: ${info.heartbeatTasks} tasks`);
        console.log('');
        printSuccess(pc.bold('Ready — talk to your agent'));
        console.log('');

        await new Promise(() => {});
      } catch (error) {
        handleError(error);
      }
    });

  gw
    .command('status')
    .description('Check if gateway is running')
    .option('--port <port>', 'WebChat port to check', '2000')
    .action(async (opts: { port: string }) => {
      try {
        const port = parseInt(opts.port, 10);
        const response = await fetch(`http://127.0.0.1:${port}/health`);
        if (response.ok) {
          const data = await response.json() as { status: string };
          printSuccess(`Gateway is running on port ${port} (${data.status})`);
        }
      } catch {
        console.log(`  ${pc.yellow('○')} Gateway is not running on port ${opts.port}`);
      }
    });

  gw
    .command('install')
    .description('Install gateway as a background daemon')
    .option('--port <port>', 'WebChat port', '2000')
    .action(async (opts: { port: string }) => {
      try {
        const os = platform();
        const bin = getT2000Bin();

        if (os === 'darwin') {
          installLaunchd(bin, opts.port);
        } else if (os === 'linux') {
          installSystemd(bin, opts.port);
        } else {
          throw new Error(`Unsupported platform: ${os}. Use macOS or Linux.`);
        }
      } catch (error) {
        handleError(error);
      }
    });

  gw
    .command('uninstall')
    .description('Remove gateway daemon')
    .action(async () => {
      try {
        const os = platform();

        if (os === 'darwin') {
          uninstallLaunchd();
        } else if (os === 'linux') {
          uninstallSystemd();
        } else {
          throw new Error(`Unsupported platform: ${os}`);
        }
      } catch (error) {
        handleError(error);
      }
    });

  gw
    .command('logs')
    .description('Tail gateway logs')
    .option('-n <lines>', 'Number of lines', '50')
    .option('-f, --follow', 'Follow log output')
    .action(async (opts: { n: string; follow?: boolean }) => {
      try {
        const logPath = join(getLogDir(), 'gateway.log');

        if (!existsSync(logPath)) {
          printWarning('No gateway logs found yet.');
          printInfo(`Log path: ${logPath}`);
          return;
        }

        printBlank();
        printInfo(`Log file: ${logPath}`);
        printBlank();

        const content = readFileSync(logPath, 'utf-8');
        const lines = content.trim().split('\n');
        const tail = lines.slice(-parseInt(opts.n, 10));

        for (const line of tail) {
          try {
            const entry = JSON.parse(line) as { ts: string; level: string; msg: string };
            const time = new Date(entry.ts).toLocaleTimeString();
            const levelColor = entry.level === 'error' ? pc.red : entry.level === 'warn' ? pc.yellow : pc.dim;
            printLine(`${pc.dim(time)} ${levelColor(entry.level.padEnd(5))} ${entry.msg}`);
          } catch {
            printLine(line);
          }
        }

        if (opts.follow) {
          printBlank();
          printInfo('Following... (Ctrl+C to stop)');
          const { spawn } = await import('node:child_process');
          const child = spawn('tail', ['-f', logPath], { stdio: 'inherit' });
          process.on('SIGINT', () => { child.kill(); process.exit(0); });
          await new Promise(() => {});
        }

        printBlank();
      } catch (error) {
        handleError(error);
      }
    });
}

function installLaunchd(bin: string, port: string): void {
  const logDir = getLogDir();
  const plistPath = getLaunchAgentPath();

  const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${PLIST_LABEL}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${bin}</string>
    <string>gateway</string>
    <string>start</string>
    <string>--port</string>
    <string>${port}</string>
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>${logDir}/gateway-stdout.log</string>
  <key>StandardErrorPath</key>
  <string>${logDir}/gateway-stderr.log</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key>
    <string>/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin</string>
  </dict>
</dict>
</plist>`;

  if (existsSync(plistPath)) {
    try { execSync(`launchctl unload "${plistPath}" 2>/dev/null`); } catch { /* ok */ }
  }

  writeFileSync(plistPath, plist);
  execSync(`launchctl load "${plistPath}"`);

  printBlank();
  printSuccess('Gateway daemon installed');
  printSuccess(`Starts on boot — runs in background`);
  printLine(`  ${pc.dim('Logs:')} ${logDir}/gateway.log`);
  printLine(`  ${pc.dim('Stop:')} t2000 gateway uninstall`);
  printBlank();
}

function uninstallLaunchd(): void {
  const plistPath = getLaunchAgentPath();

  if (!existsSync(plistPath)) {
    printWarning('Gateway daemon is not installed.');
    return;
  }

  try { execSync(`launchctl unload "${plistPath}" 2>/dev/null`); } catch { /* ok */ }
  unlinkSync(plistPath);

  printBlank();
  printSuccess('Gateway daemon removed');
  printBlank();
}

function installSystemd(bin: string, port: string): void {
  const logDir = getLogDir();
  const unitPath = getSystemdPath();
  const unitDir = join(homedir(), '.config', 'systemd', 'user');

  const unit = `[Unit]
Description=t2000 Gateway — AI Financial Advisor
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
ExecStart=${bin} gateway start --port ${port}
Restart=on-failure
RestartSec=10
StandardOutput=append:${logDir}/gateway-stdout.log
StandardError=append:${logDir}/gateway-stderr.log

[Install]
WantedBy=default.target
`;

  if (!existsSync(unitDir)) {
    execSync(`mkdir -p "${unitDir}"`);
  }

  writeFileSync(unitPath, unit);
  execSync('systemctl --user daemon-reload');
  execSync(`systemctl --user enable ${SYSTEMD_UNIT}`);
  execSync(`systemctl --user start ${SYSTEMD_UNIT}`);

  printBlank();
  printSuccess('Gateway daemon installed (systemd)');
  printSuccess('Starts on login — runs in background');
  printLine(`  ${pc.dim('Logs:')} ${logDir}/gateway.log`);
  printLine(`  ${pc.dim('Status:')} systemctl --user status ${SYSTEMD_UNIT}`);
  printLine(`  ${pc.dim('Stop:')} t2000 gateway uninstall`);
  printBlank();
}

function uninstallSystemd(): void {
  const unitPath = getSystemdPath();

  if (!existsSync(unitPath)) {
    printWarning('Gateway daemon is not installed.');
    return;
  }

  try { execSync(`systemctl --user stop ${SYSTEMD_UNIT} 2>/dev/null`); } catch { /* ok */ }
  try { execSync(`systemctl --user disable ${SYSTEMD_UNIT} 2>/dev/null`); } catch { /* ok */ }
  unlinkSync(unitPath);
  try { execSync('systemctl --user daemon-reload'); } catch { /* ok */ }

  printBlank();
  printSuccess('Gateway daemon removed');
  printBlank();
}
