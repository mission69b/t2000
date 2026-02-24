import { password, confirm } from '@inquirer/prompts';

export async function askPassphrase(message = 'Enter passphrase:'): Promise<string> {
  const value = await password({ message });
  if (!value || value.length < 8) {
    throw new Error('Passphrase must be at least 8 characters');
  }
  return value;
}

export async function askPassphraseConfirm(): Promise<string> {
  const pass = await password({ message: 'Create passphrase (min 8 chars):' });
  if (!pass || pass.length < 8) {
    throw new Error('Passphrase must be at least 8 characters');
  }

  const confirm_ = await password({ message: 'Confirm passphrase:' });
  if (pass !== confirm_) {
    throw new Error('Passphrases do not match');
  }

  return pass;
}

export async function askConfirm(message: string): Promise<boolean> {
  return confirm({ message });
}

export function getPassphraseFromEnv(): string | undefined {
  return process.env.T2000_PASSPHRASE;
}
