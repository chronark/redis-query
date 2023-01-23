/**
 * Given type A, this returns an array representation of all paths in A.
 *
 * type A = { a: { b: string, c: number } }
 * => ["a", "b"] | ["a", "c"]
 */
type NestedPaths<T> = T extends (string | number | boolean) ? [] : {
  [K in Extract<keyof T, string>]: [K, ...NestedPaths<T[K]>];
}[Extract<keyof T, string>];

/**
 * Joins an array of strings, separated by `.`
 *
 * type A =  ["a", "b"] | ["a", "c"]
 * => "a.b" | "a.c"
 */
type Join<T> = T extends [] ? never
  : T extends [infer F] ? F
  : T extends [infer F, ...infer R]
    ? F extends string ? `${F}.${Join<Extract<R, string[]>>}` : never
  : string;

export type DotNotation<T extends Record<string, unknown>> = Join<
  NestedPaths<T>
>;
