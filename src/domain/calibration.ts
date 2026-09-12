/**
 * Confidence calibration (req 27).
 * Compare pre-answer confidence vs actual performance; build a profile;
 * detect over/underconfidence and adapt practice.
 */
import { CalibrationSample, CalibrationVerdict } from './types';
import { clamp01 } from './utils';

export function addSample(
  samples: CalibrationSample[],
  s: CalibrationSample,
  cap = 100,
): CalibrationSample[] {
  const next = [...samples, s];
  return next.length > cap ? next.slice(next.length - cap) : next;
}

export interface CalibrationProfile {
  verdict: CalibrationVerdict;
  /** mean confidence 0..1 */
  confidence: number;
  /** mean performance 0..1 */
  performance: number;
  /** signed gap: positive = overconfident */
  gap: number;
  /** number of samples backing this profile — no fake numbers (req 75) */
  n: number;
}

export function profile(samples: CalibrationSample[]): CalibrationProfile {
  if (samples.length < 5) {
    return { verdict: 'unknown', confidence: 0, performance: 0, gap: 0, n: samples.length };
  }
  // weight recent samples more
  const sorted = [...samples].sort((a, b) => a.ts - b.ts);
  let cw = 0;
  let pw = 0;
  let w = 0;
  sorted.forEach((s, i) => {
    const weight = 1 + i / sorted.length; // older → smaller
    cw += weight * ((s.confidence - 1) / 4);
    pw += weight * s.score;
    w += weight;
  });
  const confidence = cw / w;
  const performance = pw / w;
  const gap = confidence - performance;
  let verdict: CalibrationVerdict = 'accurate';
  if (gap > 0.15) verdict = 'overconfident';
  else if (gap < -0.15) verdict = 'underconfident';
  return { verdict, confidence, performance, gap, n: samples.length };
}

/** Per-concept calibration used to decide when to ask for confidence (skip when well calibrated). */
export function shouldAskConfidence(
  conceptSamples: CalibrationSample[],
  globalAsk: boolean,
): boolean {
  if (!globalAsk) return false;
  if (conceptSamples.length < 3) return true;
  const p = profile(conceptSamples);
  return p.verdict !== 'accurate';
}

/** Adapt practice: overconfident learners get more retrieval at higher levels. */
export function calibrationAdjustment(p: CalibrationProfile): { levelShift: number; preferRetrieval: boolean; note?: string } {
  if (p.verdict === 'overconfident') return { levelShift: 1, preferRetrieval: true, note: 'overconfident' };
  if (p.verdict === 'underconfident') return { levelShift: -1, preferRetrieval: false, note: 'underconfident' };
  return { levelShift: 0, preferRetrieval: false };
}

/** Brier-style calibration score for progress display (0 = perfect, 0.25 = worst). */
export function brierScore(samples: CalibrationSample[]): number | null {
  if (samples.length < 5) return null;
  const s = samples.reduce((acc, x) => {
    const conf = clamp01((x.confidence - 1) / 4);
    return acc + (conf - (x.correct ? 1 : 0)) ** 2;
  }, 0);
  return s / samples.length;
}
