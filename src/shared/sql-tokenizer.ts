export type TokenType =
  | "keyword"
  | "identifier"
  | "string"
  | "number"
  | "operator"
  | "punctuation"
  | "comment"
  | "placeholder"
  | "whitespace";

export interface Token {
  type: TokenType;
  value: string;
  start: number;
  end: number;
  line: number;
  column: number;
}

export interface TokenizerOptions {
  includeWhitespace?: boolean;
  includeComments?: boolean;
}

const SQL_KEYWORDS = new Set([
  "SELECT", "FROM", "WHERE", "AND", "OR", "NOT", "IN", "IS", "NULL", "LIKE", "ILIKE",
  "BETWEEN", "EXISTS", "JOIN", "INNER", "LEFT", "RIGHT", "FULL", "OUTER", "CROSS", "ON",
  "USING", "GROUP", "BY", "HAVING", "ORDER", "ASC", "DESC", "LIMIT", "OFFSET", "UNION",
  "ALL", "DISTINCT", "AS", "CASE", "WHEN", "THEN", "ELSE", "END", "INSERT", "INTO",
  "VALUES", "UPDATE", "SET", "DELETE", "CREATE", "TABLE", "DROP", "ALTER", "ADD",
  "COLUMN", "INDEX", "PRIMARY", "KEY", "FOREIGN", "REFERENCES", "CONSTRAINT", "UNIQUE",
  "CHECK", "DEFAULT", "CASCADE", "RESTRICT", "NO", "ACTION", "AUTO_INCREMENT",
  "SERIAL", "BIGSERIAL", "IDENTITY", "GENERATED", "ALWAYS", "WITH", "RECURSIVE",
  "VIEW", "TEMPORARY", "TEMP", "IF", "INT", "INTEGER", "BIGINT", "SMALLINT", "TINYINT",
  "MEDIUMINT", "VARCHAR", "CHAR", "TEXT", "MEDIUMTEXT", "LONGTEXT", "DECIMAL",
  "NUMERIC", "FLOAT", "DOUBLE", "BOOLEAN", "BOOL", "DATE", "DATETIME", "TIMESTAMP",
  "TIME", "JSON", "JSONB", "BLOB", "BYTEA", "UNSIGNED", "SIGNED", "TRUE", "FALSE",
  "DATABASE", "SCHEMA", "BEGIN", "COMMIT", "ROLLBACK", "TRANSACTION", "TRUNCATE",
  "CAST", "COALESCE", "NULLIF", "COUNT", "SUM", "AVG", "MIN", "MAX"
]);

export function tokenizeSQL(sql: string, options: TokenizerOptions = {}): Token[] {
  const { includeWhitespace = false, includeComments = true } = options;
  const tokens: Token[] = [];
  const len = sql.length;
  let i = 0;
  let line = 1;
  let column = 1;

  function advance(count = 1): string {
    const substr = sql.slice(i, i + count);
    for (let c = 0; c < substr.length; c++) {
      if (substr[c] === "\n") {
        line++;
        column = 1;
      } else {
        column++;
      }
    }
    i += count;
    return substr;
  }

  while (i < len) {
    const start = i;
    const startLine = line;
    const startCol = column;
    const ch = sql[i];
    const next = i + 1 < len ? sql[i + 1] : "";

    // 1. Whitespace
    if (/\s/.test(ch)) {
      let ws = "";
      while (i < len && /\s/.test(sql[i])) {
        ws += advance(1);
      }
      if (includeWhitespace) {
        tokens.push({
          type: "whitespace",
          value: ws,
          start,
          end: i,
          line: startLine,
          column: startCol,
        });
      }
      continue;
    }

    // 2. Comments: Line comments (-- or #)
    if ((ch === "-" && next === "-") || ch === "#") {
      let comment = "";
      while (i < len && sql[i] !== "\n") {
        comment += advance(1);
      }
      if (includeComments) {
        tokens.push({
          type: "comment",
          value: comment,
          start,
          end: i,
          line: startLine,
          column: startCol,
        });
      }
      continue;
    }

    // 3. Comments: Block comments (/* ... */)
    if (ch === "/" && next === "*") {
      let comment = advance(2);
      while (i < len) {
        if (sql[i] === "*" && i + 1 < len && sql[i + 1] === "/") {
          comment += advance(2);
          break;
        }
        comment += advance(1);
      }
      if (includeComments) {
        tokens.push({
          type: "comment",
          value: comment,
          start,
          end: i,
          line: startLine,
          column: startCol,
        });
      }
      continue;
    }

    // 4. PostgreSQL Dollar-quoted strings ($tag$...$tag$)
    if (ch === "$") {
      const tagMatch = sql.slice(i).match(/^\$([a-zA-Z0-9_]*)\$/);
      if (tagMatch) {
        const fullTag = tagMatch[0]; // e.g. "$$", "$body$"
        let str = advance(fullTag.length);
        const closeIdx = sql.indexOf(fullTag, i);
        if (closeIdx !== -1) {
          const content = sql.slice(i, closeIdx);
          str += advance(content.length);
          str += advance(fullTag.length);
        } else {
          // Unterminated dollar quote
          str += advance(len - i);
        }
        tokens.push({
          type: "string",
          value: str,
          start,
          end: i,
          line: startLine,
          column: startCol,
        });
        continue;
      }
    }

    // 5. String literals ('...')
    if (ch === "'") {
      let str = advance(1);
      while (i < len) {
        const cur = sql[i];
        if (cur === "\\") {
          str += advance(1);
          if (i < len) str += advance(1);
        } else if (cur === "'") {
          str += advance(1);
          if (i < len && sql[i] === "'") {
            // Escaped ''
            str += advance(1);
          } else {
            break;
          }
        } else {
          str += advance(1);
        }
      }
      tokens.push({
        type: "string",
        value: str,
        start,
        end: i,
        line: startLine,
        column: startCol,
      });
      continue;
    }

    // 6. Quoted Identifiers: Double quotes ("..."), Backticks (`...`), Brackets ([...])
    if (ch === '"' || ch === "`" || ch === "[") {
      const closeChar = ch === "[" ? "]" : ch;
      let ident = advance(1);
      while (i < len) {
        const cur = sql[i];
        if (cur === "\\") {
          ident += advance(1);
          if (i < len) ident += advance(1);
        } else if (cur === closeChar) {
          ident += advance(1);
          if (ch !== "[" && i < len && sql[i] === closeChar) {
            // Escaped double quote or backtick
            ident += advance(1);
          } else {
            break;
          }
        } else {
          ident += advance(1);
        }
      }
      tokens.push({
        type: "identifier",
        value: ident,
        start,
        end: i,
        line: startLine,
        column: startCol,
      });
      continue;
    }

    // 7. Placeholders: $1, ?, :name, @name
    if (ch === "?" || (ch === "$" && /^[0-9]/.test(next))) {
      let ph = advance(1);
      if (ch === "$") {
        while (i < len && /[0-9]/.test(sql[i])) {
          ph += advance(1);
        }
      }
      tokens.push({
        type: "placeholder",
        value: ph,
        start,
        end: i,
        line: startLine,
        column: startCol,
      });
      continue;
    }
    if ((ch === ":" || ch === "@") && /[a-zA-Z_]/.test(next)) {
      let ph = advance(1);
      while (i < len && /[a-zA-Z0-9_]/.test(sql[i])) {
        ph += advance(1);
      }
      tokens.push({
        type: "placeholder",
        value: ph,
        start,
        end: i,
        line: startLine,
        column: startCol,
      });
      continue;
    }

    // 8. Numbers (including 0x hex, decimals, scientific notation)
    if (/[0-9]/.test(ch) || (ch === "." && /[0-9]/.test(next))) {
      let num = advance(1);
      if (num === "0" && (sql[i] === "x" || sql[i] === "X")) {
        num += advance(1);
        while (i < len && /[0-9a-fA-F]/.test(sql[i])) {
          num += advance(1);
        }
      } else {
        while (i < len && /[0-9]/.test(sql[i])) {
          num += advance(1);
        }
        if (i < len && sql[i] === "." && /[0-9]/.test(sql[i + 1] ?? "")) {
          num += advance(1);
          while (i < len && /[0-9]/.test(sql[i])) {
            num += advance(1);
          }
        }
        if (i < len && (sql[i] === "e" || sql[i] === "E")) {
          num += advance(1);
          if (i < len && (sql[i] === "+" || sql[i] === "-")) {
            num += advance(1);
          }
          while (i < len && /[0-9]/.test(sql[i])) {
            num += advance(1);
          }
        }
      }
      tokens.push({
        type: "number",
        value: num,
        start,
        end: i,
        line: startLine,
        column: startCol,
      });
      continue;
    }

    // 9. Multi-character operators: ::, ->>, ->, <=, >=, <>, !=, ||, :=
    const opCandidates = ["::", "->>", "->", "<=", ">=", "<>", "!=", "||", ":="];
    let matchedOp = "";
    for (const cand of opCandidates) {
      if (sql.startsWith(cand, i)) {
        matchedOp = cand;
        break;
      }
    }
    if (matchedOp) {
      advance(matchedOp.length);
      tokens.push({
        type: "operator",
        value: matchedOp,
        start,
        end: i,
        line: startLine,
        column: startCol,
      });
      continue;
    }

    // 10. Single-character operators
    if (/[=<>+\-*/%&|^~]/.test(ch)) {
      const op = advance(1);
      tokens.push({
        type: "operator",
        value: op,
        start,
        end: i,
        line: startLine,
        column: startCol,
      });
      continue;
    }

    // 11. Punctuation: ( ) , ; .
    if (/[(),;.]/.test(ch)) {
      const punc = advance(1);
      tokens.push({
        type: "punctuation",
        value: punc,
        start,
        end: i,
        line: startLine,
        column: startCol,
      });
      continue;
    }

    // 12. Identifiers / Keywords
    if (/[a-zA-Z_]/.test(ch)) {
      let word = advance(1);
      while (i < len && /[a-zA-Z0-9_$]/.test(sql[i])) {
        word += advance(1);
      }
      const upper = word.toUpperCase();
      const type: TokenType = SQL_KEYWORDS.has(upper) ? "keyword" : "identifier";
      tokens.push({
        type,
        value: word,
        start,
        end: i,
        line: startLine,
        column: startCol,
      });
      continue;
    }

    // 13. Fallback: single unknown char
    const unknown = advance(1);
    tokens.push({
      type: "punctuation",
      value: unknown,
      start,
      end: i,
      line: startLine,
      column: startCol,
    });
  }

  return tokens;
}
