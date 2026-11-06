/**
 * One unit of evaluation material: a question, the review a competent reviewer should give, and a
 * worse review. Evaluators learn to rank answers from many such pairs.
 */
export interface PreferencePair {
  readonly caseId: string;
  readonly question: string;
  readonly preferred: string;
  readonly rejected: string;
}

// Limits the Telegraph evaluation pool enforces (characters after normalisation).
const QUESTION_LENGTH = { min: 16, max: 16_000 };
const ANSWER_LENGTH = { min: 8, max: 32_000 };

export function preferencePair(params: PreferencePair): PreferencePair {
  const { caseId, question, preferred, rejected } = params;
  within("question", question, QUESTION_LENGTH, caseId);
  within("preferred answer", preferred, ANSWER_LENGTH, caseId);
  within("rejected answer", rejected, ANSWER_LENGTH, caseId);
  if (preferred.trim() === rejected.trim()) throw new Error(`Pair ${caseId}: preferred and rejected answers must differ.`);
  return params;
}

function within(what: string, text: string, limits: { min: number; max: number }, caseId: string): void {
  const length = text.trim().length;
  if (length < limits.min || length > limits.max) {
    throw new Error(`Pair ${caseId}: ${what} has ${length} characters; allowed ${limits.min}–${limits.max}.`);
  }
}
