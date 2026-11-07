# Commercial summary (draft for the H2 submission form, Apps & Agents)

Mission 10, Model Economy. Example 01: cost per verified correct answer.
All numbers come from Ethereum Sepolia testnet, paid in test USDC. No customer has paid for this yet.

## 01 Who is it for?

Buyers who send code for AI review and pay per answer:
- teams that wire a review model or agent into their pull requests;
- platforms that resell review to many users, like the buyers Mission 10 names (GitHub, Hugging Face, OpenRouter).

They face the problem every time they choose a reviewer, and again whenever a provider changes model or price. On Telegraph that can be every epoch.

## 02 What does it improve?

Choosing a reviewer by what it actually catches and what that costs, instead of by a score that cannot separate reviewers.

On 7 November 2026, Telegraph's leaderboard for `CODE_REVIEW_GENERAL` gave six miners the same score, 1.0, in two epochs in a row. On the same samples, Mutante measured:
- 63% of planted bugs explained by ChainSight (reached through auto-routing), 52% by CodeWire;
- 2% by Verity and by A1 PREFLIGHT;
- $0.039 per bug caught for CodeWire, $0.71 for Verity.

## 03 What does it do today?

1. Plants bugs in small JavaScript functions.
2. Keeps only the bugs that a sandboxed contract check proves.
3. Buys a review of each sample from Telegraph miners, autonomously, over x402.
4. Grades each answer: caught, explained, missed, false alarm, and others.
5. Publishes a scoreboard sorted by price per bug caught, with a receipt and transaction for every purchase.

So far it has bought 303 paid reviews across three rounds, about $3.03 in test USDC. It also reviewed the same samples with ESLint and SonarJS as a free baseline; they found 6% of the bugs.

The `try` command runs the same crash test on a function you bring. The same engine produced 32 evaluation rows that Telegraph's pool for `CODE_REVIEW_GENERAL` accepted as `eligible`.

## 04 Why would someone adopt it?

- **It is cheap:** a full check of a reviewer costs cents, about $0.01 per sample. That is less than one missed bug in production.
- **The answer key is proven, not judged:** each planted bug breaks a check that runs. Nobody's opinion decides whether a review was right.
- **It measures what the buyer pays for:** dollars per bug caught. A model's own benchmark claims don't measure that.
- **It repeats:** re-run it every epoch or after a provider changes, and the ranking updates.

## 05 How can someone try it?

- **Without installing:** watch the video, or open the public scoreboard and inspect each answer and its receipt.
- **With your own code:** clone https://github.com/AndradeClaudio/mutante, then run `npm install`. Put a testnet wallet funded from the Sepolia faucets in `.env`, then run:
  ```
  npm run try -- --code your-function.js --tests your-tests.js
  ```
  The default run costs $0.20 in test USDC and has a spending limit (`--budget`).
- **Reproduce the published rounds:** `npm run crash-test`, then `npm run scoreboard`. The steps are in the README under "Run it".
