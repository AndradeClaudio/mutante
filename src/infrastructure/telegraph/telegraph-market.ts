import { wrapFetchWithPaymentFromConfig } from "@x402/fetch";
import { ExactEvmScheme } from "@x402/evm";
import type { PrivateKeyAccount } from "viem/accounts";
import type { ReviewMarket } from "../../domain/ports.js";
import { parseVerdict, type Receipt, type Review } from "../../domain/review.js";
import type { Reviewer } from "../../domain/round.js";
import type { TestCase } from "../../domain/test-case.js";

const SEPOLIA = "eip155:11155111";
const TEST_USDC = "0xcc194e1a843B658526D0D5C431f670028582Ae17";

/**
 * What a buyer gets by default: no miner named, the network's router picks one by its leaderboard.
 * Treated as one more reviewer, so the default path is graded like any miner.
 */
export const AUTO_ROUTED: Reviewer = { id: "auto-routed", name: "Telegraph auto-routing (no miner chosen)" };

export interface TelegraphSettings {
  readonly nodeUrl: string; // e.g. https://devnode.telegraphprotocol.com
  readonly account: PrivateKeyAccount;
  readonly maxPerPurchaseMicroUsdc: number;
}

/** Buys code reviews on the Telegraph network, paying through x402 (test USDC on Sepolia). */
export class TelegraphMarket implements ReviewMarket {
  readonly intent = "CODE_REVIEW_GENERAL";
  readonly estimatedPriceMicroUsdc = 10_000;
  private readonly payingFetch: typeof fetch;

  constructor(private readonly settings: TelegraphSettings) {
    this.payingFetch = wrapFetchWithPaymentFromConfig(fetch, {
      schemes: [{ network: SEPOLIA, client: new ExactEvmScheme(settings.account) }],
      spendControls: {
        allowedAssets: [{ network: SEPOLIA, asset: TEST_USDC, maxAmountPerPayment: String(settings.maxPerPurchaseMicroUsdc) }],
      },
      paymentRequirementsSelector: (_version, options) => options.find((o) => o.scheme === "exact") ?? options[0]!,
    });
  }

  async listReviewers(): Promise<Reviewer[]> {
    const response = await fetch(`${this.settings.nodeUrl}/engine/v1/intents/${this.intent}/miners`);
    if (!response.ok) throw new Error(`Could not list reviewers: HTTP ${response.status}`);
    const body = (await response.json()) as { miners: { id: string | number; name: string }[] };
    return [...body.miners.map((m) => ({ id: String(m.id), name: m.name })), AUTO_ROUTED];
  }

  async buyReview(reviewer: Reviewer, testCase: TestCase): Promise<Review> {
    const start = Date.now();
    const base = { reviewerId: reviewer.id, caseId: testCase.id };
    try {
      const askUrl =
        reviewer.id === AUTO_ROUTED.id ? `${this.settings.nodeUrl}/engine/v1/ask` : `${this.settings.nodeUrl}/engine/v1/ask/${reviewer.id}`;
      const response = await this.payingFetch(askUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ intent: this.intent, params: { code: testCase.code.text } }),
      });
      const latencyMs = Date.now() - start;
      const text = await response.text();
      const receipt = readReceipt(response.headers.get("x-telegraph-receipt"));

      if (!response.ok) {
        return { ...base, kind: "failed", reason: `HTTP ${response.status}: ${text.slice(0, 300)}`, latencyMs, receipt };
      }
      const answer = parseAnswer(text);
      return {
        ...base,
        kind: "delivered",
        verdict: parseVerdict(answer.result.verdict),
        verdictRejectedByNetwork: answer.fieldStatus.verdict === "rejected",
        findings: asTextList(answer.result.findings),
        summary: typeof answer.result.summary === "string" ? answer.result.summary : "",
        latencyMs,
        receipt,
        rawResponse: text,
        ...(reviewer.id === AUTO_ROUTED.id ? { servedBy: answer.servedBy } : {}),
      };
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      return { ...base, kind: "failed", reason, latencyMs: Date.now() - start, receipt: null };
    }
  }
}

function readReceipt(header: string | null): Receipt | null {
  if (!header) return null;
  const raw = JSON.parse(Buffer.from(header, "base64").toString("utf8")) as Record<string, unknown>;
  return {
    hash: String(raw.receipt_hash),
    transaction: typeof raw.tx_hash === "string" ? raw.tx_hash : null,
    amountMicroUsdc: Number(raw.amount_uusdc ?? 0),
    recordedMiner: String(raw.miner),
  };
}

interface ParsedAnswer {
  result: Record<string, unknown>;
  fieldStatus: Record<string, unknown>;
  servedBy: { minerId: string; name: string; routerReasoning: string };
}

/** The node answers `{result, field_status, miner_id, miner_name, reasoning}`; anything unparseable is an empty answer. */
function parseAnswer(text: string): ParsedAnswer {
  const asObject = (value: unknown) => (value && typeof value === "object" ? (value as Record<string, unknown>) : {});
  const asText = (value: unknown) => (value === undefined || value === null ? "" : String(value));
  try {
    const body = JSON.parse(text) as Record<string, unknown>;
    return {
      result: asObject(body.result),
      fieldStatus: asObject(body.field_status),
      servedBy: { minerId: asText(body.miner_id), name: asText(body.miner_name), routerReasoning: asText(body.reasoning) },
    };
  } catch {
    return { result: {}, fieldStatus: {}, servedBy: { minerId: "", name: "", routerReasoning: "" } };
  }
}

function asTextList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => (typeof item === "string" ? item : JSON.stringify(item)));
}
