export const VERDICTS = ["Approve", "Request changes", "Comment"] as const;
export type Verdict = (typeof VERDICTS)[number];

export function parseVerdict(value: unknown): Verdict | null {
  return VERDICTS.find((v) => v === value) ?? null;
}

/** Proof of payment issued by the network for one purchase. */
export interface Receipt {
  readonly hash: string;
  readonly transaction: string | null;
  readonly amountMicroUsdc: number;
  /** Miner id the network recorded on the receipt (may differ from the id requested). */
  readonly recordedMiner: string;
}

/** Outcome of buying one review from one reviewer for one case. */
export type Review = DeliveredReview | FailedReview;

export interface DeliveredReview {
  readonly kind: "delivered";
  readonly reviewerId: string;
  readonly caseId: string;
  readonly verdict: Verdict | null;
  /**
   * The network validates each answer field and may reject the verdict while keeping the text.
   * We record it because a good review can then vanish from the on-chain record.
   */
  readonly verdictRejectedByNetwork: boolean;
  readonly findings: readonly string[];
  readonly summary: string;
  readonly latencyMs: number;
  readonly receipt: Receipt | null;
  readonly rawResponse: string;
}

export interface FailedReview {
  readonly kind: "failed";
  readonly reviewerId: string;
  readonly caseId: string;
  readonly reason: string;
  readonly latencyMs: number;
  /** Failures before payment (e.g. an incompatible miner) cost nothing. */
  readonly receipt: Receipt | null;
}

export function costOf(review: Review): number {
  return review.receipt?.amountMicroUsdc ?? 0;
}
