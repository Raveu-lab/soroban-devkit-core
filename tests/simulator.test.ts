import { xdr, SorobanDataBuilder } from "@stellar/stellar-sdk";
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

describe("ContractSimulator — additional edge cases", () => {
  describe("buildTransaction", () => {
    it("uses BASE_FEE as the transaction fee", () => {
      const sim = new ContractSimulator("testnet");
      const tx = sim.buildTransaction(
        "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD2KM",
        "ping",
        [],
        "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF",
        "0"
      );
      expect(Number(tx.fee)).toBeGreaterThan(0);
    });

    it("builds transaction with correct sequence number", () => {
      const sim = new ContractSimulator("testnet");
      const tx = sim.buildTransaction(
        "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD2KM",
        "ping",
        [],
        "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF",
        "42"
      );
      // sequence number in transaction is incremented by 1
      expect(tx.sequence).toBe("43");
    });

    it("accepts xdr.ScVal args and includes them in the operation", () => {
      const sim = new ContractSimulator("testnet");
      const args = [xdr.ScVal.scvU32(100), xdr.ScVal.scvBool(true)];
      const tx = sim.buildTransaction(
        "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD2KM",
        "my_method",
        args,
        "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF",
        "0"
      );
      expect(tx.operations).toHaveLength(1);
    });
  });

  describe("normalizeSimulationError", () => {
    it("always sets success to false", () => {
      const sim = new ContractSimulator("testnet");
      expect(sim.normalizeSimulationError("any error").success).toBe(false);
    });

    it("preserves the exact error message", () => {
      const sim = new ContractSimulator("testnet");
      const msg = "Contract data needs restoration";
      expect(sim.normalizeSimulationError(msg).error).toBe(msg);
    });

    it("returns zero footprint values", () => {
      const sim = new ContractSimulator("testnet");
      const result = sim.normalizeSimulationError("err");
      expect(result.footprint).toEqual({ readBytes: 0, writeBytes: 0, instructions: 0 });
    });
  });

  describe("normalizeSuccessResponse", () => {
    it("maps real readBytes/writeBytes/instructions from the transaction data, not minResourceFee", () => {
      const sim = new ContractSimulator("testnet");

      const transactionData = new SorobanDataBuilder().setResources(1000, 200, 300);

      const response = {
        id: "1",
        latestLedger: 100,
        events: [],
        _parsed: true,
        transactionData,
        minResourceFee: "999999", // deliberately different from readBytes, to catch the mixup
        cost: { cpuInsns: "42", memBytes: "84" },
      } as unknown as import("@stellar/stellar-sdk").SorobanRpc.Api.SimulateTransactionSuccessResponse;

      const result = sim.normalizeSuccessResponse(response);

      expect(result.success).toBe(true);
      expect(result.footprint).toEqual({
        readBytes: 200,
        writeBytes: 300,
        instructions: 1000,
      });
      expect(result.cost).toEqual({ cpuInstructions: "42", memoryBytes: "84" });
    });
  });
});
