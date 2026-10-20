import { isValidContractId } from "../src/validation";

describe("isValidContractId", () => {
  it("accepts a real deployed contract ID", () => {
    // soroban-devkit-contracts' token, from ADDRESSES.md.
    expect(isValidContractId("CCEQRERHTDQU5Q45JRBRWSFF6QS22TWRURAIOH27FK23ZPOB6YNXRHSX")).toBe(
      true
    );
  });

  it("rejects a placeholder that merely looks the right length", () => {
    // This is the exact string an external PR used as a config example —
    // 56 characters starting with C, but not valid base32 (0/1/8/9 aren't
    // in the base32 alphabet) and fails StrKey's checksum regardless.
    expect(isValidContractId("CABCDEF01234567890ABCDEF01234567890ABCDEF01234567890AB")).toBe(
      false
    );
  });

  it("rejects a G... account address — not a contract ID", () => {
    expect(isValidContractId("GC3BJ52UL6CBAJBSZRX5DIPHXUW6OGJFVWMQKV3GLBMXHEZ66BWLXZN6")).toBe(
      false
    );
  });

  it("rejects a muxed M... address — not a contract ID", () => {
    expect(
      isValidContractId(
        "MAAQCAIBAEAQCAIBAEAQCAIBAEAQCAIBAEAQCAIBAEAQCAIBAEAQCAAAAAAAAAAAAFQGI"
      )
    ).toBe(false);
  });

  it("rejects a string of the right alphabet but wrong length", () => {
    expect(isValidContractId("CCEQRERHTDQU5Q45JRBRWSFF6QS22TWRURAIOH27FK23ZPOB6YN")).toBe(false);
  });

  it("rejects an empty string", () => {
    expect(isValidContractId("")).toBe(false);
  });

  it("rejects undefined and non-string input without throwing", () => {
    expect(isValidContractId(undefined as unknown as string)).toBe(false);
    expect(isValidContractId(123 as unknown as string)).toBe(false);
  });
});
