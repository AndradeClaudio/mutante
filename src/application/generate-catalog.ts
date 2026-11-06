import { generateCases, type ContractChecker, type DiscardReason } from "../domain/mutation/generate-cases.js";
import type { MutationOperator } from "../domain/mutation/operators.js";
import type { OriginalCode } from "../domain/mutation/original-code.js";
import type { TestCase } from "../domain/test-case.js";

export interface Catalog {
  readonly cases: TestCase[];
  readonly acceptedByOperator: Record<string, number>;
  readonly discardedByReason: Record<DiscardReason, number>;
}

/** Use case: applies the mutation operators to every original and gathers the proven cases. */
export class GenerateCatalog {
  constructor(
    private readonly operators: readonly MutationOperator[],
    private readonly checker: ContractChecker,
  ) {}

  async execute(originals: readonly OriginalCode[]): Promise<Catalog> {
    const cases: TestCase[] = [];
    const acceptedByOperator: Record<string, number> = {};
    const discardedByReason: Record<DiscardReason, number> = { duplicate: 0, "over-on-chain-limit": 0, equivalent: 0 };

    for (const original of originals) {
      const result = await generateCases(original, this.operators, this.checker);
      cases.push(...result.cases);
      for (const testCase of result.cases) {
        const group = testCase.origin.kind === "mutant" ? testCase.origin.operator : "(correct original)";
        acceptedByOperator[group] = (acceptedByOperator[group] ?? 0) + 1;
      }
      for (const discarded of result.discarded) discardedByReason[discarded.reason]++;
    }
    return { cases, acceptedByOperator, discardedByReason };
  }
}
