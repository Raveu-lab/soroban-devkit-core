import { xdr } from "@stellar/stellar-sdk";
import { ArgEncoder } from "../src/encoder";
import { EventDecoder } from "../src/decoder";

/**
 * Round-trip every case through the existing, already-tested EventDecoder —
 * this project avoids mocking the Stellar SDK, so the decoder is the oracle.
 */
function roundTrip(val: xdr.ScVal): unknown {
  const decoder = new EventDecoder();
  return decoder.decodeData(val.toXDR("base64"));
}

describe("ArgEncoder", () => {
  const encoder = new ArgEncoder();

  it("encodes a boolean", () => {
    expect(roundTrip(encoder.encode(true))).toBe(true);
    expect(roundTrip(encoder.encode(false))).toBe(false);
  });

  it("encodes null as void", () => {
    expect(roundTrip(encoder.encode(null))).toBe(null);
  });

  it("encodes a small integer as i32", () => {
    const val = encoder.encode(42);
    expect(val.switch()).toBe(xdr.ScValType.scvI32());
    expect(roundTrip(val)).toBe(42);
  });

  it("encodes a G... string as an Address", () => {
    const address = "GACP4WS6CA6GPH7NWEPY6AKRTNQSRAL7KB2SDYEKNN7YMMCYGKKI2HE4";
    const val = encoder.encode(address);
    expect(val.switch()).toBe(xdr.ScValType.scvAddress());
    expect(roundTrip(val)).toBe(address);
  });

  it("encodes a C... string as a contract Address", () => {
    const address = "CCNGTMOQNIF5VFJCHCF6S2CGW473IN76RPAX72YOTGDXC6VDZ4XINN45";
    const val = encoder.encode(address);
    expect(val.switch()).toBe(xdr.ScValType.scvAddress());
    expect(roundTrip(val)).toBe(address);
  });

  it("encodes a numeric string as i128", () => {
    const val = encoder.encode("1000000");
    expect(val.switch()).toBe(xdr.ScValType.scvI128());
    expect(roundTrip(val)).toBe("1000000");
  });

  it("encodes a negative numeric string as i128", () => {
    const val = encoder.encode("-500");
    expect(roundTrip(val)).toBe("-500");
  });

  it("round-trips a numeric string larger than 64 bits", () => {
    const big = "99999999999999999999";
    const val = encoder.encode(big);
    expect(roundTrip(val)).toBe(big);
  });

  it("encodes a short alphanumeric string as a Symbol", () => {
    const val = encoder.encode("transfer");
    expect(val.switch()).toBe(xdr.ScValType.scvSymbol());
    expect(roundTrip(val)).toBe("transfer");
  });

  it("encodes a string with spaces as scvString, not a Symbol", () => {
    const val = encoder.encode("hello world");
    expect(val.switch()).toBe(xdr.ScValType.scvString());
    expect(roundTrip(val)).toBe("hello world");
  });

  it("encodes an array as a Vec", () => {
    const val = encoder.encode([1, 2, 3]);
    expect(roundTrip(val)).toEqual([1, 2, 3]);
  });

  it("encodes a plain object as a Map", () => {
    const val = encoder.encode({ a: 1, b: 2 });
    expect(roundTrip(val)).toEqual({ a: 1, b: 2 });
  });

  it("encodeArgs maps encode over an array", () => {
    const vals = encoder.encodeArgs([
      "GACP4WS6CA6GPH7NWEPY6AKRTNQSRAL7KB2SDYEKNN7YMMCYGKKI2HE4",
      "1000000",
      true,
    ]);
    expect(vals).toHaveLength(3);
    expect(roundTrip(vals[1])).toBe("1000000");
  });

  it("throws on a non-integer number", () => {
    expect(() => encoder.encode(3.14)).toThrow();
  });

  it("throws on a number outside i32 range", () => {
    expect(() => encoder.encode(5_000_000_000)).toThrow();
  });

  it("throws on undefined", () => {
    expect(() => encoder.encode(undefined)).toThrow();
  });
});
