# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2026-11-04

### Added
- **Initial release** of `@rahul_dadhich15/database-tools-toolkit`.
- Zero third-party runtime dependencies, browser-first universal TypeScript library.
- **Utility 1: Connection String (`connection-string`)**:
  - `parseConnectionString()`
  - `buildConnectionString()`
  - `validateConnectionString()`
  - `redactConnectionString()`
  - Support for PostgreSQL, MySQL, MongoDB, Redis, and SQLite URIs, plus key-value strings.
- **Utility 2: EXPLAIN Plan Viewer (`explain-plan-view`)**:
  - `parseExplainPlan()`
  - `normalizeExplainPlan()`
  - `formatExplainPlan()`
  - `getExplainPlanSummary()`
  - Normalization of PostgreSQL JSON and MySQL FORMAT=JSON explain trees.
- **Utility 3: ObjectId Decoder (`objectid-decode`)**:
  - `decodeObjectId()`
  - `isValidObjectId()`
  - 24-character hexadecimal parsing with 4-byte timestamp, 5-byte random value, and 3-byte counter.
- **Utility 4: MySQL to PostgreSQL DDL Converter (`mysql-to-postgres`)**:
  - `convertMySQLToPostgres()`
  - `convertMySQLTypeToPostgres()`
  - `getMySQLToPostgresMappings()`
  - Token-level AST parser for CREATE TABLE statements, identity auto-increment, and constraint conversion.
- **Utility 5: Snowflake ID Decoder & Encoder (`snowflake-id-decode`)**:
  - `decodeSnowflakeId()`
  - `encodeSnowflakeId()`
  - Safe 64-bit BigInt math, configurable epoch, and customizable bit allocations.
- **Utility 6: SQL CREATE TABLE Generator (`sql-create-table`)**:
  - `generateCreateTable()`
  - `validateTableDefinition()`
  - Dialect-aware DDL generation for PostgreSQL, MySQL, and SQLite.
- **Utility 7: SQL Formatter & Minifier (`sql-format`)**:
  - `formatSQL()`
  - `minifySQL()`
  - Tokenizer-backed SQL indentation and whitespace minification preserving literals and comments.
- **Utility 8: SQL INSERT Generator (`sql-insert-generate`)**:
  - `generateInsertSQL()`
  - `generateBulkInsertSQL()`
  - Parameterized queries with `$1` or `?` placeholders and bulk chunking.
- **Utility 9: SQL Explain & Static Analyzer (`sql-explain`)**:
  - `explainSQL()`
  - `analyzeSQL()`
  - `getSQLStatementType()`
  - Plain English explanation and static performance heuristic checks.
- **Utility 10: SQL SELECT Query Builder (`sql-select-build`)**:
  - `buildSelectQuery()`
  - `validateSelectQuery()`
  - Dialect-aware parameterized query builder with nested condition trees and join support.
- **Utility 11: UUID Decoder (`uuid-decode`)**:
  - `decodeUUID()`
  - `isValidUUID()`
  - RFC 4122 / RFC 9562 parsing for UUID v1, v4, v6, and v7 with Gregorian and Unix timestamp extraction.
- Granular subpath exports for tree-shaking across all utilities and convenient `/sql` bundle.
- ESM and CommonJS support with `.d.ts` and `.d.cts` declarations.
