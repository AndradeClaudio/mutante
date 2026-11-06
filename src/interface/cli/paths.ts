import { JsonRoundRepository } from "../../infrastructure/persistence/json-round-repository.js";

export const ROUNDS_FOLDER = "data/rounds";
export const HISTORY_FOLDER = "data/history";
export const DEFAULT_CATALOG = "data/catalogs/js-mutants.json";
export const PUBLIC_FOLDER = "data/public";

export function roundRepository(): JsonRoundRepository {
  return new JsonRoundRepository(ROUNDS_FOLDER, HISTORY_FOLDER);
}

/** Same format as the round ids already published: round-001, round-002… */
export function timestampedRoundId(now: Date): string {
  return `round-${now.toISOString().slice(0, 16).replace(/[:T]/g, "-")}`;
}
