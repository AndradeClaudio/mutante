import { ROUNDS_FOLDER, roundRepository } from "./paths.js";
import { printScoreboard } from "./scoreboard-table.js";

// Usage: npm run scoreboard -- [roundId]   (without an id, shows the latest round)
const repository = roundRepository();
const id = process.argv[2];
const round = id ? await repository.find(id) : await repository.latest();
if (!round) throw new Error(`No round found in ${ROUNDS_FOLDER}.`);
printScoreboard(round);
