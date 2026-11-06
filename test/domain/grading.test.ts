import { describe, expect, it } from "vitest";
import { correctCode, plantedBug } from "../../src/domain/answer-key.js";
import { gradeReview } from "../../src/domain/grading.js";
import type { DeliveredReview, Verdict } from "../../src/domain/review.js";

const bug = plantedBug("authorization", "or True", ["or True"]);

function delivered(verdict: Verdict | null, findings: string[] = []): DeliveredReview {
  return {
    kind: "delivered",
    reviewerId: "r1",
    caseId: "c1",
    verdict,
    verdictRejectedByNetwork: verdict === null,
    findings,
    summary: "",
    latencyMs: 100,
    receipt: null,
    rawResponse: "{}",
  };
}

describe("gradeReview", () => {
  it("gives full credit when the reviewer blocks the code and names the planted bug", () => {
    expect(gradeReview(delivered("Request changes", ["the `or True` makes it always pass"]), bug)).toBe("caught");
  });

  it("separates a block without the right reason, which may be luck", () => {
    expect(gradeReview(delivered("Request changes", ["add type hints"]), bug)).toBe("blocked-without-reason");
  });

  it("marks approving sabotaged code as missed", () => {
    expect(gradeReview(delivered("Approve"), bug)).toBe("missed");
  });

  it("marks blocking correct code as a false alarm", () => {
    expect(gradeReview(delivered("Request changes"), correctCode)).toBe("false-alarm");
  });

  it("accepts a comment without a block on correct code", () => {
    expect(gradeReview(delivered("Comment"), correctCode)).toBe("correctly-approved");
  });

  it("credits a reviewer that named the bug even when the network lost the verdict", () => {
    expect(gradeReview(delivered(null, ["`or True` bypasses the check"]), bug)).toBe("explained-without-verdict");
  });

  it("tells an answer without a verdict apart from a failure", () => {
    expect(gradeReview(delivered(null), bug)).toBe("no-verdict");
    expect(
      gradeReview({ kind: "failed", reviewerId: "r1", caseId: "c1", reason: "503", latencyMs: 5, receipt: null }, bug),
    ).toBe("failed");
  });
});
