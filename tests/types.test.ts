import { NETWORK_CONFIGS, Network } from "../src/types";

describe("NETWORK_CONFIGS", () => {
  const networks: Network[] = ["mainnet", "testnet", "futurenet", "local"];

  it("contains an entry for every supported network", () => {
    for (const net of networks) {
      expect(NETWORK_CONFIGS[net]).toBeDefined();
    }
  });

  it("every config has a non-empty rpcUrl", () => {
    for (const net of networks) {
      expect(NETWORK_CONFIGS[net].rpcUrl.length).toBeGreaterThan(0);
    }
  });

  it("every config has a non-empty networkPassphrase", () => {
    for (const net of networks) {
      expect(NETWORK_CONFIGS[net].networkPassphrase.length).toBeGreaterThan(0);
    }
  });

  it("mainnet rpcUrl uses HTTPS", () => {
    expect(NETWORK_CONFIGS.mainnet.rpcUrl.startsWith("https://")).toBe(true);
  });

  it("testnet rpcUrl uses HTTPS", () => {
    expect(NETWORK_CONFIGS.testnet.rpcUrl.startsWith("https://")).toBe(true);
  });

  it("local rpcUrl uses HTTP", () => {
    expect(NETWORK_CONFIGS.local.rpcUrl.startsWith("http://")).toBe(true);
  });

  it("network field matches the key", () => {
    for (const net of networks) {
      expect(NETWORK_CONFIGS[net].network).toBe(net);
    }
  });
});
