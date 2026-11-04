import { describe, it, expect } from "vitest";
import { decodeObjectId, isValidObjectId } from "../../src/objectid-decode/index";
import { ValidationError } from "../../src/shared/errors";

describe("ObjectId Decoder", () => {
  const validHex = "507f1f77bcf86cd799439011";

  it("validates exactly 24 hexadecimal characters", () => {
    expect(isValidObjectId(validHex)).toBe(true);
    expect(isValidObjectId("507F1F77BCF86CD799439011")).toBe(true);
    expect(isValidObjectId("507f1f77bcf86cd79943901")).toBe(false); // 23 chars
    expect(isValidObjectId("507f1f77bcf86cd799439011a")).toBe(false); // 25 chars
    expect(isValidObjectId("507f1f77bcf86cd79943901z")).toBe(false); // non-hex
    expect(isValidObjectId("")).toBe(false);
    expect(isValidObjectId(null)).toBe(false);
    expect(isValidObjectId(12345)).toBe(false);
  });

  it("decodes timestamp, random bytes and counter correctly", () => {
    // 507f1f77 = 1350508407 in decimal = 2012-10-17T20:46:47.000Z
    const decoded = decodeObjectId(validHex);
    expect(decoded.id).toBe(validHex);
    expect(decoded.timestamp.seconds).toBe(1350508407);
    expect(decoded.timestamp.milliseconds).toBe(1350508407000);
    expect(decoded.timestamp.iso).toBe("2012-10-17T21:13:27.000Z");
    expect(decoded.randomHex).toBe("bcf86cd799");
    expect(decoded.counter.hex).toBe("439011");
    expect(decoded.counter.value).toBe(parseInt("439011", 16));
  });

  it("normalizes uppercase input to lowercase", () => {
    const decoded = decodeObjectId("507F1F77BCF86CD799439011");
    expect(decoded.id).toBe(validHex);
    expect(decoded.randomHex).toBe("bcf86cd799");
  });

  it("throws ValidationError on invalid input", () => {
    expect(() => decodeObjectId("invalid")).toThrow(ValidationError);
    expect(() => decodeObjectId("")).toThrow(ValidationError);
    expect(() => decodeObjectId("507f1f77bcf86cd79943901g")).toThrow(ValidationError);
  });
});
