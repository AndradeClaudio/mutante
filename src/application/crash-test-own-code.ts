import { generateCases, type ContractChecker, type GenerationResult } from "../domain/mutation/generate-cases.js";
import type { MutationOperator } from "../domain/mutation/operators.js";
import type { OriginalCode } from "../domain/mutation/original-code.js";
import type { Round } from "../domain/round.js";
import type { OnRecorded, RunCrashTest } from "./run-crash-test.js";
import { variedSelection } from "./varied-selection.js";

export interface OwnCodeRequest {
  readonly roundId: string;
  /** The user's function, with its contract comment, and the tests that prove that contract. */
  readonly original: OriginalCode;
  /** How many proven mutants to buy reviews for (plus the correct original). */
  readonly maxMutants: number;
  readonly budgetMicroUsdc: number;
  readonly onlyReviewers?: readonly string[];
}

export interface OwnCodeResult {
  readonly round: Round;
  readonly provenMutants: number;
  readonly discarded: GenerationResult["discarded"];
}

/**
 * Use case: crash-tests the reviewers on code the user brings. The bugs are planted in the user's
 * own function and proven by the user's own tests, so the answer key is still known before buying.
 */
export class CrashTestOwnCode {
  constructor(
    private readonly operators: readonly MutationOperator[],
    private readonly checker: ContractChecker,
    private readonly crashTest: RunCrashTest,
  ) {}

  async execute(request: OwnCodeRequest, onRecorded?: OnRecorded): Promise<OwnCodeResult> {
    if (request.maxMutants < 1) throw new Error("Ask for at least one mutant.");
    const generated = await generateCases(request.original, this.operators, this.checker);
    const [correct, ...mutants] = generated.cases;
    if (mutants.length === 0) {
      throw new Error("No mutant broke your tests, so there is no proven bug to plant. Add tests that cover the contract's edges.");
    }

    const round = await this.crashTest.execute(
      {
        roundId: request.roundId,
        cases: [correct!, ...variedSelection(mutants, request.maxMutants)],
        budgetMicroUsdc: request.budgetMicroUsdc,
        parallelism: 4,
        onlyReviewers: request.onlyReviewers,
      },
      onRecorded,
    );
    return { round, provenMutants: mutants.length, discarded: generated.discarded };
  }
}
