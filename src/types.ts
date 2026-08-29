/**
 * Shared types and network configuration for soroban-devkit-core.
 * No logic lives here — only type definitions and constants.
 */

/** Supported Stellar network identifiers */
export type Network = "mainnet" | "testnet" | "futurenet" | "local";

/** RPC connection configuration for a Stellar network */
export interface NetworkConfig {
  /** Network identifier */
  network: Network;
  /** Soroban RPC endpoint URL */
  rpcUrl: string;
  /** Stellar network passphrase used when signing transactions */
  networkPassphrase: string;
  /** Extra HTTP headers sent with every RPC request — e.g. an API key for a paid provider */
  headers?: Record<string, string>;
}

/** Pre-configured RPC settings for all supported networks */
export const NETWORK_CONFIGS: Record<Network, NetworkConfig> = {
  mainnet: {
    network: "mainnet",
    rpcUrl: "https://mainnet.stellar.validationcloud.io/v1/soroban/rpc",
    networkPassphrase: "Public Global Stellar Network ; September 2015",
  },
  testnet: {
    network: "testnet",
    rpcUrl: "https://soroban-testnet.stellar.org",
    networkPassphrase: "Test SDF Network ; September 2015",
  },
  futurenet: {
    network: "futurenet",
    rpcUrl: "https://rpc-futurenet.stellar.org",
    networkPassphrase: "Test SDF Future Network ; October 2022",
  },
  local: {
    network: "local",
    rpcUrl: "http://localhost:8000/soroban/rpc",
    networkPassphrase: "Standalone Network ; February 2017",
  },
};

/** A normalized Soroban contract event */
export interface ContractEvent {
  /** Ledger sequence where the event was emitted */
  ledger: number;
  /** ISO 8601 timestamp of ledger close */
  ledgerClosedAt: string;
  /** Contract address that emitted the event (C... format) */
  contractId: string;
  /** Paginated cursor ID for this event */
  id: string;
  /** Event classification */
  type: "contract" | "system" | "diagnostic";
  /** Raw topics as base64-encoded XDR strings */
  topics: string[];
  /** Raw data as a base64-encoded XDR string */
  data: string;
  /** Human-readable decoded topics — populated by EventDecoder */
  decodedTopics?: unknown[];
  /** Human-readable decoded data — populated by EventDecoder */
  decodedData?: unknown;
}

/** Result returned by ContractSimulator.simulate() */
export interface SimulationResult {
  /** Whether the simulation succeeded */
  success: boolean;
  /** Decoded return value from the simulated call, if any */
  returnValue?: unknown;
  /** Estimated resource usage */
  footprint: {
    readBytes: number;
    writeBytes: number;
    instructions: number;
  };
  /** Human-readable cost estimates */
  cost: {
    cpuInstructions: string;
    memoryBytes: string;
  };
  /** Error message when success is false */
  error?: string;
  /** Raw RPC response for advanced use cases */
  rawResult?: unknown;
}

/** Options for BindingGenerator */
export interface BindingGeneratorOptions {
  /** Deployed contract ID in C... format */
  contractId: string;
  /** Output directory for generated TypeScript files */
  outputDir: string;
  /** Network the contract is deployed on */
  network: Network;
  /** Generate a full SDK wrapper class around the bindings (default: true) */
  generateWrapper?: boolean;
}
