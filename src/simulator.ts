import {
  Contract,
  SorobanRpc,
  TransactionBuilder,
  Account,
  BASE_FEE,
  xdr,
} from "@stellar/stellar-sdk";
import { NetworkConfig, SimulationResult, NETWORK_CONFIGS, Network } from "./types";

/**
 * ContractSimulator
 *
 * Simulates Soroban contract function calls without broadcasting to the network.
 * Returns resource footprint and cost estimates useful for gas estimation and
 * pre-flight validation during development.
 *
 * @example
 * ```ts
 * const sim = new ContractSimulator("testnet");
 * const result = await sim.simulate(
 *   "CXXXXXX...", "transfer", [fromVal, toVal, amountVal], "GXXXXXX..."
 * );
 * console.log(result.cost.cpuInstructions);
 * ```
 */
export class ContractSimulator {
  private server: SorobanRpc.Server;
  private config: NetworkConfig;

  constructor(networkOrConfig: Network | NetworkConfig) {
    this.config =
      typeof networkOrConfig === "string"
        ? NETWORK_CONFIGS[networkOrConfig]
        : networkOrConfig;

    this.server = new SorobanRpc.Server(this.config.rpcUrl, {
      allowHttp: this.config.network === "local",
    });
  }

  /**
   * Simulate a contract invocation and return cost + footprint.
   *
   * @param contractId - The contract address in C... format
   * @param method     - The contract function name
   * @param args       - Array of XDR ScVal arguments
   * @param caller     - The Stellar account public key in G... format
   */
  async simulate(
    contractId: string,
    method: string,
    args: xdr.ScVal[],
    caller: string
  ): Promise<SimulationResult> {
    try {
      const account = await this.server.getAccount(caller);
      const txAccount = new Account(account.id, account.sequenceNumber());

      const contract = new Contract(contractId);
      const tx = new TransactionBuilder(txAccount, {
        fee: BASE_FEE,
        networkPassphrase: this.config.networkPassphrase,
      })
        .addOperation(contract.call(method, ...args))
        .setTimeout(30)
        .build();

      const simResponse = await this.server.simulateTransaction(tx);

      if (SorobanRpc.Api.isSimulationError(simResponse)) {
        return {
          success: false,
          error: simResponse.error,
          footprint: { readBytes: 0, writeBytes: 0, instructions: 0 },
          cost: { cpuInstructions: "0", memoryBytes: "0" },
        };
      }

      if (SorobanRpc.Api.isSimulationRestore(simResponse)) {
        return {
          success: false,
          error: "Contract data needs restoration before this call can succeed. Run `sdev restore`.",
          footprint: { readBytes: 0, writeBytes: 0, instructions: 0 },
          cost: { cpuInstructions: "0", memoryBytes: "0" },
          rawResult: simResponse,
        };
      }

      const success = simResponse as SorobanRpc.Api.SimulateTransactionSuccessResponse;

      return {
        success: true,
        returnValue: success.result?.retval
          ? xdr.ScVal.fromXDR(success.result.retval.toXDR())
          : undefined,
        footprint: {
          readBytes: Number(success.minResourceFee ?? 0),
          writeBytes: 0,
          instructions: Number(
            success.transactionData?.build().resources().instructions() ?? 0
          ),
        },
        cost: {
          cpuInstructions: success.cost?.cpuInsns?.toString() ?? "0",
          memoryBytes: success.cost?.memBytes?.toString() ?? "0",
        },
        rawResult: success,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        footprint: { readBytes: 0, writeBytes: 0, instructions: 0 },
        cost: { cpuInstructions: "0", memoryBytes: "0" },
      };
    }
  }
}
