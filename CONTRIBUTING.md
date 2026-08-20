# Contributing to soroban-devkit-core

This project is open source and welcomes contributions from the Stellar developer community.

---

## Getting Started

### Prerequisites

- Node.js >= 18
- npm >= 9

### Setup

```bash
git clone https://github.com/Raveu-lab/soroban-devkit-core
cd soroban-devkit-core
npm install
npm run build
npm test
```

---

## Coding Convention — Test-Driven Development (TDD)

This project follows **strict TDD**. Every contribution must follow this cycle:

```
1. Write a failing test that describes the behaviour you want
2. Write the minimal implementation to make the test pass
3. Refactor — clean up without changing behaviour
4. Repeat
```

**No implementation code is accepted without a corresponding test.**

### What this looks like in practice

Write the test first:

```ts
// tests/decoder.test.ts
it("decodes a u32 integer", () => {
  const event = makeEvent([], makeU32Xdr(42));
  expect(decoder.decode(event).decodedData).toBe(42);
});
```

Run it — it should fail:

```bash
npm test
# FAIL — expected 42 but received undefined
```

Then implement:

```ts
// src/decoder.ts
case xdr.ScValType.scvU32():
  return val.u32();
```

Run again — it should pass:

```bash
npm test
# PASS
```

---

## SOLID Principles

Every class and function in this codebase follows SOLID:

- **Single Responsibility** — one class does one thing. `EventDecoder` decodes. `ContractSimulator` simulates. Neither does both.
- **Open/Closed** — extend behaviour through new methods or subclasses, not by modifying existing ones
- **Liskov Substitution** — if you subclass, the subclass must behave correctly everywhere the parent is used
- **Interface Segregation** — keep interfaces small and focused
- **Dependency Inversion** — depend on abstractions (`NetworkConfig`) not concrete implementations

---

## Code Standards

- **Small, focused methods** — each method does one thing. Name it after what it does: `decodeTopics`, `buildTransaction`, `normalizeResponse` — not `process` or `handle`
- All public classes and methods must have JSDoc comments
- No `any` types without a comment explaining why
- Error paths must return structured errors — never throw to the caller
- See [ARCHITECTURE.md](ARCHITECTURE.md) for module-level rules

---

## Development Workflow

```bash
# Watch mode — recompiles on save
npm run dev

# Run tests
npm test

# Lint
npm run lint

# Format
npm run format
```

---

## Picking Up an Issue

1. Browse [open issues](https://github.com/Raveu-lab/soroban-devkit-core/issues)
2. Issues tagged `good first issue` are beginner-friendly
3. Comment on the issue to claim it before starting work
4. One issue per contributor at a time

---

## Pull Request Guidelines

- One PR per issue
- Tests must be written before or alongside implementation — not after
- All tests must pass before opening a PR: `npm test`
- Reference the issue number in the PR title: `fix: handle scvU256 in EventDecoder (#42)`
- Keep PRs focused — no unrelated changes

---

## Questions

Open a [GitHub Discussion](https://github.com/Raveu-lab/soroban-devkit-core/discussions) for questions that aren't bug reports or feature requests.
