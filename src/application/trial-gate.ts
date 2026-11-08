import { createHash, timingSafeEqual } from "node:crypto";

export interface TrialLimits {
  /** Codes handed to judges and testers; anyone without one is refused before any work is done. */
  readonly accessCodes: readonly string[];
  /** Runs one access code may start per hour. */
  readonly runsPerCodePerHour: number;
  /** Most test USDC one run may spend, reserved when the run starts. */
  readonly budgetPerRunMicroUsdc: number;
  /** Most test USDC all runs together may spend in one UTC day. */
  readonly dailyCapMicroUsdc: number;
  /** Wrong access codes one address may try per hour, to stop guessing. */
  readonly failedAttemptsPerHour: number;
}

export type Admission =
  | { readonly admitted: true; readonly ticket: TrialTicket }
  | { readonly admitted: false; readonly reason: string; readonly status: 401 | 429 | 503 };

/** Proof that a run was admitted; closing it releases the budget it did not use. */
export interface TrialTicket {
  readonly codeLabel: string;
  close(spentMicroUsdc: number): void;
}

const HOUR_MS = 60 * 60 * 1000;

/**
 * Decides who may start a paid run, and keeps spending inside the limits: one run at a time, a few runs
 * per code per hour, a budget per run and a cap per day. It holds no business rule about bugs or reviews;
 * it only protects the wallet and the service.
 */
export class TrialGate {
  private readonly runsByCode = new Map<string, number[]>();
  private readonly failuresByAddress = new Map<string, number[]>();
  private reservedMicroUsdc = 0;
  private spentToday = { day: "", microUsdc: 0 };
  private running = false;

  constructor(
    private readonly limits: TrialLimits,
    private readonly now: () => number = Date.now,
  ) {
    if (limits.accessCodes.length === 0) throw new Error("Configure at least one access code.");
  }

  admit(accessCode: string, address: string): Admission {
    const now = this.now();
    const failures = recent(this.failuresByAddress.get(address), now);
    if (failures.length >= this.limits.failedAttemptsPerHour) {
      return { admitted: false, reason: "Too many wrong access codes from this address. Try again in an hour.", status: 429 };
    }
    const code = this.limits.accessCodes.find((known) => sameText(known, accessCode));
    if (!code) {
      this.failuresByAddress.set(address, [...failures, now]);
      return { admitted: false, reason: "Unknown access code.", status: 401 };
    }
    const label = labelOf(code);
    const runs = recent(this.runsByCode.get(label), now);
    if (runs.length >= this.limits.runsPerCodePerHour) {
      return { admitted: false, reason: `This access code already started ${runs.length} runs in the last hour.`, status: 429 };
    }
    if (this.running) {
      return { admitted: false, reason: "Another run is in progress. Try again in a minute.", status: 503 };
    }
    if (this.spentTodayMicroUsdc(now) + this.reservedMicroUsdc + this.limits.budgetPerRunMicroUsdc > this.limits.dailyCapMicroUsdc) {
      return { admitted: false, reason: "Today's test budget is used up. Try again tomorrow (UTC).", status: 503 };
    }

    this.running = true;
    this.reservedMicroUsdc += this.limits.budgetPerRunMicroUsdc;
    this.runsByCode.set(label, [...runs, now]);
    let closed = false;
    return {
      admitted: true,
      ticket: {
        codeLabel: label,
        close: (spentMicroUsdc: number) => {
          if (closed) return;
          closed = true;
          this.running = false;
          this.reservedMicroUsdc -= this.limits.budgetPerRunMicroUsdc;
          this.spentTodayMicroUsdc(this.now());
          this.spentToday.microUsdc += spentMicroUsdc;
        },
      },
    };
  }

  private spentTodayMicroUsdc(now: number): number {
    const day = new Date(now).toISOString().slice(0, 10);
    if (this.spentToday.day !== day) this.spentToday = { day, microUsdc: 0 };
    return this.spentToday.microUsdc;
  }
}

function recent(times: number[] | undefined, now: number): number[] {
  return (times ?? []).filter((t) => now - t < HOUR_MS);
}

// Compares in constant time, so response timing does not reveal how much of a code was right.
function sameText(a: string, b: string): boolean {
  const left = createHash("sha256").update(a).digest();
  const right = createHash("sha256").update(b).digest();
  return timingSafeEqual(left, right);
}

/** Logs and limits refer to a code by a short hash, never by the code itself. */
function labelOf(code: string): string {
  return createHash("sha256").update(code).digest("hex").slice(0, 8);
}
