import { tmpdir } from "node:os";
import { Worker } from "node:worker_threads";
import type { ContractChecker } from "../../domain/mutation/generate-cases.js";
import { TIME_LIMIT_MESSAGE } from "./quickjs-contract-checker.js";

/** The interpreter's own limit is 200 ms; this is the hard stop if something inside it ever hangs. */
const HARD_LIMIT_MS = 2_000;

/**
 * Runs every check in a separate worker thread with capped heap and stack, one at a time. If a check
 * overruns the hard limit, the thread is terminated and replaced, so a hostile sample can at worst cost
 * two seconds; it never shares memory with the server, which holds the wallet key.
 */
export class IsolatedContractChecker implements ContractChecker {
  private worker: Worker | null = null;
  private nextId = 0;
  private queue: Promise<unknown> = Promise.resolve();

  async honorsContract(code: string, tests: string): Promise<boolean> {
    return (await this.firstViolation(code, tests)) === null;
  }

  firstViolation(code: string, tests: string): Promise<string | null> {
    const run = this.queue.then(() => this.check(code, tests));
    this.queue = run.catch(() => undefined);
    return run;
  }

  async close(): Promise<void> {
    await this.worker?.terminate();
    this.worker = null;
  }

  private check(code: string, tests: string): Promise<string | null> {
    const worker = this.ensureWorker();
    const id = this.nextId++;
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        cleanup();
        void this.replaceWorker();
        resolve(TIME_LIMIT_MESSAGE);
      }, HARD_LIMIT_MS);
      const onMessage = (message: { id: number; violation: string | null }) => {
        if (message.id !== id) return;
        cleanup();
        resolve(message.violation);
      };
      const onError = (error: Error) => {
        cleanup();
        void this.replaceWorker();
        resolve(`the sandbox stopped: ${error.message}`);
      };
      const cleanup = () => {
        clearTimeout(timer);
        worker.off("message", onMessage);
        worker.off("error", onError);
      };
      worker.on("message", onMessage);
      worker.on("error", onError);
      worker.postMessage({ id, code, tests });
    });
  }

  private ensureWorker(): Worker {
    this.worker ??= new Worker(new URL("./checker-worker.ts", import.meta.url), {
      resourceLimits: { maxOldGenerationSizeMb: 96, maxYoungGenerationSizeMb: 16, stackSizeMb: 4 },
      // The worker gets none of the server's environment, the wallet key least of all: only where temp files go.
      env: { TMPDIR: tmpdir(), TEMP: tmpdir(), TMP: tmpdir() },
    });
    this.worker.unref();
    return this.worker;
  }

  private async replaceWorker(): Promise<void> {
    const old = this.worker;
    this.worker = null;
    await old?.terminate();
  }
}
