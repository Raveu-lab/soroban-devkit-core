import { xdr } from "@stellar/stellar-sdk";
import { ContractEvent } from "./types";

/**
 * EventDecoder
 *
 * Decodes raw base64 XDR Soroban contract events into human-readable JSON.
 * Supports automatic type inference for all primitive and composite ScVal types.
 *
 * @example
 * ```ts
 * const decoder = new EventDecoder();
 * const decoded = decoder.decode(rawEvent);
 * console.log(decoded.decodedTopics); // ['transfer', 'GABC...', 'GXYZ...']
 * console.log(decoded.decodedData);   // { amount: '1000000' }
 * ```
 */
export class EventDecoder {
  /**
   * Decode a single ContractEvent.
   * Populates `decodedTopics` and `decodedData` on the returned event.
   */
  decode(event: ContractEvent): ContractEvent {
    const decoded = { ...event };

    try {
      decoded.decodedTopics = event.topics.map((topicXdr) =>
        this.decodeScVal(xdr.ScVal.fromXDR(topicXdr, "base64"))
      );
    } catch {
      decoded.decodedTopics = event.topics.map(() => "[decode error]");
    }

    try {
      decoded.decodedData = this.decodeScVal(xdr.ScVal.fromXDR(event.data, "base64"));
    } catch {
      decoded.decodedData = "[decode error]";
    }

    return decoded;
  }

  /**
   * Decode an array of ContractEvents.
   */
  decodeMany(events: ContractEvent[]): ContractEvent[] {
    return events.map((e) => this.decode(e));
  }

  /**
   * Recursively decode an XDR ScVal into a plain JavaScript value.
   */
  private decodeScVal(val: xdr.ScVal): unknown {
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
      case xdr.ScValType.scvU128(): {
        const u = val.u128();
        return BigInt(u.hi().toString()) * BigInt("18446744073709551616") + BigInt(u.lo().toString());
      }
      case xdr.ScValType.scvI128(): {
        const i = val.i128();
        return BigInt(i.hi().toString()) * BigInt("18446744073709551616") + BigInt(i.lo().toString());
      }
      case xdr.ScValType.scvAddress():
        return val.address().toString();
      case xdr.ScValType.scvSymbol():
        return val.sym().toString();
      case xdr.ScValType.scvString():
        return val.str().toString();
      case xdr.ScValType.scvBytes():
        return Buffer.from(val.bytes()).toString("hex");
      case xdr.ScValType.scvVec(): {
        const vec = val.vec();
        return vec ? vec.map((v) => this.decodeScVal(v)) : [];
      }
      case xdr.ScValType.scvMap(): {
        const map = val.map();
        const result: Record<string, unknown> = {};
        if (map) {
          for (const entry of map) {
            const key = String(this.decodeScVal(entry.key()));
            result[key] = this.decodeScVal(entry.val());
          }
        }
        return result;
      }
      default:
        return `[unsupported: ${type.name}]`;
    }
  }
}
