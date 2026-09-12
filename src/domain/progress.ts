/**
 * Progress (req 38).
 * Real learning metrics only — no vanity statistics.
 * Everything computed from recorded evidence.
 */
import { Attempt, ConceptState, EvidenceType, ID, LearnerModel } from './types';
import { brierScore } from './calibration';
import { DAY, mean } from './utils';

export interface ProgressReport {
  encountered: number;
  learning: number; // emerging + learning + familiar
  developingPlus: number; // developing + proficient
  mastered: number;
  decaying: number;
  confused: number;
  totalConcepts: number;
  studyMinutes: number; // from sessions (sum of item time) — approximated from attempts
  retrievalAccuracy: number | null;
  applicationAccuracy: number | null;
  explanationQuality: number | null;
  delayedRetention: number | null; // success rate of delayed retrievals
  calibrationBrier: number | null;
  calibrationVerdict: string;
  xp: number;
  level: number;
  streakDays: number;
}

export function computeProgress(
  states: Map<ID, ConceptState>,
  attempts: Attempt[],
  learner: LearnerModel,
  totalConcepts: number,
): ProgressReport {
  const all = [...states.values()];
  const by = (fn: (s: ConceptState) => boolean) => all.filter(fn).length;

  const acc = (types: EvidenceType[]) => {
    const rel = attempts.filter((a) => types.includes(a.evidenceType));
    return rel.length ? mean(rel.map((a) => a.score)) : null;
  };

  const explain = attempts.filter((a) => a.evidenceType === 'explanation');
  const delayed = attempts.filter((a) => a.evidenceType === 'delayed-retrieval');

  // study minutes: sum of response times is the honest lower bound of engagement
  const studyMinutes = Math.round(attempts.reduce((s, a) => s + Math.min(a.responseMs, 5 * 60_000), 0) / 60000);

  const brier = brierScore(learner.calibrationSamples);

  return {
    encountered: by((s) => s.firstSeenAt != null || s.attempts > 0),
    learning: by((s) => ['emerging', 'learning', 'familiar'].includes(s.state)),
    developingPlus: by((s) => ['developing', 'proficient'].includes(s.state)),
    mastered: by((s) => s.state === 'mastered' && s.flag === 'none'),
    decaying: by((s) => s.flag === 'decaying'),
    confused: by((s) => s.flag === 'confused'),
    totalConcepts,
    studyMinutes,
    retrievalAccuracy: acc(['recall', 'delayed-retrieval']),
    applicationAccuracy: acc(['application', 'transfer']),
    explanationQuality: explain.length ? mean(explain.map((a) => a.score)) : null,
    delayedRetention: delayed.length ? mean(delayed.map((a) => a.score)) : null,
    calibrationBrier: brier,
    calibrationVerdict: brier == null ? 'unknown' : brier < 0.1 ? 'accurate' : brier < 0.18 ? 'mixed' : 'miscalibrated',
    xp: learner.xp,
    level: learner.level,
    streakDays: learner.streakDays,
  };
}

/** Retention over time (progress chart): delayed retrieval success by delay bucket. */
export function retentionCurve(attempts: Attempt[]): { bucket: string; rate: number; n: number }[] {
  const buckets = [
    { label: '1d', min: 1, max: 2 },
    { label: '3d', min: 2, max: 5 },
    { label: '7d', min: 5, max: 10 },
    { label: '14d+', min: 10, max: Infinity },
  ];
  return buckets.map((b) => {
    const rel = attempts.filter(
      (a) => (a.evidenceType === 'delayed-retrieval' || (a.evidenceType === 'recall' && a.wasDelayed)) &&
        a.daysSincePrev >= b.min && a.daysSincePrev < b.max,
    );
    return {
      bucket: b.label,
      rate: rel.length ? mean(rel.map((a) => a.score)) : 0,
      n: rel.length,
    };
  });
}

/** Accuracy by cognitive level — shows real ability profile. */
export function accuracyByLevel(attempts: Attempt[]): { level: string; accuracy: number; n: number }[] {
  const levels = ['recall', 'understanding', 'application', 'analysis', 'comparison', 'problem-solving', 'transfer', 'explanation'];
  return levels.map((level) => {
    const rel = attempts.filter((a) => a.cognitiveLevel === level);
    return { level, accuracy: rel.length ? mean(rel.map((a) => a.score)) : 0, n: rel.length };
  });
}

/** Study time per day (last n days). */
export function dailyActivity(attempts: Attempt[], now: number, days = 14): { day: string; minutes: number; attempts: number }[] {
  const out: { day: string; minutes: number; attempts: number }[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const start = now - (i + 1) * DAY;
    const end = now - i * DAY;
    const rel = attempts.filter((a) => a.ts >= start && a.ts < end);
    out.push({
      day: new Date(end).toISOString().slice(5, 10),
      minutes: Math.round(rel.reduce((s, a) => s + Math.min(a.responseMs, 5 * 60_000), 0) / 60000),
      attempts: rel.length,
    });
  }
  return out;
}
