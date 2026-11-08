import { parentPort } from "node:worker_threads";
import { QuickJsContractChecker } from "./quickjs-contract-checker.js";

// Runs inside a worker thread with its own heap limits: the QuickJS interpreter lives here, away from the
// server's memory, keys and sockets. The parent kills this thread if a check ever overruns.
const checker = new QuickJsContractChecker();

parentPort!.on("message", async (request: { id: number; code: string; tests: string }) => {
  try {
    const violation = await checker.firstViolation(request.code, request.tests);
    parentPort!.postMessage({ id: request.id, violation });
  } catch (error) {
    parentPort!.postMessage({ id: request.id, violation: error instanceof Error ? error.message : String(error) });
  }
});
