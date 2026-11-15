export class SerialQueue {
  private tail: Promise<void> = Promise.resolve();

  async run<T>(operation: () => Promise<T>): Promise<T> {
    const previous = this.tail;
    const { promise, resolve } = Promise.withResolvers<undefined>();
    this.tail = promise;

    await previous;

    try {
      return await operation();
    } finally {
      resolve(undefined);
    }
  }
}
