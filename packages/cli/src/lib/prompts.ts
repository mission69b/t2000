// Greenfield prompts module — confirm + hidden input. No PIN, no
// passphrase. `askHidden` is used by `t2 init --import` for the
// interactive Bech32 paste flow (terminal echo suppressed so the
// secret doesn't appear in shell history or screen scroll).

import { password, confirm } from '@inquirer/prompts';

export async function askConfirm(message: string, defaultValue = false): Promise<boolean> {
  return confirm({ message, default: defaultValue });
}

export async function askHidden(message: string): Promise<string> {
  return password({ message });
}
