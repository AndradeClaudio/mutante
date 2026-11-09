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

/** Planting and proving bugs takes a while before the first purchase; this tells the caller it is over. */
export type OnPlanted = (planted: { readonly provenMutants: number; readonly casesToReview: number }) => void;

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

  async execute(request: OwnCodeRequest, onRecorded?: OnRecorded, onPlanted?: OnPlanted): Promise<OwnCodeResult> {
    if (request.maxMutants < 1) throw new Error("Ask for at least one mutant.");
    const generated = await generateCases(request.original, this.operators, this.checker);
    const [correct, ...mutants] = generated.cases;
    if (mutants.length === 0) {
      throw new Error("No mutant broke your tests, so there is no proven bug to plant. Add tests that cover the contract's edges.");
    }
    const toReview = [correct!, ...variedSelection(mutants, request.maxMutants)];
    onPlanted?.({ provenMutants: mutants.length, casesToReview: toReview.length });

    const round = await this.crashTest.execute(
      {
        roundId: request.roundId,
        cases: toReview,
        budgetMicroUsdc: request.budgetMicroUsdc,
        parallelism: 4,
        onlyReviewers: request.onlyReviewers,
      },
      onRecorded,
    );
    return { round, provenMutants: mutants.length, discarded: generated.discarded };
  }
}
