/** @type {import('jest').Config} */
// NOTE: tsconfig.json's isolatedModules:true (required for ts-jest to support
// moduleResolution: node16, needed for @stellar/stellar-sdk/contract) makes
// ts-jest skip type-checking entirely — `npm test` only transpiles. Real type
// errors are caught by `npm run build` (tsc), not by the test run. CI runs
// both, in that order, so this doesn't weaken CI — but locally, a passing
// `npm test` alone does NOT mean the types are correct. Always also run
// `npm run build` before trusting a change.
module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  roots: ["<rootDir>/tests"],
  testMatch: ["**/*.test.ts"],
  collectCoverageFrom: ["src/**/*.ts", "!src/index.ts"],
  // Network- and filesystem-touching code (e.g. BindingGenerator.generate()/
  // write(), ContractSimulator/ContractMonitor's RPC calls) is deliberately
  // left out of unit coverage per this project's no-SDK-mocking convention —
  // it's exercised via manual/integration testing against testnet instead.
  // These thresholds reflect that realistic floor, not 100% of every line.
  coverageThreshold: {
    global: {
      branches: 60,
      functions: 70,
      lines: 70,
    },
  },
};
