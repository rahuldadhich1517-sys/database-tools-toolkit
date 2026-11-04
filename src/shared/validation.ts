import type { Dialect } from "./types";
import { InvalidIdentifierError, ValidationError } from "./errors";
import { DIALECT_CONFIGS } from "./sql-dialects";

const IDENTIFIER_REGEX = /^[a-zA-Z_][a-zA-Z0-9_$]*$/;

export function isValidIdentifierName(name: string): boolean {
  if (!name || typeof name !== "string" || name.length > 128) {
    return false;
  }
  return IDENTIFIER_REGEX.test(name);
}

export function validateIdentifier(name: string, context = "identifier"): void {
  if (!name || typeof name !== "string") {
    throw new InvalidIdentifierError(`Invalid ${context}: must be a non-empty string`, String(name));
  }

  // If compound (e.g. "users.id"), validate each segment
  const parts = name.split(".");
  for (const part of parts) {
    const trimmed = part.trim();
    if (!trimmed) {
      throw new InvalidIdentifierError(`Invalid ${context}: contains empty identifier segment`, name);
    }
    // Check if wrapped in quotes already
    if (
      (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
      (trimmed.startsWith("`") && trimmed.endsWith("`")) ||
      (trimmed.startsWith("[") && trimmed.endsWith("]"))
    ) {
      const inner = trimmed.slice(1, -1);
      if (inner.includes("\0") || inner.length === 0) {
        throw new InvalidIdentifierError(`Invalid ${context}: contains invalid quoted identifier segment`, name);
      }
      continue;
    }

    if (!isValidIdentifierName(trimmed)) {
      throw new InvalidIdentifierError(
        `Invalid ${context}: "${trimmed}" contains invalid characters. Identifiers must match /^[a-zA-Z_][a-zA-Z0-9_$]*$/`,
        name
      );
    }
  }
}

export function quoteIdentifier(name: string, dialect: Dialect): string {
  validateIdentifier(name, "identifier");
  const config = DIALECT_CONFIGS[dialect];
  const q = config.quoteChar;
  const cq = config.closeQuoteChar;

  const parts = name.split(".");
  return parts
    .map((part) => {
      let raw = part.trim();
      if (
        (raw.startsWith('"') && raw.endsWith('"')) ||
        (raw.startsWith("`") && raw.endsWith("`")) ||
        (raw.startsWith("[") && raw.endsWith("]"))
      ) {
        raw = raw.slice(1, -1);
      }
      // Escape quote char inside
      const escaped = raw.split(cq).join(cq + cq);
      return `${q}${escaped}${cq}`;
    })
    .join(".");
}

export function assertNonEmptyString(value: unknown, fieldName: string): asserts value is string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new ValidationError(`Field "${fieldName}" must be a non-empty string`, fieldName);
  }
}

export function assertArray(value: unknown, fieldName: string): asserts value is unknown[] {
  if (!Array.isArray(value)) {
    throw new ValidationError(`Field "${fieldName}" must be an array`, fieldName);
  }
}
