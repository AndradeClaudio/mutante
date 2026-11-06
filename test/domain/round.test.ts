import { describe, expect, it } from "vitest";
import { correctCode, plantedBug } from "../../src/domain/answer-key.js";
import type { Review } from "../../src/domain/review.js";
import { Round } from "../../src/domain/round.js";
import { buildScoreboard } from "../../src/domain/scoreboard.js";
import { createTestCase, handWritten } from "../../src/domain/test-case.js";

const sabotaged = createTestCase({
  id: "sabotaged",
  language: "python",
  code: "x = 1 or True",
  answerKey: plantedBug("logic", "d", ["or True"]),
  origin: handWritten,
});
const correct = createTestCase({ id: "correct", language: "python", code: "x = 1", answerKey: correctCode, origin: handWritten });

function newRound(budget = 100_000) {
  return Round.start({
    id: "r",
    intent: "CODE_REVIEW_GENERAL",
    budgetMicroUsdc: budget,
    cases: [sabotaged, correct],
    reviewers: [
      { id: "good", name: "Good" },
      { id: "rubber-stamp", name: "Approves everything" },
    ],
    now: new Date("2026-11-06T00:00:00Z"),
  });
}

function review(reviewerId: string, caseId: string, verdict: "Approve" | "Request changes", finding = ""): Review {
  return {
    kind: "delivered",
    reviewerId,
    caseId,
    verdict,
    verdictRejectedByNetwork: false,
    findings: [finding],
    summary: "",
    latencyMs: 1000,
    receipt: { hash: `0x${reviewerId}${caseId}`, transaction: null, amountMicroUsdc: 10_000, recordedMiner: reviewerId },
    rawResponse: "{}",
  };
}

describe("Round", () => {
  it("rejects test cases larger than the on-chain limit", () => {
    expect(() =>
      createTestCase({ id: "big", language: "python", code: "x".repeat(257), answerKey: correctCode, origin: handWritten }),
    ).toThrow(/256/);
  });

  it("lists each reviewer × case pair as pending exactly once", () => {
    const round = newRound();
    expect(round.pending()).toHaveLength(4);
    round.record(review("good", "sabotaged", "Request changes"));
    expect(round.pending()).toHaveLength(3);
    expect(() => round.record(review("good", "sabotaged", "Approve"))).toThrow(/not pending/);
  });

  it("tracks the budget by the amounts on the receipts", () => {
    const round = newRound(15_000);
    expect(round.fitsBudget(10_000)).toBe(true);
    round.record(review("good", "sabotaged", "Request changes"));
    expect(round.fitsBudget(10_000)).toBe(false);
  });

  it("refuses reviews after it is closed", () => {
    const round = newRound();
    round.close(new Date());
    expect(() => round.record(review("good", "sabotaged", "Approve"))).toThrow(/closed/);
  });

  it("does not store the start parameters beyond the snapshot fields", () => {
    expect(Object.keys(newRound().toSnapshot())).not.toContain("now");
  });
});

describe("buildScoreboard", () => {
  it("ranks first whoever detects without false alarms, and exposes whoever approves everything", () => {
    const round = newRound();
    round.record(review("rubber-stamp", "sabotaged", "Approve"));
    round.record(review("rubber-stamp", "correct", "Approve"));
    round.record(review("good", "sabotaged", "Request changes", "`or True` is always true"));
    round.record(review("good", "correct", "Approve"));

    const [first, second] = buildScoreboard(round.toSnapshot());
    expect(first).toMatchObject({ reviewerId: "good", detectionRate: 1, falseAlarmRate: 0, spentMicroUsdc: 20_000 });
    expect(second).toMatchObject({ reviewerId: "rubber-stamp", detectionRate: 0 });
    expect(second!.grades.missed).toBe(1);
  });

  it("prices each reviewer per correct answer, not per call", () => {
    const round = newRound();
    round.record(review("good", "sabotaged", "Request changes", "`or True` is always true"));
    round.record(review("good", "correct", "Approve"));
    round.record(review("rubber-stamp", "sabotaged", "Approve"));
    round.record(review("rubber-stamp", "correct", "Approve"));

    const [good, rubberStamp] = buildScoreboard(round.toSnapshot());
    // Same price per call; the good reviewer paid 20,000 for one caught bug, the other bought none.
    expect(good).toMatchObject({ costPerCatchMicroUsdc: 20_000, costPerExplainedMicroUsdc: 20_000 });
    expect(rubberStamp).toMatchObject({ costPerCatchMicroUsdc: null });
  });

  it("regrades with a revised answer key, but keeps the old key when the code the reviewer saw changed", () => {
    const round = newRound();
    round.record(review("good", "sabotaged", "Request changes", "tautology: the condition is always truthy"));
    const betterClues = createTestCase({ ...sabotaged, code: sabotaged.code.text, answerKey: plantedBug("logic", "d", ["always truthy"]) });
    const otherCode = createTestCase({ ...correct, code: "x = 2" });

    const report = round.regrade([betterClues, otherCode]);

    expect(report).toEqual({ revised: ["sabotaged"], keptBecauseCodeChanged: ["correct"] });
    expect(buildScoreboard(round.toSnapshot()).find((r) => r.reviewerId === "good")?.grades.caught).toBe(1);
    expect(() => round.reviseAnswerKey(otherCode)).toThrow(/different code/);
  });

  it("leaves an annulled case out of detection and false alarms", () => {
    const round = newRound();
    round.record(review("good", "sabotaged", "Request changes", "or True bypasses everything"));
    round.record(review("good", "correct", "Request changes"));
    round.annulCase("correct", "ambiguous contract");
    const row = buildScoreboard(round.toSnapshot()).find((r) => r.reviewerId === "good")!;
    expect(row.falseAlarmRate).toBe(0);
    expect(row.grades.annulled).toBe(1);
    expect(row.detectionRate).toBe(1);
  });
});
