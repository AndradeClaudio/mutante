import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { parseArgs } from "node:util";
import { BuildEvaluationMaterial } from "../../application/build-evaluation-material.js";
import type { PreferencePair } from "../../domain/evaluation/preference-pair.js";
import { DEFAULT_OPERATORS } from "../../domain/mutation/operators.js";
import { toEvalPoolLine } from "../../infrastructure/evaluation/evalpool-client.js";
import { loadEvaluationOriginals } from "../../infrastructure/evaluation/evaluation-originals-file.js";
import { QuickJsContractChecker } from "../../infrastructure/sandbox/quickjs-contract-checker.js";

// Usage: npm run evaluation:build -- [--originals evaluators/private/originals.json] [--out evaluators/private/code-review.ndjson]
// Builds PRIVATE evaluation material for CODE_REVIEW_GENERAL. Nothing is sent anywhere.
const { values: options } = parseArgs({
  options: {
    originals: { type: "string", default: "evaluators/private/originals.json" },
    out: { type: "string", default: "evaluators/private/code-review.ndjson" },
    intent: { type: "string", default: "CODE_REVIEW_GENERAL" },
  },
});

const originals = await loadEvaluationOriginals(options.originals);
const material = await new BuildEvaluationMaterial(DEFAULT_OPERATORS, new QuickJsContractChecker()).execute(originals);
const provenance = { sourceKind: "synthetic", sourceUrl: "https://github.com/AndradeClaudio/mutante/tree/main/evaluators" };

await mkdir(dirname(options.out), { recursive: true });
await writeFile(options.out, material.pairs.map((pair) => toEvalPoolLine(pair, options.intent, provenance)).join("\n") + "\n");

console.log(`${material.pairs.length} pairs from ${originals.length} originals → ${options.out}`);
console.log(`  planted bugs: ${material.pairs.length - material.correctSamples}, correct samples: ${material.correctSamples}`);
console.log(`  by operator: ${JSON.stringify(material.byOperator)}`);
const [closest, a, b] = mostSimilarQuestions(material.pairs);
console.log(`  most similar pair of questions: ${Math.round(closest * 100)}% (${a} vs ${b}); the pool rejects 85% or more\n`);
for (const pair of material.pairs.slice(0, 3)) {
  console.log(`--- ${pair.caseId}\nQUESTION:\n${pair.question}\nPREFERRED: ${pair.preferred}\nREJECTED:  ${pair.rejected}\n`);
}

/** Highest normalized edit similarity between any two questions: a local estimate of the pool's near-duplicate check. */
function mostSimilarQuestions(pairs: readonly PreferencePair[]): [number, string, string] {
  let best: [number, string, string] = [0, "", ""];
  for (let i = 0; i < pairs.length; i++) {
    for (let j = i + 1; j < pairs.length; j++) {
      const similarity = editSimilarity(pairs[i]!.question, pairs[j]!.question);
      if (similarity > best[0]) best = [similarity, pairs[i]!.caseId, pairs[j]!.caseId];
    }
  }
  return best;
}

function editSimilarity(a: string, b: string): number {
  let previous = Array.from({ length: b.length + 1 }, (_, k) => k);
  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    for (let j = 1; j <= b.length; j++) {
      current[j] = Math.min(previous[j]! + 1, current[j - 1]! + 1, previous[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    previous = current;
  }
  return 1 - previous[b.length]! / Math.max(a.length, b.length);
}
