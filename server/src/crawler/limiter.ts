/** Hand-rolled concurrency pool — caps how many tasks run at once, no queue-length limit. */
export class ConcurrencyLimiter {
  private activeCount = 0;
  private readonly waiting: Array<() => void> = [];

  constructor(private readonly limit: number) {}

  async run<T>(task: () => Promise<T>): Promise<T> {
    await this.acquire();
    try {
      return await task();
    } finally {
      this.release();
    }
  }

  private acquire(): Promise<void> {
    if (this.activeCount < this.limit) {
      this.activeCount++;
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      this.waiting.push(() => {
        this.activeCount++;
        resolve();
      });
    });
  }

  private release(): void {
    this.activeCount--;
    const next = this.waiting.shift();
    if (next) next();
  }
}
