import { describe, it, expect } from "vitest";
import { tokenizeSQL } from "../../src/shared/sql-tokenizer";

describe("SQL Tokenizer", () => {
  it("tokenizes basic select query", () => {
    const tokens = tokenizeSQL("SELECT id, name FROM users WHERE id = 1");
    expect(tokens.map((t) => t.value)).toEqual([
      "SELECT", "id", ",", "name", "FROM", "users", "WHERE", "id", "=", "1"
    ]);
    expect(tokens[0].type).toBe("keyword");
    expect(tokens[1].type).toBe("identifier");
    expect(tokens[2].type).toBe("punctuation");
    expect(tokens[8].type).toBe("operator");
    expect(tokens[9].type).toBe("number");
  });

  it("handles single-quoted string with escapes and doubled quotes", () => {
    const tokens = tokenizeSQL("SELECT 'hello ''world''', 'escaped \\' quote'");
    const strings = tokens.filter((t) => t.type === "string");
    expect(strings).toHaveLength(2);
    expect(strings[0].value).toBe("'hello ''world'''");
    expect(strings[1].value).toBe("'escaped \\' quote'");
  });

  it("handles double quoted, backtick and bracket identifiers", () => {
    const tokens = tokenizeSQL('SELECT "users"."name", `orders`.`id`, [items].[price]');
    expect(tokens.filter((t) => t.type === "identifier")).toHaveLength(6);
  });

  it("handles PostgreSQL dollar-quoted strings", () => {
    const tokens = tokenizeSQL("SELECT $$simple string$$, $tag$custom tag$tag$ FROM data");
    const strings = tokens.filter((t) => t.type === "string");
    expect(strings).toHaveLength(2);
    expect(strings[0].value).toBe("$$simple string$$");
    expect(strings[1].value).toBe("$tag$custom tag$tag$");
  });

  it("handles unterminated dollar-quoted strings gracefully", () => {
    const tokens = tokenizeSQL("SELECT $$unterminated");
    const strings = tokens.filter((t) => t.type === "string");
    expect(strings[0].value).toBe("$$unterminated");
  });

  it("handles line comments (-- and #) and block comments (/* */)", () => {
    const sql = `
      -- line comment
      # mysql comment
      SELECT 1 /* block comment */;
    `;
    const tokens = tokenizeSQL(sql, { includeComments: true });
    const comments = tokens.filter((t) => t.type === "comment");
    expect(comments).toHaveLength(3);
  });

  it("handles placeholders (?, $1, :id, @param)", () => {
    const sql = "SELECT * FROM users WHERE id = ? AND age > $1 AND org = :org AND role = @role";
    const tokens = tokenizeSQL(sql);
    const phs = tokens.filter((t) => t.type === "placeholder");
    expect(phs.map((p) => p.value)).toEqual(["?", "$1", ":org", "@role"]);
  });

  it("handles numbers (hex, decimals, scientific notation)", () => {
    const sql = "SELECT 0x1A, 3.1415, 1e10, 2.5e-3";
    const tokens = tokenizeSQL(sql);
    const nums = tokens.filter((t) => t.type === "number");
    expect(nums.map((n) => n.value)).toEqual(["0x1A", "3.1415", "1e10", "2.5e-3"]);
  });

  it("handles multi-character operators (::, ->>, ->, <=, >=, !=, ||, :=)", () => {
    const sql = "SELECT val::text, json->>'key', a <= b, c != d, 'a' || 'b', x := 1";
    const tokens = tokenizeSQL(sql);
    const ops = tokens.filter((t) => t.type === "operator");
    expect(ops.map((o) => o.value)).toContain("::");
    expect(ops.map((o) => o.value)).toContain("->>");
    expect(ops.map((o) => o.value)).toContain("<=");
    expect(ops.map((o) => o.value)).toContain("!=");
    expect(ops.map((o) => o.value)).toContain("||");
    expect(ops.map((o) => o.value)).toContain(":=");
  });

  it("includes whitespace when option is set", () => {
    const sql = "SELECT 1";
    const tokens = tokenizeSQL(sql, { includeWhitespace: true });
    expect(tokens.some((t) => t.type === "whitespace")).toBe(true);
  });
});
