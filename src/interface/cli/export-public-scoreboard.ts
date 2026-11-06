import { mkdir, writeFile } from "node:fs/promises";
import type { AnswerKey } from "../../domain/answer-key.js";
import { gradeReview, type Grade } from "../../domain/grading.js";
import type { DeliveredReview, Review } from "../../domain/review.js";
import type { RoundSnapshot } from "../../domain/round.js";
import type { CaseOrigin, TestCase } from "../../domain/test-case.js";
import { PUBLIC_FOLDER, roundRepository } from "./paths.js";

// Usage: npm run export-scoreboard   (or: npx tsx src/interface/cli/export-public-scoreboard.ts round-001 round-002)
// Writes the files the public scoreboard and the demo video read.
const OPERATOR_LABELS: Record<string, string> = {
  boundary: "Boundary (>= to >)",
  "comparison-flip": "Inverted comparison",
  "logical-connective": "Logical connective (&& / ||)",
  "equality-flip": "Equality flipped",
  arithmetic: "Arithmetic operator",
  "negation-removed": "Negation removed",
  "always-true-condition": "Condition always true",
  "guard-removed": "Guard removed",
  "constant-changed": "Constant changed",
  "sql-concatenation": "SQL concatenation",
};
const GRADE_LABELS: Record<Grade, string> = {
  caught: "Caught, with the right reason",
  "blocked-without-reason": "Blocked, reason unclear",
  "explained-without-verdict": "Explained, verdict discarded",
  "no-verdict": "No verdict",
  missed: "Missed",
  "correctly-approved": "Correctly approved",
  "false-alarm": "False alarm",
  failed: "Could not answer",
  annulled: "Annulled case",
};
const ANSWER_KEY_LABELS: Record<AnswerKey["kind"], string> = {
  "planted-bug": "planted bug",
  "correct-code": "correct code",
  annulled: "annulled",
};

const repository = roundRepository();
const roundIds = process.argv.slice(2);
if (roundIds.length === 0) throw new Error("Pass at least one round id.");

const purchases = [];
const cases = [];
for (const id of roundIds) {
  const round = await repository.find(id);
  if (!round) throw new Error(`Round ${id} not found.`);
  purchases.push(...round.reviews.map((review) => purchaseRow(round, review)));
  cases.push(...round.cases.map((testCase) => caseRow(round, testCase)));
}

await mkdir(PUBLIC_FOLDER, { recursive: true });
await writeFile(`${PUBLIC_FOLDER}/purchases.json`, JSON.stringify(purchases));
await writeFile(`${PUBLIC_FOLDER}/cases.json`, JSON.stringify(cases));
console.log(`${purchases.length} purchases and ${cases.length} cases exported to ${PUBLIC_FOLDER}`);

function caseRow(round: RoundSnapshot, testCase: TestCase) {
  return {
    round: round.id,
    case: testCase.id,
    mutation: mutationLabel(testCase.origin),
    answer_key: ANSWER_KEY_LABELS[testCase.answerKey.kind],
    planted: testCase.answerKey.kind === "planted-bug" ? testCase.answerKey.description : "",
    code: testCase.code.text,
  };
}

function purchaseRow(round: RoundSnapshot, review: Review) {
  const testCase = round.cases.find((c) => c.id === review.caseId)!;
  const reviewer = round.reviewers.find((r) => r.id === review.reviewerId)!;
  const grade = gradeReview(review, testCase.answerKey);
  const delivered = review.kind === "delivered";
  return {
    key: `${round.id}/${review.reviewerId}/${review.caseId}`,
    round: round.id,
    reviewer_id: review.reviewerId,
    reviewer: reviewer.name,
    case: review.caseId,
    mutation: mutationLabel(testCase.origin),
    answer_key: ANSWER_KEY_LABELS[testCase.answerKey.kind],
    grade_code: grade,
    grade: GRADE_LABELS[grade],
    verdict: delivered ? (review.verdict ?? "none") : "none",
    verdict_discarded_by_network: delivered && review.verdictRejectedByNetwork ? 1 : 0,
    answer: delivered ? answerText(review) : networkError(review.reason),
    latency_s: delivered ? Math.round(review.latencyMs / 100) / 10 : null,
    paid_usdc: (review.receipt?.amountMicroUsdc ?? 0) / 1_000_000,
    receipt: review.receipt?.hash ?? "",
    tx: review.receipt?.transaction ?? "",
    // Only for auto-routed purchases: the miner the network's router picked.
    served_by: delivered ? (review.servedBy?.name ?? "") : "",
  };
}

/** Correct originals have no mutation; hand-written cases are grouped together. */
function mutationLabel(origin: CaseOrigin): string | undefined {
  if (origin.kind === "mutant") return OPERATOR_LABELS[origin.operator] ?? origin.operator;
  if (origin.kind === "hand-written") return "Hand-written";
  return undefined;
}

function answerText(review: DeliveredReview): string {
  const parts = [review.summary, ...review.findings].filter((part, i, all) => part && all.indexOf(part) === i);
  return parts.join(" ").slice(0, 400);
}

function networkError(reason: string): string {
  if (reason.includes("no_compatible_miner")) return "Network: no compatible miner for this intent";
  if (reason.includes("could not route")) return "Network: could not route the question";
  return reason.slice(0, 120);
}
