import type { Dialect, ParameterizedQuery, SQLParamValue } from "../shared/types";
import { ValidationError } from "../shared/errors";
import { quoteIdentifier, validateIdentifier } from "../shared/validation";
import { getPlaceholder } from "../shared/sql-placeholders";

export interface InsertInput {
  table: string;
  rows: Record<string, unknown> | Array<Record<string, unknown>>;
  columns?: string[];
  dialect?: Dialect;
}

export interface BulkInsertInput extends InsertInput {
  batchSize?: number;
}

function sanitizeValue(val: unknown): SQLParamValue {
  if (val === undefined || val === null) {
    return null;
  }
  if (
    typeof val === "string" ||
    typeof val === "number" ||
    typeof val === "boolean" ||
    typeof val === "bigint"
  ) {
    return val;
  }
  if (val instanceof Date) {
    return val.toISOString();
  }
  if (typeof val === "object") {
    return JSON.stringify(val);
  }
  return String(val);
}

export function generateInsertSQL(input: InsertInput): ParameterizedQuery {
  const { table, dialect = "postgres" } = input;
  validateIdentifier(table, "table");

  const rowList = Array.isArray(input.rows) ? input.rows : [input.rows];
  if (rowList.length === 0) {
    throw new ValidationError("Cannot generate INSERT statement: rows array is empty", "rows");
  }

  // Derive column list
  let columns = input.columns;
  if (!columns || columns.length === 0) {
    const colSet = new Set<string>();
    for (const r of rowList) {
      if (typeof r !== "object" || r === null) {
        throw new ValidationError("Each row must be a non-null object", "rows");
      }
      for (const k of Object.keys(r)) {
        colSet.add(k);
      }
    }
    columns = Array.from(colSet);
  }

  if (columns.length === 0) {
    throw new ValidationError(
      "Cannot generate INSERT statement: no columns found or specified",
      "columns"
    );
  }

  for (const col of columns) {
    validateIdentifier(col, "column");
  }

  const quotedTable = quoteIdentifier(table, dialect);
  const quotedCols = columns.map((col) => quoteIdentifier(col, dialect)).join(", ");

  const values: SQLParamValue[] = [];
  const valueTuples: string[] = [];
  let paramIndex = 1;

  for (const row of rowList) {
    if (typeof row !== "object" || row === null) {
      throw new ValidationError("Row must be an object", "rows");
    }
    const tuplePlaceholders: string[] = [];
    for (const col of columns) {
      const val = (row as Record<string, unknown>)[col];
      values.push(sanitizeValue(val));
      tuplePlaceholders.push(getPlaceholder(paramIndex++, dialect));
    }
    valueTuples.push(`(${tuplePlaceholders.join(", ")})`);
  }

  const query = `INSERT INTO ${quotedTable} (${quotedCols}) VALUES ${valueTuples.join(", ")}`;
  return { query, values };
}

export function generateBulkInsertSQL(input: BulkInsertInput): ParameterizedQuery[] {
  const rowList = Array.isArray(input.rows) ? input.rows : [input.rows];
  if (rowList.length === 0) {
    throw new ValidationError("Cannot generate bulk INSERT: rows array is empty", "rows");
  }

  const batchSize = input.batchSize && input.batchSize > 0 ? input.batchSize : 1000;
  const batches: ParameterizedQuery[] = [];

  for (let i = 0; i < rowList.length; i += batchSize) {
    const chunk = rowList.slice(i, i + batchSize);
    batches.push(
      generateInsertSQL({
        table: input.table,
        rows: chunk,
        columns: input.columns,
        dialect: input.dialect,
      })
    );
  }

  return batches;
}
