import { ValidationError } from "../shared/errors";

export interface DecodedUUID {
  uuid: string; // normalized lowercase 8-4-4-4-12
  version: number;
  variant: string;
  variantCode: number;
  timestamp: {
    milliseconds: number;
    iso: string;
    date: Date;
  } | null;
  nodeHex?: string;
  clockSequence?: number;
}

const UUID_REGEX = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
const GREGORIAN_OFFSET_100NS = 122192928000000000n; // 100-ns intervals from 1582-10-15 to 1970-01-01

export function isValidUUID(uuid: unknown): boolean {
  if (typeof uuid !== "string") {
    return false;
  }
  return UUID_REGEX.test(uuid.trim());
}

export function decodeUUID(uuid: string): DecodedUUID {
  if (!isValidUUID(uuid)) {
    throw new ValidationError(
      `Invalid UUID: "${uuid}". Expected format xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`,
      "uuid"
    );
  }

  const clean = uuid.trim().toLowerCase();
  const hex = clean.replace(/-/g, "");

  // Extract version from nibble 12 (0-indexed in hex: byte 6 high nibble)
  const version = parseInt(hex[12], 16);

  // Extract variant from byte 8 (hex positions 16, 17)
  const variantByte = parseInt(hex.slice(16, 18), 16);
  let variant = "Unknown";
  let variantCode = 0;

  if ((variantByte & 0x80) === 0x00) {
    variant = "NCS (Reserved, backward compatibility)";
    variantCode = 0;
  } else if ((variantByte & 0xc0) === 0x80) {
    variant = "RFC 4122 / RFC 9562";
    variantCode = 1;
  } else if ((variantByte & 0xe0) === 0xc0) {
    variant = "Microsoft Corporation (backward compatibility)";
    variantCode = 2;
  } else {
    variant = "Reserved for future definition";
    variantCode = 3;
  }

  let timestamp: DecodedUUID["timestamp"] = null;
  let clockSequence: number | undefined;
  let nodeHex: string | undefined;

  // Node is last 6 bytes (hex 20..32)
  nodeHex = hex.slice(20, 32);

  if (version === 1) {
    // UUID v1: time_low (32) + time_mid (16) + time_hi (12)
    const timeLow = BigInt("0x" + hex.slice(0, 8));
    const timeMid = BigInt("0x" + hex.slice(8, 12));
    const timeHi = BigInt("0x" + hex.slice(13, 16)); // skip version nibble at 12

    const gregorian100ns = (timeHi << 48n) | (timeMid << 32n) | timeLow;
    const unixMs = Number((gregorian100ns - GREGORIAN_OFFSET_100NS) / 10000n);
    const date = new Date(unixMs);

    clockSequence = parseInt(hex.slice(16, 20), 16) & 0x3fff;

    timestamp = {
      milliseconds: unixMs,
      iso: isNaN(date.getTime()) ? "Invalid Date" : date.toISOString(),
      date,
    };
  } else if (version === 6) {
    // UUID v6: time_hi (32) + time_mid (16) + time_low (12)
    const timeHi = BigInt("0x" + hex.slice(0, 8));
    const timeMid = BigInt("0x" + hex.slice(8, 12));
    const timeLow = BigInt("0x" + hex.slice(13, 16));

    const gregorian100ns = (timeHi << 28n) | (timeMid << 12n) | timeLow;
    const unixMs = Number((gregorian100ns - GREGORIAN_OFFSET_100NS) / 10000n);
    const date = new Date(unixMs);

    clockSequence = parseInt(hex.slice(16, 20), 16) & 0x3fff;

    timestamp = {
      milliseconds: unixMs,
      iso: isNaN(date.getTime()) ? "Invalid Date" : date.toISOString(),
      date,
    };
  } else if (version === 7) {
    // UUID v7: 48-bit big-endian unsigned int unix_ts_ms (first 12 hex chars)
    const unixMsBig = BigInt("0x" + hex.slice(0, 12));
    const unixMs = Number(unixMsBig);
    const date = new Date(unixMs);

    timestamp = {
      milliseconds: unixMs,
      iso: isNaN(date.getTime()) ? "Invalid Date" : date.toISOString(),
      date,
    };
  }

  return {
    uuid: clean,
    version,
    variant,
    variantCode,
    timestamp,
    nodeHex,
    clockSequence,
  };
}
