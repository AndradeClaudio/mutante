import { pairForCorrectCode, pairForPlantedBug } from "../domain/evaluation/reference-reviews.js";
import type { PreferencePair } from "../domain/evaluation/preference-pair.js";
import { generateCases, type ContractChecker } from "../domain/mutation/generate-cases.js";
import type { MutationOperator } from "../domain/mutation/operators.js";
import type { OriginalCode } from "../domain/mutation/original-code.js";
import type { TestCase } from "../domain/test-case.js";

export interface EvaluationOriginal {
  readonly original: OriginalCode;
  /** The contract's checks, one boolean expression each; a failing one is quoted in the reference review. */
  readonly checks: readonly string[];
}

export interface EvaluationMaterial {
  readonly pairs: PreferencePair[];
  readonly byOperator: Record<string, number>;
  readonly correctSamples: number;
}

/**
 * Use case: turns original functions into evaluation material, one question per function. The pool rejects
 * questions too similar to each other, and two mutants of the same function differ by one character, so each
 * function contributes either one proven mutant or its correct version, never both.
 */
export class BuildEvaluationMaterial {
  constructor(
    private readonly operators: readonly MutationOperator[],
    private readonly checker: ContractChecker,
    /** Every n-th function is used as correct code, so reviewers are also tested on code they should approve. */
    private readonly correctEvery = 4,
  ) {}

  async execute(originals: readonly EvaluationOriginal[]): Promise<EvaluationMaterial> {
    const pairs: PreferencePair[] = [];
    const byOperator: Record<string, number> = {};
    let correctSamples = 0;

    for (const [index, { original, checks }] of originals.entries()) {
      const { cases } = await generateCases(original, this.operators, this.checker);
      const mutants = cases.filter((c) => c.origin.kind === "mutant");
      if (index % this.correctEvery === this.correctEvery - 1 || mutants.length === 0) {
        pairs.push(pairForCorrectCode({ caseId: `${original.id}-correct`, code: original.code, passingCheck: checks[0]!, variant: index }));
        correctSamples++;
        continue;
      }
      const mutant = leastUsedOperator(mutants, byOperator);
      const operator = mutant.origin.kind === "mutant" ? mutant.origin.operator : "unknown";
      byOperator[operator] = (byOperator[operator] ?? 0) + 1;
      const brokenCheck = await this.checker.firstViolation(mutant.code.text, original.tests);
      if (brokenCheck === null) throw new Error(`Mutant ${mutant.id} passes every check; it should have been discarded.`);
      pairs.push(
        pairForPlantedBug({ caseId: mutant.id, originalCode: original.code, mutantCode: mutant.code.text, brokenCheck, variant: index }),
      );
    }
    return { pairs, byOperator, correctSamples };
  }
}

/** Spreads the material over kinds of bug: picks the mutant whose operator has been used the least so far. */
function leastUsedOperator(mutants: readonly TestCase[], used: Record<string, number>): TestCase {
  const uses = (c: TestCase) => (c.origin.kind === "mutant" ? (used[c.origin.operator] ?? 0) : 0);
  return [...mutants].sort((a, b) => uses(a) - uses(b))[0]!;
}
