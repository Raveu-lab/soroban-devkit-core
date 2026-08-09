# soroban-devkit-core

> The core TypeScript library powering the Soroban DevKit ecosystem.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Stellar Wave Program](https://img.shields.io/badge/Stellar-Wave%20Program-blueviolet)](https://stellar.org)
[![npm version](https://img.shields.io/npm/v/@soroban-devkit/core)](https://www.npmjs.com/package/@soroban-devkit/core)
[![CI](https://github.com/Raveu-lab/soroban-devkit-core/actions/workflows/ci.yml/badge.svg)](https://github.com/Raveu-lab/soroban-devkit-core/actions)

---

## What is this?

Building on Soroban means dealing with raw XDR blobs, manual transaction simulation, and writing the same boilerplate over and over to watch a contract for events. `soroban-devkit-core` eliminates that.

It is the engine underneath the Soroban DevKit — a focused, well-tested TypeScript library that gives you:

- **ContractSimulator** — simulate any Soroban contract call locally, inspect resource footprint and cost before ever touching the network
- **EventDecoder** — decode raw base64 XDR contract events into typed, human-readable JSON automatically
- **ContractMonitor** — poll any set of contracts for real-time events with filtering and auto-decode built in
- **BindingGenerator** — read a deployed contract's on-chain WASM spec and generate strongly-typed TypeScript bindings

No indexer to run. No hosted service to depend on. Just a library you install and use.

---

## Why it exists

Soroban is Stellar's smart contract platform. It is powerful, well-designed, and production-ready. But the developer experience tooling around it is still catching up.

Developers coming from Ethereum have Hardhat, Foundry, and Ethers. They get simulation, event decoding, and typed contract bindings out of the box. Soroban developers today hand-roll all of this.

`soroban-devkit-core` is the first step toward closing that gap — a composable, open-source foundation that any Stellar developer can build on.

---

## Installation

```bash
npm install @soroban-devkit/core
```

Requires Node.js >= 18.

---

## Quick Start

### Simulate a contract call

```ts
import { ContractSimulator } from "@soroban-devkit/core";
import { xdr } from "@stellar/stellar-sdk";

const simulator = new ContractSimulator("testnet");

const result = await simulator.simulate(
  "CXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX", // contract ID
  "transfer",                                                        // method name
  [/* xdr.ScVal args */],
  "GXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX"  // caller address
);

if (result.success) {
  console.log("CPU instructions:", result.cost.cpuInstructions);
  console.log("Memory bytes:", result.cost.memoryBytes);
} else {
  console.error("Simulation failed:", result.error);
}
```

### Decode contract events

```ts
import { EventDecoder } from "@soroban-devkit/core";

const decoder = new EventDecoder();
const decoded = decoder.decode(rawEvent);

console.log(decoded.decodedTopics); // ['transfer', 'GABC...', 'GXYZ...']
console.log(decoded.decodedData);   // { amount: '1000000' }
```

### Monitor a contract in real-time

```ts
import { ContractMonitor } from "@soroban-devkit/core";

const monitor = new ContractMonitor("testnet");

monitor
  .watch({
    contractIds: ["CXXXXXX..."],
    eventFilter: "transfer",
    pollingIntervalMs: 3000,
  })
  .on("event", (event) => {
    console.log(`[Ledger ${event.ledger}]`, event.decodedTopics);
  })
  .on("error", (err) => console.error(err));

await monitor.start();
```

### Generate TypeScript bindings

```ts
import { BindingGenerator } from "@soroban-devkit/core";

const gen = new BindingGenerator({
  contractId: "CXXXXXX...",
  outputDir: "./generated",
  network: "testnet",
});

await gen.generate();
// Outputs: ./generated/CXXXXXX_bindings.ts
```

---

## API Reference

### `ContractSimulator`

| Method | Description |
|--------|-------------|
| `new ContractSimulator(network)` | Create a simulator for `mainnet`, `testnet`, `futurenet`, or `local` |
| `simulate(contractId, method, args, caller)` | Simulate a contract call and return a `SimulationResult` |

### `EventDecoder`

| Method | Description |
|--------|-------------|
| `decode(event)` | Decode a single `ContractEvent` — populates `decodedTopics` and `decodedData` |
| `decodeMany(events)` | Decode an array of events |

### `ContractMonitor`

| Method | Description |
|--------|-------------|
| `watch(options)` | Configure contract IDs, event filter, polling interval |
| `on('event', cb)` | Register a callback for incoming events |
| `on('error', cb)` | Register an error handler |
| `start()` | Begin polling |
| `stop()` | Stop polling |

### `BindingGenerator`

| Method | Description |
|--------|-------------|
| `new BindingGenerator(options)` | Configure contract ID, output directory, network |
| `generate()` | Fetch the contract spec and write TypeScript bindings to disk |

---

## Supported Networks

| Network | RPC Endpoint |
|---------|-------------|
| `mainnet` | `https://mainnet.stellar.validationcloud.io/v1/soroban/rpc` |
| `testnet` | `https://soroban-testnet.stellar.org` |
| `futurenet` | `https://rpc-futurenet.stellar.org` |
| `local` | `http://localhost:8000/soroban/rpc` |

---

## Project Structure

```
soroban-devkit-core/
├── src/
│   ├── index.ts          # Public exports
│   ├── types.ts          # Shared types and network configs
│   ├── simulator.ts      # ContractSimulator
│   ├── decoder.ts        # EventDecoder
│   ├── monitor.ts        # ContractMonitor
│   └── bindings.ts       # BindingGenerator
├── tests/
│   ├── simulator.test.ts
│   ├── decoder.test.ts
│   └── monitor.test.ts
├── package.json
├── tsconfig.json
└── README.md
```

---

## Contributing

This project is part of the **Stellar Wave Program** on [Drips](https://drips.network). Contributors earn rewards for completing issues during active Wave sprints.

See [CONTRIBUTING.md](CONTRIBUTING.md) for setup instructions, coding standards, and how to pick up an issue.

**Good first issues** are tagged [`good first issue`](https://github.com/Raveu-lab/soroban-devkit-core/issues?q=label%3A%22good+first+issue%22) on GitHub.

---

## Roadmap

- [ ] Full WASM spec parsing for `BindingGenerator` (generate method stubs from on-chain ABI)
- [ ] WebSocket/streaming support for `ContractMonitor`
- [ ] Multi-step simulation chaining (simulate a sequence of calls)
- [ ] Transaction replay from historical ledger
- [ ] Support for custom RPC endpoints and auth headers

---

## License

MIT — see [LICENSE](LICENSE).

Built for the Stellar ecosystem. Sponsored by the [Stellar Development Foundation](https://stellar.org) via the Stellar Wave Program.
