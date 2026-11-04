import { tokenizeSQL } from "../shared/sql-tokenizer";

export type SQLStatementType =
  | "SELECT"
  | "INSERT"
  | "UPDATE"
  | "DELETE"
  | "CREATE TABLE"
  | "DROP TABLE"
  | "ALTER TABLE"
  | "WITH"
  | "UNKNOWN";

export interface SQLAnalysisJoin {
  type: string;
  table: string;
}

export interface SQLAnalysis {
  statementType: SQLStatementType;
  tables: string[];
  columns: string[];
  joins: SQLAnalysisJoin[];
  hasWhere: boolean;
  filters: string[];
  grouping: string[];
  sorting: string[];
  limit?: number;
  offset?: number;
  isCte: boolean;
  performanceObservations: string[];
  warnings: string[];
}

export interface SQLExplanation extends SQLAnalysis {
  humanReadable: string;
  isHeuristic: true;
}

export function getSQLStatementType(sql: string): SQLStatementType {
  if (!sql || typeof sql !== "string") return "UNKNOWN";
  const tokens = tokenizeSQL(sql, { includeWhitespace: false, includeComments: false });
  if (tokens.length === 0) return "UNKNOWN";

  const first = tokens[0].value.toUpperCase();
  const second = tokens[1]?.value.toUpperCase();

  if (first === "SELECT") return "SELECT";
  if (first === "INSERT") return "INSERT";
  if (first === "UPDATE") return "UPDATE";
  if (first === "DELETE") return "DELETE";
  if (first === "WITH") return "WITH";
  if (first === "CREATE" && second === "TABLE") return "CREATE TABLE";
  if (first === "DROP" && second === "TABLE") return "DROP TABLE";
  if (first === "ALTER" && second === "TABLE") return "ALTER TABLE";

  return "UNKNOWN";
}

export function analyzeSQL(sql: string): SQLAnalysis {
  const statementType = getSQLStatementType(sql);
  const tables = new Set<string>();
  const columns = new Set<string>();
  const joins: SQLAnalysisJoin[] = [];
  const filters: string[] = [];
  const grouping: string[] = [];
  const sorting: string[] = [];
  const performanceObservations: string[] = [];
  const warnings: string[] = [];

  let hasWhere = false;
  let limit: number | undefined;
  let offset: number | undefined;
  let isCte = statementType === "WITH";

  const tokens = tokenizeSQL(sql, { includeWhitespace: false, includeComments: false });
  let i = 0;

  function cleanName(val: string): string {
    return val.replace(/[`"[\]]/g, "");
  }

  // Check for SELECT *
  if (/\bSELECT\s+(DISTINCT\s+)?\*/i.test(sql)) {
    performanceObservations.push(
      "Query uses 'SELECT *', which fetches all columns. Consider specifying only required columns to reduce I/O and network payload."
    );
  }

  // Check for LIKE '%...' (leading wildcard prevents index scan)
  const likeMatches = sql.match(/LIKE\s+'%[^']+'/gi);
  if (likeMatches) {
    performanceObservations.push(
      "Query contains LIKE with a leading wildcard ('%...'). This typically prevents B-tree index usage and causes a full table scan."
    );
  }

  while (i < tokens.length) {
    const cur = tokens[i];
    const upper = cur.value.toUpperCase();
    const next = tokens[i + 1];
    const nextUpper = next?.value.toUpperCase();

    // Tables in FROM
    if (upper === "FROM" && next) {
      if (next.value !== "(") {
        tables.add(cleanName(next.value));
      }
    }

    // Tables in INSERT INTO
    if (upper === "INSERT" && nextUpper === "INTO" && tokens[i + 2]) {
      tables.add(cleanName(tokens[i + 2].value));
    }

    // Tables in UPDATE
    if (upper === "UPDATE" && next && next.value !== "(") {
      tables.add(cleanName(next.value));
    }

    // Joins
    if (
      (upper === "JOIN" ||
        upper === "INNER" ||
        upper === "LEFT" ||
        upper === "RIGHT" ||
        upper === "FULL" ||
        upper === "CROSS") &&
      next
    ) {
      let joinType = "INNER";
      let tableIdx = i + 1;

      if (upper === "JOIN") {
        joinType = "INNER";
      } else if (nextUpper === "JOIN") {
        joinType = upper;
        tableIdx = i + 2;
        i++; // skip next JOIN keyword so it is not processed twice
      }

      const joinTblToken = tokens[tableIdx];
      if (joinTblToken && joinTblToken.value !== "(") {
        const tblName = cleanName(joinTblToken.value);
        tables.add(tblName);
        joins.push({ type: joinType, table: tblName });
        if (joinType === "CROSS") {
          performanceObservations.push(
            `CROSS JOIN on "${tblName}" produces a Cartesian product. Verify that a join condition was not unintentionally omitted.`
          );
        }
      }
    }

    // WHERE clause
    if (upper === "WHERE") {
      hasWhere = true;
      let j = i + 1;
      let filterTokens: string[] = [];
      let parenDepth = 0;

      while (j < tokens.length) {
        const t = tokens[j];
        const tu = t.value.toUpperCase();
        if (parenDepth === 0 && ["GROUP", "HAVING", "ORDER", "LIMIT", "UNION", ";"].includes(tu)) {
          break;
        }
        if (t.value === "(") parenDepth++;
        if (t.value === ")") parenDepth--;
        filterTokens.push(t.value);
        j++;
      }
      if (filterTokens.length > 0) {
        filters.push(filterTokens.join(" "));
      }
    }

    // GROUP BY
    if (upper === "GROUP" && nextUpper === "BY") {
      let j = i + 2;
      while (j < tokens.length) {
        const t = tokens[j];
        const tu = t.value.toUpperCase();
        if (["HAVING", "ORDER", "LIMIT", "UNION", ";"].includes(tu)) break;
        if (t.type === "identifier" || t.type === "keyword") {
          if (t.value !== ",") grouping.push(cleanName(t.value));
        }
        j++;
      }
    }

    // ORDER BY
    if (upper === "ORDER" && nextUpper === "BY") {
      let j = i + 2;
      while (j < tokens.length) {
        const t = tokens[j];
        const tu = t.value.toUpperCase();
        if (["LIMIT", "OFFSET", "UNION", ";"].includes(tu)) break;
        if (t.type === "identifier") {
          sorting.push(cleanName(t.value));
        }
        j++;
      }
    }

    // LIMIT & OFFSET
    if (upper === "LIMIT" && next && /^\d+$/.test(next.value)) {
      limit = parseInt(next.value, 10);
    }
    if (upper === "OFFSET" && next && /^\d+$/.test(next.value)) {
      offset = parseInt(next.value, 10);
    }

    // Selected columns in SELECT (basic scan)
    if (upper === "SELECT") {
      let j = i + 1;
      let parenDepth = 0;
      while (j < tokens.length) {
        const t = tokens[j];
        const tu = t.value.toUpperCase();
        if (parenDepth === 0 && tu === "FROM") break;
        if (t.value === "(") parenDepth++;
        if (t.value === ")") parenDepth--;
        if (parenDepth === 0 && (t.type === "identifier" || t.value === "*")) {
          columns.add(cleanName(t.value));
        }
        j++;
      }
    }

    i++;
  }

  // Safety checks for UPDATE/DELETE without WHERE
  if ((statementType === "UPDATE" || statementType === "DELETE") && !hasWhere) {
    performanceObservations.push(
      `CRITICAL: ${statementType} statement without a WHERE clause will modify or delete ALL rows in the table.`
    );
  }

  return {
    statementType,
    tables: Array.from(tables),
    columns: Array.from(columns),
    joins,
    hasWhere,
    filters,
    grouping,
    sorting,
    limit,
    offset,
    isCte,
    performanceObservations,
    warnings,
  };
}

export function explainSQL(sql: string): SQLExplanation {
  const analysis = analyzeSQL(sql);

  const sentences: string[] = [];

  switch (analysis.statementType) {
    case "SELECT": {
      sentences.push(
        `Reads records from ${
          analysis.tables.length > 0 ? `table(s) ${analysis.tables.map((t) => `"${t}"`).join(", ")}` : "the specified source"
        }.`
      );
      if (analysis.joins.length > 0) {
        const joinSummary = analysis.joins
          .map((j) => `${j.type} JOIN on "${j.table}"`)
          .join(", ");
        sentences.push(`Combines rows using: ${joinSummary}.`);
      }
      if (analysis.hasWhere) {
        sentences.push(`Applies filter condition(s): ${analysis.filters.join("; ")}.`);
      }
      if (analysis.grouping.length > 0) {
        sentences.push(`Groups rows by: ${analysis.grouping.join(", ")}.`);
      }
      if (analysis.sorting.length > 0) {
        sentences.push(`Sorts results by: ${analysis.sorting.join(", ")}.`);
      }
      if (analysis.limit !== undefined) {
        sentences.push(`Restricts output to at most ${analysis.limit} row(s)${analysis.offset ? ` starting after offset ${analysis.offset}` : ""}.`);
      }
      break;
    }
    case "INSERT": {
      sentences.push(
        `Inserts new rows into table "${analysis.tables[0] ?? "unknown"}".`
      );
      break;
    }
    case "UPDATE": {
      sentences.push(
        `Updates existing records in table "${analysis.tables[0] ?? "unknown"}".`
      );
      if (analysis.hasWhere) {
        sentences.push(`Affects only rows matching condition(s): ${analysis.filters.join("; ")}.`);
      } else {
        sentences.push("WARNING: Operates unconditionally on ALL rows in the table.");
      }
      break;
    }
    case "DELETE": {
      sentences.push(
        `Deletes records from table "${analysis.tables[0] ?? "unknown"}".`
      );
      if (analysis.hasWhere) {
        sentences.push(`Deletes only rows matching condition(s): ${analysis.filters.join("; ")}.`);
      } else {
        sentences.push("WARNING: Operates unconditionally on ALL rows in the table.");
      }
      break;
    }
    case "CREATE TABLE": {
      sentences.push(`Creates a new table "${analysis.tables[0] ?? "definition"}".`);
      break;
    }
    default: {
      sentences.push(`Executes a ${analysis.statementType} operation.`);
      break;
    }
  }

  return {
    ...analysis,
    humanReadable: sentences.join(" "),
    isHeuristic: true,
  };
}
