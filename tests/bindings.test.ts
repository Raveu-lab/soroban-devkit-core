import { xdr } from "@stellar/stellar-sdk";
import { BindingGenerator } from "../src/bindings";

/**
 * Helpers to build real XDR ScSpecFunctionV0 fixtures — this project avoids
 * mocking the Stellar SDK, so these are the same types a real contract spec
 * would produce.
 */
function input(name: string, type: xdr.ScSpecTypeDef): xdr.ScSpecFunctionInputV0 {
  return new xdr.ScSpecFunctionInputV0({ doc: "", name, type });
}

function func(
  name: string,
  inputs: xdr.ScSpecFunctionInputV0[],
  outputs: xdr.ScSpecTypeDef[] = []
): xdr.ScSpecFunctionV0 {
  return new xdr.ScSpecFunctionV0({ doc: "", name, inputs, outputs });
}

describe("BindingGenerator constructor", () => {
  it("accepts a custom NetworkConfig, not just a Network name, so it can use a custom RPC endpoint", () => {
    // Note: headers are NOT respected here, unlike ContractSimulator/
    // ContractMonitor — stellar-sdk's Client.from() (which generate() uses)
    // has no headers option in its ClientOptions. NetworkConfig still allows
    // a custom rpcUrl/networkPassphrase, just not auth headers.
    expect(
      () =>
        new BindingGenerator({
          contractId: "CCNGTMOQNIF5VFJCHCF6S2CGW473IN76RPAX72YOTGDXC6VDZ4XINN45",
          outputDir: "/tmp/does-not-matter",
          network: {
            network: "mainnet",
            rpcUrl: "https://my-provider.example/rpc",
            networkPassphrase: "Public Global Stellar Network ; September 2015",
          },
        })
    ).not.toThrow();
  });
});

describe("BindingGenerator.buildBindings", () => {
  const generator = new BindingGenerator({
    contractId: "CCNGTMOQNIF5VFJCHCF6S2CGW473IN76RPAX72YOTGDXC6VDZ4XINN45",
    outputDir: "/tmp/does-not-matter",
    network: "testnet",
  });

  it("includes the contract ID and a do-not-edit header", () => {
    const content = generator.buildBindings("CCNGT...", []);
    expect(content).toContain('CONTRACT_ID = "CCNGT..."');
    expect(content).toContain("DO NOT EDIT MANUALLY");
  });

  it("generates a method with typed parameters for a function with inputs", () => {
    const spec = func("transfer", [
      input("from", xdr.ScSpecTypeDef.scSpecTypeAddress()),
      input("to", xdr.ScSpecTypeDef.scSpecTypeAddress()),
      input("amount", xdr.ScSpecTypeDef.scSpecTypeI128()),
    ]);
    const content = generator.buildBindings("CCNGT...", [spec]);

    expect(content).toContain(
      "async transfer(from: string, to: string, amount: string, caller: string): Promise<SimulationResult>"
    );
    expect(content).toContain('"transfer",');
    expect(content).toContain("this.encoder.encodeArgs([from, to, amount])");
  });

  it("generates a method with no contract params for a function with no inputs", () => {
    const spec = func("get_admin", [], [xdr.ScSpecTypeDef.scSpecTypeAddress()]);
    const content = generator.buildBindings("CCNGT...", [spec]);

    expect(content).toContain("async get_admin(caller: string): Promise<SimulationResult>");
    expect(content).toContain('"get_admin",');
    expect(content).toContain("this.encoder.encodeArgs([])");
  });

  it("generates one method per function, for multiple functions", () => {
    const content = generator.buildBindings("CCNGT...", [
      func("mint", [input("to", xdr.ScSpecTypeDef.scSpecTypeAddress())]),
      func("burn", [input("from", xdr.ScSpecTypeDef.scSpecTypeAddress())]),
    ]);
    expect(content).toContain("async mint(");
    expect(content).toContain("async burn(");
  });

  describe("type mapping", () => {
    it.each([
      [xdr.ScSpecTypeDef.scSpecTypeBool(), "boolean"],
      [xdr.ScSpecTypeDef.scSpecTypeU32(), "number"],
      [xdr.ScSpecTypeDef.scSpecTypeI32(), "number"],
      [xdr.ScSpecTypeDef.scSpecTypeU64(), "string"],
      [xdr.ScSpecTypeDef.scSpecTypeI64(), "string"],
      [xdr.ScSpecTypeDef.scSpecTypeU128(), "string"],
      [xdr.ScSpecTypeDef.scSpecTypeI128(), "string"],
      [xdr.ScSpecTypeDef.scSpecTypeAddress(), "string"],
      [xdr.ScSpecTypeDef.scSpecTypeSymbol(), "string"],
      [xdr.ScSpecTypeDef.scSpecTypeString(), "string"],
      [xdr.ScSpecTypeDef.scSpecTypeBytes(), "string"],
    ])("maps %s to %s", (type, expectedTs) => {
      const content = generator.buildBindings("CCNGT...", [func("f", [input("x", type)])]);
      expect(content).toContain(`x: ${expectedTs}`);
    });

    it("maps a Vec<U32> to number[]", () => {
      const vecType = xdr.ScSpecTypeDef.scSpecTypeVec(
        new xdr.ScSpecTypeVec({ elementType: xdr.ScSpecTypeDef.scSpecTypeU32() })
      );
      const content = generator.buildBindings("CCNGT...", [func("f", [input("items", vecType)])]);
      expect(content).toContain("items: number[]");
    });

    it("maps an Option<Address> to string | undefined", () => {
      const optType = xdr.ScSpecTypeDef.scSpecTypeOption(
        new xdr.ScSpecTypeOption({ valueType: xdr.ScSpecTypeDef.scSpecTypeAddress() })
      );
      const content = generator.buildBindings("CCNGT...", [func("f", [input("who", optType)])]);
      expect(content).toContain("who: string | undefined");
    });

    it("maps a user-defined type (Udt) to any, noting its name in a comment", () => {
      const udtType = xdr.ScSpecTypeDef.scSpecTypeUdt(
        new xdr.ScSpecTypeUdt({ name: "TokenMetadata" })
      );
      const content = generator.buildBindings("CCNGT...", [func("f", [input("meta", udtType)])]);
      expect(content).toContain("meta: any");
      expect(content).toContain("TokenMetadata");
    });
  });
});
