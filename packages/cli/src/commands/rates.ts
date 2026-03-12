import type { Command } from 'commander';
import pc from 'picocolors';
import { T2000, SUPPORTED_ASSETS } from '@t2000/sdk';
import type { SupportedAsset } from '@t2000/sdk';

const STABLE_ASSETS = (Object.keys(SUPPORTED_ASSETS) as SupportedAsset[]).filter(k => !['SUI', 'BTC', 'ETH'].includes(k));
const INVEST_ASSETS: SupportedAsset[] = ['SUI', 'ETH', 'BTC'];
import { resolvePin } from '../prompts.js';
import { printKeyValue, printBlank, printJson, isJsonMode, handleError, printInfo, printLine, printDivider } from '../output.js';

export function registerRates(program: Command) {
  program
    .command('rates')
    .description('Show current APY rates across protocols and stablecoins')
    .option('--key <path>', 'Key file path')
    .action(async (opts) => {
      try {
        const pin = await resolvePin();
        const agent = await T2000.create({ pin, keyPath: opts.key });

        const allRates = await agent.allRatesAcrossAssets();

        if (isJsonMode()) {
          printJson(allRates);
          return;
        }

        printBlank();

        if (allRates.length > 0) {
          const best = allRates.reduce((a, b) => b.rates.saveApy > a.rates.saveApy ? b : a);
          const bestDisplay = SUPPORTED_ASSETS[best.asset as keyof typeof SUPPORTED_ASSETS]?.displayName ?? best.asset;
          printLine(pc.bold(pc.green(`Best yield: ${best.rates.saveApy.toFixed(2)}% APY`)) + pc.dim(` (${bestDisplay} on ${best.protocol})`));
          printBlank();
        }

        for (const asset of STABLE_ASSETS) {
          const assetRates = allRates.filter(r => r.asset === asset);
          if (assetRates.length === 0) continue;

          const display = SUPPORTED_ASSETS[asset as keyof typeof SUPPORTED_ASSETS]?.displayName ?? asset;
          printLine(pc.bold(display));
          printDivider();
          for (const entry of assetRates) {
            printKeyValue(entry.protocol, `Save ${entry.rates.saveApy.toFixed(2)}%  Borrow ${entry.rates.borrowApy.toFixed(2)}%`);
          }
          printBlank();
        }

        const investRates = allRates.filter(r => INVEST_ASSETS.includes(r.asset as SupportedAsset));
        if (investRates.length > 0) {
          printLine(pc.bold('Investment Assets'));
          printDivider();
          for (const asset of INVEST_ASSETS) {
            const assetRates = investRates.filter(r => r.asset === asset);
            if (assetRates.length === 0) continue;
            const display = SUPPORTED_ASSETS[asset]?.displayName ?? asset;
            for (const entry of assetRates) {
              printKeyValue(`${display} (${entry.protocol})`, `Lend ${entry.rates.saveApy.toFixed(2)}%`);
            }
          }
          printBlank();
        }

        if (allRates.length === 0) {
          printInfo('No protocol rates available');
          printBlank();
        }
      } catch (error) {
        handleError(error);
      }
    });
}
