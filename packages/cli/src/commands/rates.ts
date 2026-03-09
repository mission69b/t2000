import type { Command } from 'commander';
import pc from 'picocolors';
import { T2000, STABLE_ASSETS, SUPPORTED_ASSETS } from '@t2000/sdk';
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

          const display = SUPPORTED_ASSETS[asset]?.displayName ?? asset;
          printLine(pc.bold(display));
          printDivider();
          for (const entry of assetRates) {
            printKeyValue(entry.protocol, `Save ${entry.rates.saveApy.toFixed(2)}%  Borrow ${entry.rates.borrowApy.toFixed(2)}%`);
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
