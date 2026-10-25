/**
 * A runnable tour of @soroban-devkit/core against live Stellar testnet.
 *
 *   npm run build && node examples/walkthrough.js
 *
 * Read-only: every step simulates, encodes or decodes. Nothing is submitted
 * and no key is needed.
 *
 * The contracts are the ones deployed from soroban-devkit-contracts; see that
 * repo's ADDRESSES.md.
 */
const fs = require("fs");
const os = require("os");
const path = require("path");
const {
  ContractSimulator,
  EventDecoder,
  ArgEncoder,
  BindingGenerator,
} = require("../dist");

const TOKEN = "CCEBWHXYP3Y7BGLI7DUZWZJXGXIRHLSZJR7PGCDD3ZKINCV4Y4S55DLJ";
const VESTING = "CB3DUVIYDN3AJOKHSX6YIXGDVEA3ZPXHHXHTURFP2VYYVHJYHWGONUDL";
const HOLDER = "GC3BJ52UL6CBAJBSZRX5DIPHXUW6OGJFVWMQKV3GLBMXHEZ66BWLXZN6";

const step = (n, title) => console.log(`\n── ${n}. ${title}\n`);

async function main() {
  step(1, "ArgEncoder — plain JS values to XDR, no Stellar SDK import needed");
  const encoder = new ArgEncoder();
  const args = encoder.encodeArgs([
    HOLDER, // G... infers as an Address
    "1000", // a digit string infers as i128
    { $u32: 7 }, // a hint pins the type inference can't reach
    { $timepoint: "1760000000" },
    { $bytes: "deadbeef" },
  ]);
  console.log(args.map((a) => a.switch().name).join("\n"));

  step(2, "ContractSimulator — what does this call cost, and what does it return?");
  const simulator = new ContractSimulator("testnet");
  const result = await simulator.simulate(
    TOKEN,
    "balance",
    encoder.encodeArgs([HOLDER]),
    HOLDER
  );
  console.log("success:      ", result.success);
  console.log("returnValue:  ", JSON.stringify(result.returnValue));
  console.log("minResourceFee:", result.cost.minResourceFee, "stroops");
  console.log("instructions: ", result.footprint.instructions);

  step(3, "EventDecoder — raw XDR to plain JavaScript");
  const decoder = new EventDecoder();
  // Real event fields, from a real event-rich.emit_time_types transaction.
  console.log("timepoint_event ->", decoder.decodeData("AAAABwAAAABlU/EA"));
  console.log("duration_event  ->", decoder.decodeData("AAAACAAAAAAAAA4Q"));

  step(4, "BindingGenerator — typed TypeScript from a contract's on-chain spec");
  const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), "devkit-bindings-"));
  const generator = new BindingGenerator({
    contractId: VESTING,
    network: "testnet",
    outputDir,
  });
  await generator.generate();
  const content = fs.readFileSync(generator.outputPath(), "utf-8");
  fs.rmSync(outputDir, { recursive: true, force: true });

  console.log(
    content
      .split("\n")
      .filter((l) => l.includes("async ") || l.includes("encodeArgs"))
      .slice(0, 6)
      .join("\n")
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
