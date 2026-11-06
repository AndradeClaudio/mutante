import type { Review } from "./review.js";
import type { Reviewer, RoundSnapshot } from "./round.js";
import type { TestCase } from "./test-case.js";

/** Where code reviews are bought (the Telegraph network, in production). */
export interface ReviewMarket {
  /** The network intent every purchase goes through; stored on the round. */
  readonly intent: string;
  readonly estimatedPriceMicroUsdc: number;
  listReviewers(): Promise<Reviewer[]>;
  buyReview(reviewer: Reviewer, testCase: TestCase): Promise<Review>;
}

export interface RoundRepository {
  save(round: RoundSnapshot): Promise<void>;
  find(id: string): Promise<RoundSnapshot | null>;
  latest(): Promise<RoundSnapshot | null>;
  /** Keeps a copy of the stored version before it changes; returns where the copy went. */
  archive(id: string, now: Date): Promise<string>;
}
