# Contributing to soroban-devkit-core

This project is part of the **Stellar Wave Program** on [Drips](https://drips.network). Contributors earn rewards for completing issues during active Wave sprints.

## Getting Started

### Prerequisites

- Node.js >= 18
- npm >= 9

### Setup

```bash
git clone https://github.com/soroban-devkit/soroban-devkit-core
cd soroban-devkit-core
npm install
npm run build
npm test
```

## Picking Up an Issue

1. Browse [open issues](https://github.com/soroban-devkit/soroban-devkit-core/issues)
2. Issues tagged `good first issue` are beginner-friendly
3. Comment on the issue to claim it before starting work
4. One issue per contributor at a time

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

## Pull Request Guidelines

- One PR per issue
- Include tests for any new logic
- Run `npm run lint` and `npm test` before opening a PR
- Reference the issue number in the PR title: `fix: handle scvU256 in EventDecoder (#42)`
- Keep PRs focused — no unrelated changes

## Code Standards

- All public classes and methods must have JSDoc comments
- No `any` types without a comment explaining why
- Error paths must return structured errors, never throw to the caller
- See [ARCHITECTURE.md](ARCHITECTURE.md) for module rules

## Questions

Open a [GitHub Discussion](https://github.com/soroban-devkit/soroban-devkit-core/discussions) for questions that aren't bug reports or feature requests.
