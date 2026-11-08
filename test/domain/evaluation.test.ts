import { describe, expect, it } from "vitest";
import { BuildEvaluationMaterial } from "../../src/application/build-evaluation-material.js";
import { preferencePair } from "../../src/domain/evaluation/preference-pair.js";
import { pairForCorrectCode, pairForPlantedBug } from "../../src/domain/evaluation/reference-reviews.js";
import { DEFAULT_OPERATORS } from "../../src/domain/mutation/operators.js";
import { QuickJsContractChecker } from "../../src/infrastructure/sandbox/quickjs-contract-checker.js";

const original = "// Open from 9:00 until 17:00.\nfunction isOpen(h) {\n  return h >= 9 && h < 17;\n}\n";
const mutant = original.replace("h >= 9", "h > 9");

describe("evaluation material", () => {
  it("prefers the review that names the sabotaged line, its fix and a failing check", () => {
    const pair = pairForPlantedBug({ caseId: "c", originalCode: original, mutantCode: mutant, brokenCheck: "isOpen(9) === true", variant: 0 });
    expect(pair.question).toContain("h > 9");
    expect(pair.preferred).toContain("`return h > 9 && h < 17;` should be `return h >= 9 && h < 17;`");
    expect(pair.preferred).toContain("`isOpen(9) === true` fails");
    expect(pair.rejected).not.toContain("h > 9");
  });

  it("names a removed guard as a missing check", () => {
    const guarded = "// Rejects negatives.\nfunction f(x) {\n  if (x < 0) throw new Error(\"neg\");\n  return x;\n}\n";
    const unguarded = guarded.replace('  if (x < 0) throw new Error("neg");\n', "");
    const pair = pairForPlantedBug({ caseId: "g", originalCode: guarded, mutantCode: unguarded, brokenCheck: "f(-1) throws an error", variant: 1 });
    expect(pair.preferred).toContain('A required check is missing: `if (x < 0) throw new Error("neg");`');
  });

  it("prefers approving correct code over inventing a bug", () => {
    const pair = pairForCorrectCode({ caseId: "ok", code: original, passingCheck: "isOpen(9) === true", variant: 0 });
    expect(pair.preferred).toMatch(/^Approve\./);
    expect(pair.rejected).toMatch(/^Request changes\./);
  });

  it("refuses pairs the pool would reject", () => {
    expect(() => preferencePair({ caseId: "x", question: "short", preferred: "Approve. Fine.", rejected: "Request changes." })).toThrow(/question/);
    expect(() => preferencePair({ caseId: "x", question: "a long enough question", preferred: "same answer", rejected: "same answer" })).toThrow(/differ/);
  });

  it("builds one question per function, proving each planted bug with the check it breaks", async () => {
    const tests = 'assert(isOpen(9) === true, "isOpen(9) === true"); assert(isOpen(17) === false, "isOpen(17) === false");';
    const material = await new BuildEvaluationMaterial(DEFAULT_OPERATORS, new QuickJsContractChecker()).execute([
      { original: { id: "open", language: "javascript", code: original, tests }, checks: ["isOpen(9) === true", "isOpen(17) === false"] },
    ]);
    expect(material.pairs).toHaveLength(1);
    expect(material.pairs[0]!.preferred).toMatch(/the check `isOpen\((9|17)\) === (true|false)` fails/);
  });
});
