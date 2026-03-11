import type { Command } from 'commander';
import { ContactManager, truncateAddress } from '@t2000/sdk';
import { printSuccess, printError, printHeader, printLine, printBlank, printJson, isJsonMode, handleError } from '../output.js';

export function registerContacts(program: Command) {
  const contacts = program
    .command('contacts')
    .description('Manage contacts (send by name instead of address)');

  contacts
    .command('add <name> <address>')
    .description('Add or update a contact')
    .action((name: string, address: string) => {
      try {
        const manager = new ContactManager();
        const result = manager.add(name, address);

        if (isJsonMode()) {
          const contact = manager.get(name)!;
          printJson({ action: result.action, name: contact.name, address: contact.address });
          return;
        }

        const contact = manager.get(name)!;
        printBlank();
        printSuccess(`${result.action === 'added' ? 'Added' : 'Updated'} ${contact.name} (${truncateAddress(contact.address)})`);
        printBlank();
      } catch (error) {
        handleError(error);
      }
    });

  contacts
    .command('remove <name>')
    .description('Remove a contact')
    .action((name: string) => {
      try {
        const manager = new ContactManager();
        const removed = manager.remove(name);

        if (isJsonMode()) {
          printJson({ removed, name });
          return;
        }

        printBlank();
        if (removed) {
          printSuccess(`Removed ${name}`);
        } else {
          printError(`Contact "${name}" not found`);
        }
        printBlank();
      } catch (error) {
        handleError(error);
      }
    });

  contacts
    .command('list', { isDefault: true })
    .description('List all contacts')
    .action(() => {
      try {
        const manager = new ContactManager();
        const list = manager.list();

        if (isJsonMode()) {
          printJson(list);
          return;
        }

        if (list.length === 0) {
          printBlank();
          printLine('No contacts yet.');
          printLine('Add one: t2000 contacts add Tom 0x...');
          printBlank();
          return;
        }

        printHeader('Contacts');

        const maxNameLen = Math.max(...list.map((c) => c.name.length));
        for (const contact of list) {
          const padded = contact.name.padEnd(maxNameLen + 4);
          printLine(`${padded}${truncateAddress(contact.address)}`);
        }

        printBlank();
      } catch (error) {
        handleError(error);
      }
    });
}
