# Changelog

All notable changes to `@soroban-devkit/core` are documented here.

Format loosely follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). This project hasn't cut a tagged release yet (still `0.1.0`), so everything below lives under **Unreleased**.

## Unreleased

### Known issues

- The production dependency chain (`@stellar/stellar-sdk@^15.1.0` → `axios`, `toml`) carries 3 real, currently-active high-severity advisories (confirmed via `npm audit --omit=dev`). The only fix available is `@stellar/stellar-sdk@17.x`, which is a genuine ESM migration — not a version bump — touching the XDR API shape (`ScValType` members, `Uint128Parts`/`Uint256Parts` renames), this package's own CommonJS/ESM boundary, and `soroban-devkit-cli`'s consumption of it. Investigated directly on 2026-09-30; deferred to its own dedicated session rather than rushed in.

### Added

- `ContractSimulator`, `EventDecoder`, `ContractMonitor` — the initial scaffold.
- `decoded-value.ts` — pure type-guard helpers (`isDecodedVoid`, `isDecodedNumber`, etc.) for inspecting values `EventDecoder` produces.
- `ArgEncoder` — the inverse of `EventDecoder`: plain JS values → XDR `ScVal`, so callers never need to import the Stellar SDK just to build contract call arguments.
- `BindingGenerator` — reads a deployed contract's on-chain spec and generates typed TypeScript bindings.
- `NetworkConfig.headers` — custom auth headers for paid RPC providers, respected by `ContractSimulator` and `ContractMonitor`.
- `ContractSimulator.simulateSequence()` — simulate several independent calls in order, for checking a planned multi-step flow before submitting any of it.
- Adaptive polling for `ContractMonitor` — the interval calibrates to real ledger close cadence instead of a fixed guess, when `pollingIntervalMs` is omitted.
- `ArgEncoder`'s `{ $u32 | $u64 | $u128 | $u256: n }` hint — forces the unsigned XDR variant explicitly, since plain numbers/digit strings always infer signed by default.
- `ContractSimulator.normalizeRestoreResponse()` — surfaces `needsRestore`/`restoreFee` on `SimulationResult` when a call needs archived data restored first, instead of a dead-end error.

### Fixed

- `EventDecoder.scValToJs` wasn't decoding `scvAddress` to its real strkey string.
- `ContractMonitor`'s `eventFilter` option built an invalid RPC topic filter — it was silently never applied.
- `ContractSimulator`'s `footprint.diskReadBytes`/`writeBytes` were fabricated placeholder values, not the real resource data from the simulation response.
- `BindingGenerator` couldn't use a custom RPC endpoint — `NetworkConfig` was accepted but ignored.
- `BindingGenerator.buildMethod()` always appended a synthetic `caller` parameter, colliding with any contract function that already declared its own `caller` input and producing TypeScript that failed to compile.
- `ContractSimulator.simulate()`'s `returnValue` was never populated with the invocation's actual decoded result.
- `BindingGenerator` didn't wrap `u32`/`u64`/`u128` contract args in `ArgEncoder`'s unsigned hint, so a generated binding for any such function would fail with an opaque host trap.
- `ArgEncoder.encodeObject()` validated string *values* as Symbols but not object *keys* — an invalid map key produced a `ScVal` that only failed much later, inside `toXDR()`, with an unrelated-looking error.
- `ContractMonitor.fetchAndEmitEvents()`: one throwing event callback aborted the whole batch, silently dropping every later event in it, even ones unrelated to the failure.
- `EventDecoder` had no support for decoding `scvTimepoint`, `scvDuration`, `scvU256`, or `scvI256` — all four fell through to `[unsupported: ...]`.
- `NETWORK_CONFIGS.mainnet.rpcUrl` pointed at a paid third-party endpoint that returns `{"error":"invalid api key"}` for any unauthenticated request — mainnet was silently unusable out of the box, unlike every other network.
- `ArgEncoder.encodeString()` let a digit string outside the i128 range fall through to the underlying XDR library, which threw an opaque `RangeError` instead of a clear `ArgEncoder:` message.
- `EventDecoder.decodeMap()` stringified non-primitive map keys (a decoded `Vec`/`Map` used as a key) with bare `String()`, silently colliding distinct keys that happened to stringify the same way and dropping one of the two entries.
- `ContractMonitor`'s cursor only advanced when a poll returned events — on a quiet contract it stayed pinned to an old ledger until the RPC's retention window rolled past it, after which every later poll failed, permanently.
- `ArgEncoder`/`BindingGenerator` didn't recognize `M...` muxed addresses — they silently fell through to `scvString`/the literal TypeScript type `unknown` instead of `scvAddress`/`string`.

### Changed

- Upgraded `@stellar/stellar-sdk` from `^12.0.0` to `^15.1.0`.
- `BindingGeneratorOptions.generateWrapper` removed — it was never implemented.
- `BindingGenerator.outputPath()` is now public, so a caller (e.g. the CLI's success message) reads the real output path from one source instead of re-deriving the naming convention independently.
