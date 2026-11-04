import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { execSync } from "node:child_process";

console.log("=== Verifying Packaged Tarball in Clean Consumer Project ===");

const rootDir = process.cwd();

// 1. Pack tarball
console.log("Packaging tarball using npm pack...");
const packOutput = execSync("npm pack", { cwd: rootDir }).toString().trim();
const lines = packOutput.split("\n");
const tarballFilename = lines[lines.length - 1].trim();
const tarballPath = path.resolve(rootDir, tarballFilename);
console.log(`Generated tarball: ${tarballFilename}`);

// 2. Create clean temporary consumer directory
const tempConsumerDir = fs.mkdtempSync(path.join(os.tmpdir(), "db-toolkit-consumer-"));
console.log(`Created clean temporary consumer at: ${tempConsumerDir}`);

try {
  // Initialize consumer package.json
  const consumerPkg = {
    name: "test-consumer",
    version: "1.0.0",
    private: true,
  };
  fs.writeFileSync(
    path.join(tempConsumerDir, "package.json"),
    JSON.stringify(consumerPkg, null, 2)
  );

  // Install the tarball into the consumer project
  console.log("Installing tarball into consumer project...");
  execSync(`npm install "${tarballPath}"`, {
    cwd: tempConsumerDir,
    stdio: "inherit",
  });

  // Verify node_modules resolution
  const installedPkgPath = path.join(
    tempConsumerDir,
    "node_modules",
    "@rahul_dadhich15",
    "database-tools-toolkit",
    "package.json"
  );
  if (!fs.existsSync(installedPkgPath)) {
    throw new Error(`Package was not installed in consumer node_modules at ${installedPkgPath}`);
  }
  console.log("Confirmed: package installed cleanly in consumer node_modules.");

  // Write and run ESM consumer test script
  const esmScript = `
import assert from "node:assert";
import {
  parseConnectionString,
  decodeObjectId,
  decodeSnowflakeId,
  decodeUUID,
  formatSQL,
  explainSQL,
  buildSelectQuery,
  generateInsertSQL,
  generateCreateTable,
  convertMySQLToPostgres,
  parseExplainPlan,
} from "@rahul_dadhich15/database-tools-toolkit";

import { parseConnectionString as parseCS } from "@rahul_dadhich15/database-tools-toolkit/connection-string";
import { parseExplainPlan as parseEP } from "@rahul_dadhich15/database-tools-toolkit/explain-plan";
import { decodeObjectId as decodeOID } from "@rahul_dadhich15/database-tools-toolkit/objectid";
import { convertMySQLToPostgres as cM2P } from "@rahul_dadhich15/database-tools-toolkit/mysql-to-postgres";
import { decodeSnowflakeId as decodeSF } from "@rahul_dadhich15/database-tools-toolkit/snowflake";
import { generateCreateTable as genCT } from "@rahul_dadhich15/database-tools-toolkit/sql-create-table";
import { formatSQL as fmtSQL } from "@rahul_dadhich15/database-tools-toolkit/sql-format";
import { generateInsertSQL as genINS } from "@rahul_dadhich15/database-tools-toolkit/sql-insert";
import { explainSQL as expSQL } from "@rahul_dadhich15/database-tools-toolkit/sql-explain";
import { buildSelectQuery as bSelect } from "@rahul_dadhich15/database-tools-toolkit/sql-select";
import { decodeUUID as decUUID } from "@rahul_dadhich15/database-tools-toolkit/uuid";
import { formatSQL as sqlBundleFmt } from "@rahul_dadhich15/database-tools-toolkit/sql";

console.log("Consumer ESM: Verifying all subpath exports and APIs...");

assert.strictEqual(parseConnectionString("postgres://u:p@localhost:5432/db").protocol, "postgres:");
assert.strictEqual(parseCS("sqlite::memory:").database, ":memory:");
assert.strictEqual(decodeObjectId("507f1f77bcf86cd799439011").timestamp.seconds, 1350508407);
assert.strictEqual(decodeOID("507f1f77bcf86cd799439011").id, "507f1f77bcf86cd799439011");
assert.strictEqual(decodeSnowflakeId(1541815603606036480n).id, "1541815603606036480");
assert.strictEqual(decodeSF(1541815603606036480n).workerId, 26);
assert.strictEqual(decodeUUID("0188686f-2e38-7f9a-8ff4-39f506821360").version, 7);
assert.strictEqual(decUUID("0188686f-2e38-7f9a-8ff4-39f506821360").version, 7);

assert.ok(formatSQL("select 1;").includes("SELECT"));
assert.ok(fmtSQL("select 1;").includes("SELECT"));
assert.ok(sqlBundleFmt("select 1;").includes("SELECT"));

assert.strictEqual(generateInsertSQL({ table: "t", rows: { a: 1 } }).query, 'INSERT INTO "t" ("a") VALUES ($1)');
assert.strictEqual(genINS({ table: "t", rows: { a: 1 } }).query, 'INSERT INTO "t" ("a") VALUES ($1)');

assert.ok(generateCreateTable({ name: "t", columns: [{ name: "id", type: "INT" }] }).includes("CREATE TABLE"));
assert.ok(genCT({ name: "t", columns: [{ name: "id", type: "INT" }] }).includes("CREATE TABLE"));

assert.strictEqual(buildSelectQuery({ from: "t" }).query, 'SELECT * FROM "t"');
assert.strictEqual(bSelect({ from: "t" }).query, 'SELECT * FROM "t"');

assert.strictEqual(explainSQL("SELECT 1").statementType, "SELECT");
assert.strictEqual(expSQL("SELECT 1").statementType, "SELECT");

assert.ok(convertMySQLToPostgres("CREATE TABLE \`t\` (\`id\` int);").success);
assert.ok(cM2P("CREATE TABLE \`t\` (\`id\` int);").success);

const rawPlan = [{ Plan: { "Node Type": "Seq Scan" } }];
assert.strictEqual(parseExplainPlan(JSON.stringify(rawPlan)).dialect, "postgres");
assert.strictEqual(parseEP(JSON.stringify(rawPlan)).dialect, "postgres");

console.log("Consumer ESM: All tests passed!");
`;

  fs.writeFileSync(path.join(tempConsumerDir, "consumer-esm.mjs"), esmScript);
  console.log("Running consumer ESM script...");
  execSync("node consumer-esm.mjs", { cwd: tempConsumerDir, stdio: "inherit" });

  // Write and run CJS consumer test script
  const cjsScript = `
const assert = require("node:assert");
const {
  parseConnectionString,
  decodeObjectId,
  decodeSnowflakeId,
  decodeUUID,
  formatSQL,
  explainSQL,
  buildSelectQuery,
  generateInsertSQL,
  generateCreateTable,
  convertMySQLToPostgres,
  parseExplainPlan,
} = require("@rahul_dadhich15/database-tools-toolkit");

const { parseConnectionString: parseCS } = require("@rahul_dadhich15/database-tools-toolkit/connection-string");
const { parseExplainPlan: parseEP } = require("@rahul_dadhich15/database-tools-toolkit/explain-plan");
const { decodeObjectId: decodeOID } = require("@rahul_dadhich15/database-tools-toolkit/objectid");
const { convertMySQLToPostgres: cM2P } = require("@rahul_dadhich15/database-tools-toolkit/mysql-to-postgres");
const { decodeSnowflakeId: decodeSF } = require("@rahul_dadhich15/database-tools-toolkit/snowflake");
const { generateCreateTable: genCT } = require("@rahul_dadhich15/database-tools-toolkit/sql-create-table");
const { formatSQL: fmtSQL } = require("@rahul_dadhich15/database-tools-toolkit/sql-format");
const { generateInsertSQL: genINS } = require("@rahul_dadhich15/database-tools-toolkit/sql-insert");
const { explainSQL: expSQL } = require("@rahul_dadhich15/database-tools-toolkit/sql-explain");
const { buildSelectQuery: bSelect } = require("@rahul_dadhich15/database-tools-toolkit/sql-select");
const { decodeUUID: decUUID } = require("@rahul_dadhich15/database-tools-toolkit/uuid");
const { formatSQL: sqlBundleFmt } = require("@rahul_dadhich15/database-tools-toolkit/sql");

console.log("Consumer CJS: Verifying all subpath exports and APIs...");

assert.strictEqual(parseConnectionString("postgres://u:p@localhost:5432/db").protocol, "postgres:");
assert.strictEqual(parseCS("sqlite::memory:").database, ":memory:");
assert.strictEqual(decodeObjectId("507f1f77bcf86cd799439011").timestamp.seconds, 1350508407);
assert.strictEqual(decodeOID("507f1f77bcf86cd799439011").id, "507f1f77bcf86cd799439011");
assert.strictEqual(decodeSnowflakeId(1541815603606036480n).id, "1541815603606036480");
assert.strictEqual(decodeSF(1541815603606036480n).workerId, 26);
assert.strictEqual(decodeUUID("0188686f-2e38-7f9a-8ff4-39f506821360").version, 7);
assert.strictEqual(decUUID("0188686f-2e38-7f9a-8ff4-39f506821360").version, 7);

assert.ok(formatSQL("select 1;").includes("SELECT"));
assert.ok(fmtSQL("select 1;").includes("SELECT"));
assert.ok(sqlBundleFmt("select 1;").includes("SELECT"));

assert.strictEqual(generateInsertSQL({ table: "t", rows: { a: 1 } }).query, 'INSERT INTO "t" ("a") VALUES ($1)');
assert.strictEqual(genINS({ table: "t", rows: { a: 1 } }).query, 'INSERT INTO "t" ("a") VALUES ($1)');

assert.ok(generateCreateTable({ name: "t", columns: [{ name: "id", type: "INT" }] }).includes("CREATE TABLE"));
assert.ok(genCT({ name: "t", columns: [{ name: "id", type: "INT" }] }).includes("CREATE TABLE"));

assert.strictEqual(buildSelectQuery({ from: "t" }).query, 'SELECT * FROM "t"');
assert.strictEqual(bSelect({ from: "t" }).query, 'SELECT * FROM "t"');

assert.strictEqual(explainSQL("SELECT 1").statementType, "SELECT");
assert.strictEqual(expSQL("SELECT 1").statementType, "SELECT");

assert.ok(convertMySQLToPostgres("CREATE TABLE \`t\` (\`id\` int);").success);
assert.ok(cM2P("CREATE TABLE \`t\` (\`id\` int);").success);

const rawPlan = [{ Plan: { "Node Type": "Seq Scan" } }];
assert.strictEqual(parseExplainPlan(JSON.stringify(rawPlan)).dialect, "postgres");
assert.strictEqual(parseEP(JSON.stringify(rawPlan)).dialect, "postgres");

console.log("Consumer CJS: All tests passed!");
`;

  fs.writeFileSync(path.join(tempConsumerDir, "consumer-cjs.cjs"), cjsScript);
  console.log("Running consumer CJS script...");
  execSync("node consumer-cjs.cjs", { cwd: tempConsumerDir, stdio: "inherit" });

  console.log("\n✅ All consumer tarball verifications passed successfully!");
} finally {
  // Cleanup
  console.log("Cleaning up temporary directories and tarball...");
  fs.rmSync(tempConsumerDir, { recursive: true, force: true });
  if (fs.existsSync(tarballPath)) {
    fs.unlinkSync(tarballPath);
  }
}
