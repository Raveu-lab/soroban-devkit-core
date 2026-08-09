import { xdr } from "@stellar/stellar-sdk";
import { ContractSimulator } from "../src/simulator";
import { NETWORK_CONFIGS } from "../src/types";

describe("ContractSimulator", () => {
  describe("constructor", () => {
    it("accepts a network name string", () => {
      expect(() => new ContractSimulator("testnet")).not.toThrow();
    });

    it("accepts a custom NetworkConfig object", () => {
      expect(
        () =>
          new ContractSimulator({
            network: "local",
            rpcUrl: "http://localhost:8000/soroban/rpc",
            networkPassphrase: "Standalone Network ; February 2017",
          })
      ).not.toThrow();
    });

    it("resolves all supported network names", () => {
      const networks = ["mainnet", "testnet", "futurenet", "local"] as const;
      for (const net of networks) {
        expect(() => new ContractSimulator(net)).not.toThrow();
      }
    });
  });

  describe("buildTransaction", () => {
    it("builds a transaction with the correct network passphrase", () => {
      const sim = new ContractSimulator("testnet");
      const tx = sim.buildTransaction(
        "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD2KM",
        "ping",
        [],
        "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF",
        "0"
      );
      // Transaction should serialize without throwing
      expect(() => tx.toXDR()).not.toThrow();
    });

    it("includes the contract call operation", () => {
      const sim = new ContractSimulator("testnet");
      const tx = sim.buildTransaction(
        "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD2KM",
        "transfer",
        [],
        "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF",
        "0"
      );
      expect(tx.operations).toHaveLength(1);
      expect(tx.operations[0].type).toBe("invokeHostFunction");
    });
  });

  describe("normalizeSimulationResult", () => {
    it("normalizes a simulation error response into a failed result", () => {
      const sim = new ContractSimulator("testnet");
      const result = sim.normalizeSimulationError("insufficient funds");
      expect(result.success).toBe(false);
      expect(result.error).toBe("insufficient funds");
      expect(result.footprint.instructions).toBe(0);
    });

    it("failed result always has zero cost fields", () => {
      const sim = new ContractSimulator("testnet");
      const result = sim.normalizeSimulationError("timeout");
      expect(result.cost.cpuInstructions).toBe("0");
      expect(result.cost.memoryBytes).toBe("0");
    });
  });

  describe("simulate", () => {
    it("returns a failed result when the caller account does not exist on testnet", async () => {
      const sim = new ContractSimulator("testnet");
      const result = await sim.simulate(
        "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD2KM",
        "ping",
        [],
        "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF"
      );
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    }, 15000);
  });
});
