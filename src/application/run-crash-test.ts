import type { ReviewMarket, RoundRepository } from "../domain/ports.js";
import type { Review } from "../domain/review.js";
import { Round } from "../domain/round.js";
import type { TestCase } from "../domain/test-case.js";

export interface CrashTestRequest {
  readonly roundId: string;
  readonly cases: readonly TestCase[];
  readonly budgetMicroUsdc: number;
  /** How many purchases run in parallel (the network allows 60 questions/min per client). */
  readonly parallelism: number;
  /** When given, tests only these reviewers (e.g. the ones that answered in the previous round). */
  readonly onlyReviewers?: readonly string[];
}

export type OnRecorded = (review: Review, remaining: number) => void;

/** Use case: buys one review from every reviewer for every case and stores it all, resuming if interrupted. */
export class RunCrashTest {
  constructor(
    private readonly market: ReviewMarket,
    private readonly repository: RoundRepository,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  async execute(request: CrashTestRequest, onRecorded: OnRecorded = () => {}): Promise<Round> {
    const round = await this.loadOrStart(request);
    const queue = round.pending();

    const work = async () => {
      for (let pair = queue.shift(); pair; pair = queue.shift()) {
        if (!round.fitsBudget(this.market.estimatedPriceMicroUsdc)) return;
        const review = await this.market.buyReview(pair.reviewer, pair.testCase);
        round.record(review);
        await this.repository.save(round.toSnapshot());
        onRecorded(review, queue.length);
      }
    };
    await Promise.all(Array.from({ length: request.parallelism }, work));

    if (round.pending().length === 0) round.close(this.clock());
    await this.repository.save(round.toSnapshot());
    return round;
  }

  private async loadOrStart(request: CrashTestRequest): Promise<Round> {
    const existing = await this.repository.find(request.roundId);
    if (existing) return Round.restore(existing);
    const everyone = await this.market.listReviewers();
    const only = request.onlyReviewers;
    return Round.start({
      id: request.roundId,
      intent: this.market.intent,
      budgetMicroUsdc: request.budgetMicroUsdc,
      cases: request.cases,
      reviewers: only ? everyone.filter((r) => only.includes(r.id)) : everyone,
      now: this.clock(),
    });
  }
}
