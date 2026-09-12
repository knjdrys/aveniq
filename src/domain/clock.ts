/**
 * Clock abstraction — the scheduler & engines are time-dependent,
 * so tests inject a controllable clock while production uses real time.
 */
export interface Clock {
  now(): number;
}

export const realClock: Clock = { now: () => Date.now() };

/** Mutable fake clock for tests and simulations. */
export class FakeClock implements Clock {
  constructor(private t: number = Date.now()) {}
  now(): number {
    return this.t;
  }
  set(t: number) {
    this.t = t;
  }
  advance(ms: number) {
    this.t += ms;
  }
  advanceDays(d: number) {
    this.t += d * 86_400_000;
  }
}
