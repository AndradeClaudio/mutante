# Mutante

**A crash test for the code-review miners on the Telegraph network.**

Telegraph sells machine intelligence per call: an agent pays a miner a cent in USDC and gets a code review back.
But nothing tells the buyer whether that review came from a model that read the code or from a heuristic that
approves everything. Mutante measures it. It plants bugs whose answer is known in advance, buys a review of each
sample from every miner, and grades the answers. Every purchase is paid machine to machine, with a receipt anyone can check.

Entry to the Telegraph Hackathon Season II, by [@andradeclaudiox](https://x.com/andradeclaudiox), built with Claude.
Track: Apps & Agents. Mission 10, Model Economy, whose first example build is *"a leaderboard by price per correct
answer rather than by benchmark score"*. Mutante ranks paid code reviewers by exactly that: what a buyer pays per bug
that is actually caught.

## Results so far (Ethereum Sepolia testnet)

Every reviewer below saw the same 71 JavaScript samples: 54 with a planted bug, 15 correct, and 2 annulled after review.
Round 2 named each miner directly. Round 3 sent the same samples **without naming a miner**, the way a default buyer
asks, and the network's router chose ChainSight for all 69 gradable samples.

| Reviewer | **Price per bug caught** | Bugs explained in the answer | Bugs counted by the network | False alarms | Price per call |
|---|---|---|---|---|---|
| CodeWire (miner 7310045), named directly | **$0.039** | 28 / 54 (52%) | 18 / 54 (33%) | 0% | $0.01 |
| ChainSight (miner 302), via auto-routing | $0.049 | **34 / 54 (63%)** | 14 / 54 (26%) | 7% (1 of 15) | $0.01 |
| Telegraph Verity (miner 5530) | $0.710 | 1 / 54 (2%) | 1 / 54 (2%) | 0% | $0.01 |
| PREFLIGHT (miner 20260828) | $0.710 | 1 / 54 (2%) | 1 / 54 (2%) | 0% | $0.01 |
| ESLint 9 (recommended rules) | free | 3 / 54 (6%)\* | | 0% | free |
| SonarJS 4 ("Sonar way" rules) | free | 3 / 54 (6%)\* | | 0% | free |

Price per bug caught is everything paid to the reviewer for the 71 samples, divided by the planted bugs it blocked and named.\
\* For the static analyzers any warning counts as finding the bug, so their figure is generous.

What the results show:

- **Same price per call, 18× apart per correct answer.** Every miner charges $0.01, but a caught bug costs $0.04–0.05
  from the two reviewers that read the code and $0.71 from the others. A per-call price tells a buyer nothing; a price
  per verified correct answer does.
- **The network's record misses most of the good work.** The two good reviewers explain 52–63% of the bugs, but the
  network counts only 26–33%: it rejected the verdict field 59 times on their answers. Both write their verdict as prose
  ("Verdict: Incorrect…"), and CodeWire's own registration says it "does not emit canonical verdict or findings fields".
  It is a format mismatch between how good reviewers answer and what the network checks, not a reviewer being wrong.
- **Linters catch 6%.** ESLint and SonarJS flag only the bugs visible in the code's shape (`|| true`, a loop counting
  the wrong way). The rest is valid code that breaks its own comment.
- Two miners behave like static heuristics. They answer "no configured heuristic matched", approve almost everything,
  and caught only the SQL injection.
- **Round 1, called directly:** only 3 of the 16 miners listed for `CODE_REVIEW_GENERAL` returned a review.
  - Ten are repository data sources (GitHub, GitLab, Codeberg, NPM) that need an owner and a repo, not inline code.
  - TxLens and CodeWire Code Review were unreachable ("could not route") in every attempt, including retries on 6 November.
  - ChainSight fails on the direct path: the node requires a `code` parameter, then reports that ChainSight's endpoint has
    none. Through the router it works and reviews well. Measuring only by direct calls would have missed it, which is
    why round 3 exists.

### Three days, same samples, different ranking (rounds 4 and 5)

On 7 and 8 November we bought the same 71 reviews again, from the same four reviewers, asked the same way, with the same
answer key and the same two samples annulled:

| Reviewer | Bugs explained, 6 → 7 → 8 Nov | Bugs counted by the network | False alarms (of 15) | Price per bug caught |
|---|---|---|---|---|
| ChainSight, via auto-routing | 63% → 72% → **72%** | 26% → 30% → 30% | 1 → 2 → 0 | $0.049 → $0.044 → **$0.044** |
| CodeWire, named directly | 52% → 43% → 48% | 33% → 19% → 24% | 0 → 1 → 2 | $0.039 → $0.071 → $0.055 |
| Telegraph Verity | 2% → 2% → 2% | 2% → 2% → 2% | 0 | $0.710 |
| PREFLIGHT | 2% → 2% → 2% | 2% → 2% → 2% | 0 | $0.710 |

- **The best reviewer changed overnight.** On day 1 the cheapest correct answer came from CodeWire; on days 2 and 3 it
  came from ChainSight. CodeWire swings by up to 14 points from one day to the next, and false alarms come and go.
- **One measurement is not enough to rank a reviewer.** A buyer should re-run the test, for example every epoch, and
  rank on more than one run. Mutante is built for that: a round costs cents and needs no human grading.
- On all three days the official leaderboard gave all four the same score, 1.0 (epochs 2032, 2034 and 2042; by epoch
  2042, seven miners shared it). The snapshots are in [`data/public/official-leaderboard.json`](data/public/official-leaderboard.json).

Rounds 2, 3, 4 and 5 cost $2.13, $0.69, $2.84 and $2.84 in test USDC. Every answer, receipt and transaction is in
[`data/rounds/round-002.json`](data/rounds/round-002.json),
[`data/rounds/round-003-auto-routing.json`](data/rounds/round-003-auto-routing.json),
[`data/rounds/round-004.json`](data/rounds/round-004.json) and [`data/rounds/round-005.json`](data/rounds/round-005.json).

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
   checked against patterns written for each mutation before the purchase. Quoting the sabotaged line earns no credit
   when the reviewer's own conclusion is that the code is correct. The possible grades are:
   - *caught*: "Request changes" and the bug named;
   - *explained without verdict*: the bug named, but no verdict recorded;
   - *blocked without reason*;
   - *missed*;
   - *false alarm*: correct code blocked;
   - *failed*.
5. **Regrading.** A round can be regraded with improved patterns without buying anything again. A new answer key is
   accepted only when the code is identical to what the reviewer received, and the previous version is archived in
   [`data/history/`](data/history/). A case whose contract turned out to be ambiguous is *annulled* for every reviewer.

## Try it with your own code

Bring one JavaScript function and the tests that prove it. Mutante does the rest:
1. plants bugs in the function;
2. keeps only the bugs your tests prove;
3. buys a review of each one, and of your correct original, from the miners;
4. prints who caught what and what each correct answer cost.

```bash
npm run try -- --code samples/try/free-shipping.js --tests samples/try/free-shipping.tests.js
```

- **The code file** holds a single function whose first comment states its contract. It must fit in 256 bytes, the
  intent's on-chain limit. Example: [`samples/try/free-shipping.js`](samples/try/free-shipping.js).
- **The tests file** is a list of `assert(condition)` calls that the correct function passes. Example:
  [`samples/try/free-shipping.tests.js`](samples/try/free-shipping.tests.js).
- **Options:**
  - `--mutants 4`: how many proven bugs to buy reviews for. The default spreads them across different kinds of bug.
  - `--budget 0.25`: spending limit in test USDC.
  - `--reviewers 7310045,5530,20260828,auto-routed`: which miners to ask; `auto-routed` lets the network pick, as a default buyer would.
- **Cost:** about $0.01 per review. The default run is 5 samples × 4 reviewers = $0.20 in test USDC.
- **Errors:**
  - Tests the original does not pass are refused, as are tests no mutant can break, since then no bug is proven.
  - Miners that fail are recorded as failures.
  - An interrupted run resumes without paying twice.

A real run of the example, on 6 November 2026 ([`data/rounds/try-free-shipping.json`](data/rounds/try-free-shipping.json)):

```
case                               5530                  20260828              7310045
free-shipping-correct              correctly-approved    correctly-approved    correctly-approved
free-shipping-boundary-1           missed                missed                blocked-without-reason
  ↳ boundary changed: `>=` became `>`
free-shipping-comparison-flip-1    missed                missed                no-verdict
  ↳ comparison inverted: `>=` became `<=`
free-shipping-constant-changed-1   missed                missed                caught
  ↳ constant changed: `50` became `51`
free-shipping-constant-changed-2   missed                missed                explained-without-verdict
  ↳ constant changed: `0` became `1`

$/caught  $/explained  detected  explained  reviewer
  $0.050      $0.025       25%        50%   7310045 CodeWire Code Review Request Contract
       -           -        0%         0%   5530 Telegraph Verity Intelligence
       -           -        0%         0%   20260828 PREFLIGHT Infrastructure Signals
```

## Web version for judges

The same `try` flow as a web page: paste a function and its tests, and see who caught what, with every payment linked.

**Live: <https://64-177-59-121.sslip.io>**. It is online during the judging period. It needs an access code; judges
get one with the submission, and anyone else can ask [@andradeclaudiox](https://x.com/andradeclaudiox). The page opens
with an example loaded, so the access code is all a first run needs; a run takes one to two minutes.

To run your own copy:

```bash
# Set TESTNET_PRIVATE_KEY and ACCESS_CODES in .env (see .env.example), then:
npm run web            # http://localhost:8080
# or, in an unprivileged, read-only container:
docker build -t mutante-web . && docker run -p 8080:8080 --env-file .env --read-only --tmpfs /tmp mutante-web
# or on a server, behind Caddy with automatic HTTPS (how the live version runs):
SITE_ADDRESS=your.host.name docker compose -f deploy/compose.yaml up -d --build
```

Because it runs code that visitors paste, it has four layers of protection. [`docs/security.md`](docs/security.md)
explains each one:

1. **Allow-list:** only one small, pure function and `assert` tests are accepted. The code is checked on its syntax tree,
   and anything that looks like a secret is refused.
2. **Separate interpreter:** the code runs in QuickJS compiled to WebAssembly, with no files, network or host objects,
   and with memory and time limits.
3. **Separate thread and container:** a worker thread with no environment variables and a hard timeout, inside an
   unprivileged container.
4. **Access and spending limits:** access codes, limits per hour, at most $0.25 per run and $2 per day.

## Run it

Requirements: Node 22, and a disposable Sepolia wallet holding a little Sepolia ETH and test USDC.

```bash
npm install
node scripts/create-wallet.mjs                 # writes .env with a NEW testnet-only key (never use real funds)
node scripts/mint-test-usdc.mjs 10             # test USDC from the Telegraph testnet contract (needs Sepolia ETH for gas)
node scripts/balance.mjs

npm run try -- --code samples/try/free-shipping.js --tests samples/try/free-shipping.tests.js

npm run generate-catalog                       # originals → proven mutants (data/catalogs/js-mutants.json)
npm run crash-test -- --round my-run --budget 3 --catalog data/catalogs/js-mutants.json
npm run scoreboard -- my-run

npm run static-baseline -- --from my-run       # ESLint + SonarJS on the same samples, for free
npm run check-routing -- --from my-run --cases 20   # same samples without naming a miner: who does the router pick?
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
src/application/       use cases: RunCrashTest, CrashTestOwnCode, GenerateCatalog, RegradeRound
src/infrastructure/    Telegraph market (x402), static-analysis market, vm sandbox, JSON repositories
src/interface/cli/     command-line entry points
src/catalog/           the originals and the hand-written round-1 cases
data/                  rounds (paid evidence), catalog, history, public exports, run log
video/                 scenes, soundtrack and recorder for the demo video
```

Static analysis plugs in as just another `ReviewMarket`, so linters and paid miners go through the same use case,
grading and scoreboard.

## Limits

- Pattern-based grading can miss a correct explanation worded in an unexpected way, and long answers can match a
  pattern by chance. An audit of ChainSight's credited answers found one such case, now excluded by the rule above.
  Treat "explained" as approximate; an LLM judge would be the next step.
- Samples are JavaScript only, and each has to fit in the intent's 256-byte on-chain slot.
- Round 2 tested the three miners that answered in round 1; round 3 reached ChainSight only through auto-routing, so
  the router's choice, not ours, decided which miner answered.
- Everything runs on the Sepolia testnet with test USDC.
