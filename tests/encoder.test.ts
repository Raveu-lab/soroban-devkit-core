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
    const address = "CB5YCY5CYLNO3PTH3OXQKKT6XFXTSNIOYSC5B65XE4ZZE6MVIWGD2LNH";
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

  describe("unsigned integer hints ($u32/$u64/$u128)", () => {
    it("encodes { $u32: n } as scvU32, not the default signed i32", () => {
      const val = encoder.encode({ $u32: 42 });
      expect(val.switch()).toBe(xdr.ScValType.scvU32());
      expect(roundTrip(val)).toBe(42);
    });

    it("encodes { $u32: n } up to u32::MAX, which would overflow i32", () => {
      const val = encoder.encode({ $u32: 4_294_967_295 });
      expect(roundTrip(val)).toBe(4_294_967_295);
    });

    it("rejects a negative $u32 value", () => {
      expect(() => encoder.encode({ $u32: -1 })).toThrow(/u32/);
    });

    it("rejects a $u32 value above u32::MAX", () => {
      expect(() => encoder.encode({ $u32: 4_294_967_296 })).toThrow(/u32/);
    });

    it("encodes { $u64: n } as scvU64 from a plain number", () => {
      const val = encoder.encode({ $u64: 1_000_000 });
      expect(val.switch()).toBe(xdr.ScValType.scvU64());
      expect(roundTrip(val)).toBe("1000000");
    });

    it("encodes { $u64: \"n\" } as scvU64 from a digit string, for values beyond safe-integer range", () => {
      const val = encoder.encode({ $u64: "18446744073709551615" }); // u64::MAX
      expect(roundTrip(val)).toBe("18446744073709551615");
    });

    it("rejects a negative $u64 value", () => {
      expect(() => encoder.encode({ $u64: "-1" })).toThrow(/u64/);
    });

    it("rejects a $u64 value above u64::MAX", () => {
      expect(() => encoder.encode({ $u64: "18446744073709551616" })).toThrow(/u64/);
    });

    it("encodes { $u128: \"n\" } as scvU128 from a digit string", () => {
      const val = encoder.encode({ $u128: "340282366920938463463374607431768211455" }); // u128::MAX
      expect(val.switch()).toBe(xdr.ScValType.scvU128());
      expect(roundTrip(val)).toBe("340282366920938463463374607431768211455");
    });

    it("rejects a negative $u128 value", () => {
      expect(() => encoder.encode({ $u128: "-1" })).toThrow(/u128/);
    });

    it("rejects a $u128 value above u128::MAX", () => {
      expect(() =>
        encoder.encode({ $u128: "340282366920938463463374607431768211456" })
      ).toThrow(/u128/);
    });

    it("does not hijack an ordinary map whose only key happens to not match a hint", () => {
      const val = encoder.encode({ amount: 5 });
      expect(val.switch()).toBe(xdr.ScValType.scvMap());
      expect(roundTrip(val)).toEqual({ amount: 5 });
    });

    it("does not hijack a map with a hint-like key alongside other keys", () => {
      const val = encoder.encode({ u32: 5, other: 1 });
      expect(val.switch()).toBe(xdr.ScValType.scvMap());
      expect(roundTrip(val)).toEqual({ u32: 5, other: 1 });
    });
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
