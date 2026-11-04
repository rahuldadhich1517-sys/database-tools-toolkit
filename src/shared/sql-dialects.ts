import type { Dialect } from "./types";

export interface DialectConfig {
  name: Dialect;
  quoteChar: string;
  closeQuoteChar: string;
  parameterStyle: "numbered" | "positional"; // $1 or ?
  supportsSchemas: boolean;
  supportsRightJoin: boolean;
}

export const DIALECT_CONFIGS: Record<Dialect, DialectConfig> = {
  postgres: {
    name: "postgres",
    quoteChar: '"',
    closeQuoteChar: '"',
    parameterStyle: "numbered",
    supportsSchemas: true,
    supportsRightJoin: true,
  },
  mysql: {
    name: "mysql",
    quoteChar: "`",
    closeQuoteChar: "`",
    parameterStyle: "positional",
    supportsSchemas: true,
    supportsRightJoin: true,
  },
  sqlite: {
    name: "sqlite",
    quoteChar: '"',
    closeQuoteChar: '"',
    parameterStyle: "positional",
    supportsSchemas: false,
    supportsRightJoin: false, // SQLite historically lacks RIGHT JOIN (added only in very recent 3.39+), standard SQLite tooling avoids it or warns
  },
};

export function isSupportedDialect(dialect: string): dialect is Dialect {
  return dialect === "postgres" || dialect === "mysql" || dialect === "sqlite";
}
