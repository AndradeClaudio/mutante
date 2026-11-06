// Proof of concept kept as the record of the first purchase: buys ONE code review from one miner on the
// Telegraph testnet, paying through x402, and appends the answer and receipt to data/receipts.jsonl.
// The crash test itself goes through src/infrastructure/telegraph/telegraph-market.ts.
// Usage: node scripts/request-review.mjs <minerId> <codeFile>
import "dotenv/config";
import { appendFileSync, readFileSync } from "node:fs";
import { privateKeyToAccount } from "viem/accounts";
import { decodePaymentResponseHeader, wrapFetchWithPaymentFromConfig } from "@x402/fetch";
import { ExactEvmScheme } from "@x402/evm";

const TELEGRAPH_ASK = "https://devnode.telegraphprotocol.com/engine/v1/ask";
const SEPOLIA = "eip155:11155111";
const TEST_USDC = "0xcc194e1a843B658526D0D5C431f670028582Ae17";
const MAX_PER_QUESTION_MICRO_USDC = "20000"; // $0.02: refuses to pay more than this

const [minerId, codeFile] = process.argv.slice(2);
if (!minerId || !codeFile) {
  console.error("Usage: node scripts/request-review.mjs <minerId> <codeFile>");
  process.exit(1);
}
const code = readFileSync(codeFile, "utf8");
if (Buffer.byteLength(code) > 256) throw new Error("The intent accepts at most 256 bytes of on-chain code.");

const account = privateKeyToAccount(process.env.TESTNET_PRIVATE_KEY);
const payingFetch = wrapFetchWithPaymentFromConfig(fetch, {
  schemes: [{ network: SEPOLIA, client: new ExactEvmScheme(account) }],
  spendControls: {
    allowedAssets: [{ network: SEPOLIA, asset: TEST_USDC, maxAmountPerPayment: MAX_PER_QUESTION_MICRO_USDC }],
  },
  paymentRequirementsSelector: (_version, options) => options.find((o) => o.scheme === "exact"),
});

const start = Date.now();
const response = await payingFetch(`${TELEGRAPH_ASK}/${minerId}`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ intent: "CODE_REVIEW_GENERAL", params: { code } }),
});
const latencyMs = Date.now() - start;
const body = await response.text();

const receiptHeader = response.headers.get("x-telegraph-receipt");
const receipt = receiptHeader ? JSON.parse(Buffer.from(receiptHeader, "base64").toString("utf8")) : null;
const paymentHeader = response.headers.get("payment-response");
const payment = paymentHeader ? decodePaymentResponseHeader(paymentHeader) : null;

const entry = { at: new Date().toISOString(), minerId, codeFile, status: response.status, latencyMs, receipt, payment, response: body };
appendFileSync("data/receipts.jsonl", JSON.stringify(entry) + "\n");
console.log(JSON.stringify(entry, null, 2));
