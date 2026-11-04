import { describe, it, expect } from "vitest";
import { buildSelectQuery, validateSelectQuery } from "../../src/sql-select-build/index";
import { ValidationError, UnsupportedSyntaxError } from "../../src/shared/errors";

describe("SQL Select Query Builder", () => {
  it("builds basic SELECT query with parameters in PostgreSQL", () => {
    const result = buildSelectQuery({
      from: "users",
      columns: ["id", "username", "email"],
      where: { field: "status", operator: "=", value: "active" },
      dialect: "postgres",
    });

    expect(result.query).toBe('SELECT "id", "username", "email" FROM "users" WHERE "status" = $1');
    expect(result.values).toEqual(["active"]);
  });

  it("builds query with aliases, distinct, and expressions", () => {
    const result = buildSelectQuery({
      from: "orders",
      alias: "o",
      distinct: true,
      columns: [
        { column: "o.id", alias: "order_id" },
        "COUNT(*)",
      ],
      dialect: "postgres",
    });

    expect(result.query).toBe('SELECT DISTINCT "o"."id" AS "order_id", COUNT(*) FROM "orders" AS "o"');
  });

  it("builds query with multiple JOINs and ON conditions", () => {
    const result = buildSelectQuery({
      from: "users",
      alias: "u",
      columns: ["u.id", "p.bio"],
      joins: [
        {
          type: "LEFT",
          table: "profiles",
          alias: "p",
          on: { field: "p.user_id", operator: "=", value: 10 },
        },
      ],
      dialect: "mysql",
    });

    expect(result.query).toBe(
      "SELECT `u`.`id`, `p`.`bio` FROM `users` AS `u` LEFT JOIN `profiles` AS `p` ON `p`.`user_id` = ?"
    );
    expect(result.values).toEqual([10]);
  });

  it("handles complex WHERE conditions with AND / OR nesting, BETWEEN, IN, IS NULL", () => {
    const result = buildSelectQuery({
      from: "products",
      where: {
        and: [
          { field: "category_id", operator: "IN", value: [1, 2, 3] },
          { field: "price", operator: "BETWEEN", value: [10, 50] },
          { field: "deleted_at", operator: "IS NULL" },
          {
            or: [
              { field: "stock", operator: ">", value: 0 },
              { field: "backorder", operator: "=", value: true },
            ],
          },
        ],
      },
      orderBy: [{ column: "price", direction: "DESC" }],
      limit: 20,
      offset: 40,
      dialect: "postgres",
    });

    expect(result.query).toContain('"category_id" IN ($1, $2, $3)');
    expect(result.query).toContain('"price" BETWEEN $4 AND $5');
    expect(result.query).toContain('"deleted_at" IS NULL');
    expect(result.query).toContain('("stock" > $6 OR "backorder" = $7)');
    expect(result.query).toContain('ORDER BY "price" DESC');
    expect(result.query).toContain("LIMIT 20 OFFSET 40");
    expect(result.values).toEqual([1, 2, 3, 10, 50, 0, true]);
  });

  it("handles GROUP BY and HAVING", () => {
    const result = buildSelectQuery({
      from: "sales",
      columns: ["region"],
      groupBy: ["region"],
      having: { field: "total", operator: ">", value: 1000 },
      dialect: "sqlite",
    });

    expect(result.query).toBe('SELECT "region" FROM "sales" GROUP BY "region" HAVING "total" > ?');
    expect(result.values).toEqual([1000]);
  });

  it("handles empty and/or condition groups, NOT IN, NOT LIKE, IS NOT NULL, and order nulls", () => {
    const res = buildSelectQuery({
      from: "users",
      columns: ["id.*", { column: "full_name", alias: "fn" }],
      where: {
        and: [
          { and: [] }, // renders 1=1
          { or: [] },  // renders 1=0
          { field: "status", operator: "NOT IN", value: ["banned", "deleted"] },
          { field: "email", operator: "NOT LIKE", value: "%@spam.com" },
          { field: "verified_at", operator: "IS NOT NULL" },
        ],
      },
      orderBy: [{ column: "created_at", direction: "ASC", nulls: "FIRST" }],
      dialect: "postgres",
    });

    expect(res.query).toContain("1=1");
    expect(res.query).toContain("1=0");
    expect(res.query).toContain('"status" NOT IN ($1, $2)');
    expect(res.query).toContain('"email" NOT LIKE $3');
    expect(res.query).toContain('"verified_at" IS NOT NULL');
    expect(res.query).toContain('ORDER BY "created_at" ASC NULLS FIRST');
  });

  it("rejects RIGHT JOIN on SQLite with UnsupportedSyntaxError", () => {
    expect(() =>
      buildSelectQuery({
        from: "a",
        joins: [{ type: "RIGHT", table: "b", on: { field: "b.id", operator: "=", value: 1 } }],
        dialect: "sqlite",
      })
    ).toThrow(UnsupportedSyntaxError);
  });

  it("validates query configuration and reports errors", () => {
    const res = validateSelectQuery({
      from: "",
      limit: -5,
    });
    expect(res.valid).toBe(false);
    expect(res.errors.length).toBeGreaterThan(0);
  });

  it("throws ValidationError when building with invalid config", () => {
    expect(() => buildSelectQuery({ from: "" })).toThrow(ValidationError);
  });
});
