/**
 * Correct code that mutants are made from. The contract comment in the code itself defines the
 * expected behavior; the tests prove that contract and decide whether a mutant is a real bug.
 */
export interface OriginalCode {
  readonly id: string;
  readonly language: "javascript";
  readonly code: string;
  /** Body of an async function that calls `assert(condition, message)` and throws when the contract is broken. */
  readonly tests: string;
}
