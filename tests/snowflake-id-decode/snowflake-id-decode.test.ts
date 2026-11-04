import { describe, it, expect } from "vitest";
import { decodeSnowflakeId, encodeSnowflakeId } from "../../src/snowflake-id-decode/index";
import { ValidationError } from "../../src/shared/errors";

describe("Snowflake ID Decoder & Encoder", () => {
  it("encodes and decodes standard Twitter snowflake ID reversibly", () => {
    const originalTime = 1600000000000;
    const workerId = 3;
    const datacenterId = 7;
    const sequence = 42;

    const encoded = encodeSnowflakeId({
      timestamp: originalTime,
      workerId,
      datacenterId,
      sequence,
    });

    expect(typeof encoded).toBe("string");
    expect(encoded).toMatch(/^\d+$/);

    const decoded = decodeSnowflakeId(encoded);
    expect(decoded.workerId).toBe(workerId);
    expect(decoded.datacenterId).toBe(datacenterId);
    expect(decoded.sequence).toBe(sequence);
    expect(decoded.timestamp.milliseconds).toBe(originalTime);
    expect(decoded.timestamp.iso).toBe(new Date(originalTime).toISOString());
  });

  it("handles BigInt input directly", () => {
    const idBig = 1541815603606036480n;
    const decoded = decodeSnowflakeId(idBig);
    expect(decoded.bigint).toBe(idBig);
    expect(decoded.id).toBe("1541815603606036480");
  });

  it("handles zero values and boundary conditions", () => {
    const zeroId = 0n;
    const decoded = decodeSnowflakeId(zeroId);
    expect(decoded.workerId).toBe(0);
    expect(decoded.sequence).toBe(0);
    expect(decoded.timestamp.offsetMs).toBe(0n);
    expect(decoded.timestamp.milliseconds).toBe(1288834974657); // Epoch exactly
  });

  it("supports custom epochs (e.g. Discord epoch)", () => {
    const discordEpoch = 1420070400000n;
    const discordSnowflake = "175928847299117063";
    const decoded = decodeSnowflakeId(discordSnowflake, { epoch: discordEpoch });
    expect(decoded.timestamp.epoch).toBe(discordEpoch);
    expect(decoded.timestamp.date.getUTCFullYear()).toBe(2016);
  });

  it("supports custom bit allocations", () => {
    const encoded = encodeSnowflakeId(
      {
        timestamp: 1600000000000,
        workerId: 25,
        sequence: 1,
      },
      {
        timestampBits: 41,
        datacenterBits: 0,
        workerBits: 10,
        sequenceBits: 12,
      }
    );

    const decoded = decodeSnowflakeId(encoded, {
      timestampBits: 41,
      datacenterBits: 0,
      workerBits: 10,
      sequenceBits: 12,
    });

    expect(decoded.workerId).toBe(25);
    expect(decoded.datacenterId).toBeUndefined();
    expect(decoded.sequence).toBe(1);
  });

  it("throws ValidationError on invalid bit allocations", () => {
    expect(() =>
      decodeSnowflakeId("123", {
        timestampBits: 40,
        datacenterBits: 5,
        workerBits: 5,
        sequenceBits: 5, // total 55 != 63 or 64
      })
    ).toThrow(ValidationError);
  });

  it("throws ValidationError on negative or invalid IDs", () => {
    expect(() => decodeSnowflakeId(-1n)).toThrow(ValidationError);
    expect(() => decodeSnowflakeId("abc")).toThrow(ValidationError);
    expect(() => decodeSnowflakeId("")).toThrow(ValidationError);
  });

  it("throws ValidationError on timestamps before epoch or worker out of range", () => {
    expect(() =>
      encodeSnowflakeId({
        timestamp: 1000, // way before Twitter epoch 2010
        workerId: 1,
      })
    ).toThrow(ValidationError);

    expect(() =>
      encodeSnowflakeId({
        timestamp: 1600000000000,
        workerId: 9999, // exceeds 5 bits (max 31)
      })
    ).toThrow(ValidationError);
  });
});
