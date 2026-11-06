import { parseArgs } from "node:util";
import { RunCrashTest } from "../../application/run-crash-test.js";
import { buildScoreboard } from "../../domain/scoreboard.js";
import { StaticAnalysisMarket } from "../../infrastructure/static-analysis/static-analysis-market.js";
import { roundRepository } from "./paths.js";

// Usage: npm run static-baseline -- [--from round-002]
// Runs ESLint and SonarJS on exactly the cases (and answer keys) a paid round used, as a baseline.
const { values: options } = parseArgs({ options: { from: { type: "string", default: "round-002" } } });

const repository = roundRepository();
const source = await repository.find(options.from);
if (!source) throw new Error(`Round ${options.from} not found.`);

const baselineId = `${source.id}-static-baseline`;
const round = await new RunCrashTest(new StaticAnalysisMarket(), repository).execute({
  roundId: baselineId,
  cases: source.cases,
  // Static analysis is free; the budget only has to be positive for the round to start.
  budgetMicroUsdc: 1,
  parallelism: 1,
});

const snapshot = round.toSnapshot();
const planted = snapshot.cases.filter((c) => c.answerKey.kind === "planted-bug").length;
const percent = (part: number, whole: number) => `${Math.round((100 * part) / whole)}%`;
console.log(`Static baseline ${baselineId}: same ${snapshot.cases.length} cases as ${source.id}\n`);
for (const row of buildScoreboard(snapshot)) {
  // Any reported issue counts as flagging the bug: a generous reading, so the baseline is an upper bound.
  const flagged = row.grades.caught + row.grades["blocked-without-reason"];
  console.log(`${row.name}`);
  console.log(`  flagged ${flagged}/${planted} planted bugs (${percent(flagged, planted)}), false alarms on correct code: ${percent(row.falseAlarmRate, 1)}`);
  const hits = snapshot.reviews.filter((r) => r.reviewerId === row.reviewerId && r.kind === "delivered" && r.verdict === "Request changes");
  for (const hit of hits) if (hit.kind === "delivered") console.log(`    ${hit.caseId.padEnd(40)} ${hit.findings.join("; ")}`);
}
