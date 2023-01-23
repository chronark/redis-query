export type Field = string | number | boolean | null | Field[] | {
  [key: string]: Field;
};

export type Data = Record<string, Field>;

export type Meta<TData extends Data> = {
  id: string;
  ts: number;
  types: Record<keyof TData, Field>;
};

export type Document<TData extends Data> = TData & {
  _meta: Meta<TData>;
};

export type ArrToKeys<T extends unknown[]> = T[number];
