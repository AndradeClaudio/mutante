import { correctCode, plantedBug } from "../answer-key.js";
import { ON_CHAIN_BYTE_LIMIT } from "../code-sample.js";
import { createTestCase, type TestCase } from "../test-case.js";
import type { OriginalCode } from "./original-code.js";
import { CATEGORY_CLUES, type Mutation, type MutationOperator } from "./operators.js";

/** Runs the contract tests against some code (the original or a mutant). */
export interface ContractChecker {
  honorsContract(code: string, tests: string): Promise<boolean>;
  /** Which check the code breaks (the failing assertion's message), or null when it honors the contract. */
  firstViolation(code: string, tests: string): Promise<string | null>;
}

export type DiscardReason = "duplicate" | "over-on-chain-limit" | "equivalent";

export interface GenerationResult {
  readonly cases: TestCase[];
  readonly discarded: { readonly operator: string; readonly reason: DiscardReason }[];
}

/**
 * Builds the correct case and the sabotaged cases of one original. A mutant only becomes a test case
 * if it breaks the contract: a change that keeps the behavior ("equivalent mutant") is dropped.
 */
export async function generateCases(
  original: OriginalCode,
  operators: readonly MutationOperator[],
  checker: ContractChecker,
): Promise<GenerationResult> {
  if (!(await checker.honorsContract(original.code, original.tests))) {
    throw new Error(`Original "${original.id}" fails its own tests; fix it before generating mutants.`);
  }

  const cases: TestCase[] = [
    createTestCase({
      id: `${original.id}-correct`,
      language: original.language,
      code: original.code,
      answerKey: correctCode,
      origin: { kind: "original", originalId: original.id },
    }),
  ];
  const discarded: GenerationResult["discarded"] = [];
  const seen = new Set<string>([original.code]);
  const countByOperator = new Map<string, number>();

  for (const mutation of operators.flatMap((op) => op.mutate(original.code))) {
    const reason = await reasonToDiscard(mutation, original, seen, checker);
    seen.add(mutation.code);
    if (reason) {
      discarded.push({ operator: mutation.operator, reason });
      continue;
    }
    const n = (countByOperator.get(mutation.operator) ?? 0) + 1;
    countByOperator.set(mutation.operator, n);
    cases.push(asTestCase(original, mutation, n));
  }
  return { cases, discarded };
}

async function reasonToDiscard(
  mutation: Mutation,
  original: OriginalCode,
  seen: Set<string>,
  checker: ContractChecker,
): Promise<DiscardReason | null> {
  if (seen.has(mutation.code)) return "duplicate";
  if (new TextEncoder().encode(mutation.code).length > ON_CHAIN_BYTE_LIMIT) return "over-on-chain-limit";
  if (await checker.honorsContract(mutation.code, original.tests)) return "equivalent";
  return null;
}

function asTestCase(original: OriginalCode, mutation: Mutation, n: number): TestCase {
  return createTestCase({
    id: `${original.id}-${mutation.operator}-${n}`,
    language: original.language,
    code: mutation.code,
    answerKey: plantedBug(mutation.category, mutation.description, [...mutation.siteClues, ...CATEGORY_CLUES[mutation.category]]),
    origin: { kind: "mutant", originalId: original.id, operator: mutation.operator },
  });
}
