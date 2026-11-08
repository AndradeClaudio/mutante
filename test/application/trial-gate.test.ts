import { describe, expect, it } from "vitest";
import { TrialGate, type TrialLimits } from "../../src/application/trial-gate.js";

const limits: TrialLimits = {
  accessCodes: ["judge-code"],
  runsPerCodePerHour: 2,
  budgetPerRunMicroUsdc: 250_000,
  dailyCapMicroUsdc: 600_000,
  failedAttemptsPerHour: 3,
};

function gateAt(start = Date.parse("2026-11-08T10:00:00Z")) {
  let now = start;
  return { gate: new TrialGate(limits, () => now), advance: (ms: number) => { now += ms; } };
}

describe("trial gate (layer 4)", () => {
  it("refuses an unknown code, and blocks an address that keeps guessing", () => {
    const { gate } = gateAt();
    for (let i = 0; i < 3; i++) expect(gate.admit("guess", "1.2.3.4")).toMatchObject({ admitted: false, status: 401 });
    expect(gate.admit("judge-code", "1.2.3.4")).toMatchObject({ admitted: false, status: 429 });
    expect(gate.admit("judge-code", "5.6.7.8").admitted).toBe(true);
  });

  it("runs one at a time and limits runs per code per hour", () => {
    const { gate, advance } = gateAt();
    const first = gate.admit("judge-code", "a");
    expect(gate.admit("judge-code", "a")).toMatchObject({ admitted: false, status: 503 });
    if (first.admitted) first.ticket.close(100_000);
    const second = gate.admit("judge-code", "a");
    if (second.admitted) second.ticket.close(100_000);
    expect(gate.admit("judge-code", "a")).toMatchObject({ admitted: false, status: 429 });
    advance(61 * 60 * 1000);
    expect(gate.admit("judge-code", "a").admitted).toBe(true);
  });

  it("stops before the daily cap, counting what runs actually spent", () => {
    const { gate, advance } = gateAt();
    for (let i = 0; i < 2; i++) {
      const run = gate.admit("judge-code", "a");
      if (run.admitted) run.ticket.close(250_000);
      advance(61 * 60 * 1000);
    }
    expect(gate.admit("judge-code", "a")).toMatchObject({ admitted: false, status: 503 });
    advance(24 * 60 * 60 * 1000);
    expect(gate.admit("judge-code", "a").admitted).toBe(true);
  });
});
