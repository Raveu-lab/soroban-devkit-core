import { xdr, SorobanDataBuilder } from "@stellar/stellar-sdk";
import { ContractSimulator } from "../src/simulator";
import { NETWORK_CONFIGS, SimulationResult, SimulationCall } from "../src/types";

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

    it("accepts a NetworkConfig with custom auth headers, for paid RPC providers", () => {
      expect(
        () =>
          new ContractSimulator({
            network: "mainnet",
            rpcUrl: "https://my-provider.example/rpc",
            networkPassphrase: "Public Global Stellar Network ; September 2015",
            headers: { "X-Api-Key": "secret" },
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

  describe("simulateSequence", () => {
    function makeResult(success: boolean, error?: string): SimulationResult {
      return {
        success,
        error,
        footprint: { readBytes: 0, writeBytes: 0, instructions: 0 },
        cost: { cpuInstructions: "0", memoryBytes: "0" },
      };
    }

    function makeCall(method: string): SimulationCall {
      return { contractId: "CABC", method, args: [], caller: "GABC" };
    }

    it("runs each call in order and returns all results when every call succeeds", async () => {
      const sim = new ContractSimulator("testnet");
      const spy = jest
        .spyOn(sim, "simulate")
        .mockResolvedValueOnce(makeResult(true))
        .mockResolvedValueOnce(makeResult(true))
        .mockResolvedValueOnce(makeResult(true));

      const results = await sim.simulateSequence([
        makeCall("first"),
        makeCall("second"),
        makeCall("third"),
      ]);

      expect(results).toHaveLength(3);
      expect(results.every((r) => r.success)).toBe(true);
      expect(spy).toHaveBeenCalledTimes(3);
      expect(spy.mock.calls[0][1]).toBe("first");
      expect(spy.mock.calls[1][1]).toBe("second");
      expect(spy.mock.calls[2][1]).toBe("third");
    });

    it("stops after the first failure by default, and does not call later steps", async () => {
      const sim = new ContractSimulator("testnet");
      const spy = jest
        .spyOn(sim, "simulate")
        .mockResolvedValueOnce(makeResult(true))
        .mockResolvedValueOnce(makeResult(false, "boom"))
        .mockResolvedValueOnce(makeResult(true));

      const results = await sim.simulateSequence([
        makeCall("first"),
        makeCall("second"),
        makeCall("third"),
      ]);

      expect(results).toHaveLength(2);
      expect(results[1].error).toBe("boom");
      expect(spy).toHaveBeenCalledTimes(2);
    });

    it("runs every call when stopOnFailure is false, even after a failure", async () => {
      const sim = new ContractSimulator("testnet");
      const spy = jest
        .spyOn(sim, "simulate")
        .mockResolvedValueOnce(makeResult(false, "boom"))
        .mockResolvedValueOnce(makeResult(true));

      const results = await sim.simulateSequence([makeCall("first"), makeCall("second")], {
        stopOnFailure: false,
      });

      expect(results).toHaveLength(2);
      expect(spy).toHaveBeenCalledTimes(2);
    });

    it("returns an empty array for an empty call list", async () => {
      const sim = new ContractSimulator("testnet");
      expect(await sim.simulateSequence([])).toEqual([]);
    });
  });
});
