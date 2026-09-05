import { SorobanRpc, xdr } from "@stellar/stellar-sdk";
import { ContractEvent, Network, NETWORK_CONFIGS, NetworkConfig } from "./types";
import { EventDecoder } from "./decoder";

export interface MonitorOptions {
  /** Contract IDs to watch. Empty means watch all. */
  contractIds?: string[];
  /** Filter by event name — matches the first topic Symbol */
  eventFilter?: string;
  /** Polling interval in milliseconds (default: 5000) */
  pollingIntervalMs?: number;
  /** Auto-decode XDR events (default: true) */
  decode?: boolean;
  /** Starting ledger sequence. Defaults to current ledger minus 1. */
  startLedger?: number;
}

type EventCallback = (event: ContractEvent) => void;
type ErrorCallback = (error: Error) => void;

/** A single { ledger sequence, close time } sample used to calibrate polling. */
interface LedgerSample {
  sequence: number;
  closeTimeMs: number;
}

const DEFAULT_POLL_MS = 5000;
const MIN_POLL_MS = 2000;
const MAX_POLL_MS = 30000;

/**
 * ContractMonitor
 *
 * Polls the Stellar RPC for new Soroban contract events and emits them
 * to registered callbacks. Single Responsibility: poll, normalize, emit.
 * The polling loop intentionally left minimal for contributors to extend.
 *
 * @example
 * ```ts
 * const monitor = new ContractMonitor("testnet");
 * monitor
 *   .watch({ contractIds: ["CXXXXX"], eventFilter: "transfer" })
 *   .on("event", (e) => console.log(e.decodedTopics))
 *   .on("error", console.error);
 * await monitor.start();
 * ```
 */
export class ContractMonitor {
  private readonly server: SorobanRpc.Server;
  private readonly decoder: EventDecoder;
  private options: MonitorOptions = {};
  private eventCallbacks: EventCallback[] = [];
  private errorCallbacks: ErrorCallback[] = [];
  private running = false;
  private lastLedger = 0;
  private pollTimer?: ReturnType<typeof setTimeout>;
  private lastLedgerSample?: LedgerSample;

  constructor(networkOrConfig: Network | NetworkConfig) {
    const config =
      typeof networkOrConfig === "string" ? NETWORK_CONFIGS[networkOrConfig] : networkOrConfig;

    this.server = new SorobanRpc.Server(config.rpcUrl, {
      allowHttp: config.network === "local",
      headers: config.headers,
    });
    this.decoder = new EventDecoder();
  }

  /** Configure watch options. Returns `this` for chaining. */
  watch(options: MonitorOptions): this {
    this.options = options;
    return this;
  }

  /** Register a callback for incoming events. Returns `this` for chaining. */
  on(event: "event", callback: EventCallback): this;
  /** Register a callback for errors. Returns `this` for chaining. */
  on(event: "error", callback: ErrorCallback): this;
  on(event: "event" | "error", callback: EventCallback | ErrorCallback): this {
    if (event === "event") {
      this.eventCallbacks.push(callback as EventCallback);
    } else {
      this.errorCallbacks.push(callback as ErrorCallback);
    }
    return this;
  }

  /** Start polling for events. */
  async start(): Promise<void> {
    if (this.running) return;
    this.running = true;
    this.lastLedger = await this.resolveStartLedger();
    await this.schedulePoll();
  }

  /** Stop polling. */
  stop(): void {
    this.running = false;
    if (this.pollTimer) clearTimeout(this.pollTimer);
  }

  /**
   * Build the RPC event filters from current watch options.
   * Public so it can be tested in isolation.
   */
  buildEventFilters(): SorobanRpc.Api.EventFilter[] {
    if (!this.options.contractIds?.length) return [];

    const filter: SorobanRpc.Api.EventFilter = {
      type: "contract",
      contractIds: this.options.contractIds,
    };

    if (this.options.eventFilter) {
      const topicScVal = xdr.ScVal.scvSymbol(this.options.eventFilter).toXDR("base64");
      filter.topics = [[topicScVal]];
    }

    return [filter];
  }

  /**
   * Map a raw RPC event object to a normalized ContractEvent.
   * Public so it can be tested in isolation.
   */
  normalizeRawEvent(raw: {
    ledger: number;
    ledgerClosedAt: string;
    contractId: string;
    id: string;
    type: string;
    topic: Array<{ toXDR: (format: string) => string }>;
    value: { toXDR: (format: string) => string };
  }): ContractEvent {
    return {
      ledger: raw.ledger,
      ledgerClosedAt: raw.ledgerClosedAt,
      contractId: raw.contractId,
      id: raw.id,
      type: raw.type as ContractEvent["type"],
      topics: raw.topic.map((t) => t.toXDR("base64")),
      data: raw.value.toXDR("base64"),
    };
  }

  /** Expose options for testing. */
  getOptions(): MonitorOptions {
    return this.options;
  }

  /** Expose callback count for testing. */
  getEventCallbackCount(): number {
    return this.eventCallbacks.length;
  }

  /** Expose error callback count for testing. */
  getErrorCallbackCount(): number {
    return this.errorCallbacks.length;
  }

  /** Expose the underlying RPC server for testing. */
  getServer(): SorobanRpc.Server {
    return this.server;
  }

  /**
   * Compute a polling interval, in ms, from two ledger samples — averaging
   * how long each ledger took to close between them. Clamped to
   * [MIN_POLL_MS, MAX_POLL_MS] to avoid pathological values from a single
   * noisy sample. Falls back to DEFAULT_POLL_MS with no previous sample, or
   * if the sequence didn't advance (shouldn't normally happen).
   * Public so it can be tested in isolation without a network call.
   */
  computeAdaptiveIntervalMs(previous: LedgerSample | undefined, current: LedgerSample): number {
    if (!previous) return DEFAULT_POLL_MS;
    const deltaSeq = current.sequence - previous.sequence;
    if (deltaSeq <= 0) return DEFAULT_POLL_MS;
    const deltaMs = current.closeTimeMs - previous.closeTimeMs;
    const msPerLedger = deltaMs / deltaSeq;
    return Math.min(MAX_POLL_MS, Math.max(MIN_POLL_MS, Math.round(msPerLedger)));
  }

  /**
   * Resolve how long to wait before the next poll. If the caller set an
   * explicit `pollingIntervalMs`, that's used as-is (no RPC call). Otherwise,
   * calibrates against real ledger close cadence via getLatestLedger().
   *
   * Note: @stellar/stellar-sdk's GetLatestLedgerResponse type only declares
   * { id, sequence, protocolVersion }, but the live RPC response also
   * includes closeTime (unix seconds, as a string) — confirmed against the
   * real testnet endpoint. Narrowly typed here since the installed SDK
   * doesn't declare it.
   * Public so it can be tested in isolation.
   */
  async resolvePollingIntervalMs(): Promise<number> {
    if (this.options.pollingIntervalMs !== undefined) {
      return this.options.pollingIntervalMs;
    }

    const raw = await this.server.getLatestLedger();
    const closeTime = (raw as unknown as { closeTime?: string }).closeTime;
    if (closeTime === undefined) return DEFAULT_POLL_MS;

    const current: LedgerSample = {
      sequence: raw.sequence,
      closeTimeMs: Number(closeTime) * 1000,
    };
    const interval = this.computeAdaptiveIntervalMs(this.lastLedgerSample, current);
    this.lastLedgerSample = current;
    return interval;
  }

  private async schedulePoll(): Promise<void> {
    if (!this.running) return;
    const intervalMs = await this.resolvePollingIntervalMs();
    this.pollTimer = setTimeout(() => this.runPollCycle(), intervalMs);
  }

  private runPollCycle(): void {
    this.fetchAndEmitEvents()
      .catch((err) => this.emitError(err))
      .finally(() => {
        void this.schedulePoll();
      });
  }

  private async fetchAndEmitEvents(): Promise<void> {
    const filters = this.buildEventFilters();
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
          contractId: raw.contractId?.toString() ?? "",
          id: raw.id,
          type: raw.type as ContractEvent["type"],
          topics: raw.topic.map((t) => t.toXDR("base64")),
          data: raw.value.toXDR("base64"),
        };
        const final = this.options.decode !== false ? this.decoder.decode(event) : event;
        this.emitEvent(final);
      }
    }
  }

  private emitEvent(event: ContractEvent): void {
    this.eventCallbacks.forEach((cb) => cb(event));
  }

  private emitError(err: unknown): void {
    const error = err instanceof Error ? err : new Error(String(err));
    this.errorCallbacks.forEach((cb) => cb(error));
  }

  private async resolveStartLedger(): Promise<number> {
    if (this.options.startLedger) return this.options.startLedger;
    const latest = await this.server.getLatestLedger();
    return latest.sequence - 1;
  }
}
