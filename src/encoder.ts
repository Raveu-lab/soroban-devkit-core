import { Address, xdr } from "@stellar/stellar-sdk";

const SYMBOL_PATTERN = /^[A-Za-z0-9_]{1,32}$/;
const INTEGER_STRING_PATTERN = /^-?\d+$/;
const UINT64_MASK = (1n << 64n) - 1n;
const UINT64_MAX = UINT64_MASK;
const UINT128_MAX = (1n << 128n) - 1n;
const UNSIGNED_HINT_PATTERN = /^\$(u32|u64|u128)$/;

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
 * - G.../C... str -> scvAddress
 * - digit string  -> scvI128
 * - short [A-Za-z0-9_] string -> scvSymbol
 * - other string  -> scvString
 * - array         -> scvVec (each element encoded recursively)
 * - { $u32: n }   -> scvU32 (single-key escape hatch — see below)
 * - { $u64: n }   -> scvU64
 * - { $u128: n }  -> scvU128
 * - plain object  -> scvMap (keys encoded as scvSymbol, values recursively)
 *
 * Plain numbers and digit strings always infer the *signed* variant
 * (i32/i128) — there's no contract spec here to say a parameter is actually
 * unsigned, which is common for ids/counts/thresholds. A function call with
 * a mismatched sign fails with an opaque host VM trap, not a clear encoding
 * error. `{ $u32: n }`/`{ $u64: n }`/`{ $u128: n }` — a single-key object
 * whose key matches exactly, `n` a number or digit string — is a JSON-safe
 * escape hatch to force the unsigned variant explicitly. Collision with a
 * genuine scvMap argument is possible in principle but not realistic in
 * practice (no real contract struct field is named "$u32").
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

    if (typeof value === "object") {
      const obj = value as Record<string, unknown>;
      const hint = this.tryEncodeUnsignedHint(obj);
      if (hint) return hint;
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
      return xdr.ScVal.scvI128(this.bigIntToInt128Parts(BigInt(value)));
    }

    if (SYMBOL_PATTERN.test(value)) {
      return xdr.ScVal.scvSymbol(value);
    }

    return xdr.ScVal.scvString(Buffer.from(value));
  }

  private tryEncodeAddress(value: string): xdr.ScVal | null {
    if (value.length !== 56 || (value[0] !== "G" && value[0] !== "C")) {
      return null;
    }
    try {
      return Address.fromString(value).toScVal();
    } catch {
      return null;
    }
  }

  private encodeObject(value: Record<string, unknown>): xdr.ScVal {
    const entries = Object.entries(value).map(
      ([key, val]) =>
        new xdr.ScMapEntry({
          key: xdr.ScVal.scvSymbol(key),
          val: this.encode(val),
        })
    );
    return xdr.ScVal.scvMap(entries);
  }

  /**
   * If `value` is a single-key object whose key matches the $u32/$u64/$u128
   * escape-hatch pattern, encode it as that unsigned ScVal type. Returns
   * null for anything else, so the caller falls back to normal scvMap
   * encoding.
   */
  private tryEncodeUnsignedHint(value: Record<string, unknown>): xdr.ScVal | null {
    const keys = Object.keys(value);
    if (keys.length !== 1) return null;

    const match = keys[0].match(UNSIGNED_HINT_PATTERN);
    if (!match) return null;

    const raw = value[keys[0]];
    const kind = match[1] as "u32" | "u64" | "u128";
    switch (kind) {
      case "u32":
        return this.encodeU32(raw);
      case "u64":
        return this.encodeU64(raw);
      case "u128":
        return this.encodeU128(raw);
    }
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
