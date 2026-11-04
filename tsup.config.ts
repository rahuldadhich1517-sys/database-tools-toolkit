import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    index: "src/index.ts",
    "connection-string/index": "src/connection-string/index.ts",
    "explain-plan-view/index": "src/explain-plan-view/index.ts",
    "objectid-decode/index": "src/objectid-decode/index.ts",
    "mysql-to-postgres/index": "src/mysql-to-postgres/index.ts",
    "snowflake-id-decode/index": "src/snowflake-id-decode/index.ts",
    "sql-create-table/index": "src/sql-create-table/index.ts",
    "sql-format/index": "src/sql-format/index.ts",
    "sql-insert-generate/index": "src/sql-insert-generate/index.ts",
    "sql-explain/index": "src/sql-explain/index.ts",
    "sql-select-build/index": "src/sql-select-build/index.ts",
    "uuid-decode/index": "src/uuid-decode/index.ts",
    sql: "src/sql.ts",
  },
  format: ["esm", "cjs"],
  dts: true,
  clean: true,
  sourcemap: true,
  treeshake: true,
  splitting: false,
  target: "es2022",
  outDir: "dist",
});
