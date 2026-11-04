import type { Dialect } from "../shared/types";
import { ValidationError } from "../shared/errors";
import { quoteIdentifier, validateIdentifier } from "../shared/validation";

export type ColumnType =
  | "INT"
  | "INTEGER"
  | "BIGINT"
  | "SMALLINT"
  | "TINYINT"
  | "VARCHAR"
  | "CHAR"
  | "TEXT"
  | "DECIMAL"
  | "NUMERIC"
  | "FLOAT"
  | "DOUBLE"
  | "BOOLEAN"
  | "DATE"
  | "DATETIME"
  | "TIMESTAMP"
  | "JSON"
  | "BLOB"
  | "BYTEA"
  | string;

export interface ColumnDefinition {
  name: string;
  type: ColumnType;
  length?: number;
  precision?: number;
  scale?: number;
  nullable?: boolean;
  default?: string | number | boolean | null;
  primaryKey?: boolean;
  autoIncrement?: boolean;
  unique?: boolean;
  comment?: string;
}

export interface ForeignKeyDefinition {
  name?: string;
  columns: string[];
  referencedTable: string;
  referencedColumns: string[];
  onDelete?: "CASCADE" | "SET NULL" | "RESTRICT" | "NO ACTION";
  onUpdate?: "CASCADE" | "SET NULL" | "RESTRICT" | "NO ACTION";
}

export interface TableDefinition {
  name: string;
  columns: ColumnDefinition[];
  primaryKey?: string[]; // Composite primary key
  uniqueConstraints?: Array<{ name?: string; columns: string[] }>;
  foreignKeys?: ForeignKeyDefinition[];
  ifNotExists?: boolean;
  temporary?: boolean;
}

export interface TableValidationResult {
  valid: boolean;
  errors: string[];
}

export function validateTableDefinition(def: TableDefinition): TableValidationResult {
  const errors: string[] = [];

  try {
    validateIdentifier(def.name, "table");
  } catch (err) {
    errors.push(err instanceof Error ? err.message : `Invalid table name "${def.name}"`);
  }

  if (!Array.isArray(def.columns) || def.columns.length === 0) {
    errors.push("Table must have at least one column definition");
    return { valid: false, errors };
  }

  const columnNames = new Set<string>();
  let primaryKeyCount = 0;

  for (const col of def.columns) {
    try {
      validateIdentifier(col.name, "column");
    } catch (err) {
      errors.push(err instanceof Error ? err.message : `Invalid column name "${col.name}"`);
    }

    if (columnNames.has(col.name.toLowerCase())) {
      errors.push(`Duplicate column name "${col.name}"`);
    }
    columnNames.add(col.name.toLowerCase());

    if (col.primaryKey) {
      primaryKeyCount++;
    }
  }

  if (primaryKeyCount > 1 && !def.primaryKey) {
    errors.push(
      "Multiple columns marked as primaryKey. Use composite table-level primaryKey instead."
    );
  }

  if (def.primaryKey) {
    for (const pkCol of def.primaryKey) {
      if (!columnNames.has(pkCol.toLowerCase())) {
        errors.push(`Primary key column "${pkCol}" does not exist in table columns`);
      }
    }
  }

  if (def.uniqueConstraints) {
    for (const uc of def.uniqueConstraints) {
      for (const col of uc.columns) {
        if (!columnNames.has(col.toLowerCase())) {
          errors.push(`Unique constraint column "${col}" does not exist in table columns`);
        }
      }
    }
  }

  if (def.foreignKeys) {
    for (const fk of def.foreignKeys) {
      try {
        validateIdentifier(fk.referencedTable, "referencedTable");
      } catch (err) {
        errors.push(err instanceof Error ? err.message : `Invalid referenced table "${fk.referencedTable}"`);
      }
      for (const col of fk.columns) {
        if (!columnNames.has(col.toLowerCase())) {
          errors.push(`Foreign key column "${col}" does not exist in table columns`);
        }
      }
      if (fk.columns.length !== fk.referencedColumns.length) {
        errors.push("Foreign key column count must match referenced column count");
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

function formatDefaultValue(val: unknown, dialect: Dialect): string {
  if (val === null) return "DEFAULT NULL";
  if (typeof val === "boolean") {
    if (dialect === "sqlite") return `DEFAULT ${val ? 1 : 0}`;
    return `DEFAULT ${val ? "TRUE" : "FALSE"}`;
  }
  if (typeof val === "number") return `DEFAULT ${val}`;
  if (typeof val === "string") {
    const upper = val.toUpperCase().trim();
    if (
      upper === "CURRENT_TIMESTAMP" ||
      upper === "NOW()" ||
      upper === "CURRENT_DATE" ||
      upper === "NULL"
    ) {
      return `DEFAULT ${upper}`;
    }
    const escaped = val.replace(/'/g, "''");
    return `DEFAULT '${escaped}'`;
  }
  return `DEFAULT '${String(val)}'`;
}

function mapColumnType(col: ColumnDefinition, dialect: Dialect): string {
  const rawType = col.type.toUpperCase();

  // SQLite simple affinity mapping
  if (dialect === "sqlite") {
    if (col.autoIncrement) {
      return "INTEGER"; // SQLite requires INTEGER PRIMARY KEY AUTOINCREMENT
    }
    if (rawType.includes("INT")) return "INTEGER";
    if (rawType.includes("CHAR") || rawType.includes("TEXT") || rawType.includes("JSON")) return "TEXT";
    if (rawType.includes("BLOB") || rawType.includes("BYTEA")) return "BLOB";
    if (rawType.includes("REAL") || rawType.includes("FLOA") || rawType.includes("DOUB")) return "REAL";
    if (rawType.includes("NUMERIC") || rawType.includes("DECIMAL") || rawType.includes("BOOL")) return "NUMERIC";
    return rawType;
  }

  // PostgreSQL mappings
  if (dialect === "postgres") {
    if (col.autoIncrement) {
      if (rawType === "BIGINT") return "BIGINT GENERATED BY DEFAULT AS IDENTITY";
      return "INT GENERATED BY DEFAULT AS IDENTITY";
    }
    if (rawType === "DATETIME") return "TIMESTAMP";
    if (rawType === "TINYINT" || rawType === "MEDIUMINT") return "SMALLINT";
    if (rawType === "DOUBLE") return "DOUBLE PRECISION";
    if (rawType === "BLOB") return "BYTEA";
  }

  // MySQL mappings
  if (dialect === "mysql") {
    if (rawType === "BYTEA") return "BLOB";
  }

  // Parameterized types (length / precision, scale)
  if (col.length !== undefined && (rawType === "VARCHAR" || rawType === "CHAR")) {
    return `${rawType}(${col.length})`;
  }
  if (
    col.precision !== undefined &&
    (rawType === "DECIMAL" || rawType === "NUMERIC")
  ) {
    return col.scale !== undefined
      ? `${rawType}(${col.precision}, ${col.scale})`
      : `${rawType}(${col.precision})`;
  }

  return rawType;
}

export function generateCreateTable(def: TableDefinition, dialect: Dialect = "postgres"): string {
  const validation = validateTableDefinition(def);
  if (!validation.valid) {
    throw new ValidationError(`Invalid table definition: ${validation.errors.join("; ")}`, "tableDefinition");
  }

  const quotedTable = quoteIdentifier(def.name, dialect);
  const lines: string[] = [];

  const hasCompositePk = Array.isArray(def.primaryKey) && def.primaryKey.length > 0;

  for (const col of def.columns) {
    const colName = quoteIdentifier(col.name, dialect);
    const colType = mapColumnType(col, dialect);
    const parts = [colName, colType];

    if (dialect === "sqlite" && col.autoIncrement) {
      parts.push("PRIMARY KEY AUTOINCREMENT");
    } else {
      if (col.nullable === false) {
        parts.push("NOT NULL");
      } else if (col.nullable === true && dialect !== "sqlite") {
        parts.push("NULL");
      }

      if (col.default !== undefined) {
        parts.push(formatDefaultValue(col.default, dialect));
      }

      if (col.unique && !col.primaryKey) {
        parts.push("UNIQUE");
      }

      if (col.primaryKey && !hasCompositePk) {
        parts.push("PRIMARY KEY");
      }

      if (dialect === "mysql" && col.autoIncrement) {
        parts.push("AUTO_INCREMENT");
      }
    }

    lines.push(`  ${parts.join(" ")}`);
  }

  // Composite Primary Key
  if (hasCompositePk) {
    const pkCols = def.primaryKey!.map((c) => quoteIdentifier(c, dialect)).join(", ");
    lines.push(`  PRIMARY KEY (${pkCols})`);
  }

  // Unique Constraints
  if (def.uniqueConstraints) {
    for (const uc of def.uniqueConstraints) {
      const uCols = uc.columns.map((c) => quoteIdentifier(c, dialect)).join(", ");
      if (uc.name) {
        const uName = quoteIdentifier(uc.name, dialect);
        lines.push(`  CONSTRAINT ${uName} UNIQUE (${uCols})`);
      } else {
        lines.push(`  UNIQUE (${uCols})`);
      }
    }
  }

  // Foreign Keys
  if (def.foreignKeys) {
    for (const fk of def.foreignKeys) {
      const fkCols = fk.columns.map((c) => quoteIdentifier(c, dialect)).join(", ");
      const refTable = quoteIdentifier(fk.referencedTable, dialect);
      const refCols = fk.referencedColumns.map((c) => quoteIdentifier(c, dialect)).join(", ");

      let fkClause = "";
      if (fk.name) {
        fkClause += `CONSTRAINT ${quoteIdentifier(fk.name, dialect)} `;
      }
      fkClause += `FOREIGN KEY (${fkCols}) REFERENCES ${refTable} (${refCols})`;
      if (fk.onDelete) fkClause += ` ON DELETE ${fk.onDelete}`;
      if (fk.onUpdate) fkClause += ` ON UPDATE ${fk.onUpdate}`;

      lines.push(`  ${fkClause}`);
    }
  }

  const tempClause = def.temporary ? "TEMPORARY " : "";
  const ifNotExistsClause = def.ifNotExists ? "IF NOT EXISTS " : "";

  return `CREATE ${tempClause}TABLE ${ifNotExistsClause}${quotedTable} (\n${lines.join(",\n")}\n);`;
}
