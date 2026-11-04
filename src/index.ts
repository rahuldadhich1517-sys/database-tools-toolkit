// Root entry point for @rahul_dadhich15/database-tools-toolkit

// 1. Connection string
export {
  parseConnectionString,
  buildConnectionString,
  validateConnectionString,
  redactConnectionString,
  getDefaultPort,
  type ParsedConnectionString,
  type ConnectionConfig,
  type ConnectionValidationResult,
} from "./connection-string/index";

// 2. Explain plan view
export {
  parseExplainPlan,
  normalizeExplainPlan,
  formatExplainPlan,
  getExplainPlanSummary,
  type ExplainPlanNode,
  type NormalizedExplainPlan,
  type ExplainPlanSummary,
  type ExplainFormatOptions,
  type ExplainCost,
  type ExplainTime,
} from "./explain-plan-view/index";

// 3. ObjectId decode
export {
  decodeObjectId,
  isValidObjectId,
  type DecodedObjectId,
} from "./objectid-decode/index";

// 4. MySQL to Postgres converter
export {
  convertMySQLToPostgres,
  convertMySQLTypeToPostgres,
  getMySQLToPostgresMappings,
  type MySQLToPostgresOptions,
  type ConversionResult,
} from "./mysql-to-postgres/index";

// 5. Snowflake ID decode
export {
  decodeSnowflakeId,
  encodeSnowflakeId,
  type SnowflakeOptions,
  type DecodedSnowflakeId,
  type SnowflakeEncodeInput,
} from "./snowflake-id-decode/index";

// 6. SQL Create Table generator
export {
  generateCreateTable,
  validateTableDefinition,
  type TableDefinition,
  type ColumnDefinition,
  type ForeignKeyDefinition,
  type TableValidationResult,
  type ColumnType,
} from "./sql-create-table/index";

// 7. SQL Formatter
export {
  formatSQL,
  minifySQL,
  type FormatSQLOptions,
} from "./sql-format/index";

// 8. SQL Insert generator
export {
  generateInsertSQL,
  generateBulkInsertSQL,
  type InsertInput,
  type BulkInsertInput,
} from "./sql-insert-generate/index";

// 9. SQL Explain (Static rule-based analyzer)
export {
  explainSQL,
  analyzeSQL,
  getSQLStatementType,
  type SQLStatementType,
  type SQLAnalysis,
  type SQLExplanation,
  type SQLAnalysisJoin,
} from "./sql-explain/index";

// 10. SQL Select query builder
export {
  buildSelectQuery,
  validateSelectQuery,
  type SelectQueryConfig,
  type QueryValidationResult,
  type Condition,
  type SimpleCondition,
  type CompoundCondition,
  type JoinClause,
  type OrderByClause,
  type ColumnSelect,
  type ComparisonOperator,
} from "./sql-select-build/index";

// 11. UUID decode
export {
  decodeUUID,
  isValidUUID,
  type DecodedUUID,
} from "./uuid-decode/index";

// Shared exports
export {
  DatabaseToolkitError,
  ValidationError,
  ParseError,
  UnsupportedSyntaxError,
  InvalidIdentifierError,
} from "./shared/errors";

export {
  tokenizeSQL,
  type Token,
  type TokenType,
  type TokenizerOptions,
} from "./shared/sql-tokenizer";

export {
  quoteIdentifier,
  validateIdentifier,
  isValidIdentifierName,
} from "./shared/validation";

export {
  getPlaceholder,
} from "./shared/sql-placeholders";

export type {
  Dialect,
  SQLParamValue,
  ParameterizedQuery,
} from "./shared/types";
