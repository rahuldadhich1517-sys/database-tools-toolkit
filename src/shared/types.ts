export type Dialect = "postgres" | "mysql" | "sqlite";

export type SQLParamValue =
  | string
  | number
  | boolean
  | bigint
  | null
  | Date
  | Record<string, unknown>
  | unknown[];

export interface ParameterizedQuery {
  query: string;
  values: SQLParamValue[];
}
