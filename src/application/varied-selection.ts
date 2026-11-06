import type { TestCase } from "../domain/test-case.js";

/**
 * Takes cases group by group (mutation operator, or correct/hand-written), so a small budget still
 * covers different kinds of bug instead of spending it all on the first operator in the list.
 */
export function variedSelection(cases: readonly TestCase[], limit: number): TestCase[] {
  const groups = new Map<string, TestCase[]>();
  for (const testCase of cases) {
    const group = testCase.origin.kind === "mutant" ? testCase.origin.operator : testCase.origin.kind;
    groups.set(group, [...(groups.get(group) ?? []), testCase]);
  }
  const queues = [...groups.values()];
  const chosen: TestCase[] = [];
  for (let i = 0; chosen.length < limit && queues.some((q) => i < q.length); i++) {
    for (const queue of queues) if (i < queue.length && chosen.length < limit) chosen.push(queue[i]!);
  }
  return chosen;
}
