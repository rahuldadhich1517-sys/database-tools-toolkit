import type { Dialect } from "./types";
import { DIALECT_CONFIGS } from "./sql-dialects";

export function getPlaceholder(oneBasedIndex: number, dialect: Dialect): string {
  const config = DIALECT_CONFIGS[dialect];
  if (!config) {
    throw new Error(`Unsupported dialect: ${dialect}`);
  }
  return config.parameterStyle === "numbered" ? `$${oneBasedIndex}` : "?";
}
