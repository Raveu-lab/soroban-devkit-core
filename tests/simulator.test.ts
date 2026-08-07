import { ContractSimulator } from "../src/simulator";

describe("ContractSimulator", () => {
  it("should instantiate with a network name", () => {
    const sim = new ContractSimulator("testnet");
    expect(sim).toBeInstanceOf(ContractSimulator);
  });

  it("should instantiate with a custom NetworkConfig", () => {
    const sim = new ContractSimulator({
      network: "local",
      rpcUrl: "http://localhost:8000/soroban/rpc",
      networkPassphrase: "Standalone Network ; February 2017",
    });
    expect(sim).toBeInstanceOf(ContractSimulator);
  });

  it("should return a failed SimulationResult when caller account does not exist", async () => {
    const sim = new ContractSimulator("testnet");
    const result = await sim.simulate(
      "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD2KM",
      "transfer",
      [],
      "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF"
    );
    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });

  // TODO: Add integration tests against testnet using event-rich contract
  // See: https://github.com/soroban-devkit/soroban-devkit-core/issues/21
});
