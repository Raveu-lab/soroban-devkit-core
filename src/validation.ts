import { StrKey } from "@stellar/stellar-sdk";

/**
 * validation.ts
 *
 * Pure strkey validation helpers. Single Responsibility: is this string a
 * well-formed address of a given kind — nothing about encoding/decoding
 * values, which is ArgEncoder/EventDecoder's job.
 */

/**
 * Returns true if `value` is a syntactically valid Soroban contract ID
 * (a `C...` strkey) — correct length, base32 alphabet, version byte, and
 * checksum. Does not check that a contract is actually deployed at that
 * address, only that the string could be one.
 *
 * A length-56 string starting with "C" is not enough on its own: base32
 * excludes `0`, `1`, `8`, and `9`, and even a string using only valid
 * base32 characters can still fail the checksum. A caller-supplied
 * placeholder that merely looks like a contract ID — the kind that ends up
 * in a config file's alias map — passes an `isPlainStringRecord`-style
 * shape check without this.
 */
export function isValidContractId(value: string): boolean {
  if (typeof value !== "string") return false;
  return StrKey.isValidContract(value);
}
