import { describe, it, expect } from "vitest";
import { decodeUUID, isValidUUID } from "../../src/uuid-decode/index";
import { ValidationError } from "../../src/shared/errors";

describe("UUID Decoder", () => {
  it("validates UUID strings", () => {
    expect(isValidUUID("6ba7b810-9dad-11d1-80b4-00c04fd430c8")).toBe(true);
    expect(isValidUUID("6BA7B810-9DAD-11D1-80B4-00C04FD430C8")).toBe(true);
    expect(isValidUUID("not-a-uuid")).toBe(false);
    expect(isValidUUID("")).toBe(false);
    expect(isValidUUID(null)).toBe(false);
  });

  it("decodes UUID v1 with Gregorian timestamp", () => {
    // 6ba7b810-9dad-11d1-80b4-00c04fd430c8 is a standard RFC 4122 v1 UUID (from 1998)
    const decoded = decodeUUID("6ba7b810-9dad-11d1-80b4-00c04fd430c8");
    expect(decoded.version).toBe(1);
    expect(decoded.variant).toContain("RFC 4122");
    expect(decoded.timestamp).not.toBeNull();
    expect(decoded.timestamp?.date.getUTCFullYear()).toBe(1998);
    expect(decoded.nodeHex).toBe("00c04fd430c8");
    expect(decoded.clockSequence).toBeDefined();
  });

  it("decodes UUID v4 and does not infer a timestamp", () => {
    const v4 = "f47ac10b-58cc-4372-a567-0e02b2c3d479";
    const decoded = decodeUUID(v4);
    expect(decoded.version).toBe(4);
    expect(decoded.timestamp).toBeNull();
    expect(decoded.variant).toContain("RFC 4122");
  });

  it("decodes UUID v6 (reordered Gregorian timestamp)", () => {
    // Generated v6 UUID: time_hi + time_mid + 6time_low
    const v6 = "1ec9414c-2329-6b00-b3c8-9e6bdecacec6";
    const decoded = decodeUUID(v6);
    expect(decoded.version).toBe(6);
    expect(decoded.timestamp).not.toBeNull();
    expect(decoded.timestamp?.date.getUTCFullYear()).toBe(2022);
  });

  it("decodes UUID v7 (Unix Epoch millisecond timestamp)", () => {
    // 0188686f-2e38-7f9a-8ff4-39f506821360
    // First 48 bits: 0x0188686f2e38 = 1685379296824 ms = 2023-05-29T18:14:56.824Z
    const v7 = "0188686f-2e38-7f9a-8ff4-39f506821360";
    const decoded = decodeUUID(v7);
    expect(decoded.version).toBe(7);
    expect(decoded.timestamp).not.toBeNull();
    expect(decoded.timestamp?.milliseconds).toBe(1685379296824);
    expect(decoded.timestamp?.iso).toBe("2023-05-29T16:54:56.824Z");
  });

  it("throws ValidationError on malformed input", () => {
    expect(() => decodeUUID("invalid-uuid")).toThrow(ValidationError);
    expect(() => decodeUUID("0188686f-2e38-7f9a-8ff4-39f50682136")).toThrow(ValidationError);
  });

  it("identifies NCS, Microsoft, and Reserved UUID variants", () => {
    // Byte 8 with high bit 0 (e.g. 0x00..0x7f) -> NCS
    const ncsUuid = "00000000-0000-1000-0000-000000000000";
    const decNcs = decodeUUID(ncsUuid);
    expect(decNcs.variant).toContain("NCS");

    // Byte 8 with bits 110 (e.g. 0xc0..0xdf) -> Microsoft GUID
    const msUuid = "00000000-0000-1000-c000-000000000000";
    const decMs = decodeUUID(msUuid);
    expect(decMs.variant).toContain("Microsoft");

    // Byte 8 with bits 111 (e.g. 0xe0..0xff) -> Reserved
    const resUuid = "00000000-0000-1000-e000-000000000000";
    const decRes = decodeUUID(resUuid);
    expect(decRes.variant).toContain("Reserved");
  });
});
