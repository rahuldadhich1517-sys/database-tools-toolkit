import { ValidationError } from "../shared/errors";

export interface SnowflakeOptions {
  epoch?: bigint | number | string; // defaults to Twitter epoch: 1288834974657n
  timestampBits?: number; // default: 41
  datacenterBits?: number; // default: 5 (or 0 if worker holds 10 bits)
  workerBits?: number; // default: 5 (if datacenter is 5) or 10
  sequenceBits?: number; // default: 12
}

export interface DecodedSnowflakeId {
  id: string;
  bigint: bigint;
  timestamp: {
    epoch: bigint;
    offsetMs: bigint;
    milliseconds: number;
    iso: string;
    date: Date;
  };
  datacenterId?: number;
  workerId: number;
  sequence: number;
  binary: string;
}

export interface SnowflakeEncodeInput {
  timestamp: number | bigint | Date;
  workerId: number;
  datacenterId?: number;
  sequence?: number;
}

const DEFAULT_EPOCH = 1288834974657n; // Twitter Snowflake Epoch: 2010-11-04T01:42:54.657Z

function resolveEpoch(epoch?: bigint | number | string): bigint {
  if (epoch === undefined) return DEFAULT_EPOCH;
  try {
    return BigInt(epoch);
  } catch {
    throw new ValidationError(`Invalid epoch value: ${String(epoch)}`, "epoch");
  }
}

function parseBigIntInput(id: string | bigint): bigint {
  if (typeof id === "bigint") {
    if (id < 0n) {
      throw new ValidationError("Snowflake ID must be a non-negative integer", "id");
    }
    return id;
  }
  if (typeof id !== "string" || !/^\d+$/.test(id.trim())) {
    throw new ValidationError(
      `Invalid Snowflake ID: "${String(id)}". Must be a non-empty string of decimal digits or BigInt.`,
      "id"
    );
  }
  const parsed = BigInt(id.trim());
  if (parsed < 0n) {
    throw new ValidationError("Snowflake ID must be a non-negative integer", "id");
  }
  return parsed;
}

export function decodeSnowflakeId(
  id: string | bigint,
  options: SnowflakeOptions = {}
): DecodedSnowflakeId {
  const val = parseBigIntInput(id);

  const timestampBits = BigInt(options.timestampBits ?? 41);
  const datacenterBits = BigInt(options.datacenterBits ?? 5);
  const workerBits = BigInt(options.workerBits ?? 5);
  const sequenceBits = BigInt(options.sequenceBits ?? 12);
  const epoch = resolveEpoch(options.epoch);

  const totalBits = timestampBits + datacenterBits + workerBits + sequenceBits;
  if (totalBits !== 63n && totalBits !== 64n) {
    throw new ValidationError(
      `Total bit allocation must equal 63 or 64 bits (got ${totalBits.toString()})`,
      "bitAllocation"
    );
  }

  // Masks
  const sequenceMask = (1n << sequenceBits) - 1n;
  const workerMask = (1n << workerBits) - 1n;
  const datacenterMask = (1n << datacenterBits) - 1n;

  // Shifts
  const workerShift = sequenceBits;
  const datacenterShift = sequenceBits + workerBits;
  const timestampShift = sequenceBits + workerBits + datacenterBits;

  const sequence = Number(val & sequenceMask);
  const workerId = Number((val >> workerShift) & workerMask);
  const datacenterId = datacenterBits > 0n
    ? Number((val >> datacenterShift) & datacenterMask)
    : undefined;
  const offsetMs = val >> timestampShift;
  const absoluteMsBig = epoch + offsetMs;

  const absoluteMsNum = Number(absoluteMsBig);
  const date = new Date(absoluteMsNum);

  return {
    id: val.toString(),
    bigint: val,
    timestamp: {
      epoch,
      offsetMs,
      milliseconds: absoluteMsNum,
      iso: isNaN(date.getTime()) ? "Invalid Date" : date.toISOString(),
      date,
    },
    datacenterId,
    workerId,
    sequence,
    binary: val.toString(2).padStart(Number(totalBits), "0"),
  };
}

export function encodeSnowflakeId(
  input: SnowflakeEncodeInput,
  options: SnowflakeOptions = {}
): string {
  const timestampBits = BigInt(options.timestampBits ?? 41);
  const datacenterBits = BigInt(options.datacenterBits ?? 5);
  const workerBits = BigInt(options.workerBits ?? 5);
  const sequenceBits = BigInt(options.sequenceBits ?? 12);
  const epoch = resolveEpoch(options.epoch);

  const totalBits = timestampBits + datacenterBits + workerBits + sequenceBits;
  if (totalBits !== 63n && totalBits !== 64n) {
    throw new ValidationError(
      `Total bit allocation must equal 63 or 64 bits (got ${totalBits.toString()})`,
      "bitAllocation"
    );
  }

  let timeMs: bigint;
  if (input.timestamp instanceof Date) {
    timeMs = BigInt(input.timestamp.getTime());
  } else {
    timeMs = BigInt(input.timestamp);
  }

  if (timeMs < epoch) {
    throw new ValidationError(
      `Timestamp (${timeMs.toString()}) cannot be before epoch (${epoch.toString()})`,
      "timestamp"
    );
  }

  const offsetMs = timeMs - epoch;
  const maxTimestamp = (1n << timestampBits) - 1n;
  if (offsetMs > maxTimestamp) {
    throw new ValidationError(
      `Timestamp offset exceeds maximum representable value with ${timestampBits} bits`,
      "timestamp"
    );
  }

  const maxWorker = (1n << workerBits) - 1n;
  if (BigInt(input.workerId) < 0n || BigInt(input.workerId) > maxWorker) {
    throw new ValidationError(
      `Worker ID ${input.workerId} out of range [0, ${maxWorker.toString()}]`,
      "workerId"
    );
  }

  const workerBig = BigInt(input.workerId);
  let datacenterBig = 0n;
  if (datacenterBits > 0n) {
    const dcId = input.datacenterId ?? 0;
    const maxDc = (1n << datacenterBits) - 1n;
    if (BigInt(dcId) < 0n || BigInt(dcId) > maxDc) {
      throw new ValidationError(
        `Datacenter ID ${dcId} out of range [0, ${maxDc.toString()}]`,
        "datacenterId"
      );
    }
    datacenterBig = BigInt(dcId);
  }

  const seq = input.sequence ?? 0;
  const maxSeq = (1n << sequenceBits) - 1n;
  if (BigInt(seq) < 0n || BigInt(seq) > maxSeq) {
    throw new ValidationError(
      `Sequence ${seq} out of range [0, ${maxSeq.toString()}]`,
      "sequence"
    );
  }
  const seqBig = BigInt(seq);

  const workerShift = sequenceBits;
  const datacenterShift = sequenceBits + workerBits;
  const timestampShift = sequenceBits + workerBits + datacenterBits;

  const snowflake =
    (offsetMs << timestampShift) |
    (datacenterBig << datacenterShift) |
    (workerBig << workerShift) |
    seqBig;

  return snowflake.toString();
}
