import {
  isDecodedVoid,
  isDecodedNumber,
  isDecodedString,
  isDecodedBool,
  isDecodedVec,
  isDecodedMap,
} from "../src/decoded-value";

describe("isDecodedVoid", () => {
  it("returns true for null", () => expect(isDecodedVoid(null)).toBe(true));
  it("returns false for 0", () => expect(isDecodedVoid(0)).toBe(false));
  it("returns false for empty string", () => expect(isDecodedVoid("")).toBe(false));
  it("returns false for false", () => expect(isDecodedVoid(false)).toBe(false));
});

describe("isDecodedNumber", () => {
  it("returns true for integer", () => expect(isDecodedNumber(42)).toBe(true));
  it("returns true for negative", () => expect(isDecodedNumber(-7)).toBe(true));
  it("returns true for zero", () => expect(isDecodedNumber(0)).toBe(true));
  it("returns false for string", () => expect(isDecodedNumber("42")).toBe(false));
  it("returns false for null", () => expect(isDecodedNumber(null)).toBe(false));
});

describe("isDecodedString", () => {
  it("returns true for a non-empty string", () => expect(isDecodedString("transfer")).toBe(true));
  it("returns true for empty string", () => expect(isDecodedString("")).toBe(true));
  it("returns false for a number", () => expect(isDecodedString(1)).toBe(false));
  it("returns false for null", () => expect(isDecodedString(null)).toBe(false));
});

describe("isDecodedBool", () => {
  it("returns true for true", () => expect(isDecodedBool(true)).toBe(true));
  it("returns true for false", () => expect(isDecodedBool(false)).toBe(true));
  it("returns false for 1", () => expect(isDecodedBool(1)).toBe(false));
  it("returns false for string", () => expect(isDecodedBool("true")).toBe(false));
});

describe("isDecodedVec", () => {
  it("returns true for an array", () => expect(isDecodedVec([1, 2, 3])).toBe(true));
  it("returns true for empty array", () => expect(isDecodedVec([])).toBe(true));
  it("returns false for an object", () => expect(isDecodedVec({ a: 1 })).toBe(false));
  it("returns false for null", () => expect(isDecodedVec(null)).toBe(false));
});

describe("isDecodedMap", () => {
  it("returns true for a plain object", () => expect(isDecodedMap({ amount: 100 })).toBe(true));
  it("returns true for empty object", () => expect(isDecodedMap({})).toBe(true));
  it("returns false for an array", () => expect(isDecodedMap([])).toBe(false));
  it("returns false for null", () => expect(isDecodedMap(null)).toBe(false));
  it("returns false for a string", () => expect(isDecodedMap("hello")).toBe(false));
});
