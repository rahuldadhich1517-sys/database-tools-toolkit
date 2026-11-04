import { tokenizeSQL, Token } from "../shared/sql-tokenizer";

export interface FormatSQLOptions {
  indent?: string | number; // default: 2 spaces
  keywordCase?: "upper" | "lower" | "preserve"; // default: "upper"
  linesBetweenQueries?: number; // default: 1
}

const MAJOR_CLAUSES = new Set([
  "SELECT",
  "FROM",
  "WHERE",
  "GROUP BY",
  "HAVING",
  "ORDER BY",
  "LIMIT",
  "OFFSET",
  "JOIN",
  "INNER JOIN",
  "LEFT JOIN",
  "RIGHT JOIN",
  "FULL JOIN",
  "CROSS JOIN",
  "ON",
  "SET",
  "VALUES",
  "UPDATE",
  "DELETE",
  "INSERT",
  "CREATE TABLE",
  "WITH",
  "UNION",
  "UNION ALL",
]);

export function formatSQL(sql: string, options: FormatSQLOptions = {}): string {
  if (!sql || typeof sql !== "string") {
    return "";
  }

  const indentStr =
    typeof options.indent === "number"
      ? " ".repeat(options.indent)
      : options.indent ?? "  ";
  const keywordCase = options.keywordCase ?? "upper";

  // Tokenize including comments, but excluding raw whitespaces
  const tokens = tokenizeSQL(sql, { includeWhitespace: false, includeComments: true });
  if (tokens.length === 0) {
    return "";
  }

  const result: string[] = [];
  let indentLevel = 0;
  let parenDepth = 0;
  let newlinePending = false;

  function getIndent(): string {
    return indentStr.repeat(indentLevel);
  }

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    const prev = i > 0 ? tokens[i - 1] : undefined;
    const next = i + 1 < tokens.length ? tokens[i + 1] : undefined;

    // Check two-word clause (e.g. GROUP BY, ORDER BY, INNER JOIN, LEFT JOIN, CREATE TABLE, UNION ALL)
    let isTwoWordClause = false;
    let twoWord = "";
    if (token.type === "keyword" && next && next.type === "keyword") {
      twoWord = `${token.value.toUpperCase()} ${next.value.toUpperCase()}`;
      if (MAJOR_CLAUSES.has(twoWord)) {
        isTwoWordClause = true;
      }
    }

    // Determine keyword casing
    let displayValue = token.value;
    if (token.type === "keyword") {
      if (keywordCase === "upper") {
        displayValue = token.value.toUpperCase();
      } else if (keywordCase === "lower") {
        displayValue = token.value.toLowerCase();
      }
    }

    // Check if this token starts a major clause
    const upper = token.value.toUpperCase();
    const isMajorClause =
      token.type === "keyword" &&
      (MAJOR_CLAUSES.has(upper) || isTwoWordClause) &&
      parenDepth === 0;

    if (token.value === ";") {
      result.push(";\n");
      newlinePending = true;
      continue;
    }

    if (token.value === "(") {
      parenDepth++;
      // If previous was a subquery keyword or CREATE TABLE, or VALUES
      if (prev && prev.type === "keyword" && (prev.value.toUpperCase() === "SELECT" || prev.value.toUpperCase() === "AS")) {
        indentLevel++;
        result.push(" (\n" + getIndent());
        newlinePending = false;
        continue;
      }
      result.push("(");
      continue;
    }

    if (token.value === ")") {
      parenDepth = Math.max(0, parenDepth - 1);
      result.push(")");
      continue;
    }

    if (token.value === ",") {
      result.push(",");
      if (parenDepth === 0) {
        result.push("\n" + getIndent() + " ");
      } else {
        result.push(" ");
      }
      continue;
    }

    if (isMajorClause) {
      if (result.length > 0 && !result[result.length - 1].endsWith("\n")) {
        result.push("\n");
      }
      result.push(getIndent() + displayValue);

      if (isTwoWordClause && next) {
        let nextDisplay = next.value;
        if (keywordCase === "upper") nextDisplay = next.value.toUpperCase();
        else if (keywordCase === "lower") nextDisplay = next.value.toLowerCase();
        result.push(" " + nextDisplay);
        i++; // skip next
      }

      result.push(" ");
      newlinePending = false;
      continue;
    }

    // Handle AND / OR indentation in WHERE clause
    if (
      token.type === "keyword" &&
      (upper === "AND" || upper === "OR") &&
      parenDepth === 0
    ) {
      if (result.length > 0 && !result[result.length - 1].endsWith("\n")) {
        result.push("\n");
      }
      result.push(getIndent() + "  " + displayValue + " ");
      continue;
    }

    // Comments
    if (token.type === "comment") {
      if (result.length > 0 && !result[result.length - 1].endsWith("\n")) {
        result.push("\n");
      }
      result.push(getIndent() + token.value + "\n" + getIndent());
      continue;
    }

    // Default spacing
    if (newlinePending) {
      result.push(getIndent());
      newlinePending = false;
    } else if (
      prev &&
      token.value !== "." &&
      prev.value !== "." &&
      prev.value !== "(" &&
      token.value !== "::" &&
      prev.value !== "::" &&
      !result[result.length - 1]?.endsWith(" ") &&
      !result[result.length - 1]?.endsWith("\n")
    ) {
      result.push(" ");
    }

    result.push(displayValue);
  }

  // Trim extraneous trailing whitespace on lines
  const rawFormatted = result.join("");
  return rawFormatted
    .split("\n")
    .map((line) => line.trimEnd())
    .join("\n")
    .trim();
}

export function minifySQL(sql: string): string {
  if (!sql || typeof sql !== "string") {
    return "";
  }

  const tokens = tokenizeSQL(sql, { includeWhitespace: false, includeComments: true });
  if (tokens.length === 0) {
    return "";
  }

  const out: string[] = [];

  for (let i = 0; i < tokens.length; i++) {
    const cur = tokens[i];
    const prev = i > 0 ? tokens[i - 1] : undefined;

    if (prev) {
      // Determine if a space is required between prev and cur
      const needsSpace =
        (isWordLike(prev) && isWordLike(cur)) ||
        (cur.type === "comment" && cur.value.startsWith("--")) ||
        (prev.type === "comment" && prev.value.startsWith("--"));

      if (needsSpace) {
        if (prev.type === "comment" && prev.value.startsWith("--")) {
          out.push("\n");
        } else {
          out.push(" ");
        }
      }
    }

    out.push(cur.value);
  }

  return out.join("").trim();
}

function isWordLike(token: Token): boolean {
  return (
    token.type === "keyword" ||
    token.type === "identifier" ||
    token.type === "number" ||
    token.type === "placeholder"
  );
}
