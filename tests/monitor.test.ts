import { xdr } from "@stellar/stellar-sdk";
import { ContractMonitor } from "../src/monitor";
import { ContractEvent } from "../src/types";

describe("ContractMonitor", () => {
  describe("constructor", () => {
    it("accepts a network name string", () => {
      expect(() => new ContractMonitor("testnet")).not.toThrow();
    });

    it("accepts a custom NetworkConfig object", () => {
      expect(
        () =>
          new ContractMonitor({
            network: "local",
            rpcUrl: "http://localhost:8000/soroban/rpc",
            networkPassphrase: "Standalone Network ; February 2017",
          })
      ).not.toThrow();
    });

    it("accepts a NetworkConfig with custom auth headers, for paid RPC providers", () => {
      expect(
        () =>
          new ContractMonitor({
            network: "mainnet",
            rpcUrl: "https://my-provider.example/rpc",
            networkPassphrase: "Public Global Stellar Network ; September 2015",
            headers: { "X-Api-Key": "secret" },
          })
      ).not.toThrow();
    });
  });

  describe("watch", () => {
    it("returns the same monitor instance for chaining", () => {
      const monitor = new ContractMonitor("testnet");
      const result = monitor.watch({ contractIds: ["CTEST"] });
      expect(result).toBe(monitor);
    });

    it("stores the provided options", () => {
      const monitor = new ContractMonitor("testnet");
      monitor.watch({ contractIds: ["CABC"], pollingIntervalMs: 2000 });
      expect(monitor.getOptions().contractIds).toEqual(["CABC"]);
      expect(monitor.getOptions().pollingIntervalMs).toBe(2000);
    });
  });

  describe("on", () => {
    it("returns the same monitor instance for chaining", () => {
      const monitor = new ContractMonitor("testnet");
      const result = monitor.on("event", () => {});
      expect(result).toBe(monitor);
    });

    it("registers an event callback", () => {
      const monitor = new ContractMonitor("testnet");
      const cb = jest.fn();
      monitor.on("event", cb);
      expect(monitor.getEventCallbackCount()).toBe(1);
    });

    it("registers an error callback", () => {
      const monitor = new ContractMonitor("testnet");
      const cb = jest.fn();
      monitor.on("error", cb);
      expect(monitor.getErrorCallbackCount()).toBe(1);
    });
  });

  describe("buildEventFilters", () => {
    it("returns an empty filter list when no contractIds are set", () => {
      const monitor = new ContractMonitor("testnet");
      monitor.watch({});
      expect(monitor.buildEventFilters()).toEqual([]);
    });

    it("builds a contract filter for each contract ID", () => {
      const monitor = new ContractMonitor("testnet");
      monitor.watch({ contractIds: ["CABC", "CXYZ"] });
      const filters = monitor.buildEventFilters();
      expect(filters).toHaveLength(1);
      expect(filters[0].contractIds).toEqual(["CABC", "CXYZ"]);
    });

    it("includes topic filter when eventFilter is set", () => {
      const monitor = new ContractMonitor("testnet");
      monitor.watch({ contractIds: ["CABC"], eventFilter: "transfer" });
      const filters = monitor.buildEventFilters();
      expect(filters[0].topics).toBeDefined();
    });

    it("encodes eventFilter as a real base64 XDR Symbol, matching what contracts actually emit", () => {
      const monitor = new ContractMonitor("testnet");
      monitor.watch({ contractIds: ["CABC"], eventFilter: "transfer" });
      const filters = monitor.buildEventFilters();

      const topicSegment = filters[0].topics?.[0]?.[0];
      expect(topicSegment).toBeDefined();
      // Must round-trip through the SDK's own XDR parser — a fabricated
      // string like "SCS:transfer" would throw here.
      const decoded = xdr.ScVal.fromXDR(topicSegment as string, "base64");
      expect(decoded.switch()).toBe(xdr.ScValType.scvSymbol());
      expect(decoded.sym().toString()).toBe("transfer");
    });

    it("omits topic filter when eventFilter is not set", () => {
      const monitor = new ContractMonitor("testnet");
      monitor.watch({ contractIds: ["CABC"] });
      const filters = monitor.buildEventFilters();
      expect(filters[0].topics).toBeUndefined();
    });
  });

  describe("normalizeRawEvent", () => {
    it("maps raw RPC event fields to ContractEvent shape", () => {
      const monitor = new ContractMonitor("testnet");
      monitor.watch({});

      const fakeRaw = {
        ledger: 500,
        ledgerClosedAt: "2024-06-01T00:00:00Z",
        contractId: "CTEST",
        id: "abc123",
        type: "contract",
        topic: [{ toXDR: (_: string) => "TOPICXDR" }],
        value: { toXDR: (_: string) => "DATAXDR" },
      };

      const event = monitor.normalizeRawEvent(fakeRaw as never);

      expect(event.ledger).toBe(500);
      expect(event.contractId).toBe("CTEST");
      expect(event.id).toBe("abc123");
      expect(event.type).toBe("contract");
      expect(event.topics).toHaveLength(1);
    });
  });

  describe("stop", () => {
    it("can be called before start without throwing", () => {
      const monitor = new ContractMonitor("testnet");
      expect(() => monitor.stop()).not.toThrow();
    });
  });
});

describe("ContractMonitor — additional edge cases", () => {
  describe("watch", () => {
    it("overwrites previous options when called again", () => {
      const monitor = new ContractMonitor("testnet");
      monitor.watch({ contractIds: ["CFIRST"], pollingIntervalMs: 1000 });
      monitor.watch({ contractIds: ["CSECOND"], pollingIntervalMs: 2000 });
      expect(monitor.getOptions().contractIds).toEqual(["CSECOND"]);
      expect(monitor.getOptions().pollingIntervalMs).toBe(2000);
    });

    it("accepts empty contractIds array", () => {
      const monitor = new ContractMonitor("testnet");
      monitor.watch({ contractIds: [] });
      expect(monitor.getOptions().contractIds).toEqual([]);
    });
  });

  describe("buildEventFilters", () => {
    it("returns empty filters when contractIds is an empty array", () => {
      const monitor = new ContractMonitor("testnet");
      monitor.watch({ contractIds: [] });
      expect(monitor.buildEventFilters()).toEqual([]);
    });

    it("sets filter type to contract", () => {
      const monitor = new ContractMonitor("testnet");
      monitor.watch({ contractIds: ["CABC"] });
      const filters = monitor.buildEventFilters();
      expect(filters[0].type).toBe("contract");
    });
  });

  describe("on", () => {
    it("allows multiple event callbacks", () => {
      const monitor = new ContractMonitor("testnet");
      monitor.on("event", () => {});
      monitor.on("event", () => {});
      expect(monitor.getEventCallbackCount()).toBe(2);
    });

    it("allows multiple error callbacks", () => {
      const monitor = new ContractMonitor("testnet");
      monitor.on("error", () => {});
      monitor.on("error", () => {});
      expect(monitor.getErrorCallbackCount()).toBe(2);
    });
  });

  describe("normalizeRawEvent", () => {
    it("sets event type from raw type string", () => {
      const monitor = new ContractMonitor("testnet");
      monitor.watch({});
      const raw = {
        ledger: 1,
        ledgerClosedAt: "",
        contractId: "CTEST",
        id: "x",
        type: "diagnostic",
        topic: [],
        value: { toXDR: (_: string) => "" },
      };
      const event = monitor.normalizeRawEvent(raw as never);
      expect(event.type).toBe("diagnostic");
    });

    it("maps all topics to base64 strings", () => {
      const monitor = new ContractMonitor("testnet");
      monitor.watch({});
      const raw = {
        ledger: 1,
        ledgerClosedAt: "",
        contractId: "CTEST",
        id: "x",
        type: "contract",
        topic: [{ toXDR: (_: string) => "TOPIC1" }, { toXDR: (_: string) => "TOPIC2" }],
        value: { toXDR: (_: string) => "" },
      };
      const event = monitor.normalizeRawEvent(raw as never);
      expect(event.topics).toEqual(["TOPIC1", "TOPIC2"]);
    });
  });

  describe("computeAdaptiveIntervalMs", () => {
    const monitor = new ContractMonitor("testnet");

    it("returns the 5000ms default with no previous sample", () => {
      const result = monitor.computeAdaptiveIntervalMs(undefined, {
        sequence: 100,
        closeTimeMs: 1_000_000,
      });
      expect(result).toBe(5000);
    });

    it("computes seconds-per-ledger from one ledger advancing over 6000ms", () => {
      const result = monitor.computeAdaptiveIntervalMs(
        { sequence: 100, closeTimeMs: 1_000_000 },
        { sequence: 101, closeTimeMs: 1_006_000 }
      );
      expect(result).toBe(6000);
    });

    it("averages across multiple ledgers advancing", () => {
      const result = monitor.computeAdaptiveIntervalMs(
        { sequence: 100, closeTimeMs: 1_000_000 },
        { sequence: 103, closeTimeMs: 1_015_000 } // 3 ledgers over 15000ms = 5000ms/ledger
      );
      expect(result).toBe(5000);
    });

    it("clamps an implausibly fast cadence to the 2000ms floor", () => {
      const result = monitor.computeAdaptiveIntervalMs(
        { sequence: 100, closeTimeMs: 1_000_000 },
        { sequence: 101, closeTimeMs: 1_000_500 } // 500ms/ledger
      );
      expect(result).toBe(2000);
    });

    it("clamps a stalled/slow cadence to the 30000ms ceiling", () => {
      const result = monitor.computeAdaptiveIntervalMs(
        { sequence: 100, closeTimeMs: 1_000_000 },
        { sequence: 101, closeTimeMs: 1_060_000 } // 60000ms/ledger
      );
      expect(result).toBe(30000);
    });

    it("falls back to the default if the ledger sequence didn't advance", () => {
      const result = monitor.computeAdaptiveIntervalMs(
        { sequence: 100, closeTimeMs: 1_000_000 },
        { sequence: 100, closeTimeMs: 1_010_000 }
      );
      expect(result).toBe(5000);
    });
  });

  describe("resolvePollingIntervalMs", () => {
    it("returns the explicit pollingIntervalMs without calling the RPC", async () => {
      const monitor = new ContractMonitor("testnet");
      monitor.watch({ pollingIntervalMs: 9000 });
      const spy = jest.spyOn(monitor.getServer(), "getLatestLedger");

      const result = await monitor.resolvePollingIntervalMs();

      expect(result).toBe(9000);
      expect(spy).not.toHaveBeenCalled();
    });

    it("calls the RPC and calibrates when pollingIntervalMs is not set", async () => {
      const monitor = new ContractMonitor("testnet");
      monitor.watch({});
      const spy = jest
        .spyOn(monitor.getServer(), "getLatestLedger")
        .mockResolvedValueOnce({
          id: "a",
          protocolVersion: "21",
          sequence: 100,
          closeTime: "1000",
        } as never)
        .mockResolvedValueOnce({
          id: "b",
          protocolVersion: "21",
          sequence: 101,
          closeTime: "1007",
        } as never);

      const first = await monitor.resolvePollingIntervalMs();
      const second = await monitor.resolvePollingIntervalMs();

      expect(spy).toHaveBeenCalledTimes(2);
      expect(first).toBe(5000); // no prior sample yet
      expect(second).toBe(7000); // (1007 - 1000) * 1000ms / 1 ledger
    });

    it("falls back to the default if closeTime is absent from the response", async () => {
      const monitor = new ContractMonitor("testnet");
      monitor.watch({});
      jest.spyOn(monitor.getServer(), "getLatestLedger").mockResolvedValueOnce({
        id: "a",
        protocolVersion: "21",
        sequence: 100,
      } as never);

      const result = await monitor.resolvePollingIntervalMs();

      expect(result).toBe(5000);
    });
  });
});
