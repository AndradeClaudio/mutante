import { parseArgs } from "node:util";
import { RegradeRound } from "../../application/regrade-round.js";
import { loadCatalog } from "../../infrastructure/persistence/json-catalog.js";
import { DEFAULT_CATALOG, roundRepository } from "./paths.js";

// Usage: npm run regrade -- --round round-002 --catalog data/catalogs/js-mutants.json \
//          --annul "token-expired-correct=ambiguous contract"
const { values: options } = parseArgs({
  options: {
    round: { type: "string" },
    catalog: { type: "string", default: DEFAULT_CATALOG },
    annul: { type: "string", multiple: true, default: [] },
  },
});
if (!options.round) throw new Error("Pass --round.");

const annulments = options.annul.map((item) => {
  // Split on the first "=" only: the reason itself may quote code such as `<=`.
  const separator = item.indexOf("=");
  const caseId = item.slice(0, separator);
  const reason = item.slice(separator + 1);
  if (separator <= 0 || !reason) throw new Error(`Invalid annulment: "${item}" (use case=reason).`);
  return { caseId, reason };
});

const result = await new RegradeRound(roundRepository()).execute({
  roundId: options.round,
  revisedCatalog: await loadCatalog(options.catalog),
  annulments,
});
console.log(`Previous version kept at: ${result.archivedAt}`);
console.log(`Answer keys revised: ${result.revised.length}`);
console.log(`Kept (code changed in the catalog): ${result.keptBecauseCodeChanged.join(", ") || "none"}`);
console.log(`Annulled: ${result.annulled.join(", ") || "none"}`);
