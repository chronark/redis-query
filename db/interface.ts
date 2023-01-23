/**
 * DB is the interface that you need to implement to store, index and query your data.
 */
export interface DB {
  create: <T = unknown>(
    id: string,
    document: T,
    tx: Transaction,
  ) => void;
  read: <T = unknown>(id: string) => Promise<T | null>;
  delete: (id: string) => Promise<void>;
  smembers: (key: string) => Promise<string[]>;
  mget: <T = unknown>(ids: string[]) => Promise<T[]>;
  hmget: (key: string, ...fields: string[]) => Promise<string[]>;
  hgetall: (key: string) => Promise<string[]>;
  zrangebyscore(
    key: string,
    min: string | number,
    max: string | number,
  ): Promise<string[]>;

  tx: () => Transaction;
}

export interface Transaction {
  hset(key: string, kvs: Record<string, string>): Promise<void>;
  sadd(key: string, ...members: string[]): Promise<void>;
  srem(key: string, ...members: string[]): Promise<void>;
  del(key: string): Promise<void>;
  hmget(key: string, ...fields: string[]): Promise<(string | undefined)[]>;
  hgetall(key: string): void;
  zadd(key: string, score: number, member: string): Promise<void>;
  zrangebyscore(
    key: string,
    min: string | number,
    max: string | number,
  ): Promise<string[]>;

  commit(): Promise<void>;
}
