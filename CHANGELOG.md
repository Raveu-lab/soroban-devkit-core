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
- `examples/walkthrough.js` — a read-only tour of `ArgEncoder`, `ContractSimulator`, `EventDecoder` and `BindingGenerator` against the live testnet deployments, runnable with no key and no extra dependency. There was previously nothing in this repo a reader could execute to watch the library work.
- `isValidContractId()` — checks a string against Stellar's real strkey rules for a `C...` contract ID (length, base32 alphabet, version byte, checksum) via `StrKey.isValidContract`. Added after reviewing an external CLI PR whose example config used two 56-character, `C`-prefixed placeholders that are not valid strkeys (base32 excludes `0`/`1`/`8`/`9`, and even an all-valid-alphabet string can still fail the checksum) — nothing in this library or the CLI's own `sdev config validate` could have caught that, since the existing shape check only confirms a value is a string.
- `ArgEncoder` now encodes `scvBytes`: a `Uint8Array`/`Buffer` directly, or a `{ $bytes: "deadbeef" | [1, 2, 3] }` hint mirroring the existing `$u32`/`$u64`/`$u128`/`$u256` escape hatches. Hex may be `0x`-prefixed and is case-insensitive.
- `ArgEncoder`'s `{ $i64 | $i256 | $timepoint | $duration: n }` hints, completing the set. The existing hints only covered the unsigned integers, so these four types had no representation at all — `BindingGenerator` types each of them as `string`, and a digit string infers `scvI128`, so a `Timepoint`, `Duration`, `i64` or `i256` parameter silently received an `i128` and failed as an opaque host VM trap. `Timepoint`/`Duration` are u64-based and reject a negative value.
- `.github/PULL_REQUEST_TEMPLATE.md` — no PR template existed in any of the three sibling repos; mirrors `CONTRIBUTING.md`'s existing "Pull Request Guidelines" as a checklist.

### Fixed

- `BindingGenerator`'s `argExpression` switched on a parameter's top-level spec type to decide which `ArgEncoder` hint to wrap it in, so an `Option<u32>`/`Option<Timepoint>`/etc. fell to the default case and reached `ArgEncoder` unwrapped when present — the same opaque host trap a bare `u32` used to hit, just reachable through an optional parameter instead. `scSpecTypeToTs` already looks inside `Option<T>` to type the parameter as `T | undefined`; `argExpression` now does the same unwrapping before picking a hint. `Option<Address>` and other types needing no hint are unaffected.
- `ContractMonitor.buildEventFilters()` returned early whenever `contractIds` was empty, which silently discarded `eventFilter` along with it. Since `contractIds` is documented as "empty means watch all", `watch({ eventFilter: "transfer" })` is a supported combination — watch one event name across every contract — but it sent no filter at all and so received *every* contract event on the network. Reachable straight from the CLI, where `--contract` is optional and `sdev monitor --filter transfer` prints "Watching all contracts" before firehosing. Each narrowing is now sent on its own. Verified against the live testnet RPC that a topics-only filter is both accepted and actually matches: emitted a real `timepoint_event` and queried it back with no `contractIds` set.
- `BindingGenerator` wrapped only the four unsigned widths in an `ArgEncoder` hint, so a generated binding silently sent the wrong `ScVal` for five more types: `Timepoint`, `Duration` and `i64` all went out as `scvI128`, a short `Bytes` hex string as `scvSymbol`, and a `BytesN<32>` hash as `scvString`. The spec being generated from names the real type in every one of those cases, so the information was there and simply unused, and the failure surfaced as an opaque host trap at call time. `Timepoint`/`Duration` matter most, being how deadlines, cliffs and lock periods are declared. Only `i32` and `i128` are left unwrapped now, those two being exactly what inference already yields. A pre-existing test had asserted `i64` belonged in that unwrapped group — true only in the sense that no `$i64` hint existed yet, and corrected here.
- `ArgEncoder`'s i128-range error recommended the `$u128`/`$u256` hints but not `$i256`, which now exists — a value below `i128::MIN` was told to try an unsigned hint that cannot represent it.
- `ArgEncoder` had no path to `scvBytes` at all, so no contract function taking `Bytes`/`BytesN` could be called through this library, and every way of trying produced a silently wrong `ScVal` rather than an error. `EventDecoder` renders `scvBytes` as a hex string and `BindingGenerator` types a `Bytes`/`BytesN` parameter as `string`, so a caller naturally holds hex — which inferred as `scvSymbol` when short (`"deadbeef"`) and `scvString` at 64 characters (a `BytesN<32>` hash). A `Uint8Array`/`Buffer` was worse: it fell through to the plain-object branch and encoded as an `scvMap` of index to byte (`{"0":1,"1":2,"2":3}`). All four cases were accepted without complaint and failed later as an opaque host VM trap, the exact failure the `$u32`-style hints exist to prevent. Verified by round-tripping real `scvBytes` through `EventDecoder` and back.

- The repo had no actual `LICENSE` file — `package.json` declared `"license": "MIT"`, but there was never an actual license grant for the code, only a field claiming one.

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
- `ContractSimulator` let a muxed (`M...`) `caller` reach `server.getAccount()` directly, which rejected it with a raw strkey-decoding error (`invalid version byte. expected 48, got 96`) instead of a clear message explaining a muxed address can't be a transaction source account.
- `EventDecoder.scValToJs` had no case for `scvError`, falling through to `[unsupported: scvError]` — not a theoretical gap, `scvError` genuinely appears in a real diagnostic event's topics for any failed invocation. Now decodes to the same `"Error(Contract, #N)"`/`"Error(Type, Code)"` format the Stellar CLI itself prints, confirmed against a real simulated failure on testnet.
- `ContractSimulator.simulate()` and `ContractMonitor.emitError` both did `error instanceof Error ? error.message : String(error)` (or the `new Error(String(err))` equivalent), which degrades to the literal string `"[object Object]"` for anything thrown that isn't a real `Error` instance — confirmed live: `@stellar/stellar-sdk/contract`'s `Client.from()` throws a plain `{ code, message }` object for a non-existent contract. Both now use a public `extractErrorMessage` that checks for a string `.message` on any object first.

### Changed

- Upgraded `@stellar/stellar-sdk` from `^12.0.0` to `^15.1.0`.
- `BindingGeneratorOptions.generateWrapper` removed — it was never implemented.
- `BindingGenerator.outputPath()` is now public, so a caller (e.g. the CLI's success message) reads the real output path from one source instead of re-deriving the naming convention independently.
