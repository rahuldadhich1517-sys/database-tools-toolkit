import { describe, it, expect } from "vitest";
import {
  generateInsertSQL,
  generateBulkInsertSQL,
} from "../../src/sql-insert-generate/index";
import { ValidationError, InvalidIdentifierError } from "../../src/shared/errors";

describe("SQL Insert Generator", () => {
  it("generates single-row insert with PostgreSQL parameterization ($1, $2)", () => {
    const result = generateInsertSQL({
      table: "users",
      rows: { name: "Rahul", age: 23 },
      dialect: "postgres",
    });

    expect(result.query).toBe('INSERT INTO "users" ("name", "age") VALUES ($1, $2)');
    expect(result.values).toEqual(["Rahul", 23]);
  });

  it("generates MySQL insert with ? placeholders", () => {
    const result = generateInsertSQL({
      table: "users",
      rows: { name: "Alice", active: true },
      dialect: "mysql",
    });

    expect(result.query).toBe("INSERT INTO `users` (`name`, `active`) VALUES (?, ?)");
    expect(result.values).toEqual(["Alice", true]);
  });

  it("handles multi-row inserts with consistent column ordering", () => {
    const result = generateInsertSQL({
      table: "products",
      rows: [
        { name: "Laptop", price: 999.99 },
        { price: 19.99, name: "Mouse" }, // swapped order
      ],
      dialect: "postgres",
    });

    expect(result.query).toBe('INSERT INTO "products" ("name", "price") VALUES ($1, $2), ($3, $4)');
    expect(result.values).toEqual(["Laptop", 999.99, "Mouse", 19.99]);
  });

  it("handles null, dates, and json values cleanly", () => {
    const date = new Date("2026-01-01T00:00:00.000Z");
    const result = generateInsertSQL({
      table: "logs",
      rows: { message: null, created_at: date, meta: { ip: "127.0.0.1" } },
      dialect: "sqlite",
    });

    expect(result.values).toEqual([null, "2026-01-01T00:00:00.000Z", '{"ip":"127.0.0.1"}']);
  });

  it("generates bulk inserts in batches", () => {
    const rows = Array.from({ length: 25 }, (_, i) => ({ id: i + 1, val: `v_${i}` }));
    const batches = generateBulkInsertSQL({
      table: "items",
      rows,
      batchSize: 10,
      dialect: "postgres",
    });

    expect(batches).toHaveLength(3); // 10, 10, 5
    expect(batches[0].values).toHaveLength(20);
    expect(batches[2].values).toHaveLength(10);
  });

  it("validates identifiers against SQL injection", () => {
    expect(() =>
      generateInsertSQL({
        table: "users; DROP TABLE students;",
        rows: { name: "test" },
      })
    ).toThrow(InvalidIdentifierError);

    expect(() =>
      generateInsertSQL({
        table: "users",
        rows: { "col--comment": "val" },
      })
    ).toThrow(InvalidIdentifierError);
  });

  it("throws ValidationError on empty rows", () => {
    expect(() =>
      generateInsertSQL({
        table: "users",
        rows: [],
      })
    ).toThrow(ValidationError);
  });

  it("handles boolean, bigint, string and validates non-object rows", () => {
    const res = generateInsertSQL({
      table: "stats",
      rows: { count: 100n, active: false, label: "metric" },
      dialect: "postgres",
    });
    expect(res.values).toEqual([100n, false, "metric"]);

    expect(() =>
      generateInsertSQL({
        table: "stats",
        rows: "not an object" as any,
      })
    ).toThrow(ValidationError);

    expect(() =>
      generateBulkInsertSQL({
        table: "stats",
        rows: [],
      })
    ).toThrow(ValidationError);
  });
});
