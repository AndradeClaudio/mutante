import "dotenv/config";
import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import { parseArgs } from "node:util";
import { privateKeyToAccount } from "viem/accounts";
import { CrashTestOwnCode } from "../../application/crash-test-own-code.js";
import { RunCrashTest } from "../../application/run-crash-test.js";
import { gradeReview } from "../../domain/grading.js";
import { DEFAULT_OPERATORS } from "../../domain/mutation/operators.js";
import type { RoundSnapshot } from "../../domain/round.js";
import { JavaScriptContractChecker } from "../../infrastructure/sandbox/javascript-contract-checker.js";
import { TelegraphMarket } from "../../infrastructure/telegraph/telegraph-market.js";
import { roundRepository } from "./paths.js";
import { printScoreboard } from "./scoreboard-table.js";

// Usage: npm run try -- --code samples/try/free-shipping.js --tests samples/try/free-shipping.tests.js
//          [--mutants 4] [--budget 0.25] [--reviewers 7310045,5530,20260828,auto-routed] [--round try-my-run]
// The code file holds one JavaScript function whose first comment is its contract (max 256 bytes).
// The tests file is a list of assert(condition) calls that the correct function passes.
const { values: options } = parseArgs({
  options: {
    code: { type: "string" },
    tests: { type: "string" },
    mutants: { type: "string", default: "4" },
    budget: { type: "string", default: "0.25" },
    // The miners that returned reviews when named directly, plus the network's own auto-routing (round 3).
    reviewers: { type: "string", default: "7310045,5530,20260828,auto-routed" },
    round: { type: "string" },
  },
});
if (!options.code || !options.tests) throw new Error("Pass --code <function.js> and --tests <tests.js>.");

const privateKey = process.env.TESTNET_PRIVATE_KEY as `0x${string}` | undefined;
if (!privateKey) throw new Error("TESTNET_PRIVATE_KEY is missing from .env (create one with node scripts/create-wallet.mjs).");

const originalId = basename(options.code).replace(/\.[^.]+$/, "").toLowerCase().replace(/[^a-z0-9]+/g, "-");
const roundId = options.round ?? `try-${originalId}-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-")}`;
const market = new TelegraphMarket({
  nodeUrl: "https://devnode.telegraphprotocol.com",
  account: privateKeyToAccount(privateKey),
  maxPerPurchaseMicroUsdc: 20_000,
});
const checker = new JavaScriptContractChecker();
const repository = roundRepository();

console.log(`Planting bugs in ${options.code} and proving them with ${options.tests}…`);
const result = await new CrashTestOwnCode(DEFAULT_OPERATORS, checker, new RunCrashTest(market, repository)).execute(
  {
    roundId,
    original: {
      id: originalId,
      language: "javascript",
      code: await readFile(options.code, "utf8"),
      tests: await readFile(options.tests, "utf8"),
    },
    maxMutants: Number(options.mutants),
    budgetMicroUsdc: Number(options.budget) * 1_000_000,
    onlyReviewers: options.reviewers.split(","),
  },
  (review, remaining) => {
    const outcome = review.kind === "delivered" ? (review.verdict ?? "no verdict") : `FAILED (${review.reason.slice(0, 60)})`;
    console.log(`  [${remaining} left] ${review.reviewerId.padEnd(10)} ${review.caseId.padEnd(40)} ${outcome}`);
  },
);

const snapshot = result.round.toSnapshot();
console.log(`\n${result.provenMutants} proven mutants (${result.discarded.length} discarded); reviews bought for ${snapshot.cases.length - 1} of them plus the correct original.\n`);
printCaseGrid(snapshot);
console.log();
printScoreboard(snapshot);
console.log(`\nSaved with every answer and receipt in data/rounds/${roundId}.json`);

function printCaseGrid(round: RoundSnapshot): void {
  console.log(`${"case".padEnd(40)} ${round.reviewers.map((r) => r.id.padEnd(26)).join("")}`);
  for (const testCase of round.cases) {
    const planted = testCase.answerKey.kind === "planted-bug" ? testCase.answerKey.description : "correct code";
    const grades = round.reviewers.map((reviewer) => {
      const review = round.reviews.find((r) => r.reviewerId === reviewer.id && r.caseId === testCase.id);
      return (review ? gradeReview(review, testCase.answerKey) : "not bought (budget)").padEnd(26);
    });
    console.log(`${testCase.id.padEnd(40)} ${grades.join("")}\n  ↳ ${planted}`);
  }
}
