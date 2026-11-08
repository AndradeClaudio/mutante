import { describe, expect, it } from "vitest";
import { JAVASCRIPT_ORIGINALS } from "../../src/catalog/javascript-originals.js";
import { gradeReview } from "../../src/domain/grading.js";
import { generateCases } from "../../src/domain/mutation/generate-cases.js";
import { DEFAULT_OPERATORS } from "../../src/domain/mutation/operators.js";
import type { OriginalCode } from "../../src/domain/mutation/original-code.js";
import type { DeliveredReview } from "../../src/domain/review.js";
import { QuickJsContractChecker } from "../../src/infrastructure/sandbox/quickjs-contract-checker.js";

const checker = new QuickJsContractChecker();
const canVote: OriginalCode = {
  id: "can-vote",
  language: "javascript",
  code: "// Voting is allowed at 18 or older.\nfunction canVote(age) {\n  return age >= 18;\n}\n",
  tests: "assert(canVote(18) === true); assert(canVote(17) === false);",
};

describe("mutation engine", () => {
  it("every original in the catalog honors its own contract", async () => {
    for (const original of JAVASCRIPT_ORIGINALS) {
      expect(await checker.honorsContract(original.code, original.tests), original.id).toBe(true);
    }
  });

  it("builds the correct case and only mutants that break the contract", async () => {
    const { cases } = await generateCases(canVote, DEFAULT_OPERATORS, checker);
    expect(cases[0]).toMatchObject({
      id: "can-vote-correct",
      answerKey: { kind: "correct-code" },
      origin: { kind: "original", originalId: "can-vote" },
    });
    const mutants = cases.slice(1);
    expect(mutants.map((c) => c.code.text)).toContain(canVote.code.replace(">=", ">"));
    for (const mutant of mutants) {
      expect(mutant.origin).toMatchObject({ kind: "mutant", originalId: "can-vote" });
      expect(await checker.honorsContract(mutant.code.text, canVote.tests)).toBe(false);
    }
  });

  it("drops an equivalent mutant, which does not change observable behavior", async () => {
    const clamp: OriginalCode = {
      id: "clamp",
      language: "javascript",
      code: "// Clamps n into [min, max].\nfunction clamp(n, min, max) {\n  if (n < min) return min;\n  return n;\n}\n",
      tests: "assert(clamp(-1, 0, 9) === 0); assert(clamp(0, 0, 9) === 0); assert(clamp(5, 0, 9) === 5);",
    };
    const { discarded } = await generateCases(clamp, DEFAULT_OPERATORS, checker);
    expect(discarded).toContainEqual({ operator: "boundary", reason: "equivalent" });
  });

  it("never sabotages the contract written in the comment", async () => {
    const { cases } = await generateCases(canVote, DEFAULT_OPERATORS, checker);
    for (const testCase of cases) expect(testCase.code.text).toContain("// Voting is allowed at 18 or older.");
  });

  it("gives the answer key clues that recognize a correct explanation of the bug", async () => {
    const { cases } = await generateCases(canVote, DEFAULT_OPERATORS, checker);
    const boundary = cases.find((c) => c.code.text.includes("age > 18"))!;
    const review: DeliveredReview = {
      kind: "delivered",
      reviewerId: "r",
      caseId: boundary.id,
      verdict: "Request changes",
      verdictRejectedByNetwork: false,
      findings: ["`age > 18` rejects someone who is exactly 18"],
      summary: "",
      latencyMs: 1,
      receipt: null,
      rawResponse: "{}",
    };
    expect(gradeReview(review, boundary.answerKey)).toBe("caught");
  });

  it("stops an infinite loop created by a mutant", async () => {
    expect(await checker.honorsContract("function f(){ for(;;){} }", "f();")).toBe(false);
  });
});
