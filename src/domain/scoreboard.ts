import { GRADES, gradeReview, type Grade } from "./grading.js";
import { costOf } from "./review.js";
import type { RoundSnapshot } from "./round.js";

export interface ScoreboardRow {
  readonly reviewerId: string;
  readonly name: string;
  readonly grades: Readonly<Record<Grade, number>>;
  /** Bugs blocked with the right reason ÷ planted bugs (what the network sees). */
  readonly detectionRate: number;
  /** Bugs named in the answer, with or without a recorded verdict ÷ planted bugs (what the reviewer knew). */
  readonly explainedRate: number;
  /** Correct samples blocked ÷ correct samples. */
  readonly falseAlarmRate: number;
  readonly medianLatencyMs: number | null;
  readonly spentMicroUsdc: number;
}

export function buildScoreboard(round: RoundSnapshot): ScoreboardRow[] {
  const answerKeyByCase = new Map(round.cases.map((c) => [c.id, c.answerKey]));
  const plantedBugs = round.cases.filter((c) => c.answerKey.kind === "planted-bug").length;
  const correctSamples = round.cases.filter((c) => c.answerKey.kind === "correct-code").length;

  const rows = round.reviewers.map((reviewer) => {
    const reviews = round.reviews.filter((r) => r.reviewerId === reviewer.id);
    const grades = Object.fromEntries(GRADES.map((g) => [g, 0])) as Record<Grade, number>;
    for (const review of reviews) {
      const answerKey = answerKeyByCase.get(review.caseId);
      if (answerKey) grades[gradeReview(review, answerKey)]++;
    }
    const latencies = reviews.filter((r) => r.kind === "delivered").map((r) => r.latencyMs);
    return {
      reviewerId: reviewer.id,
      name: reviewer.name,
      grades,
      detectionRate: ratio(grades.caught, plantedBugs),
      explainedRate: ratio(grades.caught + grades["explained-without-verdict"], plantedBugs),
      falseAlarmRate: ratio(grades["false-alarm"], correctSamples),
      medianLatencyMs: median(latencies),
      spentMicroUsdc: reviews.reduce((total, r) => total + costOf(r), 0),
    };
  });

  return rows.sort(
    (a, b) => b.detectionRate - a.detectionRate || b.explainedRate - a.explainedRate || a.falseAlarmRate - b.falseAlarmRate,
  );
}

function ratio(part: number, whole: number): number {
  return whole === 0 ? 0 : part / whole;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2;
}
