// [SPEC_AGENT_WALLET_GREENFIELD Phase A Day 1 — 2026-05-26]
// Greenfield prompts module — confirm + hidden-input only. No PIN, no
// passphrase, no session caching. Old `src/prompts.ts` stays in place
// for now (old commands depend on it); it gets deleted in Day 5+ when
// every command is on the new helper.

import { password, confirm, input } from '@inquirer/prompts';

export async function askConfirm(message: string, defaultValue = false): Promise<boolean> {
  return confirm({ message, default: defaultValue });
}

export async function askHidden(message: string): Promise<string> {
  return password({ message });
}

export async function askText(message: string, defaultValue?: string): Promise<string> {
  return input({ message, default: defaultValue });
}
