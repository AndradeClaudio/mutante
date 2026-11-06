import { preferencePair, type PreferencePair } from "./preference-pair.js";

/**
 * How a competent review of a sample reads, and how the usual failures read. The preferred review is
 * grounded in what the mutation engine proved: the exact line that changed and a check that now fails.
 * The rejected reviews mirror failure modes measured in the crash test: approving everything, blocking for
 * a generic reason without finding the bug, and raising an invented bug on correct code.
 */
const QUESTION_PREFIX = "Review this JavaScript against the contract in its first comment:\n\n";

const APPROVALS = [
  "Approve. The function does what its comment describes and the logic looks correct.",
  "Approve. No bugs found; the implementation matches the documented behavior.",
  "Approve. Clean and readable. Consider adding JSDoc types, but there is nothing to fix.",
];
const WRONG_REASONS = [
  "Request changes. The function does not validate its inputs: add type checks for every argument.",
  "Request changes. Use more descriptive variable names and add unit tests before merging.",
];
const INVENTED_BUGS = [
  "Request changes. The boundary comparison is off by one; it should be strict.",
  "Request changes. The condition is inverted relative to the comment, so the result is wrong for typical inputs.",
  "Request changes. The edge case named in the comment is not handled and returns the wrong value.",
];

export function questionAbout(code: string): string {
  return QUESTION_PREFIX + code.trimEnd();
}

/** A planted bug: the preferred review names the sabotaged line, its fix, and a check that fails. */
export function pairForPlantedBug(params: {
  caseId: string;
  originalCode: string;
  mutantCode: string;
  brokenCheck: string;
  /** Picks among the typical wrong reviews, so the material is not one repeated sentence. */
  variant: number;
}): PreferencePair {
  const wrong = [...APPROVALS, ...WRONG_REASONS];
  return preferencePair({
    caseId: params.caseId,
    question: questionAbout(params.mutantCode),
    preferred: `Request changes. ${whatChanged(params.originalCode, params.mutantCode)} As written, the function breaks its contract: the check \`${params.brokenCheck}\` fails.`,
    rejected: wrong[params.variant % wrong.length]!,
  });
}

/** Correct code: the preferred review approves and cites a check that holds; the rejected one invents a bug. */
export function pairForCorrectCode(params: { caseId: string; code: string; passingCheck: string; variant: number }): PreferencePair {
  return preferencePair({
    caseId: params.caseId,
    question: questionAbout(params.code),
    preferred: `Approve. The function does what its comment states; for example, \`${params.passingCheck}\` holds. No bugs found.`,
    rejected: INVENTED_BUGS[params.variant % INVENTED_BUGS.length]!,
  });
}

/** Describes the sabotage as a reviewer would: the line as written, and the line it should be. */
function whatChanged(originalCode: string, mutantCode: string): string {
  const original = originalCode.trimEnd().split("\n");
  const mutant = mutantCode.trimEnd().split("\n");
  if (mutant.length < original.length) {
    const removed = original.find((line, i) => line !== mutant[i])!;
    return `A required check is missing: \`${removed.trim()}\`.`;
  }
  const i = mutant.findIndex((line, k) => line !== original[k]);
  return `The line \`${mutant[i]!.trim()}\` should be \`${original[i]!.trim()}\`.`;
}
