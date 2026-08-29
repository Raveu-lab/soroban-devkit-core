# Architecture — soroban-devkit-core

## Overview

`soroban-devkit-core` is a TypeScript library. It has no server, no daemon, no database. It is a pure collection of classes that wrap the Stellar SDK and expose higher-level abstractions for contract simulation, event decoding, contract monitoring, and binding generation.

Everything is stateless except `ContractMonitor`, which holds an internal polling loop and last-seen ledger cursor.

---

## High-Level Diagram

```
┌─────────────────────────────────────────────────────────┐
│                   Consumer (user code)                   │
│         (soroban-devkit-cli / dApp / scripts)            │
└───────────────────────┬─────────────────────────────────┘
                        │ imports
┌───────────────────────▼─────────────────────────────────┐
│                  soroban-devkit-core                     │
│                                                         │
│  ┌─────────────────┐   ┌─────────────────┐             │
│  │ ContractSimulator│   │  EventDecoder   │             │
│  └────────┬────────┘   └────────┬────────┘             │
│           │                     │                       │
│  ┌────────▼────────┐   ┌────────▼────────┐             │
│  │ ContractMonitor │   │ BindingGenerator│             │
│  └────────┬────────┘   └────────┬────────┘             │
│           │            ┌────────▼────────┐             │
│           │            │   ArgEncoder    │             │
│           │            └────────┬────────┘             │
│  ┌────────▼─────────────────────▼────────┐             │
│  │              types.ts                  │             │
│  │  NetworkConfig | ContractEvent |       │             │
│  │  SimulationResult | BindingOptions     │             │
│  └───────────────────────────────────────┘             │
└───────────────────────┬─────────────────────────────────┘
                        │ uses
┌───────────────────────▼─────────────────────────────────┐
│              @stellar/stellar-sdk                        │
│         SorobanRpc | xdr | Contract | Account            │
└───────────────────────┬─────────────────────────────────┘
                        │ HTTP/JSON-RPC
┌───────────────────────▼─────────────────────────────────┐
│                  Stellar RPC Node                        │
│     (testnet / mainnet / futurenet / local)              │
└─────────────────────────────────────────────────────────┘
```

---

## Module Breakdown

### `types.ts`

The single source of truth for all shared types and constants. No logic lives here.

- `Network` — union type of supported network names
- `NetworkConfig` — RPC URL + network passphrase pair, plus optional auth headers for custom/paid RPC providers
- `NETWORK_CONFIGS` — hardcoded map of `Network → NetworkConfig`
- `ContractEvent` — normalized event shape (raw XDR + decoded fields)
- `SimulationResult` — result shape returned by `ContractSimulator`
- `BindingGeneratorOptions` — configuration for `BindingGenerator`

**Rule:** No class or function is imported into `types.ts`. It imports nothing from this package.

---

### `simulator.ts` — `ContractSimulator`

**Responsibility:** Build a transaction, call `simulateTransaction` on the RPC node, and return a normalized `SimulationResult`. Never submits a transaction.

**Flow:**
```
simulate(contractId, method, args, caller)
  │
  ├─ getAccount(caller)          → fetch current sequence number
  ├─ build Transaction           → TransactionBuilder + Contract.call()
  ├─ server.simulateTransaction  → Stellar RPC call
  └─ normalize response          → SimulationResult
```

**Error handling:** All RPC errors and simulation failures are caught and returned as `{ success: false, error: string }` — never thrown to the caller.

**State:** Stateless. A new `SorobanRpc.Server` instance is created per `ContractSimulator` instance.

---

### `decoder.ts` — `EventDecoder`

**Responsibility:** Convert raw base64 XDR `ContractEvent` topics and data into plain JavaScript values.

**Flow:**
```
decode(event)
  │
  ├─ event.topics.map(t => decodeScVal(xdr.ScVal.fromXDR(t, 'base64')))
  ├─ decodeScVal(xdr.ScVal.fromXDR(event.data, 'base64'))
  └─ return enriched ContractEvent with decodedTopics + decodedData
```

**`decodeScVal` type map:**

| XDR Type     | JavaScript Type |
|--------------|----------------|
| `scvBool`    | `boolean`       |
| `scvVoid`    | `null`          |
| `scvU32/I32` | `number`        |
| `scvU64/I64` | `string`        |
| `scvU128/I128` | `string`      |
| `scvAddress` | `string` (G.../C...) |
| `scvSymbol`  | `string`        |
| `scvString`  | `string`        |
| `scvBytes`   | `string` (hex)  |
| `scvVec`     | `unknown[]`     |
| `scvMap`     | `Record<string, unknown>` |

**State:** Stateless. Safe to use as a singleton.

---

### `encoder.ts` — `ArgEncoder`

**Responsibility:** The inverse of `EventDecoder` — convert plain JavaScript values into XDR `ScVal`, so callers never need to import the Stellar SDK just to build contract call arguments.

**Flow:**
```
encode(value)
  │
  ├─ infer a type from the JS value's shape (no contract spec consulted)
  └─ construct the matching xdr.ScVal
```

**Type inference:**

| JS value | Inferred XDR type |
|----------|-------------------|
| `boolean` | `scvBool` |
| `null` | `scvVoid` |
| safe i32 integer | `scvI32` |
| `G...`/`C...` string | `scvAddress` |
| digit string (e.g. `"1000000"`) | `scvI128` |
| short `[A-Za-z0-9_]` string | `scvSymbol` |
| other string | `scvString` |
| array | `scvVec` (each element encoded recursively) |
| plain object | `scvMap` (keys as `scvSymbol`, values recursively) |

Throws for values with no sensible inferred type (`undefined`, non-integer numbers, numbers outside i32 range, functions).

**State:** Stateless. Safe to use as a singleton.

---

### `monitor.ts` — `ContractMonitor`

**Responsibility:** Poll the Stellar RPC `getEvents` endpoint on a configurable interval, filter results, decode events, and emit them to registered callbacks.

**Flow:**
```
start()
  │
  ├─ getLatestLedger()           → set lastLedger cursor
  └─ poll() loop
       │
       ├─ server.getEvents({ startLedger: lastLedger + 1, filters })
       ├─ update lastLedger cursor
       ├─ for each event → normalize to ContractEvent
       ├─ EventDecoder.decode(event)   [if decode: true]
       └─ emit to eventCallbacks[]

stop()
  └─ clearTimeout, set running = false
```

**State:** Stateful. Holds:
- `running: boolean`
- `lastLedger: number` — cursor to avoid re-processing events
- `pollTimer` — timeout handle
- `eventCallbacks[]` / `errorCallbacks[]` — registered listeners

**Concurrency:** Single polling loop. The next poll only starts after the current one completes (via `.finally()`), preventing overlapping requests.

---

### `bindings.ts` — `BindingGenerator`

**Responsibility:** Fetch a deployed contract's on-chain spec and generate a TypeScript class with one typed method per contract function.

**Flow:**
```
generate()
  │
  ├─ Client.from({ contractId, rpcUrl, networkPassphrase })
  │    (stellar-sdk's Client fetches the contract instance, WASM, and
  │     parses its embedded contractspecv0 section into ScSpecEntry[])
  ├─ client.spec.funcs()             → function name, inputs, outputs
  ├─ buildBindings(contractId, funcs) → pure codegen, testable without a network call
  │    └─ scSpecTypeToTs(type)       → maps each ScSpecTypeDef to a TS type
  └─ write .ts file to outputDir
```

`network` accepts a custom `NetworkConfig` (not just a `Network` name), for a custom RPC endpoint — like `ContractSimulator`/`ContractMonitor`. Auth headers are the one exception: `Client.from()`'s `ClientOptions` has no headers field, so `NetworkConfig.headers` is silently not used here (it is respected by `ContractSimulator` and `ContractMonitor`).

**Current state:** Full for primitive types, collections (`Vec`, `Map`, `Option`, `Tuple`), and `Address`/numeric/string types — each maps to a real TypeScript type. Struct/union/enum UDTs map to `any` (with the type name kept in a comment) since fully typing them means also generating their definitions, which is a separate, larger feature.

**State:** Stateless after construction. Writes to disk as a side effect.

---

## Data Flow: End to End

```
User calls ContractMonitor.start()
        │
        ▼
Stellar RPC getEvents (JSON-RPC over HTTPS)
        │
        ▼
Raw event: { topics: string[], data: string }  ← base64 XDR
        │
        ▼
EventDecoder.decode()
  xdr.ScVal.fromXDR(topic, 'base64') → decodeScVal()
        │
        ▼
ContractEvent: { decodedTopics: unknown[], decodedData: unknown }
        │
        ▼
User callback: (event: ContractEvent) => void
```

---

## Adding a New Module

1. Create `src/your-module.ts`
2. Export your public class/function from `src/index.ts`
3. Add any new shared types to `src/types.ts`
4. Write tests in `tests/your-module.test.ts`
5. Update this document

---

## Dependencies

| Package | Why |
|---------|-----|
| `@stellar/stellar-sdk` | Core Stellar/Soroban primitives — XDR, RPC client, transaction builder |
| `axios` | HTTP fallback for environments where `fetch` is unavailable (peer dependency of `@stellar/stellar-sdk`) |

No framework dependencies. No build plugins. TypeScript compiled to CommonJS via `tsc`.

---

## Testing Strategy

- **Unit tests** — `EventDecoder` and `BindingGenerator` are tested with mocked XDR fixtures
- **Integration tests** — `ContractSimulator` and `ContractMonitor` are tested against testnet using the contracts in `soroban-devkit-contract`
- **No mocking of the Stellar SDK** — we test against real XDR to catch encoding regressions early

Test runner: Jest with `ts-jest`.
