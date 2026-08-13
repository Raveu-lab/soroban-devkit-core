import { xdr } from "@stellar/stellar-sdk";
import { ContractEvent } from "./types";

/**
 * EventDecoder
 *
 * Decodes raw base64 XDR Soroban contract events into human-readable values.
 * Follows the Single Responsibility Principle — only decodes, never fetches or stores.
 *
 * @example
 * ```ts
 * const decoder = new EventDecoder();
 * const decoded = decoder.decode(rawEvent);
 * console.log(decoded.decodedTopics); // ['transfer', 'GABC...', 'GXYZ...']
 * console.log(decoded.decodedData);   // 1000000
 * ```
 */
export class EventDecoder {
  /**
   * Decode a single ContractEvent.
   * Returns a new event object — does not mutate the input.
   */
  decode(event: ContractEvent): ContractEvent {
    return {
      ...event,
      decodedTopics: this.decodeTopics(event.topics),
      decodedData: this.decodeData(event.data),
    };
  }

  /**
   * Decode an array of ContractEvents.
   */
  decodeMany(events: ContractEvent[]): ContractEvent[] {
    return events.map((e) => this.decode(e));
  }

  /**
   * Decode an array of base64 XDR topic strings into plain values.
   * Returns "[decode error]" for any topic that cannot be decoded.
   */
  decodeTopics(topics: string[]): unknown[] {
    return topics.map((topic) => this.decodeBase64ScVal(topic));
  }

  /**
   * Decode a single base64 XDR data string into a plain value.
   */
  decodeData(data: string): unknown {
    return this.decodeBase64ScVal(data);
  }

  /**
   * Decode a base64 XDR string into a plain JavaScript value.
   * Returns "[decode error]" on failure — never throws.
   */
  private decodeBase64ScVal(base64: string): unknown {
    try {
      return this.scValToJs(xdr.ScVal.fromXDR(base64, "base64"));
    } catch {
      return "[decode error]";
    }
  }

  /**
   * Check whether a decoded data value is null (scvVoid).
   */
  isVoid(decodedData: unknown): boolean {
    return decodedData === null;
  }

  /**
   * Check whether a decoded data value is a plain number (scvU32 or scvI32).
   */
  isNumber(decodedData: unknown): boolean {
    return typeof decodedData === "number";
  }
  private scValToJs(val: xdr.ScVal): unknown {
    const type = val.switch();

    switch (type) {
      case xdr.ScValType.scvBool():
        return val.b();

      case xdr.ScValType.scvVoid():
        return null;

      case xdr.ScValType.scvU32():
        return val.u32();

      case xdr.ScValType.scvI32():
        return val.i32();

      case xdr.ScValType.scvU64():
        return val.u64().toString();

      case xdr.ScValType.scvI64():
        return val.i64().toString();

      case xdr.ScValType.scvU128():
        return this.u128ToBigInt(val.u128()).toString();

      case xdr.ScValType.scvI128():
        return this.i128ToBigInt(val.i128()).toString();

      case xdr.ScValType.scvAddress():
        return val.address().toString();

      case xdr.ScValType.scvSymbol():
        return val.sym().toString();

      case xdr.ScValType.scvString():
        return val.str().toString();

      case xdr.ScValType.scvBytes():
        return Buffer.from(val.bytes()).toString("hex");

      case xdr.ScValType.scvVec():
        return this.decodeVec(val);

      case xdr.ScValType.scvMap():
        return this.decodeMap(val);

      default:
        return `[unsupported: ${type.name}]`;
    }
  }

  /**
   * Decode an scvVec into an array of plain JavaScript values.
   */
  private decodeVec(val: xdr.ScVal): unknown[] {
    const vec = val.vec();
    return vec ? vec.map((v) => this.scValToJs(v)) : [];
  }

  /**
   * Decode an scvMap into a plain JavaScript object.
   */
  private decodeMap(val: xdr.ScVal): Record<string, unknown> {
    const map = val.map();
    const result: Record<string, unknown> = {};
    if (map) {
      for (const entry of map) {
        const key = String(this.scValToJs(entry.key()));
        result[key] = this.scValToJs(entry.val());
      }
    }
    return result;
  }

  /**
   * Convert a UInt128Parts XDR value into a BigInt.
   * High 64 bits are multiplied by 2^64 before adding the low 64 bits.
   */
  private u128ToBigInt(parts: xdr.UInt128Parts): bigint {
    return (
      BigInt(parts.hi().toString()) * BigInt("18446744073709551616") +
      BigInt(parts.lo().toString())
    );
  }

  /**
   * Convert an Int128Parts XDR value into a BigInt.
   * High 64 bits are multiplied by 2^64 before adding the low 64 bits.
   */
  private i128ToBigInt(parts: xdr.Int128Parts): bigint {
    return (
      BigInt(parts.hi().toString()) * BigInt("18446744073709551616") +
      BigInt(parts.lo().toString())
    );
  }
}
