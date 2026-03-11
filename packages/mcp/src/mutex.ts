export class TxMutex {
  private queue: Promise<void> = Promise.resolve();

  async run<T>(fn: () => Promise<T>): Promise<T> {
    let release: () => void;
    const next = new Promise<void>(r => { release = r; });
    const prev = this.queue;
    this.queue = next;
    await prev;
    try {
      return await fn();
    } finally {
      release!();
    }
  }
}
