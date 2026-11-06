import { buildScoreboard } from "../../domain/scoreboard.js";
import { ROUNDS_FOLDER, roundRepository } from "./paths.js";

// Usage: npm run scoreboard -- [roundId]   (without an id, shows the latest round)
const repository = roundRepository();
const id = process.argv[2];
const round = id ? await repository.find(id) : await repository.latest();
if (!round) throw new Error(`No round found in ${ROUNDS_FOLDER}.`);

const percent = (x: number) => `${Math.round(x * 100)}%`.padStart(4);
console.log(`Scoreboard for ${round.id} (${round.reviews.length} reviews, ${round.cases.length} cases)\n`);
console.log("detected  explained  false-alarm  failed  no-verdict  latency   reviewer");
for (const row of buildScoreboard(round)) {
  const latency = row.medianLatencyMs === null ? "    -" : `${(row.medianLatencyMs / 1000).toFixed(1)}s`.padStart(5);
  const noVerdict = row.grades["no-verdict"] + row.grades["explained-without-verdict"];
  console.log(
    `  ${percent(row.detectionRate)}      ${percent(row.explainedRate)}        ${percent(row.falseAlarmRate)}      ${String(row.grades.failed).padStart(2)}       ${String(noVerdict).padStart(2)}      ${latency}    ${row.reviewerId} ${row.name}`,
  );
}
