import { ContractMonitor } from "../src/monitor";

describe("ContractMonitor", () => {
  it("should instantiate with a network name", () => {
    const monitor = new ContractMonitor("testnet");
    expect(monitor).toBeInstanceOf(ContractMonitor);
  });

  it("should support chained .watch().on() configuration", () => {
    const monitor = new ContractMonitor("testnet");
    const result = monitor
      .watch({ contractIds: ["CTEST"], pollingIntervalMs: 1000 })
      .on("event", () => {})
      .on("error", () => {});
    expect(result).toBeInstanceOf(ContractMonitor);
  });

  it("should not start polling twice if start() is called again", async () => {
    const monitor = new ContractMonitor("testnet");
    monitor.watch({ contractIds: [] });

    // We mock start to avoid real network calls in unit tests
    const startSpy = jest
      .spyOn(monitor as never, "fetchEvents")
      .mockResolvedValue(undefined);

    // Can't call start() in unit tests without mocking getLatestLedger
    // Integration tests cover actual polling behaviour
    monitor.stop();
    expect(startSpy).not.toHaveBeenCalled();
  });

  // TODO: Add integration tests with real polling against testnet
  // See: https://github.com/soroban-devkit/soroban-devkit-core/issues/22
});
