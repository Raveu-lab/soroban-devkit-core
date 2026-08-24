import { Address, xdr } from "@stellar/stellar-sdk";

const SYMBOL_PATTERN = /^[A-Za-z0-9_]{1,32}$/;
const INTEGER_STRING_PATTERN = /^-?\d+$/;
const UINT64_MASK = (1n << 64n) - 1n;

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
 * - plain object  -> scvMap (keys encoded as scvSymbol, values recursively)
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
      return this.encodeObject(value as Record<string, unknown>);
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
