# YouTube upload: Mutante demo

File: `outreach/video/mutante-demo.mp4` (4:41, 1920×1080, with soundtrack)
Subtitles: `outreach/video/mutante-demo.srt` (English; upload it under Subtitles so the captions can be switched on and off)

## Title (66 characters)

Mutante: crash-testing AI code reviewers on Telegraph (Hackathon S2)

## Description

Telegraph's leaderboard gives seven code-review miners the same top score, 1.0. Mutante plants bugs it can prove, pays each reviewer to find them, and ranks them by what a caught bug actually costs.

On the same 71 JavaScript samples (54 planted bugs, each proven by a failing test), reviewers with the same official score explained between 2% and 72% of the bugs. The price per bug caught ran from $0.044 to $0.71, although every call costs $0.01. Over three days the ranking moved, so one measurement is not enough.

How it works:
- A mutation engine plants one small bug at a time in a correct function, and keeps it only if the function's own tests fail in a sandbox.
- An agent buys a review of every sample from every miner through Telegraph's CODE_REVIEW_GENERAL intent, paying per call with x402, machine to machine, with no human in the loop.
- Each answer is graded against the known answer key. Every purchase has a Telegraph receipt and an on-chain payment.

Everything ran on the Ethereum Sepolia testnet with test USDC. No customer has paid for this yet.

Source code, run logs, every receipt, and a command to crash-test your own function:
https://github.com/AndradeClaudio/mutante

This is my entry to the Telegraph Hackathon Season II (Apps & Agents track, Model Economy mission), which awards cash prizes. Built with Claude.
Telegraph: https://anjoman.ai · @Telegraphprotoc on X

Chapters
0:00 Mutante
0:09 A one-character bug
0:30 How the test set is built
0:54 Buying the reviews
1:22 Proof of every purchase
1:38 First, the free option: linters
1:54 Scoreboard
2:30 Price per verified correct answer
2:46 The official score is a tie
3:02 Three days, same samples
3:28 Same bug, three reviewers
3:52 Round 1: who can review code at all
4:08 Run it, break it, reproduce it
4:26 Closing

## Tags

Telegraph, AI code review, mutation testing, x402, AI agents, LLM evaluation, hackathon, model economy, code review benchmark, testnet

## Settings

- Visibility: **Unlisted** or Public. Judges only need the link, and a public video also counts toward outreach.
- Audience: not made for kids.
- Category: Science & Technology.
- Paid promotion: tick "includes paid promotion" only if YouTube's rules require it for a contest entry. The description already says that it is a hackathon entry with cash prizes.
- Subtitles: upload `mutante-demo.srt` as English.
