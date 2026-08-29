import {
  Contract,
  SorobanRpc,
  Transaction,
  TransactionBuilder,
  Account,
  BASE_FEE,
  xdr,
} from "@stellar/stellar-sdk";
import { NetworkConfig, SimulationResult, SimulationCall, NETWORK_CONFIGS, Network } from "./types";

/**
 * ContractSimulator
 *
 * Simulates Soroban contract function calls without broadcasting to the network.
 * Single Responsibility: build a transaction, simulate it, normalize the result.
 *
 * @example
 * ```ts
 * const sim = new ContractSimulator("testnet");
 * const result = await sim.simulate("CXXXXX", "transfer", [from, to, amount], "GXXXXX");
 * console.log(result.cost.cpuInstructions);
 * ```
 */
export class ContractSimulator {
  private readonly server: SorobanRpc.Server;
  private readonly config: NetworkConfig;

  constructor(networkOrConfig: Network | NetworkConfig) {
    this.config =
      typeof networkOrConfig === "string" ? NETWORK_CONFIGS[networkOrConfig] : networkOrConfig;

    this.server = new SorobanRpc.Server(this.config.rpcUrl, {
      allowHttp: this.config.network === "local",
      headers: this.config.headers,
    });
  }

  /**
   * Simulate a contract invocation and return a normalized SimulationResult.
   * Never throws — all errors are caught and returned as { success: false, error }.
   *
   * @param contractId - The contract address in C... format
   * @param method     - The contract function name to call
   * @param args       - Array of XDR ScVal arguments
   * @param caller     - The caller's Stellar public key in G... format
   */
  async simulate(
    contractId: string,
    method: string,
    args: xdr.ScVal[],
    caller: string
  ): Promise<SimulationResult> {
    try {
      const sequenceNumber = await this.fetchSequenceNumber(caller);
      const tx = this.buildTransaction(contractId, method, args, caller, sequenceNumber);
      const response = await this.server.simulateTransaction(tx);
      return this.normalizeResponse(response);
    } catch (error) {
      return this.normalizeSimulationError(error instanceof Error ? error.message : String(error));
    }
  }

  /**
   * Simulate a sequence of independent contract calls, in order.
   *
   * Each call is simulated against the current ledger state exactly like a
   * standalone `simulate()` — this does NOT chain state between steps (a
   * simulation never commits anything on-chain for a later step to see).
   * It's for checking that a planned multi-step flow would work — and what
   * it would cost — before submitting any of it for real.
   *
   * By default, stops at the first failing call (the returned array is
   * shorter than `calls` in that case). Pass `{ stopOnFailure: false }` to
   * run every call regardless.
   */
  async simulateSequence(
    calls: SimulationCall[],
    options: { stopOnFailure?: boolean } = {}
  ): Promise<SimulationResult[]> {
    const stopOnFailure = options.stopOnFailure ?? true;
    const results: SimulationResult[] = [];

    for (const call of calls) {
      const result = await this.simulate(call.contractId, call.method, call.args, call.caller);
      results.push(result);
      if (!result.success && stopOnFailure) {
        break;
      }
    }

    return results;
  }

  /**
   * Build a Soroban transaction for the given contract call.
   * Public so it can be unit-tested in isolation without a network call.
   *
   * @param contractId      - The contract address in C... format
   * @param method          - The function name to invoke
   * @param args            - XDR ScVal arguments
   * @param callerPublicKey - The caller's public key in G... format
   * @param sequenceNumber  - Current sequence number for the caller account
   */
  buildTransaction(
    contractId: string,
    method: string,
    args: xdr.ScVal[],
    callerPublicKey: string,
    sequenceNumber: string
  ): Transaction {
    const account = new Account(callerPublicKey, sequenceNumber);
    const contract = new Contract(contractId);

    return new TransactionBuilder(account, {
      fee: BASE_FEE,
      networkPassphrase: this.config.networkPassphrase,
    })
      .addOperation(contract.call(method, ...args))
      .setTimeout(30)
      .build();
  }

  /**
   * Convert a simulation error message into a failed SimulationResult.
   * Public so it can be tested in isolation.
   */
  normalizeSimulationError(errorMessage: string): SimulationResult {
    return {
      success: false,
      error: errorMessage,
      footprint: { readBytes: 0, writeBytes: 0, instructions: 0 },
      cost: { cpuInstructions: "0", memoryBytes: "0" },
    };
  }

  /**
   * Fetch the current sequence number for a Stellar account.
   */
  private async fetchSequenceNumber(publicKey: string): Promise<string> {
    const account = await this.server.getAccount(publicKey);
    return account.sequenceNumber();
  }

  /**
   * Normalize a raw RPC simulation response into a SimulationResult.
   */
  private normalizeResponse(
    response: SorobanRpc.Api.SimulateTransactionResponse
  ): SimulationResult {
    if (SorobanRpc.Api.isSimulationError(response)) {
      return this.normalizeSimulationError(response.error);
    }

    if (SorobanRpc.Api.isSimulationRestore(response)) {
      return this.normalizeSimulationError(
        "Contract data needs restoration before this call can succeed."
      );
    }

    return this.normalizeSuccessResponse(
      response as SorobanRpc.Api.SimulateTransactionSuccessResponse
    );
  }

  /**
   * Normalize a successful simulation response.
   * Public so it can be tested in isolation without a network call.
   */
  normalizeSuccessResponse(
    response: SorobanRpc.Api.SimulateTransactionSuccessResponse
  ): SimulationResult {
    const resources = response.transactionData?.build().resources();
    return {
      success: true,
      footprint: {
        readBytes: Number(resources?.readBytes() ?? 0),
        writeBytes: Number(resources?.writeBytes() ?? 0),
        instructions: Number(resources?.instructions() ?? 0),
      },
      cost: {
        cpuInstructions: response.cost?.cpuInsns?.toString() ?? "0",
        memoryBytes: response.cost?.memBytes?.toString() ?? "0",
      },
      rawResult: response,
    };
  }
}
