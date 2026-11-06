import "dotenv/config";
import { readFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import { privateKeyToAccount } from "viem/accounts";
import { EvalPoolClient } from "../../infrastructure/evaluation/evalpool-client.js";

// Usage: npm run evaluation:submit -- [--file evaluators/private/code-review.ndjson] [--intent CODE_REVIEW_GENERAL]
// PUBLISHES the material to the Telegraph evaluation pool, signed by the testnet wallet in .env.
// Then lists how the node classified each row (eligible, near_duplicate, …).
const { values: options } = parseArgs({
  options: {
    file: { type: "string", default: "evaluators/private/code-review.ndjson" },
    intent: { type: "string", default: "CODE_REVIEW_GENERAL" },
  },
});

const privateKey = process.env.TESTNET_PRIVATE_KEY as `0x${string}` | undefined;
if (!privateKey) throw new Error("TESTNET_PRIVATE_KEY is missing from .env");
const client = new EvalPoolClient("https://devnode.telegraphprotocol.com", privateKeyToAccount(privateKey));

const ndjson = await readFile(options.file, "utf8");
console.log(`Submitting ${ndjson.trim().split("\n").length} rows to ${options.intent}…`);
const result = await client.submit(options.intent, ndjson);
console.log(`HTTP ${result.httpStatus}: ${result.body.slice(0, 600)}`);

const rows = await client.myRows(options.intent);
const byStatus: Record<string, number> = {};
for (const row of rows) {
  const key = row.reason_code ? `${row.status} (${row.reason_code})` : row.status;
  byStatus[key] = (byStatus[key] ?? 0) + 1;
}
console.log("Rows from this wallet, by status:", byStatus);
