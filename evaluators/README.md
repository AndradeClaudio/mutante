# Mutante evaluation material (Evaluators track)

Evaluation material for Telegraph's `CODE_REVIEW_GENERAL` intent, built with the same mutation engine as the crash test.
It targets [issue #111](https://github.com/telegraphprotocol/bounties/issues/111) ("CODE_REVIEW: evaluation material and
an evaluator adapter").

## Why this material

On 6 November 2026, the network's leaderboard for `CODE_REVIEW_GENERAL` gave six miners the same top score, 1.0.
Those six include reviewers that catch 2% of planted bugs, and reviewers that explain 52–63% of them (see the main
[README](../README.md)). The ranking cannot tell them apart. The pool behind it held 70 rows from 10 contributors,
unchanged since 28 October. Material whose correct answer is **proven** helps the ranking separate reviewers that find
bugs from reviewers that approve everything.

## How each row is made

Each row is a `preference_pair`:

- **The question:** a small JavaScript function whose first comment states its contract, with one planted bug, or
  sometimes the correct function.
- **The preferred answer:**
  - for a planted bug, the review a competent reviewer gives: the exact line that is wrong, what it should be, and a
    check from the contract that now fails;
  - for correct code, an approval that cites a check that holds.
- **The rejected answer:** one of the failure modes the crash test measured on real miners:
  - approving sabotaged code;
  - blocking for a generic reason without finding the bug;
  - inventing a bug in correct code.

The answer key is proven, not judged. A mutant only becomes a question if it breaks the function's own checks when
run in a sandbox, and the failing check is quoted in the preferred answer.

**One question per function.** The pool rejects a question that is 85% or more similar to another one. Two mutants of
the same function differ by one character, so each function contributes either one mutant or its correct version. The
mutants are chosen to spread the material across kinds of bug.

## Privacy

The pool keeps part of the material as hidden tests. If the questions were public, a miner could memorise the answers.
So the functions and the generated rows live in `evaluators/private/`, which is excluded from git. This repository
publishes only:
- the method, which is the code below;
- counts and summaries;
- the contributor address, so the network's acceptance can be checked.

The judges can receive the material privately.

The 71 crash-test samples in `data/` are public, so they are **not** used as evaluation material.

## Commands

```bash
# Build: reads evaluators/private/originals.json, writes evaluators/private/code-review.ndjson. Sends nothing.
npm run evaluation:build

# Submit: publishes the rows to the pool, signed (EIP-191) by the testnet wallet in .env,
# then lists how the node classified each row (eligible, near_duplicate, …).
npm run evaluation:submit
```

An originals file is a JSON list of `{ "id", "code", "checks" }`:
- `code` is one function whose first comment is its contract;
- each check is a boolean expression the correct code satisfies, such as `"isOpen(9) === true"`, or
  `"throws: f(-1)"` for a call the contract says must fail.

Code: [`src/application/build-evaluation-material.ts`](../src/application/build-evaluation-material.ts),
[`src/domain/evaluation/`](../src/domain/evaluation/) and
[`src/infrastructure/evaluation/evalpool-client.ts`](../src/infrastructure/evaluation/evalpool-client.ts).

## Status

| Version | Rows | Planted bugs | Correct samples | Kinds of bug | Submitted |
|---|---|---|---|---|---|
| v1 (6 Nov 2026) | 32 | 24 | 8 | 9 | 6 Nov 2026, from `0x612a5aE1970488583A059E97749F5D817B65FFAb`: 32 received, 32 accepted, 0 duplicates, 0 rejected. All 32 `eligible` since 7 Nov 2026 |

On 7 November 2026 at 01:52 UTC the network published a new snapshot for `CODE_REVIEW_GENERAL`
(`dfeb44cd…e138d`, active from epoch 2031). It holds 102 rows from 11 contributors: 50 for qualification and 52 for
ranking. The previous snapshot, from 28 October, held 70 rows from 10 contributors. The work is claimed and submitted on
[issue #111](https://github.com/telegraphprotocol/bounties/issues/111).

Nothing here claims a ranking change. That needs network evidence, and the [rules](https://anjoman.ai/dashboard/hackathon/season-2/rules)
ask for exactly that.
