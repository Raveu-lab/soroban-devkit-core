import { Address, xdr } from "@stellar/stellar-sdk";

const SYMBOL_PATTERN = /^[A-Za-z0-9_]{1,32}$/;
const INTEGER_STRING_PATTERN = /^-?\d+$/;
const UINT64_MASK = (1n << 64n) - 1n;
const UINT64_MAX = UINT64_MASK;
const UINT128_MAX = (1n << 128n) - 1n;
const UINT256_MAX = (1n << 256n) - 1n;
const INT128_MAX = (1n << 127n) - 1n;
const INT128_MIN = -(1n << 127n);
const INT64_MAX = (1n << 63n) - 1n;
const INT64_MIN = -(1n << 63n);
const INT256_MAX = (1n << 255n) - 1n;
const INT256_MIN = -(1n << 255n);
const NUMERIC_HINT_PATTERN = /^\$(u32|u64|u128|u256|i64|i256|timepoint|duration)$/;
const HEX_PATTERN = /^[0-9a-fA-F]+$/;

/**
 * ArgEncoder
 *
 * Encodes plain JavaScript values into XDR ScVal — the inverse of EventDecoder.
 * Used to turn user-supplied CLI/JSON arguments into typed contract call args
 * without callers needing to import the Stellar SDK themselves.
 *
 * Type inference (no contract spec is consulted):
 * - boolean       -> scvBool
 * - null          -> scvVoid
 * - safe i32 int  -> scvI32
 * - G.../C.../M... str -> scvAddress
 * - digit string  -> scvI128
 * - short [A-Za-z0-9_] string -> scvSymbol
 * - other string  -> scvString
 * - array         -> scvVec (each element encoded recursively)
 * - Uint8Array/Buffer -> scvBytes
 * - { $u32: n }   -> scvU32 (single-key escape hatch — see below)
 * - { $u64: n }   -> scvU64
 * - { $u128: n }  -> scvU128
 * - { $u256: n }  -> scvU256
 * - { $i64: n }   -> scvI64
 * - { $i256: n }  -> scvI256
 * - { $timepoint: n } -> scvTimepoint
 * - { $duration: n }  -> scvDuration
 * - { $bytes: hex | number[] } -> scvBytes
 * - plain object  -> scvMap (keys encoded as scvSymbol, values recursively)
 *
 * Plain numbers and digit strings always infer i32 or i128 — there's no
 * contract spec here to say a parameter is actually some other width, and
 * every remaining integer type is unreachable by inference: `u32`/`u64`/
 * `u128`/`u256` (common for ids/counts/thresholds), `i64`/`i256`, and the
 * u64-based `Timepoint`/`Duration` (common for deadlines and lock periods).
 * A function call with a mismatched type fails with an opaque host VM trap,
 * not a clear encoding error. A single-key object whose key matches one of
 * the hints exactly, with `n` a number or digit string, is a JSON-safe
 * escape hatch to force the intended type. Collision with a genuine scvMap
 * argument is possible in principle but not realistic in practice (no real
 * contract struct field is named "$u32").
 *
 * Bytes have the same problem with no inference available at all: a hex
 * string is indistinguishable from a Symbol or a String, so `"deadbeef"`
 * infers scvSymbol and a 64-character hash infers scvString. Since
 * EventDecoder renders scvBytes as hex and BindingGenerator types a
 * Bytes/BytesN parameter as `string`, that is exactly the value a caller
 * tends to have in hand. `{ $bytes: "deadbeef" }` (or a `number[]`, or a
 * plain Uint8Array/Buffer, which is unambiguous) forces scvBytes.
 *
 * @example
 * ```ts
 * const encoder = new ArgEncoder();
 * const args = encoder.encodeArgs(["GABC...", "1000000"]);
 * await simulator.simulate(contractId, "transfer", args, caller);
 * ```
 */
export class ArgEncoder {
  /**
   * Encode an array of plain values into ScVal args, in order.
   */
  encodeArgs(values: unknown[]): xdr.ScVal[] {
    return values.map((value) => this.encode(value));
  }

  /**
   * Encode a single plain value into an ScVal, inferring its type.
   * Throws for values with no sensible inferred type (undefined, functions, NaN, etc.).
   */
  encode(value: unknown): xdr.ScVal {
    if (value === null) {
      return xdr.ScVal.scvVoid();
    }

    if (typeof value === "boolean") {
      return xdr.ScVal.scvBool(value);
    }

    if (typeof value === "number") {
      return this.encodeNumber(value);
    }

    if (typeof value === "string") {
      return this.encodeString(value);
    }

    if (Array.isArray(value)) {
      return xdr.ScVal.scvVec(value.map((item) => this.encode(item)));
    }

    if (value instanceof Uint8Array) {
      return xdr.ScVal.scvBytes(Buffer.from(value));
    }

    if (typeof value === "object") {
      const obj = value as Record<string, unknown>;
      const numeric = this.tryEncodeNumericHint(obj);
      if (numeric) return numeric;
      const bytes = this.tryEncodeBytesHint(obj);
      if (bytes) return bytes;
      return this.encodeObject(obj);
    }

    throw new Error(`ArgEncoder: cannot encode value of type ${typeof value}`);
  }

  private encodeNumber(value: number): xdr.ScVal {
    if (!Number.isInteger(value)) {
      throw new Error(
        `ArgEncoder: ${value} is not an integer — non-integer numbers have no ScVal type`
      );
    }
    if (value < -2147483648 || value > 2147483647) {
      throw new Error(
        `ArgEncoder: ${value} is outside the i32 range — pass large integers as a string (encoded as i128)`
      );
    }
    return xdr.ScVal.scvI32(value);
  }

  private encodeString(value: string): xdr.ScVal {
    const address = this.tryEncodeAddress(value);
    if (address) {
      return address;
    }

    if (INTEGER_STRING_PATTERN.test(value)) {
      const parsed = BigInt(value);
      if (parsed < INT128_MIN || parsed > INT128_MAX) {
        throw new Error(
          `ArgEncoder: ${value} is outside the i128 range [${INT128_MIN}, ${INT128_MAX}] — ` +
            `pass a smaller value, or use the { $u128: n } / { $u256: n } hint if it's meant to be unsigned`
        );
      }
      return xdr.ScVal.scvI128(this.bigIntToInt128Parts(parsed));
    }

    if (SYMBOL_PATTERN.test(value)) {
      return xdr.ScVal.scvSymbol(value);
    }

    return xdr.ScVal.scvString(Buffer.from(value));
  }

  private tryEncodeAddress(value: string): xdr.ScVal | null {
    const isAccountOrContract = value.length === 56 && (value[0] === "G" || value[0] === "C");
    const isMuxedAccount = value.length === 69 && value[0] === "M";
    if (!isAccountOrContract && !isMuxedAccount) {
      return null;
    }
    try {
      return Address.fromString(value).toScVal();
    } catch {
      return null;
    }
  }

  private encodeObject(value: Record<string, unknown>): xdr.ScVal {
    const entries = Object.entries(value).map(([key, val]) => {
      if (!SYMBOL_PATTERN.test(key)) {
        throw new Error(
          `ArgEncoder: map key "${key}" is not a valid Symbol — must be 1-32 characters from [A-Za-z0-9_]`
        );
      }
      return new xdr.ScMapEntry({
        key: xdr.ScVal.scvSymbol(key),
        val: this.encode(val),
      });
    });
    return xdr.ScVal.scvMap(entries);
  }

  /**
   * If `value` is a single-key object whose key matches the numeric
   * escape-hatch pattern, encode it as that ScVal type. Returns null for
   * anything else, so the caller falls back to normal scvMap encoding.
   */
  private tryEncodeNumericHint(value: Record<string, unknown>): xdr.ScVal | null {
    const keys = Object.keys(value);
    if (keys.length !== 1) return null;

    const match = keys[0].match(NUMERIC_HINT_PATTERN);
    if (!match) return null;

    const raw = value[keys[0]];
    const kind = match[1] as
      | "u32"
      | "u64"
      | "u128"
      | "u256"
      | "i64"
      | "i256"
      | "timepoint"
      | "duration";
    switch (kind) {
      case "u32":
        return this.encodeU32(raw);
      case "u64":
        return this.encodeU64(raw);
      case "u128":
        return this.encodeU128(raw);
      case "u256":
        return this.encodeU256(raw);
      case "i64":
        return this.encodeI64(raw);
      case "i256":
        return this.encodeI256(raw);
      case "timepoint":
        return xdr.ScVal.scvTimepoint(new xdr.Uint64(this.toU64Hint(raw, "timepoint")));
      case "duration":
        return xdr.ScVal.scvDuration(new xdr.Uint64(this.toU64Hint(raw, "duration")));
    }
  }

  private encodeI64(raw: unknown): xdr.ScVal {
    const value = this.toBigIntHint(raw, "i64");
    if (value < INT64_MIN || value > INT64_MAX) {
      throw new Error(`ArgEncoder: $i64 value ${value} is outside the i64 range`);
    }
    return xdr.ScVal.scvI64(new xdr.Int64(value));
  }

  private encodeI256(raw: unknown): xdr.ScVal {
    const value = this.toBigIntHint(raw, "i256");
    if (value < INT256_MIN || value > INT256_MAX) {
      throw new Error(`ArgEncoder: $i256 value ${value} is outside the i256 range`);
    }
    // BigInt bitwise ops are two's-complement over arbitrary precision, so
    // the same shifts work for negatives without special-casing sign.
    return xdr.ScVal.scvI256(
      new xdr.Int256Parts({
        hiHi: new xdr.Int64(value >> 192n),
        hiLo: new xdr.Uint64((value >> 128n) & UINT64_MASK),
        loHi: new xdr.Uint64((value >> 64n) & UINT64_MASK),
        loLo: new xdr.Uint64(value & UINT64_MASK),
      })
    );
  }

  /** Timepoint and Duration are both u64-based, and neither can be negative. */
  private toU64Hint(raw: unknown, typeName: string): bigint {
    const value = this.toBigIntHint(raw, typeName);
    if (value < 0n || value > UINT64_MAX) {
      throw new Error(`ArgEncoder: $${typeName} value ${value} is outside the u64 range`);
    }
    return value;
  }

  /**
   * If `value` is a single-key `{ $bytes: ... }` object, encode it as scvBytes
   * from either a hex string (optionally 0x-prefixed) or an array of byte
   * values. Returns null for anything else.
   *
   * EventDecoder renders scvBytes as a hex string and BindingGenerator types
   * a Bytes/BytesN parameter as `string`, so hex is the representation a
   * caller already has in hand.
   */
  private tryEncodeBytesHint(value: Record<string, unknown>): xdr.ScVal | null {
    const keys = Object.keys(value);
    if (keys.length !== 1 || keys[0] !== "$bytes") return null;

    const raw = value.$bytes;
    if (typeof raw === "string") {
      return xdr.ScVal.scvBytes(this.hexToBuffer(raw));
    }
    if (Array.isArray(raw)) {
      return xdr.ScVal.scvBytes(this.byteArrayToBuffer(raw));
    }
    throw new Error(
      `ArgEncoder: $bytes value must be a hex string or an array of bytes, got ${JSON.stringify(raw)}`
    );
  }

  private hexToBuffer(raw: string): Buffer {
    const hex = raw.startsWith("0x") || raw.startsWith("0X") ? raw.slice(2) : raw;
    // Buffer.from(_, "hex") stops at the first non-hex character and returns a
    // short buffer rather than throwing, so the input has to be checked here.
    if (hex.length > 0 && !HEX_PATTERN.test(hex)) {
      throw new Error(`ArgEncoder: $bytes value "${raw}" is not a hex string`);
    }
    if (hex.length % 2 !== 0) {
      throw new Error(
        `ArgEncoder: $bytes hex string "${raw}" has an odd number of digits — each byte needs two`
      );
    }
    return Buffer.from(hex, "hex");
  }

  private byteArrayToBuffer(raw: unknown[]): Buffer {
    return Buffer.from(
      raw.map((byte) => {
        if (typeof byte !== "number" || !Number.isInteger(byte) || byte < 0 || byte > 255) {
          throw new Error(
            `ArgEncoder: $bytes array element ${JSON.stringify(byte)} is not a byte value (0-255)`
          );
        }
        return byte;
      })
    );
  }

  private toBigIntHint(raw: unknown, typeName: string): bigint {
    if (typeof raw === "number") {
      if (!Number.isInteger(raw)) {
        throw new Error(`ArgEncoder: $${typeName} value ${raw} is not an integer`);
      }
      return BigInt(raw);
    }
    if (typeof raw === "string" && INTEGER_STRING_PATTERN.test(raw)) {
      return BigInt(raw);
    }
    throw new Error(
      `ArgEncoder: $${typeName} value must be an integer or digit string, got ${JSON.stringify(raw)}`
    );
  }

  private encodeU32(raw: unknown): xdr.ScVal {
    const value = this.toBigIntHint(raw, "u32");
    if (value < 0n || value > 4_294_967_295n) {
      throw new Error(`ArgEncoder: $u32 value ${value} is outside the u32 range`);
    }
    return xdr.ScVal.scvU32(Number(value));
  }

  private encodeU64(raw: unknown): xdr.ScVal {
    const value = this.toBigIntHint(raw, "u64");
    if (value < 0n || value > UINT64_MAX) {
      throw new Error(`ArgEncoder: $u64 value ${value} is outside the u64 range`);
    }
    return xdr.ScVal.scvU64(new xdr.Uint64(value));
  }

  private encodeU128(raw: unknown): xdr.ScVal {
    const value = this.toBigIntHint(raw, "u128");
    if (value < 0n || value > UINT128_MAX) {
      throw new Error(`ArgEncoder: $u128 value ${value} is outside the u128 range`);
    }
    const hi = value >> 64n;
    const lo = value & UINT64_MASK;
    return xdr.ScVal.scvU128(
      new xdr.UInt128Parts({ hi: new xdr.Uint64(hi), lo: new xdr.Uint64(lo) })
    );
  }

  private encodeU256(raw: unknown): xdr.ScVal {
    const value = this.toBigIntHint(raw, "u256");
    if (value < 0n || value > UINT256_MAX) {
      throw new Error(`ArgEncoder: $u256 value ${value} is outside the u256 range`);
    }
    const hiHi = value >> 192n;
    const hiLo = (value >> 128n) & UINT64_MASK;
    const loHi = (value >> 64n) & UINT64_MASK;
    const loLo = value & UINT64_MASK;
    return xdr.ScVal.scvU256(
      new xdr.UInt256Parts({
        hiHi: new xdr.Uint64(hiHi),
        hiLo: new xdr.Uint64(hiLo),
        loHi: new xdr.Uint64(loHi),
        loLo: new xdr.Uint64(loLo),
      })
    );
  }

  /**
   * Split a BigInt into the hi/lo 64-bit parts an XDR Int128Parts expects.
   * JS BigInt bitwise ops are two's-complement over arbitrary precision, so
   * this handles negative values correctly without special-casing sign.
   */
  private bigIntToInt128Parts(value: bigint): xdr.Int128Parts {
    const lo = value & UINT64_MASK;
    const hi = value >> 64n;
    return new xdr.Int128Parts({
      hi: new xdr.Int64(hi),
      lo: new xdr.Uint64(lo),
    });
  }
}
