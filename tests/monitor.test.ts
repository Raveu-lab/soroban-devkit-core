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
        topic: [
          { toXDR: (_: string) => "TOPIC1" },
          { toXDR: (_: string) => "TOPIC2" },
        ],
        value: { toXDR: (_: string) => "" },
      };
      const event = monitor.normalizeRawEvent(raw as never);
      expect(event.topics).toEqual(["TOPIC1", "TOPIC2"]);
    });
  });
});
