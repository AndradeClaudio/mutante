// The CODE_REVIEW_GENERAL intent writes the code on-chain into a slot of at most 256 bytes.
export const ON_CHAIN_BYTE_LIMIT = 256;

/** Code sent to a reviewer, exactly as the reviewer receives it. */
export class CodeSample {
  private constructor(readonly text: string) {}

  static create(text: string): CodeSample {
    if (text.trim().length === 0) throw new Error("A code sample cannot be empty.");
    const bytes = new TextEncoder().encode(text).length;
    if (bytes > ON_CHAIN_BYTE_LIMIT) {
      throw new Error(`The code sample has ${bytes} bytes; the on-chain limit is ${ON_CHAIN_BYTE_LIMIT}.`);
    }
    return new CodeSample(text);
  }
}
