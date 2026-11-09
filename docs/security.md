# Security model of the web version

The web version (`npm run web`, or the `Dockerfile`) runs JavaScript that visitors paste, and it pays for reviews from a
wallet. Four layers stand between a visitor and the server. Each layer assumes the one before it can fail.

## 1. Only one shape of code is accepted

Code: [`src/domain/submission.ts`](../src/domain/submission.ts) and
[`src/infrastructure/sandbox/javascript-allow-list.ts`](../src/infrastructure/sandbox/javascript-allow-list.ts).

A `Submission` can only be created if it passes every rule, so nothing else ever reaches the sandbox. The code is parsed
into a syntax tree, and every node is checked against an **allow-list**. Anything not on the list is refused, so a new
trick is refused by default rather than missed by a deny-list.

- **The function:** exactly one function declaration, starting with its contract comment, at most 256 bytes (the
  intent's on-chain limit). It cannot be async or a generator. It may use literals, operators, `if`, loops, `const`/`let`,
  arrow functions, arrays, objects and `new Error(...)`.
- **The tests:** at most 2,000 characters and 20 `assert` calls. They must call the function.
- **Names:** every name must be declared in the submission or be one of a few pure globals: `Math`, `Number`, `Array`,
  `Object`, `JSON` (each with a fixed list of members), plus `String`, `Boolean`, `parseInt`, `parseFloat`, `isNaN` and
  `Error`.
- **Refused anywhere** (as a name, a key or a string): `eval`, `Function`, `constructor`, `__proto__`, `prototype`,
  `globalThis`, `process`, `require`, `import`, `this`, `Reflect`, `Proxy`, `call`, `apply`, `bind`, and similar.
- **Secrets:** anything that looks like a private key, an API key or a password is refused. The code is sent to a public
  network.
- **Error messages:** each problem names its line, so the visitor can fix it.

Tests: [`test/infrastructure/submission-rules.test.ts`](../test/infrastructure/submission-rules.test.ts). Every original in
the catalog is accepted, and 15 escape attempts are refused.

## 2. It runs in a separate interpreter

Code: [`src/infrastructure/sandbox/quickjs-contract-checker.ts`](../src/infrastructure/sandbox/quickjs-contract-checker.ts).

Samples run in **QuickJS compiled to WebAssembly**, a JavaScript engine separate from Node's. It has no access to files,
network, processes or any host object. `assert` itself is defined inside it. Each check gets a fresh runtime, so nothing
one sample does reaches the next.

| Limit | Value |
|---|---|
| Memory | 16 MB |
| Stack | 512 KB |
| Time | 200 ms, enforced by an interrupt (this stops mutants that loop forever) |

This replaced `node:vm`, which is not a security boundary. On the 16 catalog originals it produces exactly the same 71
cases. Tests: [`test/infrastructure/quickjs-contract-checker.test.ts`](../test/infrastructure/quickjs-contract-checker.test.ts).

## 3. In a separate thread, in an unprivileged container

**The thread.** Code: [`src/infrastructure/sandbox/isolated-contract-checker.ts`](../src/infrastructure/sandbox/isolated-contract-checker.ts).
- The interpreter lives in a worker thread with capped heap (96 MB) and stack (4 MB).
- The thread gets **none of the server's environment variables**, so not the wallet key. It only learns where temporary
  files go.
- Checks run one at a time. If one overruns 2 seconds, the thread is terminated and replaced.

**The container.** The [`Dockerfile`](../Dockerfile):
- runs as the unprivileged `node` user;
- contains only the app's code and production dependencies;
- writes only to `/app/data/web`, where run results go.

Run it like this:

```bash
docker run -d -p 8080:8080 --env-file .env \
  --read-only --tmpfs /tmp -v mutante-data:/app/data/web \
  --cap-drop ALL --security-opt no-new-privileges \
  --memory 512m --cpus 1 --pids-limit 128 mutante-web
```

The server itself needs outbound internet, to reach the Telegraph node and to pay over x402. The sample never does: it
runs in an interpreter that has no network API at all.

## 4. Access, limits and spending

Code: [`src/application/trial-gate.ts`](../src/application/trial-gate.ts) and
[`src/interface/web/server.ts`](../src/interface/web/server.ts).

- **Access codes** (`ACCESS_CODES`):
  - an access code is required to start a run, and is compared in constant time;
  - it is checked before anything else, so without one the code is not even parsed; a refused sample does not use up a
    run;
  - one address may try at most 10 wrong codes per hour.
- **Limits:**
  - one run at a time;
  - 3 runs per code per hour;
  - $0.25 of test USDC per run (reserved at the start, unused part released);
  - $2 per UTC day for all runs together.
- **Requests:** bodies over 16 KB are refused, and only JSON is accepted.
- **Run ids:** they are random UUIDs. Results are kept in memory for 24 hours.
- **Browser protections:**
  - a strict Content-Security-Policy (no inline scripts, nothing loaded from other sites, no framing), plus `nosniff` and
    `no-referrer`;
  - every answer from a miner is third-party text, so the page shows it with `textContent`, never as HTML.
- **Logs:** one JSON line per event. Addresses, access codes and samples appear only as short hashes.

## What this does not cover

- **No external security review.** These layers are tested, but no one outside the project has reviewed them.
- **Testnet only.** The wallet key on the server pays in test USDC. Use a disposable testnet wallet, never one that holds
  real funds.
- **Single-process state.** Rate limits and spending live in one process's memory, so a restart resets them. The daily
  cap is a guard, not an accounting system.
