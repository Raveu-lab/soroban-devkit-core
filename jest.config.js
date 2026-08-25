/** @type {import('jest').Config} */
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
