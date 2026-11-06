import type { RoundRepository } from "../domain/ports.js";
import { Round, type RegradeReport } from "../domain/round.js";
import type { TestCase } from "../domain/test-case.js";

export interface RegradeRequest {
  readonly roundId: string;
  /** Catalog with the revised answer keys; only cases with identical code are used. */
  readonly revisedCatalog: readonly TestCase[];
  readonly annulments: readonly { caseId: string; reason: string }[];
}

export interface RegradeResult extends RegradeReport {
  readonly annulled: string[];
  /** Where the previous version was kept. */
  readonly archivedAt: string;
}

/** Use case: applies an improved answer key to a round already paid for, without buying anything again. */
export class RegradeRound {
  constructor(
    private readonly repository: RoundRepository,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  async execute(request: RegradeRequest): Promise<RegradeResult> {
    const snapshot = await this.repository.find(request.roundId);
    if (!snapshot) throw new Error(`Round ${request.roundId} not found.`);
    const round = Round.restore(snapshot);

    const report = round.regrade(request.revisedCatalog);
    for (const { caseId, reason } of request.annulments) round.annulCase(caseId, reason);

    // A round is paid, publishable evidence: the previous grading stays on record to show what changed.
    const archivedAt = await this.repository.archive(request.roundId, this.clock());
    await this.repository.save(round.toSnapshot());
    return { ...report, annulled: request.annulments.map((a) => a.caseId), archivedAt };
  }
}
