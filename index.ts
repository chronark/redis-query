import type { ArrToKeys, Data, Document, Field, Meta } from "./types.ts";
import type { DB } from "./db/mod.ts";
import type { Transaction } from "./db/mod.ts";
import { Collection } from "./collection.ts";
import type { DotNotation } from "./dotNotation.ts";
import { Event, Interceptor } from "./pubsub.ts";

export class Index<
  TData extends Data,
  TTerms extends DotNotation<TData>[],
  TValues extends (keyof TData)[],
> {
  public readonly name: string;
  private readonly collection: Collection<TData>;
  private readonly termFields: TTerms;
  private readonly values: TValues | null;

  private readonly db: DB;
  private readonly unique: boolean;

  private readonly interceptor: Interceptor<TData>;
  constructor({
    name,
    collection,
    termFields,
    db,
    unique,
    values,
    interceptor,
  }: {
    name: string;
    collection: Collection<TData>;
    termFields: TTerms;
    db: DB;
    unique?: boolean;
    values?: TValues;
    interceptor: Interceptor<TData>;
  }) {
    this.db = db;
    this.name = name;
    this.collection = collection;
    this.termFields = termFields;
    this.unique = unique ?? false;
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
    return ["collection", this.collection.name, "index", this.name].concat(s)
      .join(":");
  }

  private hashTerms = async (
    terms: Record<ArrToKeys<TTerms>, unknown>,
  ): Promise<string> => {
    const keys = Object.keys(terms).sort() as TTerms;
    const bufs: Uint8Array[] = [];
    for (const key of keys) {
      // const value = path.reduce((acc, key) => acc[key], terms);
      bufs.push(new TextEncoder().encode(key as string));
      bufs.push(new TextEncoder().encode(terms[key]!.toString()));
    }
    const buf = new Uint8Array(bufs.reduce((acc, b) => acc + b.length, 0));
    let offset = 0;
    for (const b of bufs) {
      buf.set(b, offset);
      offset += b.length;
    }

    const hash = await crypto.subtle.digest("SHA-256", buf);
    return Array.from(new Uint8Array(hash)).map((b) =>
      b.toString(16).padStart(2, "0")
    ).join("");
  };

  public index = async (tx: Transaction, documents: Document<TData>[]) => {
    for (const document of documents) {
      const terms = this.termFields.reduce((acc, field) => {
        let v: any = document;

        for (const key of field.split(".")) {
          v = v[key];
        }
        acc[field] = v as any;
        return acc;
      }, {} as TData);
      const hash = await this.hashTerms(terms);
      const documentId = document._meta.id;

      tx.sadd(this.prefix("forward", documentId), hash);
      tx.sadd(this.prefix("reverse", hash), documentId);
    }
  };

  public match = async (
    matches: Record<ArrToKeys<TTerms>, Field>,
  ): Promise<Document<Pick<TData, TValues[number]>>[]> => {
    const key = await this.hashTerms(matches);
    const ids = await this.db.smembers(this.prefix("reverse", key));
    if (ids.length === 0) {
      return [];
    }

    const documents = await Promise.all(
      ids.map(async (id) => {
        const key = this.collection.prefix(id);

        const raw = {} as Record<keyof Document<TData>, string>;
        if (this.values) {
          const res = await this.db.hmget(
            key,
            "_meta",
            ...this.values as string[],
          );
          console.log({ res });

          raw._meta = res[0];
          for (let i = 0; i < this.values.length; i++) {
            const field = this.values[i];
            const value = res[i + 1];
            console.log({ i, field, value });
            raw[field] = value;
          }
        } else {
          const res = await this.db.hgetall(key);

          if (res.length === 0) {
            throw new Error("No response from db");
          }

          while (res.length >= 2) {
            const key = res.shift() as keyof TData;
            const value = res.shift()!;

            raw[key] = value as any;
          }
        }

        console.log({ raw });
        const meta = JSON.parse(raw._meta) as Meta<TData>;
        const doc = {};
        for (const [key, value] of Object.entries(raw)) {
          console.log({ key, value, meta, type: meta.types[key] });
          if (meta.types[key] === "string") {
            doc[key] = value;
          } else {
            doc[key] = JSON.parse(value);
          }
        }

        return doc as Document<TData>;
      }),
    );

    return documents;
  };
}
