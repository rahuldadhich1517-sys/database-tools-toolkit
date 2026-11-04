import { describe, it, expect } from "vitest";
import {
  parseConnectionString,
  buildConnectionString,
  validateConnectionString,
  redactConnectionString,
  getDefaultPort,
} from "../../src/connection-string/index";
import { ValidationError } from "../../src/shared/errors";

describe("Connection String Utility", () => {
  it("parses postgres URI with credentials, port, db and query parameters", () => {
    const uri = "postgresql://myuser:secret%21pass@db.example.com:5432/mydb?sslmode=require&pool_size=10";
    const parsed = parseConnectionString(uri);

    expect(parsed.protocol).toBe("postgresql:");
    expect(parsed.username).toBe("myuser");
    expect(parsed.password).toBe("secret!pass");
    expect(parsed.hosts).toEqual([{ host: "db.example.com", port: 5432 }]);
    expect(parsed.database).toBe("mydb");
    expect(parsed.params).toEqual({ sslmode: "require", pool_size: "10" });
    expect(parsed.isKeyValue).toBe(false);
  });

  it("parses IPv6 hostnames with brackets", () => {
    const uri = "postgres://admin:pass@[::1]:5432/mydb";
    const parsed = parseConnectionString(uri);
    expect(parsed.hosts).toEqual([{ host: "[::1]", port: 5432 }]);
  });

  it("parses multi-host MongoDB URI", () => {
    const uri = "mongodb://user:pass@host1:27017,host2:27018/admin?replicaSet=rs0";
    const parsed = parseConnectionString(uri);
    expect(parsed.hosts).toEqual([
      { host: "host1", port: 27017 },
      { host: "host2", port: 27018 },
    ]);
    expect(parsed.database).toBe("admin");
    expect(parsed.params.replicaSet).toBe("rs0");
  });

  it("parses SQLite URI", () => {
    const uri = "sqlite:///var/data/app.db?mode=ro";
    const parsed = parseConnectionString(uri);
    expect(parsed.protocol).toBe("sqlite:");
    expect(parsed.database).toBe("/var/data/app.db");
    expect(parsed.params.mode).toBe("ro");
  });

  it("parses key-value connection string", () => {
    const kv = "Host=localhost;Port=5432;Database=testdb;User=postgres;Password=mypass;ApplicationName=MyApp";
    const parsed = parseConnectionString(kv);
    expect(parsed.isKeyValue).toBe(true);
    expect(parsed.hosts).toEqual([{ host: "localhost", port: 5432 }]);
    expect(parsed.database).toBe("testdb");
    expect(parsed.username).toBe("postgres");
    expect(parsed.password).toBe("mypass");
    expect(parsed.params.ApplicationName).toBe("MyApp");
  });

  it("builds connection strings deterministically", () => {
    const built = buildConnectionString({
      protocol: "postgres",
      username: "user",
      password: "pwd",
      host: "localhost",
      port: 5432,
      database: "testdb",
      params: { ssl: "true" },
    });
    expect(built).toBe("postgres://user:pwd@localhost:5432/testdb?ssl=true");

    const builtKv = buildConnectionString({
      format: "keyvalue",
      host: "localhost",
      port: 3306,
      database: "mydb",
      username: "root",
      password: "secretpassword",
    });
    expect(builtKv).toBe("Host=localhost;Port=3306;Database=mydb;User=root;Password=secretpassword");
  });

  it("safely redacts passwords in URI and key-value formats", () => {
    const uri = "postgresql://user:SuperSecretPassword!@localhost:5432/db";
    const redacted = redactConnectionString(uri);
    expect(redacted).toBe("postgresql://user:***@localhost:5432/db");
    expect(redacted).not.toContain("SuperSecretPassword!");

    const kv = "Host=localhost;Port=5432;User=admin;Password=SuperSecretPassword!;Database=db";
    const redactedKv = redactConnectionString(kv, "REDACTED");
    expect(redactedKv).toContain("Password=REDACTED");
    expect(redactedKv).not.toContain("SuperSecretPassword!");
  });

  it("validates connection strings", () => {
    const valid = validateConnectionString("postgres://user:pass@localhost:5432/db");
    expect(valid.valid).toBe(true);
    expect(valid.errors).toHaveLength(0);

    const invalidPort = validateConnectionString("postgres://localhost:99999/db");
    expect(invalidPort.valid).toBe(false);
    expect(invalidPort.errors.some((e) => e.includes("65535"))).toBe(true);
  });

  it("returns default ports for known schemes", () => {
    expect(getDefaultPort("postgres")).toBe(5432);
    expect(getDefaultPort("mysql")).toBe(3306);
    expect(getDefaultPort("redis")).toBe(6379);
    expect(getDefaultPort("unknown")).toBeUndefined();
  });

  it("throws ValidationError on empty or invalid inputs", () => {
    expect(() => parseConnectionString("")).toThrow(ValidationError);
    expect(() => parseConnectionString("not a valid uri or kv")).toThrow(ValidationError);
  });

  it("handles sqlite :memory: and rediss protocols", () => {
    const mem = parseConnectionString("sqlite::memory:");
    expect(mem.database).toBe(":memory:");

    const redis = parseConnectionString("rediss://:secret@cache.example.com:6380/0");
    expect(redis.protocol).toBe("rediss:");
    expect(redis.hosts[0].port).toBe(6380);

    const builtMem = buildConnectionString({ protocol: "sqlite", database: ":memory:" });
    expect(builtMem).toBe("sqlite::memory:");
  });
});
