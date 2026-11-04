import { ValidationError } from "../shared/errors";

export interface DecodedObjectId {
  id: string; // 24-character normalized lowercase hex
  timestamp: {
    seconds: number;
    milliseconds: number;
    iso: string;
    date: Date;
  };
  randomHex: string; // 5 bytes (10 hex chars)
  counter: {
    value: number; // 3-byte integer (0 to 16,777,215)
    hex: string; // 6 hex chars
  };
}

const OBJECT_ID_HEX_REGEX = /^[0-9a-fA-F]{24}$/;

export function isValidObjectId(id: unknown): boolean {
  if (typeof id !== "string") {
    return false;
  }
  return OBJECT_ID_HEX_REGEX.test(id);
}

export function decodeObjectId(id: string): DecodedObjectId {
  if (!isValidObjectId(id)) {
    throw new ValidationError(
      `Invalid ObjectId: "${id}". Must be exactly 24 hexadecimal characters.`,
      "id"
    );
  }

  const normalized = id.toLowerCase();
  const timeHex = normalized.slice(0, 8);
  const randomHex = normalized.slice(8, 18);
  const counterHex = normalized.slice(18, 24);

  const seconds = parseInt(timeHex, 16);
  const milliseconds = seconds * 1000;
  const date = new Date(milliseconds);
  const counterValue = parseInt(counterHex, 16);

  return {
    id: normalized,
    timestamp: {
      seconds,
      milliseconds,
      iso: date.toISOString(),
      date,
    },
    randomHex,
    counter: {
      value: counterValue,
      hex: counterHex,
    },
  };
}
