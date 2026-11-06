import { runInNewContext } from "node:vm";
import type { ContractChecker } from "../../domain/mutation/generate-cases.js";

const TIME_LIMIT_MS = 200;

/** Runs JavaScript code and its tests in an isolated Node context (no modules, network or disk). */
export class JavaScriptContractChecker implements ContractChecker {
  async honorsContract(code: string, tests: string): Promise<boolean> {
    const context = {
      assert(condition: unknown, message = "contract broken") {
        if (!condition) throw new Error(message);
      },
    };
    try {
      // The vm `timeout` stops synchronous infinite loops created by mutants (e.g. `i < n` turned into `i > n`).
      const run = runInNewContext(`${code}\n;(async () => { ${tests} })()`, context, { timeout: TIME_LIMIT_MS });
      await Promise.race([run, timeout(TIME_LIMIT_MS)]);
      return true;
    } catch {
      return false;
    }
  }
}

function timeout(ms: number): Promise<never> {
  return new Promise((_, reject) => setTimeout(() => reject(new Error("time limit exceeded")), ms).unref());
}
