import type { Data, Document } from "./types.ts";
import type { DB } from "./db/mod.ts";
import type { Transaction } from "./db/mod.ts";
import { Collection } from "./collection.ts";
import type { DotNotation } from "./dotNotation.ts";
import { Event, Interceptor } from "./pubsub.ts";

export class Range<
  TData extends Data,
  TTerm extends DotNotation<TData>,
  TValues extends (keyof TData)[],
> {
  public readonly name: string;
  private readonly collection: Collection<TData>;
  private readonly term: TTerm;
  private readonly values: TValues | null;

  private readonly db: DB;

  private readonly interceptor: Interceptor<TData>;
  constructor({
    name,
    collection,
    term,
    db,
    values,
    interceptor,
  }: {
    name: string;
    collection: Collection<TData>;
    term: TTerm;
    db: DB;
    unique?: boolean;
    values?: TValues;
    interceptor: Interceptor<TData>;
  }) {
    this.db = db;
    this.name = name;
    this.collection = collection;
    this.term = term;
    this.values = values ?? null;
    this.interceptor = interceptor;

    this.interceptor.listen(
      Event.CREATE,
      async (tx: Transaction, ...docs: Document<TData>[]) => {
        await this.index(tx, docs);
      },
    );

    this.interceptor.listen(
      Event.UPDATE,
      async (tx: Transaction, ...docs: Document<TData>[]) => {
        await this.removeFromIndex(tx, docs.map((doc) => doc._meta.id));
        await this.index(tx, docs);
      },
    );

    this.interceptor.listen(
      Event.DELETE,
      async (tx: Transaction, ...docs: Document<TData>[]) => {
        await this.removeFromIndex(tx, docs.map((doc) => doc._meta.id));
      },
    );
  }

  public removeFromIndex = async (
    tx: Transaction,
    ids: string[],
  ): Promise<void> => {
    /**
     * Load all hashes that are in the index
     */
    await Promise.all(ids.map(async (id) => {
      const forwardIndexKey = this.prefix("forward", id);
      const hashes = await this.db.smembers(forwardIndexKey);

      tx.del(forwardIndexKey);
      for (const hash of hashes) {
        const reverseIndexKey = this.prefix("reverse", hash);
        tx.srem(reverseIndexKey, id);
      }
    }));
  };

  public prefix(...s: string[]): string {
    return ["collection", this.collection.name, "range", this.term].concat(s)
      .join(":");
  }

  public index = (tx: Transaction, documents: Document<TData>[]) => {
    for (const document of documents) {
      const documentId = document._meta.id;
      let score = document as any;
      for (const key of this.term.split(".")) {
        score = score[key];
      }

      tx.zadd(this.prefix(), score, documentId);
    }
  };

  public range = async (query: {
    min: number;
    max: number;
  }): Promise<Document<TData>[]> => {
    const ids = await this.db.zrangebyscore(
      this.prefix(),
      query.min,
      query.max,
    );
    if (ids.length === 0) {
      return [];
    }

    const documents: Document<TData>[] = await Promise.all(
      ids.map(async (id) => {
        const key = this.collection.prefix(id);

        const doc: Document<TData> = {} as Document<TData>;

        if (this.values) {
          const res = await this.db.hmget(key, ...this.values as string[]);
          for (let i = 0; i < this.values.length; i++) {
            const field = this.values[i];
            const value = res[i];
            doc[field] = value as any;
          }
        } else {
          const res = await this.db.hgetall(key);

          if (res.length === 0) {
            throw new Error("No response from db");
          }

          while (res.length >= 2) {
            const key = res.shift() as keyof TData;
            const value = res.shift()!;

            doc[key] = value as any;
          }
        }
        return doc;
      }),
    );

    return documents;
  };
}
