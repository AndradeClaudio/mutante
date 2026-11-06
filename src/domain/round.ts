import { annulledCase } from "./answer-key.js";
import { costOf, type Review } from "./review.js";
import type { TestCase } from "./test-case.js";

export interface Reviewer {
  readonly id: string;
  readonly name: string;
}

export interface RoundSnapshot {
  readonly id: string;
  readonly intent: string;
  readonly startedAt: string;
  readonly closedAt: string | null;
  readonly budgetMicroUsdc: number;
  readonly cases: readonly TestCase[];
  readonly reviewers: readonly Reviewer[];
  readonly reviews: readonly Review[];
}

export interface RegradeReport {
  readonly revised: string[];
  /** Cases whose code changed in the catalog keep their old key: the answers were about the old code. */
  readonly keptBecauseCodeChanged: string[];
}

/** One crash-test round: every reviewer gets every case once, within a budget. */
export class Round {
  private readonly reviews: Review[];
  private currentCases: TestCase[];
  private closedAt: string | null;

  private constructor(private readonly snapshot: RoundSnapshot) {
    this.reviews = [...snapshot.reviews];
    this.currentCases = [...snapshot.cases];
    this.closedAt = snapshot.closedAt;
  }

  static start(params: {
    id: string;
    intent: string;
    budgetMicroUsdc: number;
    cases: readonly TestCase[];
    reviewers: readonly Reviewer[];
    now: Date;
  }): Round {
    if (params.cases.length === 0) throw new Error("A round needs at least one test case.");
    if (params.reviewers.length === 0) throw new Error("A round needs at least one reviewer.");
    if (params.budgetMicroUsdc <= 0) throw new Error("The round budget must be positive.");
    const { now, ...rest } = params;
    return new Round({ ...rest, startedAt: now.toISOString(), closedAt: null, reviews: [] });
  }

  static restore(snapshot: RoundSnapshot): Round {
    return new Round(snapshot);
  }

  get id(): string {
    return this.snapshot.id;
  }

  get cases(): readonly TestCase[] {
    return this.currentCases;
  }

  get reviewers(): readonly Reviewer[] {
    return this.snapshot.reviewers;
  }

  get spentMicroUsdc(): number {
    return this.reviews.reduce((total, r) => total + costOf(r), 0);
  }

  /** (reviewer, case) pairs not tested yet. */
  pending(): { reviewer: Reviewer; testCase: TestCase }[] {
    const done = new Set(this.reviews.map((r) => pairKey(r.reviewerId, r.caseId)));
    return this.snapshot.reviewers.flatMap((reviewer) =>
      this.currentCases
        .filter((testCase) => !done.has(pairKey(reviewer.id, testCase.id)))
        .map((testCase) => ({ reviewer, testCase })),
    );
  }

  fitsBudget(priceMicroUsdc: number): boolean {
    return this.spentMicroUsdc + priceMicroUsdc <= this.snapshot.budgetMicroUsdc;
  }

  record(review: Review): void {
    if (this.closedAt) throw new Error(`Round ${this.id} is already closed.`);
    const isPending = this.pending().some((p) => p.reviewer.id === review.reviewerId && p.testCase.id === review.caseId);
    if (!isPending) throw new Error(`Pair reviewer ${review.reviewerId} × case ${review.caseId} is not pending in this round.`);
    this.reviews.push(review);
  }

  close(now: Date): void {
    this.closedAt ??= now.toISOString();
  }

  /**
   * Replaces the answer key of an already answered case (e.g. better clues).
   * Only allowed when the code is identical: a reviewer is judged on what it actually received.
   */
  reviseAnswerKey(revised: TestCase): void {
    const current = this.caseById(revised.id);
    if (current.code.text !== revised.code.text) {
      throw new Error(`Case ${revised.id} has different code; the new answer key does not apply to answers already bought.`);
    }
    this.replaceCase({ ...current, answerKey: revised.answerKey });
  }

  /** Applies a revised catalog: cases with identical code get the new key, the others keep theirs. */
  regrade(revisedCatalog: readonly TestCase[]): RegradeReport {
    const revisedById = new Map(revisedCatalog.map((c) => [c.id, c]));
    const report: RegradeReport = { revised: [], keptBecauseCodeChanged: [] };
    for (const current of this.currentCases) {
      const revised = revisedById.get(current.id);
      if (!revised) continue;
      if (revised.code.text === current.code.text) {
        this.reviseAnswerKey(revised);
        report.revised.push(current.id);
      } else {
        report.keptBecauseCodeChanged.push(current.id);
      }
    }
    return report;
  }

  /** Takes a case out of the score, like an annulled question, keeping the bought answers for audit. */
  annulCase(caseId: string, reason: string): void {
    this.replaceCase({ ...this.caseById(caseId), answerKey: annulledCase(reason) });
  }

  toSnapshot(): RoundSnapshot {
    return { ...this.snapshot, cases: [...this.currentCases], reviews: [...this.reviews], closedAt: this.closedAt };
  }

  private caseById(caseId: string): TestCase {
    const testCase = this.currentCases.find((c) => c.id === caseId);
    if (!testCase) throw new Error(`Round ${this.id} has no case ${caseId}.`);
    return testCase;
  }

  private replaceCase(testCase: TestCase): void {
    this.currentCases = this.currentCases.map((c) => (c.id === testCase.id ? testCase : c));
  }
}

function pairKey(reviewerId: string, caseId: string): string {
  return `${reviewerId}::${caseId}`;
}
