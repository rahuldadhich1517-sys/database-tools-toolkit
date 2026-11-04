# @rahul_dadhich15/database-tools-toolkit

[![CI](https://github.com/rahul_dadhich15/database-tools-toolkit/actions/workflows/ci.yml/badge.svg)](https://github.com/rahul_dadhich15/database-tools-toolkit/actions/workflows/ci.yml)
[![Zero Runtime Dependencies](https://img.shields.io/badge/dependencies-0-brightgreen.svg)](https://www.npmjs.com/package/@rahul_dadhich15/database-tools-toolkit)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

A browser-first, zero-runtime-dependency universal TypeScript toolkit for database tooling, SQL generation, parsing, formatting, explain plan visualization, and distributed ID decoding.

Designed specifically to run 100% locally in web browsers (e.g. React/Vite developer tools websites) as well as Node.js, Deno, Bun, and edge runtimes without backend servers, database drivers, or network requests.

---

## Key Highlights

- **Zero Runtime Dependencies**: Zero external dependencies in production.
- **Browser-First & Universal**: Works directly in modern evergreen browsers without polyfills or Node.js shims (`no Buffer`, `no child_process`, `no fs`, `no Node crypto`).
- **Complete Typing**: Written in strict TypeScript with full `.d.ts` (ESM) and `.d.cts` (CJS) type declarations.
- **Dual Module Support**: Full ESM (`import`) and CommonJS (`require()`) compatibility.
- **Granular Tree-Shakeable Subpaths**: Import only the utilities you need to keep browser bundle sizes minimal.
- **Security-First**: Parameterized SQL queries, identifier validation to prevent injection, and built-in credential redaction.

---

## Installation

```bash
npm install @rahul_dadhich15/database-tools-toolkit
```

Or with yarn / pnpm / bun:

```bash
pnpm add @rahul_dadhich15/database-tools-toolkit
yarn add @rahul_dadhich15/database-tools-toolkit
bun add @rahul_dadhich15/database-tools-toolkit
```

---

## Environment & Compatibility

| Platform | Minimum Supported Version | Notes |
| :--- | :--- | :--- |
| **Node.js** | `>= 18.0.0` | Uses native `BigInt`, `URL`, `URLSearchParams` |
| **Modern Browsers** | Chrome `>= 90`, Firefox `>= 88`, Safari `>= 15`, Edge `>= 90` | ES2022 compliant |
| **Deno / Bun** | `Deno >= 1.30`, `Bun >= 1.0` | Native ESM |

---

## Subpath Exports & Tree-Shaking

To minimize web application bundle sizes, import individual utilities via granular subpaths:

```ts
// Root export (all utilities)
import { formatSQL, parseConnectionString } from "@rahul_dadhich15/database-tools-toolkit";

// Granular subpaths
import { parseConnectionString } from "@rahul_dadhich15/database-tools-toolkit/connection-string";
import { parseExplainPlan } from "@rahul_dadhich15/database-tools-toolkit/explain-plan";
import { decodeObjectId } from "@rahul_dadhich15/database-tools-toolkit/objectid";
import { convertMySQLToPostgres } from "@rahul_dadhich15/database-tools-toolkit/mysql-to-postgres";
import { decodeSnowflakeId } from "@rahul_dadhich15/database-tools-toolkit/snowflake";
import { generateCreateTable } from "@rahul_dadhich15/database-tools-toolkit/sql-create-table";
import { formatSQL, minifySQL } from "@rahul_dadhich15/database-tools-toolkit/sql-format";
import { generateInsertSQL } from "@rahul_dadhich15/database-tools-toolkit/sql-insert";
import { explainSQL } from "@rahul_dadhich15/database-tools-toolkit/sql-explain";
import { buildSelectQuery } from "@rahul_dadhich15/database-tools-toolkit/sql-select";
import { decodeUUID } from "@rahul_dadhich15/database-tools-toolkit/uuid";

// Combined SQL bundle
import { formatSQL, explainSQL, buildSelectQuery } from "@rahul_dadhich15/database-tools-toolkit/sql";
```

---

## The 11 Database Utilities

### 1. Connection String (`connection-string`)

Parse, validate, format, and safely redact database connection URIs and key-value connection strings.

```ts
import {
  parseConnectionString,
  buildConnectionString,
  validateConnectionString,
  redactConnectionString,
} from "@rahul_dadhich15/database-tools-toolkit/connection-string";

// 1. Parse URI
const parsed = parseConnectionString(
  "postgresql://admin:SecretPass%21@db.example.com:5432/production?sslmode=require"
);
console.log(parsed.protocol); // "postgresql:"
console.log(parsed.username); // "admin"
console.log(parsed.password); // "SecretPass!"
console.log(parsed.hosts);    // [{ host: "db.example.com", port: 5432 }]
console.log(parsed.params);   // { sslmode: "require" }

// 2. Safe UI Redaction (never exposes password)
const safeString = redactConnectionString("postgres://user:super_secret@localhost:5432/mydb");
console.log(safeString); // "postgres://user:***@localhost:5432/mydb"

// 3. Build connection string
const uri = buildConnectionString({
  protocol: "mysql",
  username: "root",
  password: "pwd",
  host: "127.0.0.1",
  port: 3306,
  database: "app",
});
```

Supported schemes: `postgres://`, `postgresql://`, `mysql://`, `mongodb://`, `mongodb+srv://`, `redis://`, `rediss://`, `sqlite:`, and key-value strings (`Host=...;Port=...`).

---

### 2. EXPLAIN Plan View (`explain-plan`)

Normalizes PostgreSQL JSON and MySQL `FORMAT=JSON` query execution plans into a standardized tree structure and renders ASCII trees for visualization.

```ts
import {
  parseExplainPlan,
  formatExplainPlan,
  getExplainPlanSummary,
} from "@rahul_dadhich15/database-tools-toolkit/explain-plan";

const pgExplain = JSON.stringify([
  {
    Plan: {
      "Node Type": "Nested Loop",
      "Total Cost": 35.5,
      Plans: [
        { "Node Type": "Index Scan", "Relation Name": "users", "Total Cost": 8.17 },
        { "Node Type": "Seq Scan", "Relation Name": "orders", "Total Cost": 25.0 }
      ]
    }
  }
]);

const plan = parseExplainPlan(pgExplain);
console.log(getExplainPlanSummary(plan));
// { dialect: 'postgres', nodeCount: 3, totalEstimatedCost: 35.5, tablesAccessed: ['users', 'orders'], ... }

console.log(formatExplainPlan(plan));
/*
Nested Loop (cost=35.5)
├─ Index Scan on users (cost=8.17)
└─ Seq Scan on orders (cost=25)
*/
```

---

### 3. MongoDB ObjectId Decode (`objectid`)

Decodes 24-character hexadecimal MongoDB ObjectIds into Unix timestamp, 5-byte random value, and 3-byte incrementing counter without external libraries.

```ts
import { decodeObjectId, isValidObjectId } from "@rahul_dadhich15/database-tools-toolkit/objectid";

const id = "507f1f77bcf86cd799439011";

if (isValidObjectId(id)) {
  const decoded = decodeObjectId(id);
  console.log(decoded.timestamp.seconds);      // 1350508407
  console.log(decoded.timestamp.iso);          // "2012-10-17T21:13:27.000Z"
  console.log(decoded.randomHex);              // "bcf86cd799"
  console.log(decoded.counter.value);          // 4427793
}
```

---

### 4. MySQL to PostgreSQL DDL Converter (`mysql-to-postgres`)

Converts supported MySQL `CREATE TABLE` statements to clean PostgreSQL DDL using a token-level parser.

```ts
import { convertMySQLToPostgres } from "@rahul_dadhich15/database-tools-toolkit/mysql-to-postgres";

const mysqlDDL = `
  CREATE TABLE \`users\` (
    \`id\` int(11) NOT NULL AUTO_INCREMENT,
    \`username\` varchar(50) NOT NULL,
    \`bio\` text,
    \`is_admin\` tinyint(1) DEFAULT 0,
    \`data\` json,
    PRIMARY KEY (\`id\`)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
`;

const result = convertMySQLToPostgres(mysqlDDL);
console.log(result.sql);
/*
CREATE TABLE "users" (
  "id" INTEGER GENERATED BY DEFAULT AS IDENTITY,
  "username" VARCHAR(50) NOT NULL,
  "bio" TEXT,
  "is_admin" BOOLEAN DEFAULT 0,
  "data" JSONB,
  PRIMARY KEY ("id")
);
*/
console.log(result.warnings); // Warnings for stripped table engine, character sets, etc.
```

---

### 5. Snowflake ID Decode & Encode (`snowflake`)

Safely decodes and encodes Twitter/Discord Snowflake IDs using 64-bit `BigInt` arithmetic.

```ts
import { decodeSnowflakeId, encodeSnowflakeId } from "@rahul_dadhich15/database-tools-toolkit/snowflake";

// Decode
const decoded = decodeSnowflakeId("1541815603606036480");
console.log(decoded.timestamp.iso); // "2022-06-28T16:15:37.387Z"
console.log(decoded.workerId);      // 26
console.log(decoded.sequence);      // 0

// Reversible Encode
const encoded = encodeSnowflakeId({
  timestamp: 1680000000000,
  workerId: 5,
  datacenterId: 2,
  sequence: 1,
});
```

---

### 6. SQL CREATE TABLE Generator (`sql-create-table`)

Generates structured, validated DDL statements across PostgreSQL, MySQL, and SQLite.

```ts
import { generateCreateTable } from "@rahul_dadhich15/database-tools-toolkit/sql-create-table";

const ddl = generateCreateTable(
  {
    name: "orders",
    columns: [
      { name: "id", type: "BIGINT", autoIncrement: true, primaryKey: true },
      { name: "order_number", type: "VARCHAR", length: 32, nullable: false, unique: true },
      { name: "amount", type: "DECIMAL", precision: 12, scale: 2, default: 0 },
      { name: "status", type: "VARCHAR", length: 20, default: "pending" },
    ],
  },
  "postgres"
);
```

---

### 7. SQL Formatter & Minifier (`sql-format`)

Formats, indents, and minifies SQL queries while preserving string literals, PostgreSQL dollar quotes, and inline/block comments.

```ts
import { formatSQL, minifySQL } from "@rahul_dadhich15/database-tools-toolkit/sql-format";

const raw = "select id,name from users where age > 18 order by name asc limit 10;";
console.log(formatSQL(raw));
/*
SELECT id,
  name
FROM users
WHERE age > 18
ORDER BY name ASC
LIMIT 10;
*/

console.log(minifySQL(raw));
// "SELECT id,name FROM users WHERE age>18 ORDER BY name ASC LIMIT 10;"
```

---

### 8. SQL INSERT Statement Generator (`sql-insert`)

Generates parameterized single-row and multi-row SQL INSERT statements with dialect-specific placeholders (`$1, $2` vs `?`).

```ts
import { generateInsertSQL, generateBulkInsertSQL } from "@rahul_dadhich15/database-tools-toolkit/sql-insert";

const { query, values } = generateInsertSQL({
  table: "users",
  rows: [
    { name: "Rahul", age: 23 },
    { name: "Alice", age: 30 }
  ],
  dialect: "postgres",
});

console.log(query);
// 'INSERT INTO "users" ("name", "age") VALUES ($1, $2), ($3, $4)'
console.log(values);
// ["Rahul", 23, "Alice", 30]
```

---

### 9. SQL Explain & Static Analyzer (`sql-explain`)

Analyzes SQL queries statically using rule-based token inspections to provide plain English explanations and performance warnings.

```ts
import { explainSQL } from "@rahul_dadhich15/database-tools-toolkit/sql-explain";

const explanation = explainSQL("SELECT * FROM users WHERE email LIKE '%@domain.com'");
console.log(explanation.humanReadable);
// 'Reads records from table(s) "users". Applies filter condition(s): email LIKE '%@domain.com'.'

console.log(explanation.performanceObservations);
// [
//   "Query uses 'SELECT *', which fetches all columns...",
//   "Query contains LIKE with a leading wildcard ('%...'). This typically prevents B-tree index usage..."
// ]
```

---

### 10. SQL SELECT Query Builder (`sql-select`)

Builds parameterized SELECT queries with joins, nested conditions, and pagination.

```ts
import { buildSelectQuery } from "@rahul_dadhich15/database-tools-toolkit/sql-select";

const { query, values } = buildSelectQuery({
  from: "products",
  columns: ["id", "title", "price"],
  where: {
    and: [
      { field: "category_id", operator: "=", value: 4 },
      { field: "stock", operator: ">", value: 0 },
      { field: "is_active", operator: "=", value: true },
    ],
  },
  orderBy: [{ column: "price", direction: "DESC" }],
  limit: 20,
  offset: 0,
  dialect: "postgres",
});

console.log(query);
// 'SELECT "id", "title", "price" FROM "products" WHERE ("category_id" = $1 AND "stock" = $2 AND "is_active" = $3) ORDER BY "price" DESC LIMIT 20 OFFSET 0'
console.log(values);
// [4, 0, true]
```

---

### 11. UUID Decoder (`uuid`)

Decodes and inspects UUIDs (v1, v4, v6, v7) and extracts RFC variants, timestamp components, and node identifiers.

```ts
import { decodeUUID } from "@rahul_dadhich15/database-tools-toolkit/uuid";

// UUID v7 (Time-ordered Unix Epoch)
const v7 = decodeUUID("0188686f-2e38-7f9a-8ff4-39f506821360");
console.log(v7.version);                 // 7
console.log(v7.variant);                 // "RFC 4122 / RFC 9562"
console.log(v7.timestamp?.milliseconds); // 1685379296824
console.log(v7.timestamp?.iso);          // "2023-05-29T16:54:56.824Z"

// UUID v4 (Random)
const v4 = decodeUUID("f47ac10b-58cc-4372-a567-0e02b2c3d479");
console.log(v4.version);   // 4
console.log(v4.timestamp); // null (no timestamp inferred)
```

---

## Dialect Support Matrix

| Feature | PostgreSQL | MySQL | SQLite |
| :--- | :---: | :---: | :---: |
| **Identifier Quoting** | `"identifier"` | `` `identifier` `` | `"identifier"` |
| **Placeholders** | `$1, $2, ...` | `?, ?, ...` | `?, ?, ...` |
| **AUTO_INCREMENT / Identity** | `GENERATED BY DEFAULT AS IDENTITY` | `AUTO_INCREMENT` | `AUTOINCREMENT` |
| **JSON Support** | `JSONB` / `JSON` | `JSON` | `TEXT` |
| **RIGHT JOIN** | Supported | Supported | Not supported (warns/rejects) |
| **EXPLAIN Plan Normalization** | JSON format | FORMAT=JSON | Generic fallback |

---

## Security Best Practices

1. **Untrusted Input**: All table and column identifiers are validated against an allowlist pattern (`/^[a-zA-Z_][a-zA-Z0-9_$]*$/`) to prevent SQL injection.
2. **Parameterized Values**: All values passed to generators (`generateInsertSQL`, `buildSelectQuery`) are parameterized and never interpolated into SQL strings.
3. **No Execution**: This toolkit strictly performs client-side string processing and static analysis. It **never** executes SQL, establishes network sockets, or calls `eval()` or `new Function()`.
4. **Credential Redaction**: When displaying user connection strings in UIs, always use `redactConnectionString()` to prevent leaking database passwords.

---

## Development & Testing

```bash
# Install development dependencies
npm install

# Run TypeScript type check
npm run typecheck

# Run unit tests
npm test

# Run unit tests with code coverage (enforces >=90% statements/lines, >=80% branches)
npm run test:coverage

# Build ESM, CommonJS, and declaration files (.d.ts, .d.cts)
npm run build

# Run in-repo ESM and CommonJS smoke verification
npm run test:smoke

# Pack and verify clean installation in an isolated consumer project
npm run test:consumer
```

---

## License

MIT © [Rahul Dadhich](https://github.com/rahul_dadhich15)
