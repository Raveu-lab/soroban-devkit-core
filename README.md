# soroban-devkit-core

> The core TypeScript library powering the Soroban DevKit ecosystem.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
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
- **ArgEncoder** — turn plain JS values (numbers, strings, arrays, objects) into typed `xdr.ScVal` contract arguments, without touching the Stellar SDK yourself

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
import { ContractSimulator, ArgEncoder } from "@soroban-devkit/core";

const simulator = new ContractSimulator("testnet");
const encoder = new ArgEncoder();

const result = await simulator.simulate(
  "CXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX", // contract ID
  "transfer",                                                        // method name
  encoder.encodeArgs(["GABC...", "GXYZ...", "1000000"]),
  "GXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX"  // caller address
);

if (result.success) {
  console.log("CPU instructions:", result.cost.cpuInstructions);
  console.log("Memory bytes:", result.cost.memoryBytes);
} else {
  console.error("Simulation failed:", result.error);
}
```

### Check a multi-step flow before submitting any of it

```ts
const results = await simulator.simulateSequence([
  { contractId: "CTOKEN...", method: "approve", args: [...], caller: "GXXXX..." },
  { contractId: "CDEX...", method: "swap", args: [...], caller: "GXXXX..." },
]);
// Each call is simulated independently against current ledger state — this
// checks "would each step work and what would it cost", not "run this as
// one atomic on-chain transaction". Stops at the first failure by default.
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

### Encode arguments without touching the Stellar SDK

```ts
import { ArgEncoder } from "@soroban-devkit/core";

const encoder = new ArgEncoder();
const args = encoder.encodeArgs(["GABC...", "1000000", true]);
// Infers: Address, i128 (large digit strings), and bool respectively
```

---

## API Reference

### `ContractSimulator`

| Method | Description |
|--------|-------------|
| `new ContractSimulator(network)` | Create a simulator for `mainnet`, `testnet`, `futurenet`, or `local` |
| `simulate(contractId, method, args, caller)` | Simulate a contract call and return a `SimulationResult` |
| `simulateSequence(calls, options?)` | Simulate several independent calls in order; stops at the first failure unless `{ stopOnFailure: false }` |

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

### `ArgEncoder`

| Method | Description |
|--------|-------------|
| `encode(value)` | Encode a single plain value into an `xdr.ScVal`, inferring its type |
| `encodeArgs(values)` | Encode an array of plain values, in order |

---

## Supported Networks

| Network | RPC Endpoint |
|---------|-------------|
| `mainnet` | `https://mainnet.stellar.validationcloud.io/v1/soroban/rpc` |
| `testnet` | `https://soroban-testnet.stellar.org` |
| `futurenet` | `https://rpc-futurenet.stellar.org` |
| `local` | `http://localhost:8000/soroban/rpc` |

Pass a `NetworkConfig` object instead of a network name to use a custom RPC endpoint (e.g. a paid provider), optionally with auth headers:

```ts
const simulator = new ContractSimulator({
  network: "mainnet",
  rpcUrl: "https://my-provider.example/rpc",
  networkPassphrase: "Public Global Stellar Network ; September 2015",
  headers: { "X-Api-Key": process.env.RPC_API_KEY! },
});
```

`ContractMonitor` accepts the same shape.

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
│   ├── bindings.ts       # BindingGenerator
│   └── encoder.ts        # ArgEncoder
├── tests/
│   ├── simulator.test.ts
│   ├── decoder.test.ts
│   ├── monitor.test.ts
│   ├── bindings.test.ts
│   └── encoder.test.ts
├── package.json
├── tsconfig.json
└── README.md
```

---

## Contributing

This project is open source and welcomes contributions from the Stellar developer community.

See [CONTRIBUTING.md](CONTRIBUTING.md) for setup instructions, coding standards, and how to pick up an issue.

**Good first issues** are tagged [`good first issue`](https://github.com/Raveu-lab/soroban-devkit-core/issues?q=label%3A%22good+first+issue%22) on GitHub.

---

## Roadmap

- [ ] Typed struct/union/enum bindings for `BindingGenerator` (currently maps to `any` — needs generating the UDT definitions themselves)
- [ ] Adaptive polling for `ContractMonitor` — sync `pollingIntervalMs` to actual ledger close cadence instead of a fixed guess (checked and ruled out: real WebSocket/streaming support isn't possible here — Soroban RPC's `getEvents` is plain HTTP JSON-RPC with no subscription endpoint; a raw WS upgrade attempt against `soroban-testnet.stellar.org` returns `405`)
- [ ] Transaction replay from historical ledger

---

## License

MIT — see [LICENSE](LICENSE).

Built for the Stellar ecosystem.
