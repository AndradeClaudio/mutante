import "dotenv/config";
import { parseArgs } from "node:util";
import { privateKeyToAccount } from "viem/accounts";
import { RunCrashTest } from "../../application/run-crash-test.js";
import { variedSelection } from "../../application/varied-selection.js";
import { gradeReview, type Grade } from "../../domain/grading.js";
import { AUTO_ROUTED, TelegraphMarket } from "../../infrastructure/telegraph/telegraph-market.js";
import { roundRepository } from "./paths.js";
import { printScoreboard } from "./scoreboard-table.js";

// Usage: npm run check-routing -- [--from round-002] [--cases 20] [--budget 0.3]
// Asks the network for reviews WITHOUT naming a miner, as a default buyer would, on cases a paid round
// already graded. Shows which miners the router picked and how its answers compare with naming the best miner.
const { values: options } = parseArgs({
  options: {
    from: { type: "string", default: "round-002" },
    cases: { type: "string", default: "20" },
    budget: { type: "string", default: "0.3" },
    round: { type: "string" },
  },
});

const privateKey = process.env.TESTNET_PRIVATE_KEY as `0x${string}` | undefined;
if (!privateKey) throw new Error("TESTNET_PRIVATE_KEY is missing from .env");

const repository = roundRepository();
const source = await repository.find(options.from);
if (!source) throw new Error(`Round ${options.from} not found.`);

const gradable = source.cases.filter((c) => c.answerKey.kind !== "annulled");
const cases = variedSelection(gradable, Number(options.cases));
const roundId = options.round ?? `${source.id}-auto-routing`;
const market = new TelegraphMarket({
  nodeUrl: "https://devnode.telegraphprotocol.com",
  account: privateKeyToAccount(privateKey),
  maxPerPurchaseMicroUsdc: 20_000,
});

console.log(`Auto-routing check: ${cases.length} cases from ${source.id}, no miner named.\n`);
const round = await new RunCrashTest(market, repository).execute(
  { roundId, cases, budgetMicroUsdc: Number(options.budget) * 1_000_000, parallelism: 4, onlyReviewers: [AUTO_ROUTED.id] },
  (review, remaining) => {
    const servedBy = review.kind === "delivered" ? (review.servedBy?.name || review.servedBy?.minerId || "?") : "-";
    const outcome = review.kind === "delivered" ? (review.verdict ?? "no verdict") : `FAILED (${review.reason.slice(0, 60)})`;
    console.log(`  [${remaining} left] ${review.caseId.padEnd(42)} served by ${servedBy.padEnd(40)} ${outcome}`);
  },
);

const snapshot = round.toSnapshot();
const answerKeyOf = new Map(snapshot.cases.map((c) => [c.id, c.answerKey]));

console.log("\nWho the router picked:");
const pickedCount = new Map<string, number>();
for (const review of snapshot.reviews) {
  const who = review.kind === "delivered" ? review.servedBy?.name || review.servedBy?.minerId || "unknown" : "failed before a miner answered";
  pickedCount.set(who, (pickedCount.get(who) ?? 0) + 1);
}
for (const [who, n] of [...pickedCount].sort((a, b) => b[1] - a[1])) console.log(`  ${String(n).padStart(3)}  ${who}`);

console.log(`\nSame cases, graded the same way: auto-routing vs naming each miner in ${source.id}`);
const tally = (grades: Grade[]) => {
  const planted = grades.length;
  const caught = grades.filter((g) => g === "caught").length;
  const explained = caught + grades.filter((g) => g === "explained-without-verdict").length;
  return `caught ${caught}/${planted}, explained ${explained}/${planted}`;
};
const plantedIds = cases.filter((c) => c.answerKey.kind === "planted-bug").map((c) => c.id);
const autoGrades = snapshot.reviews.filter((r) => plantedIds.includes(r.caseId)).map((r) => gradeReview(r, answerKeyOf.get(r.caseId)!));
console.log(`  ${"auto-routing".padEnd(40)} ${tally(autoGrades)}`);
for (const reviewer of source.reviewers) {
  const grades = source.reviews
    .filter((r) => r.reviewerId === reviewer.id && plantedIds.includes(r.caseId))
    .map((r) => gradeReview(r, answerKeyOf.get(r.caseId)!));
  console.log(`  ${reviewer.name.slice(0, 40).padEnd(40)} ${tally(grades)}`);
}
console.log();
printScoreboard(snapshot);
