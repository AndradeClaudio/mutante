import { getQuickJS, shouldInterruptAfterDeadline, type QuickJSWASMModule } from "quickjs-emscripten";
import type { ContractChecker } from "../../domain/mutation/generate-cases.js";

/** Long enough for any honest sample; mutants that loop forever (`i < n` turned into `i > n`) are cut here. */
const TIME_LIMIT_MS = 200;
const MEMORY_LIMIT_BYTES = 16 * 1024 * 1024;
const STACK_LIMIT_BYTES = 512 * 1024;
export const TIME_LIMIT_MESSAGE = "the code ran past the time limit";

// `assert` is defined inside the interpreter, so the sample never touches a host object.
const PRELUDE = `function assert(condition, message) {
  if (!condition) throw new Error(message === undefined ? "contract broken" : String(message));
}
`;

/**
 * Runs a sample and its tests in QuickJS compiled to WebAssembly: a separate JavaScript engine with no
 * access to files, network, processes or the host's objects, and with its own memory, stack and time limits.
 * A fresh runtime per check means nothing one sample does can leak into the next.
 */
export class QuickJsContractChecker implements ContractChecker {
  private engine: Promise<QuickJSWASMModule> | null = null;

  async honorsContract(code: string, tests: string): Promise<boolean> {
    return (await this.firstViolation(code, tests)) === null;
  }

  async firstViolation(code: string, tests: string): Promise<string | null> {
    this.engine ??= getQuickJS();
    const runtime = (await this.engine).newRuntime();
    runtime.setMemoryLimit(MEMORY_LIMIT_BYTES);
    runtime.setMaxStackSize(STACK_LIMIT_BYTES);
    runtime.setInterruptHandler(shouldInterruptAfterDeadline(Date.now() + TIME_LIMIT_MS));
    const context = runtime.newContext();
    try {
      const result = context.evalCode(`${PRELUDE}${code}\n;(() => {\n${tests}\n})();`, "sample.js");
      if (!result.error) {
        result.value.dispose();
        return null;
      }
      const error = context.dump(result.error) as { name?: string; message?: string } | string;
      result.error.dispose();
      return describe(error);
    } finally {
      context.dispose();
      runtime.dispose();
    }
  }
}

function describe(error: { name?: string; message?: string } | string): string {
  if (typeof error === "string") return error;
  if (error.name === "InternalError" && /interrupted/i.test(error.message ?? "")) return TIME_LIMIT_MESSAGE;
  return error.message || error.name || "contract broken";
}
