import type { DB, Transaction } from "./interface.ts";
import type {
  Redis as Client,
  RedisConnectOptions,
  RedisPipeline,
} from "https://deno.land/x/redis@v0.26.0/mod.ts";
import { connect } from "https://deno.land/x/redis@v0.26.0/mod.ts";

import { EncoderDecoder, Json } from "../encoding.ts";

export class TcpRedis implements DB {
  private client: Client;

  private readonly encoderDecoder: EncoderDecoder = new Json();
  constructor(client: Client) {
    this.client = client;
  }

  static async connect(connectOptions: RedisConnectOptions): Promise<TcpRedis> {
    return new TcpRedis(await connect(connectOptions));
  }

  public create<TDocument = unknown>(
    id: string,
    data: TDocument,
    tx: Transaction,
  ) {
    const kv: Record<string, string> = {};
    for (const key in data) {
      kv[key] = this.encoderDecoder.encode(data[key]);
    }

    tx.hset(id, kv);
  }

  public async read<TDocument = unknown>(id: string) {
    const res = await this.client.hgetall(id);
    if (res.length === 0) {
      return null;
    }
    const data: Record<string, unknown> = {};
    while (res.length >= 2) {
      const key = res.shift()!;
      const value = res.shift()!;

      data[key] = this.encoderDecoder.decode(value);
    }

    return data as TDocument;
  }

  public async update<TDocument = unknown>(
    id: string,
    data: Partial<TDocument>,
  ) {
    const existing = await this.client.get(id);
    if (!existing) {
      throw new Error("Document does not exist");
    }

    const dec = this.encoderDecoder.decode<TDocument>(existing);
    const updated = { ...dec, ...data };
    await this.client.set(id, this.encoderDecoder.encode(updated));
    return updated;
  }
  public async delete(id: string) {
    const tx = this.client.pipeline();
    tx.del(id);
    await tx.flush();
  }

  public async smembers(key: string) {
    return await this.client.smembers(key);
  }

  public async mget<T = string>(keys: string[]): Promise<T[]> {
    const res = await this.client.mget(...keys);
    return res.filter((v) => !!v).map((v) =>
      this.encoderDecoder.decode<T>(v as string)
    );
  }

  public async hmget(key: string, ...fields: string[]) {
    const res = await this.client.hmget(key, ...fields);

    return res.filter((v) => !!v) as string[];
  }

  public async hgetall(key: string) {
    const res = await this.client.hgetall(key);
    return res.filter((v) => !!v) as string[];
  }
  public async zrangebyscore(
    key: string,
    min: string | number,
    max: string | number,
  ): Promise<string[]> {
    return await this.client.zrangebyscore(key, min, max);
  }
  public tx(): Transaction {
    return new Tx(this.client);
  }
}

class Tx implements Transaction {
  private readonly tx: RedisPipeline;

  constructor(client: Client) {
    this.tx = client.tx();
  }

  public async hset(key: string, kv: Record<string, string>): Promise<void> {
    await this.tx.hset(key, ...Object.entries(kv));
  }

  public async hmget(
    key: string,
    ...fields: string[]
  ): Promise<(string | undefined)[]> {
    return await this.tx.hmget(key, ...fields);
  }

  public hgetall(key: string): void {
    this.tx.hgetall(key);
  }
  public async sadd(key: string, ...members: string[]): Promise<void> {
    await this.tx.sadd(key, ...members);
  }

  public async srem(key: string, ...members: string[]): Promise<void> {
    await this.tx.srem(key, ...members);
  }
  public async del(key: string): Promise<void> {
    await this.tx.del(key);
  }
  public async zadd(key: string, score: number, member: string): Promise<void> {
    await this.tx.zadd(key, score, member);
  }
  public async zrangebyscore(
    key: string,
    min: string | number,
    max: string | number,
  ): Promise<string[]> {
    return await this.tx.zrangebyscore(key, min, max);
  }

  public async commit(): Promise<void> {
    await this.tx.flush();
  }
}
