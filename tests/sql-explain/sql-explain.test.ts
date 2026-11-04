import { describe, it, expect } from "vitest";
import {
  explainSQL,
  analyzeSQL,
  getSQLStatementType,
} from "../../src/sql-explain/index";

describe("SQL Explain and Analyzer", () => {
  it("determines statement types correctly", () => {
    expect(getSQLStatementType("SELECT * FROM users")).toBe("SELECT");
    expect(getSQLStatementType("INSERT INTO users VALUES (1)")).toBe("INSERT");
    expect(getSQLStatementType("UPDATE users SET name = 'a'")).toBe("UPDATE");
    expect(getSQLStatementType("DELETE FROM users WHERE id = 1")).toBe("DELETE");
    expect(getSQLStatementType("CREATE TABLE users (id int)")).toBe("CREATE TABLE");
    expect(getSQLStatementType("WITH cte AS (...) SELECT 1")).toBe("WITH");
    expect(getSQLStatementType("INVALID SQL STATEMENT")).toBe("UNKNOWN");
  });

  it("analyzes complex SELECT query with joins, where, group by, order by and limit", () => {
    const sql = `
      SELECT u.id, u.name, o.total
      FROM users u
      LEFT JOIN orders o ON o.user_id = u.id
      WHERE u.age > 21
      GROUP BY u.id
      ORDER BY u.name ASC
      LIMIT 50 OFFSET 10;
    `;

    const analysis = analyzeSQL(sql);
    expect(analysis.statementType).toBe("SELECT");
    expect(analysis.tables).toContain("users");
    expect(analysis.tables).toContain("orders");
    expect(analysis.joins).toEqual([{ type: "LEFT", table: "orders" }]);
    expect(analysis.hasWhere).toBe(true);
    expect(analysis.grouping).toContain("id");
    expect(analysis.sorting).toContain("name");
    expect(analysis.limit).toBe(50);
    expect(analysis.offset).toBe(10);
  });

  it("flags performance observations for SELECT *, leading wildcards, and unindexed joins", () => {
    const badQuery = "SELECT * FROM users WHERE email LIKE '%@gmail.com' CROSS JOIN logs";
    const explanation = explainSQL(badQuery);

    expect(explanation.performanceObservations.some((o) => o.includes("SELECT *"))).toBe(true);
    expect(explanation.performanceObservations.some((o) => o.includes("leading wildcard"))).toBe(true);
    expect(explanation.performanceObservations.some((o) => o.includes("CROSS JOIN"))).toBe(true);
  });

  it("warns about missing WHERE on UPDATE and DELETE statements", () => {
    const dangerousUpdate = "UPDATE users SET active = false;";
    const expUpdate = explainSQL(dangerousUpdate);
    expect(expUpdate.performanceObservations.some((o) => o.includes("CRITICAL"))).toBe(true);

    const dangerousDelete = "DELETE FROM users;";
    const expDelete = explainSQL(dangerousDelete);
    expect(expDelete.performanceObservations.some((o) => o.includes("CRITICAL"))).toBe(true);
  });

  it("generates a human-readable plain language explanation", () => {
    const query = "SELECT id, name FROM users WHERE active = true LIMIT 10;";
    const explanation = explainSQL(query);

    expect(explanation.humanReadable).toContain('Reads records from table(s) "users"');
    expect(explanation.humanReadable).toContain("Applies filter condition(s)");
    expect(explanation.humanReadable).toContain("Restricts output to at most 10 row(s)");
    expect(explanation.isHeuristic).toBe(true);
  });
});
