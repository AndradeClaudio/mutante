export type DefectCategory =
  | "authorization"
  | "injection"
  | "boundary"
  | "inverted-comparison"
  | "logic"
  | "missing-validation"
  | "arithmetic"
  | "constant";

/** What a competent reviewer should say about a sample. */
export type AnswerKey = PlantedBug | CorrectCode | AnnulledCase;

export interface PlantedBug {
  readonly kind: "planted-bug";
  readonly category: DefectCategory;
  readonly description: string;
  /** Patterns showing the reviewer pointed at the right defect, not just "something is wrong". */
  readonly clues: readonly RegExp[];
}

export interface CorrectCode {
  readonly kind: "correct-code";
}

/**
 * A case that no longer counts, like an annulled exam question: it turned out that the
 * contract allowed more than one reading, so no answer can be held against the reviewer.
 */
export interface AnnulledCase {
  readonly kind: "annulled";
  readonly reason: string;
}

export function plantedBug(category: DefectCategory, description: string, clues: readonly string[]): PlantedBug {
  if (clues.length === 0) throw new Error("A planted bug needs at least one clue for grading.");
  return { kind: "planted-bug", category, description, clues: clues.map((clue) => new RegExp(clue, "i")) };
}

export const correctCode: CorrectCode = { kind: "correct-code" };

export function annulledCase(reason: string): AnnulledCase {
  if (reason.trim().length === 0) throw new Error("Annulling a case requires a reason.");
  return { kind: "annulled", reason };
}
