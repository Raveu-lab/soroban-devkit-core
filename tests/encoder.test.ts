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

  it("encodes an M... string as a muxed Address, not scvString", () => {
    // tryEncodeAddress only recognized 56-char G.../C... strings — a 69-char
    // M... muxed address (real, decodable via Address.fromString, confirmed
    // live) fell through to scvString instead of scvAddress: the wrong XDR
    // type, which fails at the contract boundary with an opaque mismatch
    // error rather than a clear encoding one.
    const muxed =
      "MA7QYNF7SOWQ3GLR2BGMZEHXAVIRZA4KVWLTJJFC7MGXUA74P7UJVAAAAAAAAAAAAAJLK";
    const val = encoder.encode(muxed);
    expect(val.switch()).toBe(xdr.ScValType.scvAddress());
    expect(roundTrip(val)).toBe(muxed);
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

  it("round-trips a digit string at exactly i128::MAX", () => {
    const max = "170141183460469231731687303715884105727";
    expect(roundTrip(encoder.encode(max))).toBe(max);
  });

  it("round-trips a digit string at exactly i128::MIN", () => {
    const min = "-170141183460469231731687303715884105728";
    expect(roundTrip(encoder.encode(min))).toBe(min);
  });

  it("throws a clear ArgEncoder error for a digit string above i128::MAX, not a raw XDR RangeError", () => {
    // Previously this fell straight through to bigIntToInt128Parts, which
    // let the underlying js-xdr library throw an opaque
    // "bigint value ... for i64 out of range [...]" RangeError instead of
    // a clear, branded error consistent with every other range check in
    // this file ($u32/$u64/$u128/$u256).
    const overMax = "170141183460469231731687303715884105728";
    expect(() => encoder.encode(overMax)).toThrow(/i128/);
  });

  it("throws a clear ArgEncoder error for a digit string below i128::MIN", () => {
    const underMin = "-170141183460469231731687303715884105729";
    expect(() => encoder.encode(underMin)).toThrow(/i128/);
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

  describe("invalid map keys", () => {
    // encode() previously accepted any object key as a scvSymbol without
    // validating it, unlike string *values* (which already go through
    // SYMBOL_PATTERN via encodeString). The failure only surfaced much
    // later, deep inside toXDR(), with an opaque error unrelated to the
    // actual cause: "XDR Write Error: got 50 bytes, max allowed is 32" —
    // no mention of which key, or that it's even about a map key.

    it("throws a clear error for a key containing a space", () => {
      expect(() => encoder.encode({ "has spaces": 1 })).toThrow(/"has spaces"/);
    });

    it("throws a clear error for a key longer than 32 characters", () => {
      const longKey = "thisiswaytoolongtobeavalidsymbolgreaterthan32chars";
      expect(() => encoder.encode({ [longKey]: 1 })).toThrow(new RegExp(longKey));
    });

    it("throws a clear error for an empty string key", () => {
      expect(() => encoder.encode({ "": 1 })).toThrow(/key/i);
    });

    it("still accepts a valid Symbol key", () => {
      expect(() => encoder.encode({ valid_key123: 1 })).not.toThrow();
    });
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

    it("encodes { $u256: \"n\" } as scvU256 from a digit string", () => {
      // u256::MAX = 2^256 - 1
      const val = encoder.encode({
        $u256: "115792089237316195423570985008687907853269984665640564039457584007913129639935",
      });
      expect(val.switch()).toBe(xdr.ScValType.scvU256());
      expect(roundTrip(val)).toBe(
        "115792089237316195423570985008687907853269984665640564039457584007913129639935"
      );
    });

    it("encodes { $u256: n } as scvU256 from a plain number", () => {
      const val = encoder.encode({ $u256: 1_000_000 });
      expect(val.switch()).toBe(xdr.ScValType.scvU256());
      expect(roundTrip(val)).toBe("1000000");
    });

    it("rejects a negative $u256 value", () => {
      expect(() => encoder.encode({ $u256: "-1" })).toThrow(/u256/);
    });

    it("rejects a $u256 value above u256::MAX", () => {
      expect(() =>
        encoder.encode({
          $u256: "115792089237316195423570985008687907853269984665640564039457584007913129639936",
        })
      ).toThrow(/u256/);
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

  describe("signed and time hints ($i64/$i256/$timepoint/$duration)", () => {
    // BindingGenerator types every one of these as `string`, and a digit
    // string infers scvI128 — so without a hint none of them is reachable.
    it("encodes { $i64: n } as scvI64, not the default i128", () => {
      const val = encoder.encode({ $i64: 1000 });
      expect(val.switch()).toBe(xdr.ScValType.scvI64());
      expect(roundTrip(val)).toBe("1000");
    });

    it("round-trips $i64 at exactly i64::MIN and i64::MAX", () => {
      expect(roundTrip(encoder.encode({ $i64: "-9223372036854775808" }))).toBe(
        "-9223372036854775808"
      );
      expect(roundTrip(encoder.encode({ $i64: "9223372036854775807" }))).toBe(
        "9223372036854775807"
      );
    });

    it("rejects an $i64 value outside the i64 range", () => {
      expect(() => encoder.encode({ $i64: "9223372036854775808" })).toThrow(/i64/);
      expect(() => encoder.encode({ $i64: "-9223372036854775809" })).toThrow(/i64/);
    });

    it("encodes { $i256: n } as scvI256, including a negative value", () => {
      const val = encoder.encode({ $i256: "-1606938044258990275541962092341162602522202993782792835301383" });
      expect(val.switch()).toBe(xdr.ScValType.scvI256());
      expect(roundTrip(val)).toBe("-1606938044258990275541962092341162602522202993782792835301383");
    });

    it("round-trips $i256 at exactly i256::MIN and i256::MAX", () => {
      const max = (2n ** 255n - 1n).toString();
      const min = (-(2n ** 255n)).toString();
      expect(roundTrip(encoder.encode({ $i256: max }))).toBe(max);
      expect(roundTrip(encoder.encode({ $i256: min }))).toBe(min);
    });

    it("rejects an $i256 value outside the i256 range", () => {
      expect(() => encoder.encode({ $i256: (2n ** 255n).toString() })).toThrow(/i256/);
    });

    it("encodes { $timepoint: n } as scvTimepoint, not a bare integer", () => {
      const val = encoder.encode({ $timepoint: 1_760_000_000 });
      expect(val.switch()).toBe(xdr.ScValType.scvTimepoint());
      expect(roundTrip(val)).toBe("1760000000");
    });

    it("encodes { $duration: n } as scvDuration", () => {
      const val = encoder.encode({ $duration: 86_400 });
      expect(val.switch()).toBe(xdr.ScValType.scvDuration());
      expect(roundTrip(val)).toBe("86400");
    });

    it("rejects a negative $timepoint or $duration, which are u64-based", () => {
      expect(() => encoder.encode({ $timepoint: -1 })).toThrow(/timepoint/);
      expect(() => encoder.encode({ $duration: -1 })).toThrow(/duration/);
    });

    it("rejects a $timepoint above u64::MAX", () => {
      expect(() => encoder.encode({ $timepoint: "18446744073709551616" })).toThrow(/timepoint/);
    });
  });

  describe("bytes", () => {
    it("encodes a Uint8Array as scvBytes, not a map of index to byte", () => {
      const val = encoder.encode(new Uint8Array([1, 2, 3]));
      expect(val.switch()).toBe(xdr.ScValType.scvBytes());
      expect(roundTrip(val)).toBe("010203");
    });

    it("encodes a Buffer as scvBytes", () => {
      const val = encoder.encode(Buffer.from([0xde, 0xad, 0xbe, 0xef]));
      expect(val.switch()).toBe(xdr.ScValType.scvBytes());
      expect(roundTrip(val)).toBe("deadbeef");
    });

    it("encodes an empty Uint8Array as empty scvBytes", () => {
      const val = encoder.encode(new Uint8Array([]));
      expect(val.switch()).toBe(xdr.ScValType.scvBytes());
      expect(roundTrip(val)).toBe("");
    });

    it("encodes { $bytes: hex } as scvBytes", () => {
      const val = encoder.encode({ $bytes: "deadbeef" });
      expect(val.switch()).toBe(xdr.ScValType.scvBytes());
      expect(roundTrip(val)).toBe("deadbeef");
    });

    it("round-trips what the decoder emits for a BytesN<32>, which a binding types as string", () => {
      const hash = "ab".repeat(32);
      const val = encoder.encode({ $bytes: hash });
      expect(val.switch()).toBe(xdr.ScValType.scvBytes());
      expect(roundTrip(val)).toBe(hash);
    });

    it("accepts a 0x-prefixed hex string", () => {
      expect(roundTrip(encoder.encode({ $bytes: "0xdeadbeef" }))).toBe("deadbeef");
    });

    it("accepts uppercase hex", () => {
      expect(roundTrip(encoder.encode({ $bytes: "DEADBEEF" }))).toBe("deadbeef");
    });

    it("encodes { $bytes: [] } from a byte array", () => {
      expect(roundTrip(encoder.encode({ $bytes: [1, 2, 3] }))).toBe("010203");
    });

    it("rejects an odd-length hex string rather than silently dropping a nibble", () => {
      expect(() => encoder.encode({ $bytes: "abc" })).toThrow(/bytes/);
    });

    it("rejects a non-hex $bytes string", () => {
      expect(() => encoder.encode({ $bytes: "nothex!" })).toThrow(/bytes/);
    });

    it("rejects a byte array value outside 0-255", () => {
      expect(() => encoder.encode({ $bytes: [256] })).toThrow(/bytes/);
    });
  });
});
