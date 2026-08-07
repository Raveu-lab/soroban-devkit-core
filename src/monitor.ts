import { SorobanRpc } from "@stellar/stellar-sdk";
import { ContractEvent, Network, NETWORK_CONFIGS, NetworkConfig } from "./types";
import { EventDecoder } from "./decoder";

export interface MonitorOptions {
  /** Contract IDs to watch. Empty means watch all contracts. */
  contractIds?: string[];
  /** Filter by event name (matches first topic Symbol) */
  eventFilter?: string;
  /** Polling interval in milliseconds (default: 5000) */
  pollingIntervalMs?: number;
  /** Auto-decode XDR events (default: true) */
  decode?: boolean;
  /** Starting ledger sequence. Defaults to current ledger - 1. */
  startLedger?: number;
}

type EventCallback = (event: ContractEvent) => void;
type ErrorCallback = (error: Error) => void;

/**
 * ContractMonitor
 *
 * Polls the Stellar RPC for new Soroban contract events and emits them
 * to registered callbacks. Supports contract ID filtering, event name
 * filtering, and automatic XDR decoding.
 *
 * @example
 * ```ts
 * const monitor = new ContractMonitor("testnet");
 * monitor
 *   .watch({ contractIds: ["CXXXXXX..."], eventFilter: "transfer" })
 *   .on("event", (e) => console.log(e.decodedTopics, e.decodedData))
 *   .on("error", console.error);
 * await monitor.start();
 * ```
 */
export class ContractMonitor {
  private server: SorobanRpc.Server;
  private config: NetworkConfig;
  private decoder: EventDecoder;
  private options: MonitorOptions = {};
  private eventCallbacks: EventCallback[] = [];
  private errorCallbacks: ErrorCallback[] = [];
  private running = false;
  private lastLedger = 0;
  private pollTimer?: ReturnType<typeof setTimeout>;

  constructor(networkOrConfig: Network | NetworkConfig) {
    this.config =
      typeof networkOrConfig === "string"
        ? NETWORK_CONFIGS[networkOrConfig]
        : networkOrConfig;

    this.server = new SorobanRpc.Server(this.config.rpcUrl, {
      allowHttp: this.config.network === "local",
    });
    this.decoder = new EventDecoder();
  }

  /** Configure watch options */
  watch(options: MonitorOptions): this {
    this.options = options;
    return this;
  }

  /** Register an event callback */
  on(event: "event", callback: EventCallback): this;
  /** Register an error callback */
  on(event: "error", callback: ErrorCallback): this;
  on(event: "event" | "error", callback: EventCallback | ErrorCallback): this {
    if (event === "event") {
      this.eventCallbacks.push(callback as EventCallback);
    } else {
      this.errorCallbacks.push(callback as ErrorCallback);
    }
    return this;
  }

  /** Start polling for events */
  async start(): Promise<void> {
    if (this.running) return;
    this.running = true;

    if (this.options.startLedger) {
      this.lastLedger = this.options.startLedger;
    } else {
      const latest = await this.server.getLatestLedger();
      this.lastLedger = latest.sequence - 1;
    }

    this.poll();
  }

  /** Stop polling */
  stop(): void {
    this.running = false;
    if (this.pollTimer) clearTimeout(this.pollTimer);
  }

  private poll(): void {
    if (!this.running) return;

    this.fetchEvents()
      .catch((err) => {
        const error = err instanceof Error ? err : new Error(String(err));
        this.errorCallbacks.forEach((cb) => cb(error));
      })
      .finally(() => {
        if (this.running) {
          this.pollTimer = setTimeout(
            () => this.poll(),
            this.options.pollingIntervalMs ?? 5000
          );
        }
      });
  }

  private async fetchEvents(): Promise<void> {
    const filters: SorobanRpc.Api.EventFilter[] = [];

    if (this.options.contractIds?.length) {
      filters.push({
        type: "contract",
        contractIds: this.options.contractIds,
        topics: this.options.eventFilter
          ? [[`SCS:${this.options.eventFilter}`]]
          : undefined,
      });
    }

    const response = await this.server.getEvents({
      startLedger: this.lastLedger + 1,
      filters,
    });

    if (response.events.length > 0) {
      this.lastLedger = Math.max(...response.events.map((e) => e.ledger));

      for (const raw of response.events) {
        const event: ContractEvent = {
          ledger: raw.ledger,
          ledgerClosedAt: raw.ledgerClosedAt,
          contractId: raw.contractId,
          id: raw.id,
          type: raw.type as ContractEvent["type"],
          topics: raw.topic.map((t) => t.toXDR("base64")),
          data: raw.value.toXDR("base64"),
        };

        const final =
          this.options.decode !== false ? this.decoder.decode(event) : event;

        this.eventCallbacks.forEach((cb) => cb(final));
      }
    }
  }
}
