/**
 * decoded-value.ts
 *
 * Pure utility functions for inspecting decoded ScVal values.
 * Single Responsibility: type-checking helpers for values returned by EventDecoder.
 *
 * These live here — not in EventDecoder — because inspecting a decoded value
 * is a separate concern from decoding it.
 */

/**
 * Returns true if a decoded value is null (was scvVoid).
 */
export function isDecodedVoid(value: unknown): value is null {
  return value === null;
}

/**
 * Returns true if a decoded value is a number (was scvU32 or scvI32).
 */
export function isDecodedNumber(value: unknown): value is number {
  return typeof value === "number";
}

/**
 * Returns true if a decoded value is a string (was scvSymbol, scvString, scvAddress, scvU64, scvI64, etc.).
 */
export function isDecodedString(value: unknown): value is string {
  return typeof value === "string";
}

/**
 * Returns true if a decoded value is a boolean (was scvBool).
 */
export function isDecodedBool(value: unknown): value is boolean {
  return typeof value === "boolean";
}

/**
 * Returns true if a decoded value is an array (was scvVec).
 */
export function isDecodedVec(value: unknown): value is unknown[] {
  return Array.isArray(value);
}

/**
 * Returns true if a decoded value is a plain object (was scvMap).
 */
export function isDecodedMap(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
