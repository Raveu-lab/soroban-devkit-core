import { xdr, Address } from "@stellar/stellar-sdk";
import { EventDecoder } from "../src/decoder";
import { ContractEvent } from "../src/types";
import { isDecodedVoid, isDecodedNumber } from "../src/decoded-value";

/**
 * Helpers to build real XDR ScVal fixtures
 */
function makeSymbolXdr(value: string): string {
  return xdr.ScVal.scvSymbol(value).toXDR("base64");
}

function makeBoolXdr(value: boolean): string {
  return xdr.ScVal.scvBool(value).toXDR("base64");
}

function makeU32Xdr(value: number): string {
  return xdr.ScVal.scvU32(value).toXDR("base64");
}

function makeI32Xdr(value: number): string {
  return xdr.ScVal.scvI32(value).toXDR("base64");
}

function makeAddressXdr(value: string): string {
  return Address.fromString(value).toScVal().toXDR("base64");
}

function makeVoidXdr(): string {
  return xdr.ScVal.scvVoid().toXDR("base64");
}

function makeStringXdr(value: string): string {
  return xdr.ScVal.scvString(Buffer.from(value)).toXDR("base64");
}

function makeVecXdr(items: xdr.ScVal[]): string {
  return xdr.ScVal.scvVec(items).toXDR("base64");
}

function makeMapXdr(entries: Array<[string, xdr.ScVal]>): string {
  const mapEntries = entries.map(
    ([key, val]) =>
      new xdr.ScMapEntry({
        key: xdr.ScVal.scvSymbol(key),
        val,
      })
  );
  return xdr.ScVal.scvMap(mapEntries).toXDR("base64");
}

function makeEvent(topics: string[], data: string): ContractEvent {
  return {
    ledger: 100,
    ledgerClosedAt: "2024-01-01T00:00:00Z",
    contractId: "CTEST",
    id: "1",
    type: "contract",
    topics,
    data,
  };
}

describe("EventDecoder", () => {
  let decoder: EventDecoder;

  beforeEach(() => {
    decoder = new EventDecoder();
  });

  describe("decodeTopics", () => {
    it("decodes a single symbol topic", () => {
      const event = makeEvent([makeSymbolXdr("transfer")], makeVoidXdr());
      const result = decoder.decode(event);
      expect(result.decodedTopics).toEqual(["transfer"]);
    });

    it("decodes multiple topics", () => {
      const event = makeEvent([makeSymbolXdr("mint"), makeSymbolXdr("token")], makeVoidXdr());
      const result = decoder.decode(event);
      expect(result.decodedTopics).toEqual(["mint", "token"]);
    });

    it("returns decode error string for invalid base64 topics without throwing", () => {
      const event = makeEvent(["not-valid-xdr"], makeVoidXdr());
      const result = decoder.decode(event);
      expect(result.decodedTopics?.[0]).toBe("[decode error]");
    });

    it("returns empty array for empty topics", () => {
      const event = makeEvent([], makeVoidXdr());
      const result = decoder.decode(event);
      expect(result.decodedTopics).toEqual([]);
    });
  });

  describe("decodeData", () => {
    it("decodes a boolean true value", () => {
      const event = makeEvent([], makeBoolXdr(true));
      expect(decoder.decode(event).decodedData).toBe(true);
    });

    it("decodes a boolean false value", () => {
      const event = makeEvent([], makeBoolXdr(false));
      expect(decoder.decode(event).decodedData).toBe(false);
    });

    it("decodes a void value as null", () => {
      const event = makeEvent([], makeVoidXdr());
      expect(decoder.decode(event).decodedData).toBeNull();
    });

    it("decodes a u32 integer", () => {
      const event = makeEvent([], makeU32Xdr(42));
      expect(decoder.decode(event).decodedData).toBe(42);
    });

    it("decodes an i32 negative integer", () => {
      const event = makeEvent([], makeI32Xdr(-7));
      expect(decoder.decode(event).decodedData).toBe(-7);
    });

    it("decodes a string value", () => {
      const event = makeEvent([], makeStringXdr("hello soroban"));
      expect(decoder.decode(event).decodedData).toBe("hello soroban");
    });

    it("decodes a vec of u32 values", () => {
      const event = makeEvent(
        [],
        makeVecXdr([xdr.ScVal.scvU32(1), xdr.ScVal.scvU32(2), xdr.ScVal.scvU32(3)])
      );
      expect(decoder.decode(event).decodedData).toEqual([1, 2, 3]);
    });

    it("decodes a map into a plain object", () => {
      const event = makeEvent(
        [],
        makeMapXdr([
          ["amount", xdr.ScVal.scvU32(1000)],
          ["fee", xdr.ScVal.scvU32(10)],
        ])
      );
      expect(decoder.decode(event).decodedData).toEqual({ amount: 1000, fee: 10 });
    });

    it("decodes an account address (G...) to its strkey string", () => {
      const address = "GACP4WS6CA6GPH7NWEPY6AKRTNQSRAL7KB2SDYEKNN7YMMCYGKKI2HE4";
      const event = makeEvent([], makeAddressXdr(address));
      expect(decoder.decode(event).decodedData).toBe(address);
    });

    it("decodes a contract address (C...) to its strkey string", () => {
      const address = "CB5YCY5CYLNO3PTH3OXQKKT6XFXTSNIOYSC5B65XE4ZZE6MVIWGD2LNH";
      const event = makeEvent([], makeAddressXdr(address));
      expect(decoder.decode(event).decodedData).toBe(address);
    });

    it("returns decode error string for invalid base64 data without throwing", () => {
      const event = makeEvent([], "not-valid-xdr");
      const result = decoder.decode(event);
      expect(result.decodedData).toBe("[decode error]");
    });
  });

  describe("decode", () => {
    it("does not mutate the original event", () => {
      const event = makeEvent([makeSymbolXdr("transfer")], makeVoidXdr());
      const original = { ...event };
      decoder.decode(event);
      expect(event).toEqual(original);
    });

    it("returns a new event object", () => {
      const event = makeEvent([], makeVoidXdr());
      const result = decoder.decode(event);
      expect(result).not.toBe(event);
    });
  });

  describe("decodeMany", () => {
    it("decodes all events in an array", () => {
      const events = [
        makeEvent([makeSymbolXdr("transfer")], makeVoidXdr()),
        makeEvent([makeSymbolXdr("mint")], makeU32Xdr(100)),
      ];
      const results = decoder.decodeMany(events);
      expect(results).toHaveLength(2);
      expect(results[0].decodedTopics).toEqual(["transfer"]);
      expect(results[1].decodedTopics).toEqual(["mint"]);
      expect(results[1].decodedData).toBe(100);
    });

    it("returns an empty array for empty input", () => {
      expect(decoder.decodeMany([])).toEqual([]);
    });
  });
});

describe("EventDecoder — additional edge cases", () => {
  let decoder: EventDecoder;

  beforeEach(() => {
    decoder = new EventDecoder();
  });

  it("decodes scvBytes as a lowercase hex string", () => {
    const bytes = Buffer.from([0xde, 0xad, 0xbe, 0xef]);
    const xdrVal = xdr.ScVal.scvBytes(bytes).toXDR("base64");
    const event = makeEvent([], xdrVal);
    expect(decoder.decode(event).decodedData).toBe("deadbeef");
  });

  it("decodes a vec of symbols", () => {
    const vec = makeVecXdr([xdr.ScVal.scvSymbol("alpha"), xdr.ScVal.scvSymbol("beta")]);
    const event = makeEvent([], vec);
    expect(decoder.decode(event).decodedData).toEqual(["alpha", "beta"]);
  });

  it("decodes an empty vec as an empty array", () => {
    const vec = xdr.ScVal.scvVec([]).toXDR("base64");
    const event = makeEvent([], vec);
    expect(decoder.decode(event).decodedData).toEqual([]);
  });

  it("decodes a nested map with mixed value types", () => {
    const map = makeMapXdr([
      ["count", xdr.ScVal.scvU32(5)],
      ["label", xdr.ScVal.scvSymbol("active")],
      ["enabled", xdr.ScVal.scvBool(true)],
    ]);
    const event = makeEvent([], map);
    expect(decoder.decode(event).decodedData).toEqual({
      count: 5,
      label: "active",
      enabled: true,
    });
  });

  it("decodes multiple topics of different types", () => {
    const event = makeEvent(
      [makeSymbolXdr("burn"), makeU32Xdr(999), makeBoolXdr(false)],
      makeVoidXdr()
    );
    const result = decoder.decode(event);
    expect(result.decodedTopics).toEqual(["burn", 999, false]);
  });
});

describe("EventDecoder — type-guard integration", () => {
  let decoder: EventDecoder;

  beforeEach(() => {
    decoder = new EventDecoder();
  });

  it("decoded void value passes isDecodedVoid check", () => {
    const event = makeEvent([], makeVoidXdr());
    const result = decoder.decode(event);
    expect(isDecodedVoid(result.decodedData)).toBe(true);
  });

  it("decoded u32 value passes isDecodedNumber check", () => {
    const event = makeEvent([], makeU32Xdr(99));
    const result = decoder.decode(event);
    expect(isDecodedNumber(result.decodedData)).toBe(true);
  });
});
