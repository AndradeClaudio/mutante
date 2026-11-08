import { ON_CHAIN_BYTE_LIMIT } from "./code-sample.js";

/** Longest test list accepted from a visitor: enough for the edges of a small contract, not for a program. */
export const TESTS_CHARACTER_LIMIT = 2_000;
/** Most assertions accepted in one test list. */
export const ASSERTION_LIMIT = 20;

/**
 * The language rules a submission must follow, checked by parsing it (an infrastructure concern).
 * Returns every problem found, so the visitor can fix them all at once; empty when the code is accepted.
 */
export interface SubmissionRules {
  problemsInFunction(code: string): readonly string[];
  problemsInTests(tests: string, functionName: string): readonly string[];
  functionName(code: string): string | null;
}

/** Why a submission was refused, in words the visitor can act on. */
export class RejectedSubmission extends Error {
  constructor(readonly problems: readonly string[]) {
    super(`Submission refused: ${problems.join("; ")}`);
    this.name = "RejectedSubmission";
  }
}

/**
 * Code a visitor asks Mutante to crash-test: one small function with its contract comment, and the tests
 * that prove the contract. It can only be created if it passes every rule, so nothing else ever reaches the
 * sandbox. The code is sent to Telegraph miners and becomes public, which is why anything that looks like a
 * secret is refused too.
 */
export class Submission {
  private constructor(
    readonly code: string,
    readonly tests: string,
    readonly functionName: string,
  ) {}

  static accept(code: string, tests: string, rules: SubmissionRules): Submission {
    const problems = [...sizeProblems(code, tests), ...secretProblems(code), ...secretProblems(tests)];
    if (problems.length === 0) {
      problems.push(...rules.problemsInFunction(code));
    }
    const name = problems.length === 0 ? rules.functionName(code) : null;
    if (name !== null) problems.push(...rules.problemsInTests(tests, name));
    if (problems.length > 0 || name === null) {
      throw new RejectedSubmission(problems.length > 0 ? problems : ["the code must declare exactly one function"]);
    }
    return new Submission(code, tests, name);
  }
}

function sizeProblems(code: string, tests: string): string[] {
  const problems: string[] = [];
  if (code.trim() === "") problems.push("the function is empty");
  if (tests.trim() === "") problems.push("the tests are empty");
  const bytes = new TextEncoder().encode(code).length;
  if (bytes > ON_CHAIN_BYTE_LIMIT) {
    problems.push(`the function has ${bytes} bytes; the intent accepts at most ${ON_CHAIN_BYTE_LIMIT}`);
  }
  if (tests.length > TESTS_CHARACTER_LIMIT) {
    problems.push(`the tests have ${tests.length} characters; at most ${TESTS_CHARACTER_LIMIT} are accepted`);
  }
  return problems;
}

// Shapes of credentials that must never be sent to a public network.
const SECRET_SHAPES: readonly [string, RegExp][] = [
  ["a private key", /-----BEGIN [A-Z ]*PRIVATE KEY-----|\b0x[0-9a-fA-F]{64}\b/],
  ["an API key", /\b(sk|pk|rk)[-_](live|test|proj)?[-_]?[A-Za-z0-9]{16,}|\bAKIA[0-9A-Z]{16}\b|\bgh[pousr]_[A-Za-z0-9]{30,}|\bxox[abp]-[A-Za-z0-9-]{10,}/],
  ["a password", /\b(password|passwd|secret|api[_-]?key|token)\s*[:=]\s*["'][^"']{6,}["']/i],
];

function secretProblems(text: string): string[] {
  return SECRET_SHAPES.filter(([, shape]) => shape.test(text)).map(
    ([what]) => `it looks like it contains ${what}; the code is sent to a public network, so remove it`,
  );
}
