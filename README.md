# Mutante

**A crash test for the code-review miners on the Telegraph network.**

Telegraph sells machine intelligence per call: an agent pays a miner a cent in USDC and gets a code review back.
But nothing tells the buyer whether that review came from a model that read the code or from a heuristic that
approves everything. Mutante measures it. It plants bugs whose answer is known in advance, buys a review of each
sample from every miner, and grades the answers. Every purchase is paid machine to machine, with a receipt anyone can check.

Entry to the Telegraph Hackathon Season II (Apps & Agents · Model Economy), by [@andradeclaudiox](https://x.com/andradeclaudiox), built with Claude.

## Results so far (round 2, Ethereum Sepolia testnet)

Every miner and every static analyzer reviewed the same 71 JavaScript samples: 54 with a planted bug, 15 correct, and 2 annulled after review.

| Reviewer | Bugs explained in the answer | Bugs counted by the network | False alarms | Cost |
|---|---|---|---|---|
| CodeWire (miner 7310045, an LLM) | **28 / 54 (52%)** | 18 / 54 (33%) | 0% | $0.01 per review |
| Telegraph Verity (miner 5530) | 1 / 54 (2%) | 1 / 54 (2%) | 0% | $0.01 per review |
| PREFLIGHT (miner 20260828) | 1 / 54 (2%) | 1 / 54 (2%) | 0% | $0.01 per review |
| ESLint 9 (recommended rules) | 3 / 54 (6%)\* | | 0% | free |
| SonarJS 4 ("Sonar way" rules) | 3 / 54 (6%)\* | | 0% | free |

\* For the static analyzers any warning counts as finding the bug, so their figure is generous.

What the results show:

- **Linters catch 6%. The best miner explains 52%. The network only counts 33%.** The network rejected the verdict
  field on 27 of the best miner's answers, even though many of those answers explained the bug correctly.
  That is a protocol issue, and only an outside measurement with a known answer key can find it.
- Two of the three miners behave like static heuristics. They answer "no configured heuristic matched", approve almost
  everything, and caught only the SQL injection.
- In round 1, only 3 of the 16 miners listed for `CODE_REVIEW_GENERAL` returned a review at all. The network refused the rest.

Round 2 cost $2.13 in test USDC for 213 paid reviews. Every answer, receipt and transaction is in
[`data/rounds/round-002.json`](data/rounds/round-002.json).

## How it works

1. **Originals.** Each sample starts as a small, correct JavaScript function. Its first comment is its contract, and
   it comes with tests. See [`src/catalog/javascript-originals.ts`](src/catalog/javascript-originals.ts).
2. **Mutation engine.** Ten operators each make one small change of the kind people make by accident: a boundary
   (`>=` to `>`), a flipped comparison, a swapped `&&`/`||`, an arithmetic operator, a changed constant, a removed
   guard, SQL concatenation, and a few more. A mutant joins the catalog only if it **breaks the tests**, which run in
   an isolated `node:vm` sandbox. A change that keeps every test passing is discarded, because it may not be a bug.
   This is why the answer key is known before anyone is asked.
3. **Buying the reviews.** For every reviewer × sample pair, the agent calls the Telegraph node
   (`/engine/v1/ask/{minerId}`, intent `CODE_REVIEW_GENERAL`), pays through x402 in test USDC, and stores the answer
   together with the `X-TELEGRAPH-RECEIPT` header. The round is saved after every purchase, so an interrupted run
   resumes without paying twice, and it stops before going over budget.
4. **Grading.** An answer *names the bug* when it quotes the sabotaged expression or describes its mechanism. This is
   checked against patterns written for each mutation before the purchase. The possible grades are:
   - *caught*: "Request changes" and the bug named;
   - *explained without verdict*: the bug named, but no verdict recorded;
   - *blocked without reason*;
   - *missed*;
   - *false alarm*: correct code blocked;
   - *failed*.
5. **Regrading.** A round can be regraded with improved patterns without buying anything again. A new answer key is
   accepted only when the code is identical to what the reviewer received, and the previous version is archived in
   [`data/history/`](data/history/). A case whose contract turned out to be ambiguous is *annulled* for every reviewer.

## Run it

Requirements: Node 22, and a disposable Sepolia wallet holding a little Sepolia ETH and test USDC.

```bash
npm install
node scripts/create-wallet.mjs                 # writes .env with a NEW testnet-only key (never use real funds)
node scripts/mint-test-usdc.mjs 10             # test USDC from the Telegraph testnet contract (needs Sepolia ETH for gas)
node scripts/balance.mjs

npm run generate-catalog                       # originals → proven mutants (data/catalogs/js-mutants.json)
npm run crash-test -- --round my-run --budget 3 --catalog data/catalogs/js-mutants.json
npm run scoreboard -- my-run

npm run static-baseline -- --from my-run       # ESLint + SonarJS on the same samples, for free
npm run test
```

The static analyzers live in [`tools/static-analyzers`](tools/static-analyzers) with their own `node_modules`, because
SonarJS needs TypeScript 5 while this project builds with TypeScript 7. Install them with
`npm install --prefix tools/static-analyzers`.

The [demo video](outreach/video/) is generated from the same data: `npm run export-scoreboard && npm run record-video`.
Chrome draws the scenes on a canvas, an original soundtrack is synthesized with Web Audio, and MediaRecorder records
both. No ffmpeg is needed.

## Code map

The code follows domain-driven design. The domain has no I/O, and the network, the sandbox and the file system are
adapters behind ports.

```
src/domain/            TestCase, AnswerKey, Review, Round (aggregate), grading, scoreboard, ports
src/domain/mutation/   mutation operators and case generation
src/application/       use cases: RunCrashTest, GenerateCatalog, RegradeRound
src/infrastructure/    Telegraph market (x402), static-analysis market, vm sandbox, JSON repositories
src/interface/cli/     command-line entry points
src/catalog/           the originals and the hand-written round-1 cases
data/                  rounds (paid evidence), catalog, history, public exports, run log
video/                 scenes, soundtrack and recorder for the demo video
```

Static analysis plugs in as just another `ReviewMarket`, so linters and paid miners go through the same use case,
grading and scoreboard.

## Limits

- Pattern-based grading can miss a correct explanation worded in an unexpected way, so "explained" is a floor, not an
  exact score. An LLM judge would be the next step.
- Samples are JavaScript only, and each has to fit in the intent's 256-byte on-chain slot.
- Round 2 tested the three miners that answered in round 1.
- Everything runs on the Sepolia testnet with test USDC.
