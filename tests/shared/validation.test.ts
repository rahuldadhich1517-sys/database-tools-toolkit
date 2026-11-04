import { describe, it, expect } from "vitest";
import {
  validateIdentifier,
  quoteIdentifier,
  isValidIdentifierName,
  assertNonEmptyString,
  assertArray,
} from "../../src/shared/validation";
import { isSupportedDialect } from "../../src/shared/sql-dialects";
import { getPlaceholder } from "../../src/shared/sql-placeholders";
import { InvalidIdentifierError, ValidationError } from "../../src/shared/errors";

describe("Validation and Quoting", () => {
  it("validates valid identifier names", () => {
    expect(isValidIdentifierName("users")).toBe(true);
    expect(isValidIdentifierName("_internal_id")).toBe(true);
    expect(isValidIdentifierName("Table123")).toBe(true);
    expect(isValidIdentifierName("")).toBe(false);
    expect(isValidIdentifierName("123table")).toBe(false);
    expect(isValidIdentifierName("user-name")).toBe(false);
    expect(isValidIdentifierName("user name")).toBe(false);
  });

  it("validates compound and quoted identifiers", () => {
    expect(() => validateIdentifier("public.users")).not.toThrow();
    expect(() => validateIdentifier('"users"')).not.toThrow();
    expect(() => validateIdentifier("`my_table`")).not.toThrow();
    expect(() => validateIdentifier("[order details]")).not.toThrow();
  });

  it("throws InvalidIdentifierError on malicious or invalid identifiers", () => {
    expect(() => validateIdentifier("users; DROP TABLE students;")).toThrow(InvalidIdentifierError);
    expect(() => validateIdentifier("users--comment")).toThrow(InvalidIdentifierError);
    expect(() => validateIdentifier("users..id")).toThrow(InvalidIdentifierError);
    expect(() => validateIdentifier("")).toThrow(InvalidIdentifierError);
    expect(() => validateIdentifier('"with\0null"')).toThrow(InvalidIdentifierError);
  });

  it("quotes identifiers correctly by dialect", () => {
    expect(quoteIdentifier("users", "postgres")).toBe('"users"');
    expect(quoteIdentifier("users", "mysql")).toBe("`users`");
    expect(quoteIdentifier("users", "sqlite")).toBe('"users"');
    expect(quoteIdentifier("schema.users", "postgres")).toBe('"schema"."users"');
    expect(quoteIdentifier("schema.users", "mysql")).toBe("`schema`.`users`");
    expect(quoteIdentifier('"already_quoted"', "postgres")).toBe('"already_quoted"');
  });

  it("escapes embedded quote characters in quoted identifiers", () => {
    expect(quoteIdentifier('"weird""name"', "postgres")).toBe('"weird""""name"');
  });

  it("assertNonEmptyString checks", () => {
    expect(() => assertNonEmptyString("valid", "test")).not.toThrow();
    expect(() => assertNonEmptyString("", "test")).toThrow(ValidationError);
    expect(() => assertNonEmptyString(null, "test")).toThrow(ValidationError);
  });

  it("assertArray checks", () => {
    expect(() => assertArray([1, 2], "test")).not.toThrow();
    expect(() => assertArray("not an array", "test")).toThrow(ValidationError);
  });

  it("checks supported dialects and placeholder generation", () => {
    expect(isSupportedDialect("postgres")).toBe(true);
    expect(isSupportedDialect("mysql")).toBe(true);
    expect(isSupportedDialect("sqlite")).toBe(true);
    expect(isSupportedDialect("oracle")).toBe(false);

    expect(getPlaceholder(1, "postgres")).toBe("$1");
    expect(getPlaceholder(2, "mysql")).toBe("?");
    expect(() => getPlaceholder(1, "oracle" as any)).toThrow();
  });
});
