import "dotenv/config";
import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { join } from "node:path";
import { privateKeyToAccount } from "viem/accounts";
import { CrashTestOwnCode } from "../../application/crash-test-own-code.js";
import { RunCrashTest } from "../../application/run-crash-test.js";
import { TrialGate } from "../../application/trial-gate.js";
import { gradeReview } from "../../domain/grading.js";
import { DEFAULT_OPERATORS } from "../../domain/mutation/operators.js";
import type { RoundSnapshot } from "../../domain/round.js";
import { buildScoreboard } from "../../domain/scoreboard.js";
import { RejectedSubmission, Submission } from "../../domain/submission.js";
import { JsonRoundRepository } from "../../infrastructure/persistence/json-round-repository.js";
import { IsolatedContractChecker } from "../../infrastructure/sandbox/isolated-contract-checker.js";
import { JavaScriptAllowList } from "../../infrastructure/sandbox/javascript-allow-list.js";
import { TelegraphMarket } from "../../infrastructure/telegraph/telegraph-market.js";

// Web version of `npm run try`, for judges: paste a function and its tests, Mutante plants and proves bugs,
// buys reviews with the server's testnet wallet, and shows who caught what. Configuration is in .env.example.
const settings = {
  port: Number(process.env.PORT ?? 8080),
  dataDir: process.env.DATA_DIR ?? "data/web",
  trustProxy: process.env.TRUST_PROXY === "1",
  reviewers: (process.env.REVIEWERS ?? "7310045,5530,20260828,auto-routed").split(","),
  mutantsPerRun: 4,
};
const privateKey = process.env.TESTNET_PRIVATE_KEY as `0x${string}` | undefined;
if (!privateKey) throw new Error("TESTNET_PRIVATE_KEY is missing.");

const usdc = (name: string, fallback: number) => Math.round(Number(process.env[name] ?? fallback) * 1_000_000);
const budgetPerRunMicroUsdc = usdc("BUDGET_PER_RUN_USDC", 0.25);
const gate = new TrialGate({
  accessCodes: (process.env.ACCESS_CODES ?? "").split(",").map((c) => c.trim()).filter((c) => c.length >= 8),
  runsPerCodePerHour: Number(process.env.RUNS_PER_CODE_PER_HOUR ?? 3),
  budgetPerRunMicroUsdc,
  dailyCapMicroUsdc: usdc("DAILY_CAP_USDC", 2),
  failedAttemptsPerHour: Number(process.env.FAILED_ATTEMPTS_PER_HOUR ?? 10),
});
const rules = new JavaScriptAllowList();
const checker = new IsolatedContractChecker();
const repository = new JsonRoundRepository(join(settings.dataDir, "rounds"), join(settings.dataDir, "history"));
const market = new TelegraphMarket({
  nodeUrl: "https://devnode.telegraphprotocol.com",
  account: privateKeyToAccount(privateKey),
  maxPerPurchaseMicroUsdc: 20_000,
});
const crashTest = new CrashTestOwnCode(DEFAULT_OPERATORS, checker, new RunCrashTest(market, repository));

interface RunState {
  status: "running" | "done" | "failed";
  startedAt: number;
  progress: { reviewer: string; caseId: string; outcome: string }[];
  result?: ReturnType<typeof resultOf>;
  error?: string;
}
const runs = new Map<string, RunState>();
const RUN_RETENTION_MS = 24 * 60 * 60 * 1000;

const PUBLIC_FILES: Record<string, [string, string]> = {
  "/": ["index.html", "text/html; charset=utf-8"],
  "/app.js": ["app.js", "text/javascript; charset=utf-8"],
  "/styles.css": ["styles.css", "text/css; charset=utf-8"],
};
const publicDir = new URL("./public/", import.meta.url);
const SECURITY_HEADERS = {
  "Content-Security-Policy": "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  "Cross-Origin-Opener-Policy": "same-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
};
const BODY_LIMIT_BYTES = 16 * 1024;

createServer((request, response) => {
  handle(request, response).catch((error) => {
    log("error", { message: error instanceof Error ? error.message : String(error) });
    if (!response.headersSent) send(response, 500, { error: "Unexpected error." });
  });
}).listen(settings.port, () => log("listening", { port: settings.port }));

async function handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
  const url = new URL(request.url ?? "/", "http://localhost");
  if (request.method === "GET" && PUBLIC_FILES[url.pathname]) {
    const [file, type] = PUBLIC_FILES[url.pathname]!;
    response.writeHead(200, { ...SECURITY_HEADERS, "Content-Type": type, "Cache-Control": "no-cache" });
    response.end(await readFile(new URL(file, publicDir)));
    return;
  }
  if (request.method === "POST" && url.pathname === "/api/runs") return startRun(request, response);
  const runMatch = /^\/api\/runs\/([0-9a-f-]{36})$/.exec(url.pathname);
  if (request.method === "GET" && runMatch) {
    const run = runs.get(runMatch[1]!);
    return run ? send(response, 200, run) : send(response, 404, { error: "Unknown run." });
  }
  if (request.method === "GET" && url.pathname === "/healthz") return send(response, 200, { ok: true });
  send(response, 404, { error: "Not found." });
}

async function startRun(request: IncomingMessage, response: ServerResponse): Promise<void> {
  if (!(request.headers["content-type"] ?? "").startsWith("application/json")) {
    return send(response, 415, { error: "Send JSON." });
  }
  const body = await readBody(request);
  if (body === null) return send(response, 413, { error: `The request is larger than ${BODY_LIMIT_BYTES / 1024} KB.` });
  let input: { accessCode?: unknown; code?: unknown; tests?: unknown };
  try {
    input = JSON.parse(body);
  } catch {
    return send(response, 400, { error: "The request is not valid JSON." });
  }
  if (typeof input.accessCode !== "string" || typeof input.code !== "string" || typeof input.tests !== "string") {
    return send(response, 400, { error: "Send accessCode, code and tests as text." });
  }

  // Layer 4 first: without a valid access code, nothing else about the request is looked at.
  const address = clientAddress(request);
  const recognition = gate.recognize(input.accessCode, address);
  if (!recognition.recognized) {
    log("refused", { address: hashed(address), reason: recognition.reason });
    return send(response, recognition.status, { error: recognition.reason });
  }

  // Layer 1: only the accepted shape of code gets any further. A refused sample does not use up a run.
  let submission: Submission;
  try {
    submission = Submission.accept(input.code, input.tests, rules);
  } catch (error) {
    if (error instanceof RejectedSubmission) return send(response, 422, { error: "Your code was refused.", problems: error.problems });
    throw error;
  }

  // Layer 4 again: rate limits and spending limits.
  const admission = gate.admit(input.accessCode, address);
  if (!admission.admitted) {
    log("refused", { address: hashed(address), reason: admission.reason });
    return send(response, admission.status, { error: admission.reason });
  }

  const id = randomUUID();
  const state: RunState = { status: "running", startedAt: Date.now(), progress: [] };
  runs.set(id, state);
  forgetOldRuns();
  log("run-started", { run: id, code: admission.ticket.codeLabel, address: hashed(address), sample: hashed(submission.code) });
  send(response, 202, { runId: id });

  const originalId = `web-${submission.functionName.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 30)}`;
  try {
    const result = await crashTest.execute(
      {
        roundId: `web-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-")}-${id.slice(0, 8)}`,
        original: { id: originalId, language: "javascript", code: submission.code, tests: submission.tests },
        maxMutants: settings.mutantsPerRun,
        budgetMicroUsdc: budgetPerRunMicroUsdc,
        onlyReviewers: settings.reviewers,
      },
      (review, remaining) => {
        state.progress.push({
          reviewer: review.reviewerId,
          caseId: review.caseId,
          outcome: review.kind === "delivered" ? (review.verdict ?? "no verdict") : "failed",
        });
      },
    );
    const snapshot = result.round.toSnapshot();
    state.result = resultOf(snapshot, result.provenMutants);
    state.status = "done";
    admission.ticket.close(result.round.spentMicroUsdc);
    log("run-done", { run: id, spentMicroUsdc: result.round.spentMicroUsdc });
  } catch (error) {
    state.status = "failed";
    state.error = error instanceof Error ? error.message : String(error);
    admission.ticket.close(0);
    log("run-failed", { run: id, message: state.error });
  }
}

/** What the page shows: every case with each reviewer's grade, answer and payment, plus the scoreboard. */
function resultOf(round: RoundSnapshot, provenMutants: number) {
  const names = new Map(round.reviewers.map((r) => [r.id, r.name]));
  return {
    provenMutants,
    spentUsdc: round.reviews.reduce((sum, r) => sum + (r.kind === "delivered" ? (r.receipt?.amountMicroUsdc ?? 0) : 0), 0) / 1_000_000,
    reviewers: round.reviewers.map((r) => ({ id: r.id, name: r.name })),
    cases: round.cases.map((testCase) => ({
      id: testCase.id,
      code: testCase.code.text,
      planted: testCase.answerKey.kind === "planted-bug" ? testCase.answerKey.description : null,
      answers: round.reviewers.map((reviewer) => {
        const review = round.reviews.find((r) => r.reviewerId === reviewer.id && r.caseId === testCase.id);
        if (!review) return { reviewer: reviewer.id, grade: "not bought", verdict: null, text: "", tx: null, servedBy: null };
        return {
          reviewer: reviewer.id,
          grade: gradeReview(review, testCase.answerKey),
          verdict: review.kind === "delivered" ? review.verdict : null,
          text: (review.kind === "delivered" ? [review.summary, ...review.findings].join(" ") : review.reason).slice(0, 700),
          tx: review.kind === "delivered" ? (review.receipt?.transaction ?? null) : null,
          servedBy: review.kind === "delivered" ? (review.servedBy?.name ?? null) : null,
        };
      }),
    })),
    scoreboard: buildScoreboard(round).map((row) => ({
      reviewer: row.reviewerId,
      name: names.get(row.reviewerId) ?? row.name,
      explained: row.explainedRate,
      counted: row.detectionRate,
      falseAlarms: row.falseAlarmRate,
      costPerCatchUsdc: row.costPerCatchMicroUsdc === null ? null : row.costPerCatchMicroUsdc / 1_000_000,
    })),
  };
}

function readBody(request: IncomingMessage): Promise<string | null> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    let tooLarge = false;
    request.on("data", (chunk: Buffer) => {
      size += chunk.length;
      // Past the limit the rest is read and dropped, so the visitor still gets a clear 413.
      if (size > BODY_LIMIT_BYTES) tooLarge = true;
      if (!tooLarge) chunks.push(chunk);
    });
    request.on("end", () => resolve(tooLarge ? null : Buffer.concat(chunks).toString("utf8")));
    request.on("error", reject);
  });
}

function send(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { ...SECURITY_HEADERS, "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  response.end(JSON.stringify(body));
}

function clientAddress(request: IncomingMessage): string {
  const forwarded = settings.trustProxy ? String(request.headers["x-forwarded-for"] ?? "").split(",")[0]!.trim() : "";
  return forwarded || request.socket.remoteAddress || "unknown";
}

function forgetOldRuns(): void {
  const cutoff = Date.now() - RUN_RETENTION_MS;
  for (const [id, run] of runs) if (run.startedAt < cutoff) runs.delete(id);
}

/** Addresses and code are logged only as short hashes: enough to spot abuse, nothing personal or private. */
function hashed(text: string): string {
  return createHash("sha256").update(text).digest("hex").slice(0, 10);
}

function log(event: string, details: Record<string, unknown>): void {
  console.log(JSON.stringify({ at: new Date().toISOString(), event, ...details }));
}
