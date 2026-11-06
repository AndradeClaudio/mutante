import type { RoundSnapshot } from "../../domain/round.js";
import { buildScoreboard, type ScoreboardRow } from "../../domain/scoreboard.js";

/** Prints a round's scoreboard, cheapest correct answer first in spirit: the price columns lead. */
export function printScoreboard(snapshot: RoundSnapshot): void {
  console.log(`Scoreboard for ${snapshot.id} (${snapshot.reviews.length} reviews, ${snapshot.cases.length} cases)\n`);
  console.log("$/caught  $/explained  detected  explained  false-alarm  no-verdict  latency   reviewer");
  for (const row of buildScoreboard(snapshot)) {
    console.log(
      `  ${usd(row.costPerCatchMicroUsdc)}      ${usd(row.costPerExplainedMicroUsdc)}      ${percent(row.detectionRate)}       ${percent(row.explainedRate)}        ${percent(row.falseAlarmRate)}         ${String(noVerdict(row)).padStart(2)}     ${latency(row)}    ${row.reviewerId} ${row.name}`,
    );
  }
  console.log('\n$/caught: everything paid to the reviewer ÷ planted bugs it blocked and named ("-" = none caught).');
}

function percent(x: number): string {
  return `${Math.round(x * 100)}%`.padStart(4);
}

function usd(microUsdc: number | null): string {
  return microUsdc === null ? "     -" : `$${(microUsdc / 1_000_000).toFixed(3)}`.padStart(6);
}

function noVerdict(row: ScoreboardRow): number {
  return row.grades["no-verdict"] + row.grades["explained-without-verdict"];
}

function latency(row: ScoreboardRow): string {
  return row.medianLatencyMs === null ? "    -" : `${(row.medianLatencyMs / 1000).toFixed(1)}s`.padStart(5);
}
