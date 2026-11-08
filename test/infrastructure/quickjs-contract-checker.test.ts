import { describe, expect, it } from "vitest";
import { QuickJsContractChecker, TIME_LIMIT_MESSAGE } from "../../src/infrastructure/sandbox/quickjs-contract-checker.js";

const checker = new QuickJsContractChecker();

describe("QuickJS sandbox (layer 2)", () => {
  it("reports the failing assertion's message, or null when the contract holds", async () => {
    expect(await checker.firstViolation("function f(x) { return x; }", "assert(f(1) === 1);")).toBeNull();
    expect(await checker.firstViolation("function f(x) { return x; }", "assert(f(1) === 2, 'f(1) === 2');")).toBe("f(1) === 2");
  });

  it("gives the sample no host objects at all", async () => {
    const probe = "function f() { return [typeof process, typeof require, typeof fetch, typeof std, typeof os].join(); }";
    expect(await checker.firstViolation(probe, "assert(false, f());")).toBe("undefined,undefined,undefined,undefined,undefined");
  });

  it("stops a sample that loops forever", async () => {
    expect(await checker.firstViolation("function f() { while (true) {} }", "assert(f());")).toBe(TIME_LIMIT_MESSAGE);
  });

  it("stops a sample that eats memory", async () => {
    const hog = "function f() { const a = []; while (true) a.push(new Array(1e5).fill(1)); }";
    expect(await checker.firstViolation(hog, "assert(f());")).toMatch(/memory|time limit/);
  }, 20_000);

  it("does not let one sample change the next", async () => {
    await checker.firstViolation("function f() { Array.prototype.includes = () => true; return 1; }", "assert(f());");
    expect(await checker.firstViolation("function g() { return [1].includes(2); }", "assert(g() === false);")).toBeNull();
  });
});
