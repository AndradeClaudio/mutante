import { readFile } from "node:fs/promises";
import type { EvaluationOriginal } from "../../application/build-evaluation-material.js";

/** JSON shape of a private originals file: `[{ "id", "code", "checks": ["f(1) === 2", …] }]`. */
interface OriginalDocument {
  id: string;
  code: string;
  checks: string[];
}

export async function loadEvaluationOriginals(path: string): Promise<EvaluationOriginal[]> {
  const documents = JSON.parse(await readFile(path, "utf8")) as OriginalDocument[];
  return documents.map((doc) => {
    if (doc.checks.length === 0) throw new Error(`Original ${doc.id} has no checks.`);
    return {
      original: {
        id: doc.id,
        language: "javascript",
        code: doc.code,
        // Each check is its own assertion, with a readable message, so a failure says which check broke.
        tests: doc.checks.map(asAssertion).join("\n"),
      },
      checks: doc.checks.map(readable),
    };
  });
}

// A check is a boolean expression, or "throws: <call>" for a call the contract says must be rejected.
const THROWS = /^throws:\s*(.+)$/;

function asAssertion(check: string): string {
  const call = THROWS.exec(check)?.[1];
  const condition = call ? `(() => { try { ${call}; return false; } catch { return true; } })()` : check;
  return `assert(${condition}, ${JSON.stringify(readable(check))});`;
}

function readable(check: string): string {
  const call = THROWS.exec(check)?.[1];
  return call ? `${call} throws an error` : check;
}
