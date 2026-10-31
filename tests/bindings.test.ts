import * as path from "path";
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
          contractId: "CB5YCY5CYLNO3PTH3OXQKKT6XFXTSNIOYSC5B65XE4ZZE6MVIWGD2LNH",
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

describe("BindingGenerator.outputPath", () => {
  it("returns the exact path generate() writes to, so callers don't have to re-derive the filename convention", () => {
    const generator = new BindingGenerator({
      contractId: "CB5YCY5CYLNO3PTH3OXQKKT6XFXTSNIOYSC5B65XE4ZZE6MVIWGD2LNH",
      outputDir: "/tmp/does-not-matter",
      network: "testnet",
    });
    expect(generator.outputPath()).toBe("/tmp/does-not-matter/CB5YCY5C_bindings.ts");
  });

  it("resolves a relative outputDir the same way write() does", () => {
    const generator = new BindingGenerator({
      contractId: "CB5YCY5CYLNO3PTH3OXQKKT6XFXTSNIOYSC5B65XE4ZZE6MVIWGD2LNH",
      outputDir: "./generated",
      network: "testnet",
    });
    expect(generator.outputPath()).toBe(path.resolve("./generated", "CB5YCY5C_bindings.ts"));
  });
});

describe("BindingGenerator.buildBindings", () => {
  const generator = new BindingGenerator({
    contractId: "CB5YCY5CYLNO3PTH3OXQKKT6XFXTSNIOYSC5B65XE4ZZE6MVIWGD2LNH",
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
      "async transfer(from: string, to: string, amount: string, callerAddress: string): Promise<SimulationResult>"
    );
    expect(content).toContain('"transfer",');
    expect(content).toContain("this.encoder.encodeArgs([from, to, amount])");
  });

  it("generates a method with no contract params for a function with no inputs", () => {
    const spec = func("get_admin", [], [xdr.ScSpecTypeDef.scSpecTypeAddress()]);
    const content = generator.buildBindings("CCNGT...", [spec]);

    expect(content).toContain("async get_admin(callerAddress: string): Promise<SimulationResult>");
    expect(content).toContain('"get_admin",');
    expect(content).toContain("this.encoder.encodeArgs([])");
  });

  it("does not collide with a contract input literally named 'caller' (common in this project's own contracts, e.g. access-control.grant_role)", () => {
    const spec = func("grant_role", [
      input("caller", xdr.ScSpecTypeDef.scSpecTypeAddress()),
      input("role", xdr.ScSpecTypeDef.scSpecTypeSymbol()),
      input("to", xdr.ScSpecTypeDef.scSpecTypeAddress()),
    ]);
    const content = generator.buildBindings("CCNGT...", [spec]);

    // Would previously emit `caller: string` twice — a TypeScript
    // "Duplicate identifier" compile error in the generated file.
    expect(content).toContain(
      "async grant_role(caller: string, role: string, to: string, callerAddress: string): Promise<SimulationResult>"
    );
    expect(content).toContain("this.encoder.encodeArgs([caller, role, to])");
  });

  it("throws a clear error instead of emitting a broken file when a contract input is named 'callerAddress' too", () => {
    const spec = func("weird", [input("callerAddress", xdr.ScSpecTypeDef.scSpecTypeAddress())]);
    expect(() => generator.buildBindings("CCNGT...", [spec])).toThrow(
      /reserved parameter name/i
    );
  });

  describe("unsigned integer args", () => {
    it("wraps a u32 arg in the $u32 hint, so ArgEncoder doesn't default it to scvI32", () => {
      const spec = func("get_proposal", [input("proposal_id", xdr.ScSpecTypeDef.scSpecTypeU32())]);
      const content = generator.buildBindings("CCNGT...", [spec]);

      // Without the hint, ArgEncoder would infer scvI32 for a plain number,
      // and a real u32-typed contract parameter would reject it with an
      // opaque host trap — confirmed against a real deployed contract.
      expect(content).toContain("this.encoder.encodeArgs([{ $u32: proposal_id }])");
    });

    it("wraps a u64 arg in the $u64 hint", () => {
      const spec = func("f", [input("count", xdr.ScSpecTypeDef.scSpecTypeU64())]);
      const content = generator.buildBindings("CCNGT...", [spec]);
      expect(content).toContain("this.encoder.encodeArgs([{ $u64: count }])");
    });

    it("wraps a u128 arg in the $u128 hint", () => {
      const spec = func("f", [input("total", xdr.ScSpecTypeDef.scSpecTypeU128())]);
      const content = generator.buildBindings("CCNGT...", [spec]);
      expect(content).toContain("this.encoder.encodeArgs([{ $u128: total }])");
    });

    it("wraps a u256 arg in the $u256 hint", () => {
      // Without this case, argExpression's switch fell through to `default`
      // and passed the raw arg name through unwrapped — the same
      // opaque-host-trap risk as the u32/u64/u128 cases above, just for
      // U256-typed contract parameters instead.
      const spec = func("f", [input("amount", xdr.ScSpecTypeDef.scSpecTypeU256())]);
      const content = generator.buildBindings("CCNGT...", [spec]);
      expect(content).toContain("this.encoder.encodeArgs([{ $u256: amount }])");
    });

    it("does not wrap an i32/i128 arg — ArgEncoder's default already matches those two", () => {
      // i64 is deliberately not in this list: a plain number infers scvI32
      // and a digit string infers scvI128, so i64 needs its own hint like
      // every other width. It used to be asserted as unwrapped here, which
      // was only ever true in the sense that no $i64 hint existed yet.
      const spec = func("f", [
        input("a", xdr.ScSpecTypeDef.scSpecTypeI32()),
        input("c", xdr.ScSpecTypeDef.scSpecTypeI128()),
      ]);
      const content = generator.buildBindings("CCNGT...", [spec]);
      expect(content).toContain("this.encoder.encodeArgs([a, c])");
    });

    it("wraps an i64 arg in the $i64 hint — the default is scvI128, not scvI64", () => {
      const spec = func("f", [input("delta", xdr.ScSpecTypeDef.scSpecTypeI64())]);
      const content = generator.buildBindings("CCNGT...", [spec]);
      expect(content).toContain("this.encoder.encodeArgs([{ $i64: delta }])");
    });

    it("wraps an i256 arg in the $i256 hint", () => {
      const spec = func("f", [input("big", xdr.ScSpecTypeDef.scSpecTypeI256())]);
      const content = generator.buildBindings("CCNGT...", [spec]);
      expect(content).toContain("this.encoder.encodeArgs([{ $i256: big }])");
    });

    it("wraps a Timepoint arg in the $timepoint hint", () => {
      // Deadlines, cliffs and expirations are declared as Timepoint, and
      // this project's own vesting/escrow/dao-voting contracts are built on
      // them — an unwrapped digit string reaches the contract as an i128.
      const spec = func("f", [input("deadline", xdr.ScSpecTypeDef.scSpecTypeTimepoint())]);
      const content = generator.buildBindings("CCNGT...", [spec]);
      expect(content).toContain("this.encoder.encodeArgs([{ $timepoint: deadline }])");
    });

    it("wraps a Duration arg in the $duration hint", () => {
      const spec = func("f", [input("lock", xdr.ScSpecTypeDef.scSpecTypeDuration())]);
      const content = generator.buildBindings("CCNGT...", [spec]);
      expect(content).toContain("this.encoder.encodeArgs([{ $duration: lock }])");
    });

    it("wraps a Bytes arg in the $bytes hint, since hex otherwise infers Symbol or String", () => {
      const spec = func("f", [input("payload", xdr.ScSpecTypeDef.scSpecTypeBytes())]);
      const content = generator.buildBindings("CCNGT...", [spec]);
      expect(content).toContain("this.encoder.encodeArgs([{ $bytes: payload }])");
    });

    it("wraps a String arg in the $string hint, since a short value otherwise infers Symbol", () => {
      // Confirmed live against dao-voting.propose(description: String, ...):
      // a short alphanumeric description traps unwrapped, inferring as
      // scvSymbol instead of the scvString the parameter actually is.
      const spec = func("f", [input("description", xdr.ScSpecTypeDef.scSpecTypeString())]);
      const content = generator.buildBindings("CCNGT...", [spec]);
      expect(content).toContain("this.encoder.encodeArgs([{ $string: description }])");
    });

    it("wraps a BytesN arg in the $bytes hint too — a 32-byte hash is the common case", () => {
      const spec = func("f", [
        input("hash", xdr.ScSpecTypeDef.scSpecTypeBytesN(new xdr.ScSpecTypeBytesN({ n: 32 }))),
      ]);
      const content = generator.buildBindings("CCNGT...", [spec]);
      expect(content).toContain("this.encoder.encodeArgs([{ $bytes: hash }])");
    });

    it("wraps an Option<u32> arg in the $u32 hint too, not just a bare u32", () => {
      // argExpression switched on the top-level spec type, so an Option<u32>
      // (switch() == scSpecTypeOption) fell to the default case and the arg
      // went through unwrapped. scSpecTypeToTs already looks inside Option
      // for the TS type (-> "number | undefined"); argExpression needs the
      // same unwrapping for the hint, or a present value hits the same
      // opaque host trap a bare u32 used to.
      const optU32 = xdr.ScSpecTypeDef.scSpecTypeOption(
        new xdr.ScSpecTypeOption({ valueType: xdr.ScSpecTypeDef.scSpecTypeU32() })
      );
      const content = generator.buildBindings("CCNGT...", [func("f", [input("max_age", optU32)])]);
      expect(content).toContain("this.encoder.encodeArgs([{ $u32: max_age }])");
    });

    it("wraps an Option<Timepoint> arg in the $timepoint hint", () => {
      const optTimepoint = xdr.ScSpecTypeDef.scSpecTypeOption(
        new xdr.ScSpecTypeOption({ valueType: xdr.ScSpecTypeDef.scSpecTypeTimepoint() })
      );
      const content = generator.buildBindings("CCNGT...", [
        func("f", [input("deadline", optTimepoint)]),
      ]);
      expect(content).toContain("this.encoder.encodeArgs([{ $timepoint: deadline }])");
    });

    it("does not wrap an Option<Address> — the inner type needs no hint", () => {
      const optAddr = xdr.ScSpecTypeDef.scSpecTypeOption(
        new xdr.ScSpecTypeOption({ valueType: xdr.ScSpecTypeDef.scSpecTypeAddress() })
      );
      const content = generator.buildBindings("CCNGT...", [func("f", [input("who", optAddr)])]);
      expect(content).toContain("this.encoder.encodeArgs([who])");
    });

    it("mixes wrapped and unwrapped args in the same call, preserving order", () => {
      const spec = func("vote", [
        input("proposal_id", xdr.ScSpecTypeDef.scSpecTypeU32()),
        input("voter", xdr.ScSpecTypeDef.scSpecTypeAddress()),
        input("support", xdr.ScSpecTypeDef.scSpecTypeBool()),
      ]);
      const content = generator.buildBindings("CCNGT...", [spec]);
      expect(content).toContain(
        "this.encoder.encodeArgs([{ $u32: proposal_id }, voter, support])"
      );
    });
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
      // Previously fell through to the default case as the literal
      // TypeScript type "unknown" — a real, decodable M... address type
      // (confirmed live via Address.fromString) had no case here, unlike
      // every other address-like type.
      [xdr.ScSpecTypeDef.scSpecTypeMuxedAddress(), "string"],
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
