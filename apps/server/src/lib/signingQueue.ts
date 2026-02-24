type QueuedJob<T> = {
  execute: () => Promise<T>;
  resolve: (value: T) => void;
  reject: (error: unknown) => void;
};

const queue: QueuedJob<unknown>[] = [];
let processing = false;

async function processQueue(): Promise<void> {
  if (processing) return;
  processing = true;

  while (queue.length > 0) {
    const job = queue.shift()!;
    try {
      const result = await job.execute();
      job.resolve(result);
    } catch (err) {
      job.reject(err);
    }
  }

  processing = false;
}

export function enqueueSign<T>(execute: () => Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    queue.push({ execute, resolve, reject } as QueuedJob<unknown>);
    processQueue();
  });
}
