import type { AnswerKey } from "./answer-key.js";
import { CodeSample } from "./code-sample.js";

/** Where a case came from; the scoreboard groups results by mutation operator. */
export type CaseOrigin =
  | { readonly kind: "hand-written" }
  | { readonly kind: "original"; readonly originalId: string }
  | { readonly kind: "mutant"; readonly originalId: string; readonly operator: string };

export interface TestCase {
  readonly id: string;
  readonly language: string;
  readonly code: CodeSample;
  readonly answerKey: AnswerKey;
  readonly origin: CaseOrigin;
}

export function createTestCase(params: {
  id: string;
  language: string;
  code: string;
  answerKey: AnswerKey;
  origin: CaseOrigin;
}): TestCase {
  if (!/^[a-z0-9-]+$/.test(params.id)) {
    throw new Error(`Invalid case id: "${params.id}" (use lowercase letters, digits and hyphens).`);
  }
  return { ...params, code: CodeSample.create(params.code) };
}

export const handWritten: CaseOrigin = { kind: "hand-written" };
