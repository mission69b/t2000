// Greenfield prompts module — confirm-only. No PIN, no passphrase, no
// hidden input (the v4 CLI doesn't prompt for secrets).

import { confirm } from '@inquirer/prompts';

export async function askConfirm(message: string, defaultValue = false): Promise<boolean> {
  return confirm({ message, default: defaultValue });
}
