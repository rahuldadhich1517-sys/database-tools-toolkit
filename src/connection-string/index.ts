import { ValidationError } from "../shared/errors";

export interface ParsedConnectionString {
  protocol: string; // e.g. "postgres:", "mysql:", "mongodb:", "sqlite:", "keyvalue"
  hosts: Array<{ host: string; port?: number }>;
  username?: string;
  password?: string;
  database?: string;
  params: Record<string, string>;
  isKeyValue: boolean;
  raw: string;
}

export interface ConnectionConfig {
  protocol?: string; // e.g. "postgres", "mysql", "mongodb", "redis", "sqlite", "keyvalue"
  host?: string;
  hosts?: Array<{ host: string; port?: number }>;
  port?: number;
  username?: string;
  password?: string;
  database?: string;
  params?: Record<string, string>;
  format?: "uri" | "keyvalue";
}

export interface ConnectionValidationResult {
  valid: boolean;
  errors: string[];
  protocol?: string;
}

const DEFAULT_PORTS: Record<string, number> = {
  postgres: 5432,
  postgresql: 5432,
  mysql: 3306,
  mongodb: 27017,
  redis: 6379,
  rediss: 6379,
};

export function parseConnectionString(connectionString: string): ParsedConnectionString {
  if (typeof connectionString !== "string" || !connectionString.trim()) {
    throw new ValidationError("Connection string must be a non-empty string", "connectionString");
  }

  const trimmed = connectionString.trim();

  // 1. Check for key-value format (semicolon-delimited key=value pairs)
  // e.g. "host=localhost;port=5432;database=test;user=admin" or "Server=localhost;Database=test..."
  if (trimmed.includes("=") && (!trimmed.includes("://") && !trimmed.startsWith("sqlite:"))) {
    return parseKeyValueConnectionString(trimmed);
  }

  // 2. Check for sqlite URI: sqlite:path or sqlite://path or sqlite::memory:
  if (trimmed.startsWith("sqlite:")) {
    return parseSqliteConnectionString(trimmed);
  }

  // 3. Standard URI scheme (postgres://, mysql://, mongodb://, etc.)
  return parseUriConnectionString(trimmed);
}

function parseKeyValueConnectionString(raw: string): ParsedConnectionString {
  const pairs = raw.split(";").map((p) => p.trim()).filter(Boolean);
  const params: Record<string, string> = {};
  let host = "";
  let port: number | undefined;
  let username: string | undefined;
  let password: string | undefined;
  let database: string | undefined;

  for (const pair of pairs) {
    const eqIdx = pair.indexOf("=");
    if (eqIdx === -1) continue;
    const key = pair.slice(0, eqIdx).trim();
    const val = pair.slice(eqIdx + 1).trim();
    const lowerKey = key.toLowerCase();

    if (lowerKey === "host" || lowerKey === "server" || lowerKey === "data source" || lowerKey === "addr") {
      host = val;
    } else if (lowerKey === "port") {
      const p = parseInt(val, 10);
      if (!isNaN(p)) port = p;
    } else if (lowerKey === "user" || lowerKey === "username" || lowerKey === "uid" || lowerKey === "user id") {
      username = val;
    } else if (lowerKey === "password" || lowerKey === "pwd") {
      password = val;
    } else if (lowerKey === "database" || lowerKey === "initial catalog" || lowerKey === "db") {
      database = val;
    } else {
      params[key] = val;
    }
  }

  return {
    protocol: "keyvalue:",
    hosts: host ? [{ host, port }] : [],
    username,
    password,
    database,
    params,
    isKeyValue: true,
    raw,
  };
}

function parseSqliteConnectionString(raw: string): ParsedConnectionString {
  // Handles sqlite::memory:, sqlite:///path/to/db.sqlite, sqlite:local.db
  let dbPath = raw.slice(7); // strip "sqlite:"
  if (dbPath.startsWith("//")) {
    dbPath = dbPath.slice(2);
  }
  const params: Record<string, string> = {};
  const qIdx = dbPath.indexOf("?");
  if (qIdx !== -1) {
    const qStr = dbPath.slice(qIdx + 1);
    dbPath = dbPath.slice(0, qIdx);
    const searchParams = new URLSearchParams(qStr);
    for (const [k, v] of searchParams.entries()) {
      params[k] = v;
    }
  }

  return {
    protocol: "sqlite:",
    hosts: [],
    database: decodeURIComponent(dbPath),
    params,
    isKeyValue: false,
    raw,
  };
}

function parseUriConnectionString(raw: string): ParsedConnectionString {
  const schemeMatch = raw.match(/^([a-zA-Z0-9+.-]+):\/\//);
  if (!schemeMatch) {
    throw new ValidationError(
      "Invalid connection string format. Must be a valid URI or key-value format.",
      "connectionString"
    );
  }

  const protocol = schemeMatch[1].toLowerCase() + ":";
  const rest = raw.slice(schemeMatch[0].length);

  // Extract query params if any
  const qIdx = rest.indexOf("?");
  const uriWithoutQuery = qIdx !== -1 ? rest.slice(0, qIdx) : rest;
  const queryString = qIdx !== -1 ? rest.slice(qIdx + 1) : "";

  const params: Record<string, string> = {};
  if (queryString) {
    const searchParams = new URLSearchParams(queryString);
    for (const [k, v] of searchParams.entries()) {
      params[k] = v;
    }
  }

  // Extract path (database name)
  const slashIdx = uriWithoutQuery.indexOf("/");
  let authAndHosts = slashIdx !== -1 ? uriWithoutQuery.slice(0, slashIdx) : uriWithoutQuery;
  const pathPart = slashIdx !== -1 ? uriWithoutQuery.slice(slashIdx + 1) : "";
  const database = pathPart ? decodeURIComponent(pathPart) : undefined;

  // Extract userInfo (user:pass@)
  let username: string | undefined;
  let password: string | undefined;
  const atIdx = authAndHosts.lastIndexOf("@");
  if (atIdx !== -1) {
    const userinfo = authAndHosts.slice(0, atIdx);
    authAndHosts = authAndHosts.slice(atIdx + 1);
    const colonIdx = userinfo.indexOf(":");
    if (colonIdx !== -1) {
      username = decodeURIComponent(userinfo.slice(0, colonIdx));
      password = decodeURIComponent(userinfo.slice(colonIdx + 1));
    } else {
      username = decodeURIComponent(userinfo);
    }
  }

  // Parse hosts (handles multiple hosts for mongodb: host1:27017,host2:27018, and IPv6 [::1]:5432)
  const hostEntries = splitHostEntries(authAndHosts);
  const hosts: Array<{ host: string; port?: number }> = [];

  for (const entry of hostEntries) {
    if (!entry) continue;
    if (entry.startsWith("[")) {
      // IPv6 with brackets: [2001:db8::1]:5432 or [::1]
      const closeBracket = entry.indexOf("]");
      if (closeBracket !== -1) {
        const ip = entry.slice(1, closeBracket);
        const portPart = entry.slice(closeBracket + 1);
        let port: number | undefined;
        if (portPart.startsWith(":")) {
          const parsedPort = parseInt(portPart.slice(1), 10);
          if (!isNaN(parsedPort)) port = parsedPort;
        }
        hosts.push({ host: `[${ip}]`, port });
        continue;
      }
    }

    const colonIdx = entry.lastIndexOf(":");
    if (colonIdx !== -1) {
      const h = entry.slice(0, colonIdx);
      const p = parseInt(entry.slice(colonIdx + 1), 10);
      hosts.push({ host: h, port: isNaN(p) ? undefined : p });
    } else {
      hosts.push({ host: entry, port: undefined });
    }
  }

  return {
    protocol,
    hosts,
    username,
    password,
    database,
    params,
    isKeyValue: false,
    raw,
  };
}

function splitHostEntries(str: string): string[] {
  // Handles commas outside IPv6 brackets
  const result: string[] = [];
  let current = "";
  let inBracket = false;

  for (let i = 0; i < str.length; i++) {
    const ch = str[i];
    if (ch === "[") inBracket = true;
    else if (ch === "]") inBracket = false;

    if (ch === "," && !inBracket) {
      result.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  if (current.trim()) {
    result.push(current.trim());
  }
  return result;
}

export function buildConnectionString(config: ConnectionConfig): string {
  if (config.format === "keyvalue" || config.protocol?.toLowerCase() === "keyvalue") {
    const parts: string[] = [];
    const host = config.host || config.hosts?.[0]?.host;
    if (host) parts.push(`Host=${host}`);
    const port = config.port ?? config.hosts?.[0]?.port;
    if (port) parts.push(`Port=${port}`);
    if (config.database) parts.push(`Database=${config.database}`);
    if (config.username) parts.push(`User=${config.username}`);
    if (config.password) parts.push(`Password=${config.password}`);
    if (config.params) {
      for (const [k, v] of Object.entries(config.params)) {
        parts.push(`${k}=${v}`);
      }
    }
    return parts.join(";");
  }

  let proto = (config.protocol || "postgres").replace(/:$/, "").toLowerCase();
  if (proto === "sqlite") {
    const db = config.database || ":memory:";
    const query = config.params && Object.keys(config.params).length > 0
      ? `?${new URLSearchParams(config.params).toString()}`
      : "";
    return `sqlite:${db}${query}`;
  }

  let userInfo = "";
  if (config.username) {
    userInfo = encodeURIComponent(config.username);
    if (config.password) {
      userInfo += `:${encodeURIComponent(config.password)}`;
    }
    userInfo += "@";
  }

  const hostList: Array<{ host: string; port?: number }> = [];
  if (config.hosts && config.hosts.length > 0) {
    hostList.push(...config.hosts);
  } else if (config.host) {
    hostList.push({ host: config.host, port: config.port });
  } else {
    hostList.push({ host: "localhost", port: config.port });
  }

  const hostsStr = hostList
    .map((h) => {
      let hostStr = h.host;
      if (hostStr.includes(":") && !hostStr.startsWith("[")) {
        hostStr = `[${hostStr}]`;
      }
      return h.port !== undefined ? `${hostStr}:${h.port}` : hostStr;
    })
    .join(",");

  const dbStr = config.database ? `/${encodeURIComponent(config.database)}` : "";
  const queryStr = config.params && Object.keys(config.params).length > 0
    ? `?${new URLSearchParams(config.params).toString()}`
    : "";

  return `${proto}://${userInfo}${hostsStr}${dbStr}${queryStr}`;
}

export function redactConnectionString(connectionString: string, replacement = "***"): string {
  try {
    const parsed = parseConnectionString(connectionString);
    if (parsed.isKeyValue) {
      // Redact password in key-value string
      return parsed.raw.replace(
        /(password|pwd)\s*=\s*([^;]+)/gi,
        `$1=${replacement}`
      );
    }

    if (parsed.protocol === "sqlite:") {
      return parsed.raw;
    }

    // URI scheme
    if (!parsed.password) {
      return connectionString;
    }

    const encodedPass = encodeURIComponent(parsed.password);
    // Replace password between : and @
    const userPassRegex = new RegExp(`(:)${escapeRegex(parsed.password)}(@)`, "g");
    if (userPassRegex.test(connectionString)) {
      return connectionString.replace(userPassRegex, `$1${replacement}$2`);
    }
    const encodedRegex = new RegExp(`(:)${escapeRegex(encodedPass)}(@)`, "g");
    return connectionString.replace(encodedRegex, `$1${replacement}$2`);
  } catch {
    // If parsing fails, fall back to safe regex redaction without crashing
    return connectionString.replace(/(:)([^@/:]+)(@)/g, `$1${replacement}$3`);
  }
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function validateConnectionString(connectionString: string): ConnectionValidationResult {
  const errors: string[] = [];
  let protocol: string | undefined;

  try {
    const parsed = parseConnectionString(connectionString);
    protocol = parsed.protocol.replace(/:$/, "");

    if (parsed.protocol !== "sqlite:" && parsed.hosts.length === 0) {
      errors.push("Missing host specification");
    }

    for (const h of parsed.hosts) {
      if (h.port !== undefined && (h.port <= 0 || h.port > 65535)) {
        errors.push(`Port ${h.port} is outside the valid range 1-65535`);
      }
    }
  } catch (err) {
    errors.push(err instanceof Error ? err.message : "Invalid connection string");
  }

  return {
    valid: errors.length === 0,
    errors,
    protocol,
  };
}

export function getDefaultPort(protocol: string): number | undefined {
  const proto = protocol.toLowerCase().replace(/:$/, "");
  return DEFAULT_PORTS[proto];
}
