import { EventDecoder } from "../src/decoder";
import { ContractEvent } from "../src/types";

describe("EventDecoder", () => {
  let decoder: EventDecoder;

  beforeEach(() => {
    decoder = new EventDecoder();
  });

  it("should return a new event object without mutating the original", () => {
    const raw: ContractEvent = {
      ledger: 100,
      ledgerClosedAt: "2024-01-01T00:00:00Z",
      contractId: "CTEST",
      id: "1",
      type: "contract",
      topics: [],
      data: "",
    };
    const decoded = decoder.decode(raw);
    expect(decoded).not.toBe(raw);
  });

  it("should handle decode errors gracefully without throwing", () => {
    const raw: ContractEvent = {
      ledger: 100,
      ledgerClosedAt: "2024-01-01T00:00:00Z",
      contractId: "CTEST",
      id: "1",
      type: "contract",
      topics: ["not-valid-xdr"],
      data: "not-valid-xdr",
    };
    expect(() => decoder.decode(raw)).not.toThrow();
    const result = decoder.decode(raw);
    expect(result.decodedTopics?.[0]).toBe("[decode error]");
    expect(result.decodedData).toBe("[decode error]");
  });

  it("decodeMany should process all events in an array", () => {
    const events: ContractEvent[] = Array.from({ length: 5 }, (_, i) => ({
      ledger: i,
      ledgerClosedAt: "",
      contractId: "CTEST",
      id: String(i),
      type: "contract" as const,
      topics: [],
      data: "",
    }));
    const results = decoder.decodeMany(events);
    expect(results).toHaveLength(5);
  });

  // TODO: Add tests with real XDR fixtures from soroban-devkit-contracts
  // See: https://github.com/soroban-devkit/soroban-devkit-core/issues/20
});
