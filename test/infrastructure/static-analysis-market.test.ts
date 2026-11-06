import { describe, expect, it } from "vitest";
import { correctCode, plantedBug } from "../../src/domain/answer-key.js";
import { createTestCase, handWritten } from "../../src/domain/test-case.js";
import { StaticAnalysisMarket } from "../../src/infrastructure/static-analysis/static-analysis-market.js";

const market = new StaticAnalysisMarket();
const reviewer = { id: "eslint-recommended", name: "ESLint" };
const sample = (code: string, language = "javascript") =>
  createTestCase({ id: "sample", language, code, answerKey: correctCode, origin: handWritten });

describe("StaticAnalysisMarket", () => {
  it("blocks code with a constant condition", async () => {
    const review = await market.buyReview(reviewer, sample("function f(x) {\n  if (x || true) return 1;\n  return 0;\n}\n"));
    expect(review).toMatchObject({ kind: "delivered", verdict: "Request changes" });
  });

  it("does not hold an unused function against a sample, since every sample is a lone function", async () => {
    const review = await market.buyReview(reviewer, sample("function canVote(age) {\n  return age >= 18;\n}\n"));
    expect(review).toMatchObject({ kind: "delivered", verdict: "Approve", findings: [] });
  });

  it("records other languages as failures instead of approving them", async () => {
    const pythonBug = createTestCase({
      id: "py",
      language: "python",
      code: "x = 1 or True",
      answerKey: plantedBug("logic", "d", ["or True"]),
      origin: handWritten,
    });
    expect(await market.buyReview(reviewer, pythonBug)).toMatchObject({ kind: "failed" });
  });
});
