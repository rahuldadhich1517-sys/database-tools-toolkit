import { describe, it, expect } from "vitest";

// Import all 11 utilities from root package export
import {
  parseConnectionString,
  buildConnectionString,
  validateConnectionString,
  redactConnectionString,
  parseExplainPlan,
  normalizeExplainPlan,
  formatExplainPlan,
  getExplainPlanSummary,
  decodeObjectId,
  isValidObjectId,
  convertMySQLToPostgres,
  convertMySQLTypeToPostgres,
  getMySQLToPostgresMappings,
  decodeSnowflakeId,
  encodeSnowflakeId,
  generateCreateTable,
  validateTableDefinition,
  formatSQL,
  minifySQL,
  generateInsertSQL,
  generateBulkInsertSQL,
  explainSQL,
  analyzeSQL,
  getSQLStatementType,
  buildSelectQuery,
  validateSelectQuery,
  decodeUUID,
  isValidUUID,
} from "../src/index";

describe("All 11 Utilities Smoke Integration Test", () => {
  it("exercises utility 1: connection-string", () => {
    const cs = "postgres://user:secret@localhost:5432/mydb";
    const parsed = parseConnectionString(cs);
    expect(parsed.protocol).toBe("postgres:");
    expect(parsed.database).toBe("mydb");

    const built = buildConnectionString({ protocol: "postgres", host: "localhost", database: "test" });
    expect(built).toBe("postgres://localhost/test");

    const validated = validateConnectionString(cs);
    expect(validated.valid).toBe(true);

    const redacted = redactConnectionString(cs);
    expect(redacted).not.toContain("secret");
  });

  it("exercises utility 2: explain-plan-view", () => {
    const raw = { Plan: { "Node Type": "Seq Scan", "Relation Name": "users" } };
    const plan = normalizeExplainPlan(raw);
    expect(plan.root.type).toBe("Seq Scan");
    expect(getExplainPlanSummary(plan).nodeCount).toBe(1);
    expect(formatExplainPlan(plan)).toContain("Seq Scan on users");

    const parsed = parseExplainPlan(JSON.stringify([raw]));
    expect(parsed.dialect).toBe("postgres");
  });

  it("exercises utility 3: objectid-decode", () => {
    const id = "507f1f77bcf86cd799439011";
    expect(isValidObjectId(id)).toBe(true);
    const decoded = decodeObjectId(id);
    expect(decoded.timestamp.seconds).toBe(1350508407);
  });

  it("exercises utility 4: mysql-to-postgres", () => {
    const mysql = "CREATE TABLE `users` (`id` INT AUTO_INCREMENT PRIMARY KEY);";
    const res = convertMySQLToPostgres(mysql);
    expect(res.success).toBe(true);
    expect(res.sql).toContain('CREATE TABLE "users"');
    expect(convertMySQLTypeToPostgres("INT UNSIGNED").postgresType).toBe("BIGINT");
    expect(getMySQLToPostgresMappings()["JSON"]).toBe("JSONB");
  });

  it("exercises utility 5: snowflake-id-decode", () => {
    const encoded = encodeSnowflakeId({ timestamp: 1600000000000, workerId: 1 });
    const decoded = decodeSnowflakeId(encoded);
    expect(decoded.workerId).toBe(1);
    expect(decoded.timestamp.milliseconds).toBe(1600000000000);
  });

  it("exercises utility 6: sql-create-table", () => {
    const tableDef = {
      name: "items",
      columns: [{ name: "id", type: "INT", primaryKey: true }],
    };
    expect(validateTableDefinition(tableDef).valid).toBe(true);
    const ddl = generateCreateTable(tableDef, "postgres");
    expect(ddl).toContain('CREATE TABLE "items"');
  });

  it("exercises utility 7: sql-format", () => {
    const sql = "select a, b from c where d = 1;";
    const formatted = formatSQL(sql);
    expect(formatted).toContain("SELECT");
    expect(minifySQL(formatted)).toBe("SELECT a,b FROM c WHERE d=1;");
  });

  it("exercises utility 8: sql-insert-generate", () => {
    const res = generateInsertSQL({ table: "users", rows: { id: 1 } });
    expect(res.query).toBe('INSERT INTO "users" ("id") VALUES ($1)');
    const bulk = generateBulkInsertSQL({ table: "users", rows: [{ id: 1 }, { id: 2 }], batchSize: 1 });
    expect(bulk).toHaveLength(2);
  });

  it("exercises utility 9: sql-explain", () => {
    const sql = "SELECT * FROM users WHERE id = 1";
    expect(getSQLStatementType(sql)).toBe("SELECT");
    const analysis = analyzeSQL(sql);
    expect(analysis.tables).toContain("users");
    const exp = explainSQL(sql);
    expect(exp.humanReadable).toContain("Reads records");
  });

  it("exercises utility 10: sql-select-build", () => {
    const res = buildSelectQuery({ from: "users", columns: ["id"], where: { field: "id", operator: "=", value: 5 } });
    expect(res.query).toBe('SELECT "id" FROM "users" WHERE "id" = $1');
    expect(validateSelectQuery({ from: "users" }).valid).toBe(true);
  });

  it("exercises utility 11: uuid-decode", () => {
    const v7 = "0188686f-2e38-7f9a-8ff4-39f506821360";
    expect(isValidUUID(v7)).toBe(true);
    const decoded = decodeUUID(v7);
    expect(decoded.version).toBe(7);
    expect(decoded.timestamp?.milliseconds).toBe(1685379296824);
  });
});
