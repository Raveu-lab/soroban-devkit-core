import { rpc, xdr } from "@stellar/stellar-sdk";
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
  private readonly server: rpc.Server;
  private readonly decoder: EventDecoder;
  private options: MonitorOptions = {};
  private eventCallbacks: EventCallback[] = [];
  private errorCallbacks: ErrorCallback[] = [];
  private running = false;
  private lastLedger = 0;
  private pollTimer?: ReturnType<typeof setTimeout>;
  private lastLedgerSample?: LedgerSample;
  private lastIntervalMs?: number;

  constructor(networkOrConfig: Network | NetworkConfig) {
    const config =
      typeof networkOrConfig === "string" ? NETWORK_CONFIGS[networkOrConfig] : networkOrConfig;

    this.server = new rpc.Server(config.rpcUrl, {
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
  buildEventFilters(): rpc.Api.EventFilter[] {
    const contractIds = this.options.contractIds;
    const eventFilter = this.options.eventFilter;

    // Either narrowing alone is enough to be worth sending. contractIds is
    // documented as "empty means watch all", so an eventFilter on its own
    // means one event name across every contract — requiring contractIds
    // here would silently discard it and return every event instead.
    if (!contractIds?.length && !eventFilter) return [];

    const filter: rpc.Api.EventFilter = { type: "contract" };

    if (contractIds?.length) {
      filter.contractIds = contractIds;
    }
    if (eventFilter) {
      filter.topics = [[xdr.ScVal.scvSymbol(eventFilter).toXDR("base64")]];
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
  getServer(): rpc.Server {
    return this.server;
  }

  /**
   * Compute a polling interval, in ms, from two ledger samples — averaging
   * how long each ledger took to close between them. Clamped to
   * [MIN_POLL_MS, MAX_POLL_MS] to avoid pathological values from a single
   * noisy sample. Falls back to DEFAULT_POLL_MS with no previous sample.
   *
   * If the sequence didn't advance between samples, `previousIntervalMs` —
   * the last real calibration, when one exists — is returned instead of
   * resetting to DEFAULT_POLL_MS. This is not a rare case: measured against
   * real testnet traffic, ledger close cadence (~5-6s) sits close enough to
   * DEFAULT_POLL_MS (5000ms) that deltaSeq === 0 happens routinely at the
   * default rate, not as a one-off. Resetting to the default every time
   * that happens would discard a real calibration (e.g. 6000ms) for a
   * guess, making the next poll land early again just as often —
   * self-perpetuating jitter instead of settling near the real cadence.
   *
   * Public so it can be tested in isolation without a network call.
   */
  computeAdaptiveIntervalMs(
    previous: LedgerSample | undefined,
    current: LedgerSample,
    previousIntervalMs?: number
  ): number {
    if (!previous) return DEFAULT_POLL_MS;
    const deltaSeq = current.sequence - previous.sequence;
    if (deltaSeq <= 0) return previousIntervalMs ?? DEFAULT_POLL_MS;
    const deltaMs = current.closeTimeMs - previous.closeTimeMs;
    const msPerLedger = deltaMs / deltaSeq;
    return Math.min(MAX_POLL_MS, Math.max(MIN_POLL_MS, Math.round(msPerLedger)));
  }

  /**
   * Resolve how long to wait before the next poll. If the caller set an
   * explicit `pollingIntervalMs`, that's used as-is (no RPC call). Otherwise,
   * calibrates against real ledger close cadence via getLatestLedger().
   *
   * Public so it can be tested in isolation.
   */
  async resolvePollingIntervalMs(): Promise<number> {
    if (this.options.pollingIntervalMs !== undefined) {
      return this.options.pollingIntervalMs;
    }

    const raw = await this.server.getLatestLedger();
    if (raw.closeTime === undefined) return DEFAULT_POLL_MS;

    const current: LedgerSample = {
      sequence: raw.sequence,
      closeTimeMs: Number(raw.closeTime) * 1000,
    };
    const interval = this.computeAdaptiveIntervalMs(
      this.lastLedgerSample,
      current,
      this.lastIntervalMs
    );
    this.lastLedgerSample = current;
    this.lastIntervalMs = interval;
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

  /**
   * Fetch new events since lastLedger and emit each one. Public so it can
   * be tested in isolation without a network call.
   *
   * Each event is processed and emitted independently — one throwing event
   * callback must not prevent the rest of the batch from being delivered.
   * lastLedger is advanced before the loop runs (it reflects what the RPC
   * reported, not local processing success), so a batch that isn't fully
   * delivered here can't be recovered by a later poll either; isolating
   * each event is what keeps one bad callback from taking down its
   * unrelated siblings in the same batch.
   */
  async fetchAndEmitEvents(): Promise<void> {
    const filters = this.buildEventFilters();
    const response = await this.server.getEvents({
      startLedger: this.lastLedger + 1,
      filters,
    });

    // With no events, still move the cursor to the RPC's latestLedger: the
    // RPC only retains a limited window of ledgers, so a cursor pinned to
    // an old ledger on a quiet contract eventually falls out of range and
    // every later poll fails. Everything up to latestLedger has been
    // searched, so nothing is skipped by advancing.
    if (response.events.length === 0 && typeof response.latestLedger === "number") {
      this.lastLedger = Math.max(this.lastLedger, response.latestLedger);
    }

    if (response.events.length > 0) {
      this.lastLedger = Math.max(...response.events.map((e) => e.ledger));
      for (const raw of response.events) {
        try {
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
        } catch (err) {
          this.emitError(err);
        }
      }
    }
  }

  private emitEvent(event: ContractEvent): void {
    this.eventCallbacks.forEach((cb) => cb(event));
  }

  private emitError(err: unknown): void {
    const error = err instanceof Error ? err : new Error(this.extractErrorMessage(err));
    this.errorCallbacks.forEach((cb) => cb(error));
  }

  /**
   * Extract a human-readable message from a caught value of unknown shape.
   * Public so it can be tested in isolation. The old `err instanceof Error
   * ? err : new Error(String(err))` discarded a non-Error value's real
   * .message and produced an Error whose own message was the literal
   * string "[object Object]" — confirmed live elsewhere:
   * @stellar/stellar-sdk/contract's Client.from() throws exactly this
   * shape (a plain { code, message } object, not a real Error) for a
   * non-existent contract.
   */
  extractErrorMessage(error: unknown): string {
    if (error instanceof Error) {
      return error.message;
    }
    if (typeof error === "object" && error !== null && "message" in error) {
      const message = (error as { message: unknown }).message;
      if (typeof message === "string") {
        return message;
      }
    }
    return String(error);
  }

  private async resolveStartLedger(): Promise<number> {
    if (this.options.startLedger) return this.options.startLedger;
    const latest = await this.server.getLatestLedger();
    return latest.sequence - 1;
  }
}
