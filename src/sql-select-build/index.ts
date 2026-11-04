import type { Dialect, ParameterizedQuery, SQLParamValue } from "../shared/types";
import { ValidationError, UnsupportedSyntaxError } from "../shared/errors";
import { quoteIdentifier, validateIdentifier } from "../shared/validation";
import { getPlaceholder } from "../shared/sql-placeholders";

export type ComparisonOperator =
  | "="
  | "!="
  | "<>"
  | ">"
  | "<"
  | ">="
  | "<="
  | "LIKE"
  | "NOT LIKE"
  | "ILIKE"
  | "NOT ILIKE"
  | "IN"
  | "NOT IN"
  | "BETWEEN"
  | "IS NULL"
  | "IS NOT NULL";

export interface SimpleCondition {
  field: string;
  operator: ComparisonOperator;
  value?: unknown;
}

export interface CompoundCondition {
  and?: Condition[];
  or?: Condition[];
}

export type Condition = SimpleCondition | CompoundCondition;

export interface JoinClause {
  type?: "INNER" | "LEFT" | "RIGHT" | "CROSS";
  table: string;
  alias?: string;
  on: Condition | Condition[];
}

export interface OrderByClause {
  column: string;
  direction?: "ASC" | "DESC";
  nulls?: "FIRST" | "LAST";
}

export interface ColumnSelect {
  column: string;
  alias?: string;
}

export interface SelectQueryConfig {
  from: string;
  alias?: string;
  columns?: Array<string | ColumnSelect>;
  distinct?: boolean;
  joins?: JoinClause[];
  where?: Condition | Condition[];
  groupBy?: string[];
  having?: Condition | Condition[];
  orderBy?: Array<string | OrderByClause>;
  limit?: number;
  offset?: number;
  dialect?: Dialect;
}

export interface QueryValidationResult {
  valid: boolean;
  errors: string[];
}

const VALID_OPERATORS = new Set<string>([
  "=", "!=", "<>", ">", "<", ">=", "<=",
  "LIKE", "NOT LIKE", "ILIKE", "NOT ILIKE",
  "IN", "NOT IN", "BETWEEN", "IS NULL", "IS NOT NULL"
]);

export function validateSelectQuery(config: SelectQueryConfig): QueryValidationResult {
  const errors: string[] = [];

  if (!config.from || typeof config.from !== "string") {
    errors.push("Missing or invalid 'from' table specification");
  } else {
    try {
      validateIdentifier(config.from, "from table");
    } catch (err) {
      errors.push(err instanceof Error ? err.message : `Invalid from table: ${config.from}`);
    }
  }

  if (config.alias) {
    try {
      validateIdentifier(config.alias, "table alias");
    } catch (err) {
      errors.push(err instanceof Error ? err.message : `Invalid alias: ${config.alias}`);
    }
  }

  if (config.joins) {
    for (const j of config.joins) {
      try {
        validateIdentifier(j.table, "join table");
      } catch (err) {
        errors.push(err instanceof Error ? err.message : `Invalid join table: ${j.table}`);
      }
      if (j.alias) {
        try {
          validateIdentifier(j.alias, "join alias");
        } catch (err) {
          errors.push(err instanceof Error ? err.message : `Invalid join alias: ${j.alias}`);
        }
      }
      if (j.type === "RIGHT" && config.dialect === "sqlite") {
        errors.push("SQLite does not support RIGHT JOIN");
      }
    }
  }

  if (config.limit !== undefined && (typeof config.limit !== "number" || config.limit < 0)) {
    errors.push("Limit must be a non-negative number");
  }
  if (config.offset !== undefined && (typeof config.offset !== "number" || config.offset < 0)) {
    errors.push("Offset must be a non-negative number");
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

function renderColumnItem(item: string | ColumnSelect, dialect: Dialect): string {
  if (typeof item === "string") {
    const trimmed = item.trim();
    if (trimmed === "*") return "*";
    if (trimmed.endsWith(".*")) {
      const tbl = trimmed.slice(0, -2);
      return `${quoteIdentifier(tbl, dialect)}.*`;
    }
    // Check if it's a simple function like COUNT(*) or SUM(amount)
    const funcMatch = trimmed.match(/^([a-zA-Z_]+)\((.*)\)$/);
    if (funcMatch) {
      const funcName = funcMatch[1].toUpperCase();
      const arg = funcMatch[2].trim();
      const renderedArg = arg === "*" ? "*" : quoteIdentifier(arg, dialect);
      return `${funcName}(${renderedArg})`;
    }
    return quoteIdentifier(trimmed, dialect);
  }

  const baseCol = renderColumnItem(item.column, dialect);
  if (item.alias) {
    validateIdentifier(item.alias, "column alias");
    return `${baseCol} AS ${quoteIdentifier(item.alias, dialect)}`;
  }
  return baseCol;
}

interface ConditionContext {
  dialect: Dialect;
  values: SQLParamValue[];
  paramCounter: { count: number };
}

function renderCondition(
  cond: Condition,
  ctx: ConditionContext
): string {
  if ("and" in cond && Array.isArray(cond.and)) {
    if (cond.and.length === 0) return "1=1";
    const sub = cond.and.map((c) => renderCondition(c, ctx));
    return `(${sub.join(" AND ")})`;
  }
  if ("or" in cond && Array.isArray(cond.or)) {
    if (cond.or.length === 0) return "1=0";
    const sub = cond.or.map((c) => renderCondition(c, ctx));
    return `(${sub.join(" OR ")})`;
  }

  const simple = cond as SimpleCondition;
  if (!simple.field || !simple.operator) {
    throw new ValidationError("Condition must have field and operator", "condition");
  }

  const op = simple.operator.toUpperCase();
  if (!VALID_OPERATORS.has(op)) {
    throw new ValidationError(`Unsupported condition operator: ${simple.operator}`, "operator");
  }

  // Quoted field
  const fieldSql = quoteIdentifier(simple.field, ctx.dialect);

  if (op === "IS NULL" || op === "IS NOT NULL") {
    return `${fieldSql} ${op}`;
  }

  if (op === "IN" || op === "NOT IN") {
    const list = Array.isArray(simple.value) ? simple.value : [simple.value];
    if (list.length === 0) {
      return op === "IN" ? "1=0" : "1=1";
    }
    const phs = list.map((v) => {
      ctx.values.push(v as SQLParamValue);
      return getPlaceholder(ctx.paramCounter.count++, ctx.dialect);
    });
    return `${fieldSql} ${op} (${phs.join(", ")})`;
  }

  if (op === "BETWEEN") {
    if (!Array.isArray(simple.value) || simple.value.length !== 2) {
      throw new ValidationError("BETWEEN operator requires an array of two values", "value");
    }
    ctx.values.push(simple.value[0] as SQLParamValue);
    const ph1 = getPlaceholder(ctx.paramCounter.count++, ctx.dialect);
    ctx.values.push(simple.value[1] as SQLParamValue);
    const ph2 = getPlaceholder(ctx.paramCounter.count++, ctx.dialect);
    return `${fieldSql} BETWEEN ${ph1} AND ${ph2}`;
  }

  // Standard binary comparison
  ctx.values.push((simple.value ?? null) as SQLParamValue);
  const ph = getPlaceholder(ctx.paramCounter.count++, ctx.dialect);
  return `${fieldSql} ${op} ${ph}`;
}

export function buildSelectQuery(config: SelectQueryConfig): ParameterizedQuery {
  const dialect = config.dialect ?? "postgres";
  if (dialect === "sqlite" && config.joins?.some((j) => j.type === "RIGHT")) {
    throw new UnsupportedSyntaxError("RIGHT JOIN is not supported in SQLite", "RIGHT JOIN", "sqlite");
  }

  const validation = validateSelectQuery(config);
  if (!validation.valid) {
    throw new ValidationError(`Invalid SELECT query configuration: ${validation.errors.join("; ")}`, "config");
  }

  const values: SQLParamValue[] = [];
  const paramCounter = { count: 1 };
  const ctx: ConditionContext = { dialect, values, paramCounter };

  // SELECT columns
  const distinctStr = config.distinct ? "DISTINCT " : "";
  let columnsStr = "*";
  if (config.columns && config.columns.length > 0) {
    columnsStr = config.columns.map((c) => renderColumnItem(c, dialect)).join(", ");
  }

  // FROM
  let fromStr = quoteIdentifier(config.from, dialect);
  if (config.alias) {
    fromStr += ` AS ${quoteIdentifier(config.alias, dialect)}`;
  }

  let query = `SELECT ${distinctStr}${columnsStr} FROM ${fromStr}`;

  // JOINS
  if (config.joins && config.joins.length > 0) {
    for (const j of config.joins) {
      if (j.type === "RIGHT" && dialect === "sqlite") {
        throw new UnsupportedSyntaxError("RIGHT JOIN is not supported in SQLite", "RIGHT JOIN", "sqlite");
      }
      const joinType = j.type ?? "INNER";
      let jTable = quoteIdentifier(j.table, dialect);
      if (j.alias) {
        jTable += ` AS ${quoteIdentifier(j.alias, dialect)}`;
      }

      const onConditions = Array.isArray(j.on) ? j.on : [j.on];
      const renderedOn = onConditions.map((c) => renderCondition(c, ctx)).join(" AND ");
      query += ` ${joinType} JOIN ${jTable} ON ${renderedOn}`;
    }
  }

  // WHERE
  if (config.where) {
    const whereConditions = Array.isArray(config.where) ? config.where : [config.where];
    if (whereConditions.length > 0) {
      const renderedWhere = whereConditions.map((c) => renderCondition(c, ctx)).join(" AND ");
      query += ` WHERE ${renderedWhere}`;
    }
  }

  // GROUP BY
  if (config.groupBy && config.groupBy.length > 0) {
    const gb = config.groupBy.map((c) => quoteIdentifier(c, dialect)).join(", ");
    query += ` GROUP BY ${gb}`;
  }

  // HAVING
  if (config.having) {
    const havingConds = Array.isArray(config.having) ? config.having : [config.having];
    if (havingConds.length > 0) {
      const renderedHaving = havingConds.map((c) => renderCondition(c, ctx)).join(" AND ");
      query += ` HAVING ${renderedHaving}`;
    }
  }

  // ORDER BY
  if (config.orderBy && config.orderBy.length > 0) {
    const obParts = config.orderBy.map((ob) => {
      if (typeof ob === "string") {
        return quoteIdentifier(ob, dialect);
      }
      let clause = quoteIdentifier(ob.column, dialect);
      if (ob.direction) {
        clause += ` ${ob.direction.toUpperCase()}`;
      }
      if (ob.nulls) {
        clause += ` NULLS ${ob.nulls.toUpperCase()}`;
      }
      return clause;
    });
    query += ` ORDER BY ${obParts.join(", ")}`;
  }

  // LIMIT & OFFSET
  if (config.limit !== undefined) {
    query += ` LIMIT ${config.limit}`;
  }
  if (config.offset !== undefined) {
    query += ` OFFSET ${config.offset}`;
  }

  return { query, values };
}
