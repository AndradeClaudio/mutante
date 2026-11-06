import { describe, expect, it } from "vitest";
import { CrashTestOwnCode } from "../../src/application/crash-test-own-code.js";
import { RunCrashTest } from "../../src/application/run-crash-test.js";
import { DEFAULT_OPERATORS } from "../../src/domain/mutation/operators.js";
import type { ReviewMarket, RoundRepository } from "../../src/domain/ports.js";
import type { Review } from "../../src/domain/review.js";
import type { RoundSnapshot } from "../../src/domain/round.js";
import { JavaScriptContractChecker } from "../../src/infrastructure/sandbox/javascript-contract-checker.js";

const shipping = {
  id: "free-shipping",
  language: "javascript" as const,
  code: "// Orders of $50 or more ship free; below that, shipping costs $5.\nfunction shippingFee(orderTotal) {\n  return orderTotal >= 50 ? 0 : 5;\n}\n",
  tests: "assert(shippingFee(50) === 0); assert(shippingFee(49.99) === 5); assert(shippingFee(120) === 0); assert(shippingFee(0) === 5);",
};

/** A reviewer that blocks everything, paid one cent per call. */
const blocksEverything: ReviewMarket = {
  intent: "TEST",
  estimatedPriceMicroUsdc: 10_000,
  listReviewers: async () => [{ id: "paranoid", name: "Blocks everything" }],
  buyReview: async (reviewer, testCase): Promise<Review> => ({
    kind: "delivered",
    reviewerId: reviewer.id,
    caseId: testCase.id,
    verdict: "Request changes",
    verdictRejectedByNetwork: false,
    findings: [],
    summary: "",
    latencyMs: 1,
    receipt: { hash: "0x", transaction: null, amountMicroUsdc: 10_000, recordedMiner: reviewer.id },
    rawResponse: "{}",
  }),
};

function inMemoryRepository(): RoundRepository {
  const rounds = new Map<string, RoundSnapshot>();
  return {
    save: async (round) => void rounds.set(round.id, round),
    find: async (id) => rounds.get(id) ?? null,
    latest: async () => null,
    archive: async () => "memory",
  };
}

function useCase() {
  return new CrashTestOwnCode(DEFAULT_OPERATORS, new JavaScriptContractChecker(), new RunCrashTest(blocksEverything, inMemoryRepository()));
}

describe("CrashTestOwnCode", () => {
  it("plants proven bugs in the user's own function and buys a review of each, plus the correct original", async () => {
    const { round, provenMutants } = await useCase().execute({ roundId: "try", original: shipping, maxMutants: 3, budgetMicroUsdc: 1_000_000 });
    const cases = round.toSnapshot().cases;
    expect(provenMutants).toBeGreaterThan(3);
    expect(cases).toHaveLength(4);
    expect(cases[0]).toMatchObject({ id: "free-shipping-correct", answerKey: { kind: "correct-code" } });
    expect(round.toSnapshot().reviews).toHaveLength(4);
  });

  it("spreads a small budget over different kinds of bug", async () => {
    const { round } = await useCase().execute({ roundId: "try", original: shipping, maxMutants: 3, budgetMicroUsdc: 1_000_000 });
    const operators = round.cases.flatMap((c) => (c.origin.kind === "mutant" ? [c.origin.operator] : []));
    expect(new Set(operators).size).toBe(3);
  });

  it("refuses tests that no mutant can break, since then no bug is proven", async () => {
    const weakTests = { ...shipping, tests: "assert(typeof shippingFee === 'function');" };
    await expect(useCase().execute({ roundId: "try", original: weakTests, maxMutants: 3, budgetMicroUsdc: 1_000_000 })).rejects.toThrow(
      /No mutant broke your tests/,
    );
  });

  it("refuses an original that fails its own tests", async () => {
    const wrong = { ...shipping, tests: "assert(shippingFee(50) === 5);" };
    await expect(useCase().execute({ roundId: "try", original: wrong, maxMutants: 3, budgetMicroUsdc: 1_000_000 })).rejects.toThrow(
      /fails its own tests/,
    );
  });
});
