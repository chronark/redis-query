import type { Data, Document } from "./types.ts";
import type { Transaction } from "./db/interface.ts";
export enum Event {
  CREATE = "create",
  UPDATE = "update",
  DELETE = "delete",
}

export type Callback<TData extends Data> = (
  tx: Transaction,
  ...documents: Document<TData>[]
) => Promise<void>;

/**
 * Interceptor allos emitting and listening for events synchronously
 */
export class Interceptor<TData extends Data> {
  /**
   * map of {uuid -> callback}
   */
  private readonly callbacks: Record<Event, Record<string, Callback<TData>>>;

  constructor() {
    this.callbacks = {} as Record<Event, Record<string, Callback<TData>>>;
    for (const event of Object.values(Event)) {
      this.callbacks[event as Event] = {};
    }
  }

  /**
   * Returns a function that can be used to unregister the callback.
   */
  public listen(event: Event, callback: Callback<TData>): () => void {
    const id = crypto.randomUUID();

    this.callbacks[event][id] = callback;

    return () => {
      delete this.callbacks[event][id];
    };
  }

  public async emit(
    event: Event,
    tx: Transaction,
    ...documents: Document<TData>[]
  ) {
    await Promise.all(
      Object.values(this.callbacks[event]).map(async (cb) =>
        await cb(tx, ...documents)
      ),
    );
  }
}
