import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { JAVASCRIPT_ORIGINALS } from "../../src/catalog/javascript-originals.js";
import { RejectedSubmission, Submission } from "../../src/domain/submission.js";
import { JavaScriptAllowList } from "../../src/infrastructure/sandbox/javascript-allow-list.js";

const rules = new JavaScriptAllowList();
const contract = "// Open from 9:00 until 17:00.\n";
const tests = "assert(isOpen(9) === true); assert(isOpen(17) === false);";

function problemsOf(code: string, testList = tests): readonly string[] {
  try {
    Submission.accept(code, testList, rules);
    return [];
  } catch (error) {
    if (error instanceof RejectedSubmission) return error.problems;
    throw error;
  }
}

describe("submission rules (layer 1)", () => {
  it("accepts every original in the catalog and the try example", () => {
    for (const original of JAVASCRIPT_ORIGINALS) expect(problemsOf(original.code, original.tests), original.id).toEqual([]);
    const code = readFileSync("samples/try/free-shipping.js", "utf8");
    expect(problemsOf(code, readFileSync("samples/try/free-shipping.tests.js", "utf8"))).toEqual([]);
  });

  it.each([
    ["the Function constructor", "function isOpen(h) { return Function('return process')(); }"],
    ["eval", "function isOpen(h) { return eval('h >= 9'); }"],
    ["a prototype escape", "function isOpen(h) { return h.constructor.constructor('return this')(); }"],
    ["a computed escape", "function isOpen(h) { return h['constructor']; }"],
    ["process", "function isOpen(h) { return process.env.KEY; }"],
    ["require", "function isOpen(h) { return require('fs'); }"],
    ["globalThis", "function isOpen(h) { return globalThis.fetch; }"],
    ["this", "function isOpen(h) { return this; }"],
    ["an undeclared global", "function isOpen(h) { return Date.now() > h; }"],
    ["a class", "function isOpen(h) { class A {} return h >= 9; }"],
    ["async", "async function isOpen(h) { return h >= 9; }"],
    ["a getter", "function isOpen(h) { const o = { get x() { return 1; } }; return h >= 9; }"],
    ["new on anything but Error", "function isOpen(h) { return new Promise(() => h); }"],
    ["a Math member outside the list", "function isOpen(h) { return Math.random() > h; }"],
    ["call/apply rebinding", "function isOpen(h) { return [].map.call(h, (x) => x); }"],
  ])("refuses %s", (_, body) => {
    expect(problemsOf(contract + body).length).toBeGreaterThan(0);
  });

  it("refuses two declarations, missing contract comment, and oversize code", () => {
    expect(problemsOf(`${contract}function isOpen(h) { return h >= 9; }\nfunction other() {}`)).toHaveLength(1);
    expect(problemsOf("function isOpen(h) { return h >= 9; }")[0]).toMatch(/comment/);
    expect(problemsOf(`${contract}function isOpen(h) { return ${"h + ".repeat(80)}0; }`)[0]).toMatch(/bytes/);
  });

  it("refuses tests that run anything but assertions on the function", () => {
    const code = `${contract}function isOpen(h) { return h >= 9 && h < 17; }`;
    expect(problemsOf(code, "const fs = require('fs'); assert(isOpen(9));").join()).toMatch(/require/);
    expect(problemsOf(code, "isOpen(9);").join()).toMatch(/assert/);
    expect(problemsOf(code, "assert(true);").join()).toMatch(/never call isOpen/);
    expect(problemsOf(code, Array(21).fill("assert(isOpen(9));").join(" ")).join()).toMatch(/at most 20/);
  });

  it("refuses anything that looks like a secret, since the code becomes public", () => {
    const leaky = `${contract}function isOpen(h) { const password = "hunter22"; return h >= 9; }`;
    expect(problemsOf(leaky).join()).toMatch(/password/);
    expect(problemsOf(`${contract}function isOpen(h) { return "sk-live-abcdefghijklmnop1234" && h; }`).join()).toMatch(/API key/);
  });

  it("names the line of each problem, so the visitor can fix it", () => {
    expect(problemsOf(`${contract}function isOpen(h) {\n  return process;\n}`)[0]).toMatch(/`process` is not allowed \(line 3\)/);
  });
});
