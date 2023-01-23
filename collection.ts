import type { Data, DataType, Document } from "./types.ts";
import { Index } from "./index.ts";
import { Range } from "./range.ts";
import { newId } from "./ids.ts";
import type { DB } from "./db/mod.ts";
import type { DotNotation } from "./dotNotation.ts";
import { Event, Interceptor } from "./pubsub.ts";

export class Collection<TData extends Data> {
  public readonly name: string;
  public readonly db: DB;
  private readonly interceptor = new Interceptor<TData>();

  constructor(name: string, db: DB) {
    this.name = name;
    this.db = db;
  }

  public prefix(id: string): string {
    return ["collection", this.name, id].join(":");
  }

  public createDocument = async (data: TData): Promise<{ id: string }> => {
    const document: Document<TData> = {
      ...data,
      _meta: {
        id: newId("document"),
        ts: Date.now(),
        types: {} as Record<keyof TData, DataType>,
      },
    };

    for (const [key, value] of Object.entries(data)) {
      document._meta.types[key as keyof TData] = typeof value as DataType;
    }
    const tx = this.db.tx();
    await this.interceptor.emit(Event.CREATE, tx, document);

    this.db.create(this.prefix(document._meta.id), document, tx);

    await tx.commit();
    return { id: document._meta.id };
  };

  public readDocument = async (id: string): Promise<Document<TData> | null> => {
    const document = await this.db.read<Document<TData>>(this.prefix(id));

    return document;
  };
  public updateDocument = async (
    id: string,
    data: Partial<TData>,
  ): Promise<Document<TData>> => {
    const existing = await this.readDocument(this.prefix(id));
    if (!existing) {
      throw new Error(`Document ${id} does not exist`);
    }
    const document = { ...existing, ...data };
    document._meta.ts = Date.now();
    const tx = this.db.tx();
    this.db.create(this.prefix(id), document, tx);

    await this.interceptor.emit(Event.UPDATE, tx, document);

    await tx.commit();
    return document;
  };

  public deleteDocument = async (id: string): Promise<void> => {
    const document = await this.db.read<Document<TData>>(this.prefix(id));
    if (!document) {
      return;
    }

    await this.db.delete(this.prefix(id));
    const tx = this.db.tx();
    await this.interceptor.emit(Event.DELETE, tx, document);

    await tx.commit();
  };

  public index<
    TTerms extends DotNotation<TData>[],
    TValues extends (keyof TData)[],
  >(
    config: {
      name: string;
      terms: TTerms;
      values?: TValues;
    },
  ): Index<TData, TTerms, TValues> {
    const index = new Index({
      name: config.name,
      collection: this,
      termFields: config.terms,
      db: this.db,
      values: config.values,
      interceptor: this.interceptor,
    });
    return index;
  }

  public range<
    TTerm extends DotNotation<TData>,
    TValues extends (keyof TData)[],
  >(
    config: {
      name: string;
      term: TTerm;
      values?: TValues;
    },
  ): Range<TData, TTerm, TValues> {
    return new Range({
      name: config.name,
      collection: this,
      term: config.term,
      db: this.db,
      values: config.values,
      interceptor: this.interceptor,
    });
  }
}
