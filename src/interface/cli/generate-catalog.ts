import { GenerateCatalog } from "../../application/generate-catalog.js";
import { JAVASCRIPT_ORIGINALS } from "../../catalog/javascript-originals.js";
import { DEFAULT_OPERATORS } from "../../domain/mutation/operators.js";
import { saveCatalog } from "../../infrastructure/persistence/json-catalog.js";
import { QuickJsContractChecker } from "../../infrastructure/sandbox/quickjs-contract-checker.js";
import { DEFAULT_CATALOG } from "./paths.js";

// Usage: npm run generate-catalog -- [outputPath]
const destination = process.argv[2] ?? DEFAULT_CATALOG;

const catalog = await new GenerateCatalog(DEFAULT_OPERATORS, new QuickJsContractChecker()).execute(JAVASCRIPT_ORIGINALS);
await saveCatalog(destination, catalog.cases);

const planted = catalog.cases.filter((c) => c.answerKey.kind === "planted-bug").length;
console.log(`Catalog saved to ${destination}`);
console.log(
  `${JAVASCRIPT_ORIGINALS.length} originals → ${catalog.cases.length} cases (${planted} proven bugs + ${catalog.cases.length - planted} correct)\n`,
);
console.log("Accepted by operator:");
for (const [operator, n] of Object.entries(catalog.acceptedByOperator).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${String(n).padStart(4)}  ${operator}`);
}
console.log("\nDiscarded:");
for (const [reason, n] of Object.entries(catalog.discardedByReason)) console.log(`  ${String(n).padStart(4)}  ${reason}`);
