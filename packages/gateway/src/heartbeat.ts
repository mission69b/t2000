import cron from 'node-cron';
import type { T2000 } from '@t2000/sdk';
import type { Channel } from './channels/types.js';
import type { GatewayConfig } from './config.js';

export interface HeartbeatTask {
  id: string;
  name: string;
  schedule: string;
  enabled: boolean;
  run(agent: T2000, context: HeartbeatContext): Promise<HeartbeatResult>;
}

export interface HeartbeatResult {
  message: string;
  silent?: boolean;
}

export interface HeartbeatContext {
  totalUsage: { inputTokens: number; outputTokens: number };
}

export class HeartbeatScheduler {
  private tasks: HeartbeatTask[] = [];
  private jobs: cron.ScheduledTask[] = [];
  private agent: T2000;
  private channels: Channel[];
  private running = false;
  private getUsage: () => { inputTokens: number; outputTokens: number };

  constructor(
    agent: T2000,
    channels: Channel[],
    getUsage: () => { inputTokens: number; outputTokens: number },
  ) {
    this.agent = agent;
    this.channels = channels;
    this.getUsage = getUsage;
  }

  registerTask(task: HeartbeatTask): void {
    this.tasks.push(task);
  }

  start(): void {
    if (this.running) return;
    this.running = true;

    for (const task of this.tasks) {
      if (!task.enabled) continue;

      const job = cron.schedule(task.schedule, async () => {
        try {
          const context: HeartbeatContext = { totalUsage: this.getUsage() };
          const result = await task.run(this.agent, context);

          if (!result.silent) {
            await this.pushToChannels(result.message);
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          console.error(`[heartbeat] ${task.name} failed: ${msg}`);
        }
      });

      this.jobs.push(job);
    }
  }

  stop(): void {
    this.running = false;
    for (const job of this.jobs) {
      job.stop();
    }
    this.jobs = [];
  }

  getTaskCount(): number {
    return this.tasks.filter(t => t.enabled).length;
  }

  private async pushToChannels(message: string): Promise<void> {
    for (const channel of this.channels) {
      try {
        await channel.send('heartbeat', message);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[heartbeat] Failed to push to ${channel.name}: ${msg}`);
      }
    }
  }
}

export function createDefaultTasks(config: GatewayConfig): HeartbeatTask[] {
  return [
    createMorningBriefingTask(config.heartbeat.morningBriefing),
    createYieldMonitorTask(config.heartbeat.yieldMonitor),
    createDcaExecutorTask(config.heartbeat.dcaExecutor),
    createHealthCheckTask(config.heartbeat.healthCheck),
  ];
}

function createMorningBriefingTask(config: { enabled: boolean; schedule: string }): HeartbeatTask {
  return {
    id: 'morning-briefing',
    name: 'Morning Briefing',
    schedule: config.schedule,
    enabled: config.enabled,
    async run(agent, context) {
      const balance = await agent.balance();
      const portfolio = await agent.getPortfolio();
      const earnings = await agent.earnings();

      const parts = ['☀️ *Good morning. Here\'s your daily briefing.*\n'];

      const total = balance.total;
      parts.push(`💰 *Net worth:* $${total.toFixed(2)}`);
      parts.push(`Checking: $${balance.available.toFixed(2)} · Savings: $${balance.savings.toFixed(2)}`);

      if (portfolio.positions.length > 0) {
        const pnl = portfolio.unrealizedPnL;
        const pnlSign = pnl >= 0 ? '+' : '';
        parts.push(`\nPortfolio: $${portfolio.totalValue.toFixed(2)} (${pnlSign}$${pnl.toFixed(2)})`);
        for (const p of portfolio.positions) {
          const earning = p.earning ? ` · ${(p.earningApy ?? 0).toFixed(1)}% on ${p.earningProtocol}` : '';
          parts.push(`  ${p.asset}: $${p.currentValue.toFixed(2)}${earning}`);
        }
      }

      if (earnings.totalYieldEarned > 0) {
        parts.push(`\nYield earned (24h): ~$${earnings.dailyEarning.toFixed(4)}`);
      }

      if (balance.debt > 0) {
        const health = await agent.healthFactor();
        parts.push(`\n⚠️ Debt: $${balance.debt.toFixed(2)} (health: ${health.healthFactor.toFixed(2)})`);
      }

      const costInput = context.totalUsage.inputTokens * 3 / 1_000_000;
      const costOutput = context.totalUsage.outputTokens * 15 / 1_000_000;
      const totalCost = costInput + costOutput;
      if (totalCost > 0.01) {
        parts.push(`\n🤖 AI usage: ~$${totalCost.toFixed(2)}`);
      }

      return { message: parts.join('\n') };
    },
  };
}

function createYieldMonitorTask(config: { enabled: boolean; schedule: string }): HeartbeatTask {
  return {
    id: 'yield-monitor',
    name: 'Yield Monitor',
    schedule: config.schedule,
    enabled: config.enabled,
    async run(agent) {
      // Check savings rebalance
      let savingsOpp = '';
      try {
        const savingsResult = await agent.rebalance({ dryRun: true });
        if (!savingsResult.executed && savingsResult.currentApy < savingsResult.newApy) {
          savingsOpp = `Your savings can earn ${savingsResult.newApy.toFixed(1)}% on ${savingsResult.toProtocol} ` +
            `(currently ${savingsResult.currentApy.toFixed(1)}% on ${savingsResult.fromProtocol}). ` +
            `Gain: +${(savingsResult.newApy - savingsResult.currentApy).toFixed(2)}%`;
        }
      } catch { /* no savings positions */ }

      // Check investment rebalance
      const investOpps: string[] = [];
      try {
        const investResult = await agent.investRebalance({ dryRun: true });
        for (const move of investResult.moves) {
          investOpps.push(
            `Your ${move.asset} is earning ${move.oldApy.toFixed(1)}% on ${move.fromProtocol}. ` +
            `${move.toProtocol} offers ${move.newApy.toFixed(1)}%. ` +
            `Want me to rebalance?`,
          );
        }
      } catch { /* no invest positions */ }

      const allOpps = [savingsOpp, ...investOpps].filter(Boolean);
      if (allOpps.length === 0) {
        return { message: '', silent: true };
      }

      return {
        message: '📈 *Yield opportunity found*\n\n' + allOpps.join('\n\n') + '\n\nReply "rebalance" to optimize.',
      };
    },
  };
}

function createDcaExecutorTask(config: { enabled: boolean; schedule: string }): HeartbeatTask {
  return {
    id: 'dca-executor',
    name: 'DCA Executor',
    schedule: config.schedule,
    enabled: config.enabled,
    async run(agent) {
      const status = agent.getAutoInvestStatus();
      const pending = status.pendingRuns;

      if (pending.length === 0) {
        return { message: '', silent: true };
      }

      try {
        const balance = await agent.balance();
        const totalNeeded = pending.reduce((sum, s) => sum + s.amount, 0);

        if (balance.available < totalNeeded) {
          return {
            message: `⚠️ *DCA scheduled but insufficient balance*\n\n` +
              `Available: $${balance.available.toFixed(2)}\n` +
              `Needed: $${totalNeeded.toFixed(2)}\n\n` +
              `Fund your wallet or adjust DCA amounts.`,
          };
        }

        const result = await agent.runAutoInvest();
        const executed = result.executed;

        if (executed.length === 0) {
          return { message: '', silent: true };
        }

        return {
          message: `✅ *DCA executed*\n\n` +
            executed.map(r =>
              `${r.strategy ?? r.asset ?? 'Unknown'}: $${r.amount.toFixed(2)}`).join('\n'),
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return { message: `⚠️ DCA execution failed: ${msg}` };
      }
    },
  };
}

function createHealthCheckTask(config: { enabled: boolean; schedule: string }): HeartbeatTask {
  return {
    id: 'health-check',
    name: 'Health Check',
    schedule: config.schedule,
    enabled: config.enabled,
    async run(agent) {
      const health = await agent.healthFactor();

      if (health.healthFactor === Infinity || health.healthFactor > 1.5) {
        return { message: '', silent: true };
      }

      if (health.healthFactor <= 1.2) {
        return {
          message: `🚨 *CRITICAL: Health factor ${health.healthFactor.toFixed(2)}*\n\n` +
            `Your borrow position is at risk of liquidation.\n` +
            `Reply "repay all" to repay debt, or "withdraw all" to reduce exposure.`,
        };
      }

      return {
        message: `⚠️ *Warning: Health factor ${health.healthFactor.toFixed(2)}*\n\n` +
          `Getting close to liquidation threshold (1.0).\n` +
          `Consider repaying some debt or adding more savings.`,
      };
    },
  };
}
