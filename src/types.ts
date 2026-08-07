/**
 * Shared types and network configuration for soroban-devkit-core.
 * No logic lives here — only type definitions and constants.
 */

export type Network = "mainnet" | "testnet" | "futurenet" | "local";

export interface NetworkConfig {
  network: Network;
  rpcUrl: string;
  networkPassphrase: string;
}

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

export interface ContractEvent {
  /** Ledger sequence where the event was emitted */
  ledger: number;
  /** ISO timestamp of ledger close */
  ledgerClosedAt: string;
  /** Contract address that emitted the event (C... format) */
  contractId: string;
  /** Paginated cursor ID */
  id: string;
  /** Event type */
  type: "contract" | "system" | "diagnostic";
  /** Raw topics as base64-encoded XDR */
  topics: string[];
  /** Raw data as base64-encoded XDR */
  data: string;
  /** Human-readable decoded topics (populated by EventDecoder) */
  decodedTopics?: unknown[];
  /** Human-readable decoded data (populated by EventDecoder) */
  decodedData?: unknown;
}

export interface SimulationResult {
  success: boolean;
  /** Decoded return value from the simulated call */
  returnValue?: unknown;
  /** Resource footprint estimates */
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
  error?: string;
  rawResult?: unknown;
}

export interface BindingGeneratorOptions {
  /** Deployed contract ID in C... format */
  contractId: string;
  /** Output directory for generated TypeScript files */
  outputDir: string;
  /** Network the contract is deployed on */
  network: Network;
  /** Generate a full SDK wrapper class (default: true) */
  generateWrapper?: boolean;
}
