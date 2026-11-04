import { describe, it, expect } from "vitest";
import { formatSQL, minifySQL } from "../../src/sql-format/index";

describe("SQL Formatter and Minifier", () => {
  it("formats basic SELECT query with uppercase keywords and indentation", () => {
    const raw = "select id, name, email from users where id = 1 and status = 'active' order by name asc limit 10";
    const formatted = formatSQL(raw);

    expect(formatted).toContain("SELECT");
    expect(formatted).toContain("FROM users");
    expect(formatted).toContain("WHERE");
    expect(formatted).toContain("ORDER BY name ASC");
    expect(formatted).toContain("LIMIT 10");
  });

  it("is idempotent: formatting twice produces stable output", () => {
    const query = `
      SELECT u.id, u.name, o.total
      FROM users u
      LEFT JOIN orders o ON o.user_id = u.id
      WHERE u.age > 18 AND u.active = true
      ORDER BY u.created_at DESC;
    `;
    const firstPass = formatSQL(query);
    const secondPass = formatSQL(firstPass);
    expect(secondPass).toBe(firstPass);
  });

  it("preserves single-quoted literals, escapes and comments", () => {
    const query = `
      -- Fetch active users
      SELECT 'John Doe', 'O''Reilly', "custom_col"
      FROM users
      /* block comment */
      WHERE note = 'first line\nsecond line';
    `;
    const formatted = formatSQL(query);
    expect(formatted).toContain("'John Doe'");
    expect(formatted).toContain("'O''Reilly'");
    expect(formatted).toContain("-- Fetch active users");
    expect(formatted).toContain("/* block comment */");
  });

  it("supports lowercase keywords and custom indentation", () => {
    const query = "SELECT id FROM users WHERE id = 1";
    const formatted = formatSQL(query, { keywordCase: "lower", indent: 4 });
    expect(formatted).toContain("select");
    expect(formatted).toContain("from");
  });

  it("handles complex subqueries and WITH clauses", () => {
    const query = "WITH active_users AS (SELECT id FROM users WHERE active = true) SELECT * FROM active_users";
    const formatted = formatSQL(query);
    expect(formatted).toContain("WITH active_users AS");
    expect(formatted).toContain("SELECT");
  });

  it("minifies SQL while preserving string literals and comments", () => {
    const query = `
      SELECT   id,   name  
      FROM     users 
      WHERE    status = 'active and verified';
    `;
    const minified = minifySQL(query);
    expect(minified).toBe("SELECT id,name FROM users WHERE status='active and verified';");
  });

  it("handles empty and edge-case inputs", () => {
    expect(formatSQL("")).toBe("");
    expect(minifySQL("")).toBe("");
    expect(formatSQL("   ")).toBe("");
  });
});
