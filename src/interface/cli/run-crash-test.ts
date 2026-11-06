import "dotenv/config";
import { parseArgs } from "node:util";
import { privateKeyToAccount } from "viem/accounts";
import { RunCrashTest } from "../../application/run-crash-test.js";
import { HAND_WRITTEN_CASES } from "../../catalog/hand-written-cases.js";
import { loadCatalog } from "../../infrastructure/persistence/json-catalog.js";
import { TelegraphMarket } from "../../infrastructure/telegraph/telegraph-market.js";
import { roundRepository, timestampedRoundId } from "./paths.js";

// Usage: npm run crash-test -- --round round-003 --budget 3 --catalog data/catalogs/js-mutants.json --reviewers 7310045,5530
const { values: options } = parseArgs({
  options: {
    round: { type: "string", default: timestampedRoundId(new Date()) },
    budget: { type: "string", default: "2" },
    catalog: { type: "string" },
    reviewers: { type: "string" },
  },
});

const privateKey = process.env.TESTNET_PRIVATE_KEY as `0x${string}` | undefined;
if (!privateKey) throw new Error("TESTNET_PRIVATE_KEY is missing from .env");

const cases = options.catalog ? await loadCatalog(options.catalog) : HAND_WRITTEN_CASES;
const budgetUsdc = Number(options.budget);
const market = new TelegraphMarket({
  nodeUrl: "https://devnode.telegraphprotocol.com",
  account: privateKeyToAccount(privateKey),
  maxPerPurchaseMicroUsdc: 20_000,
});

console.log(`Round ${options.round}: ${cases.length} cases, budget $${budgetUsdc}`);
const round = await new RunCrashTest(market, roundRepository()).execute(
  {
    roundId: options.round,
    cases,
    budgetMicroUsdc: budgetUsdc * 1_000_000,
    parallelism: 4,
    onlyReviewers: options.reviewers?.split(","),
  },
  (review, remaining) => {
    const outcome = review.kind === "delivered" ? (review.verdict ?? "no verdict") : `FAILED (${review.reason.slice(0, 80)})`;
    console.log(`[${remaining} left] ${review.reviewerId.padEnd(11)} ${review.caseId.padEnd(44)} ${outcome}`);
  },
);
console.log(`Done. Spent: $${(round.spentMicroUsdc / 1_000_000).toFixed(2)}. Pending: ${round.pending().length}`);
