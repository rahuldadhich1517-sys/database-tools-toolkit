// Smoke test for CommonJS exports
const assert = require("node:assert");

const {
  parseConnectionString,
  buildConnectionString,
  decodeObjectId,
  decodeSnowflakeId,
  decodeUUID,
  formatSQL,
  minifySQL,
  generateInsertSQL,
  generateCreateTable,
  buildSelectQuery,
  explainSQL,
  convertMySQLToPostgres,
  parseExplainPlan,
} = require("../dist/index.cjs");

const { parseConnectionString: parseCS } = require("../dist/connection-string/index.cjs");
const { decodeObjectId: decodeOID } = require("../dist/objectid-decode/index.cjs");
const { formatSQL: fmtSQL, buildSelectQuery: bsq } = require("../dist/sql.cjs");
const { decodeUUID: decUUID } = require("../dist/uuid-decode/index.cjs");

console.log("Running CommonJS Smoke Tests...");

// 1. Connection string
const cs = parseConnectionString("postgres://usr:pwd@localhost:5432/db");
assert.strictEqual(cs.protocol, "postgres:");
assert.strictEqual(parseCS("sqlite::memory:").database, ":memory:");

// 2. ObjectId
const oid = decodeObjectId("507f1f77bcf86cd799439011");
assert.strictEqual(oid.timestamp.seconds, 1350508407);
assert.strictEqual(decodeOID("507f1f77bcf86cd799439011").id, "507f1f77bcf86cd799439011");

// 3. Snowflake
const sf = decodeSnowflakeId(1541815603606036480n);
assert.strictEqual(sf.id, "1541815603606036480");

// 4. UUID
const u = decodeUUID("0188686f-2e38-7f9a-8ff4-39f506821360");
assert.strictEqual(u.version, 7);
assert.strictEqual(decUUID("0188686f-2e38-7f9a-8ff4-39f506821360").version, 7);

// 5. SQL Format & Minify
const formatted = formatSQL("select a from b;");
assert.ok(formatted.includes("SELECT"));
assert.strictEqual(minifySQL("SELECT   1;"), "SELECT 1;");
assert.ok(fmtSQL("select 1;").includes("SELECT"));

// 6. SQL Insert
const ins = generateInsertSQL({ table: "t", rows: { a: 1 } });
assert.strictEqual(ins.query, 'INSERT INTO "t" ("a") VALUES ($1)');

// 7. SQL Create Table
const ct = generateCreateTable({ name: "t", columns: [{ name: "id", type: "INT" }] });
assert.ok(ct.includes("CREATE TABLE"));

// 8. SQL Select Build
const sel = buildSelectQuery({ from: "users", columns: ["id"] });
assert.strictEqual(sel.query, 'SELECT "id" FROM "users"');
assert.strictEqual(bsq({ from: "t" }).query, 'SELECT * FROM "t"');

// 9. SQL Explain
const exp = explainSQL("SELECT * FROM users");
assert.strictEqual(exp.statementType, "SELECT");

// 10. MySQL to Postgres
const conv = convertMySQLToPostgres("CREATE TABLE `t` (`id` int);");
assert.ok(conv.success);

// 11. Explain Plan View
const plan = parseExplainPlan(JSON.stringify([{ Plan: { "Node Type": "Seq Scan" } }]));
assert.strictEqual(plan.dialect, "postgres");

console.log("CommonJS Smoke Tests passed successfully!");
