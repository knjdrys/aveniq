/**
 * Exam readiness (req 35, 36).
 * Readiness considers coverage, accuracy, freshness, mastery, weak areas,
 * prerequisite gaps — and explains WHY the score is what it is.
 * No number without evidence (req 75).
 */
import { ID, ReadinessSnapshot } from './types';
import { clamp01, DAY } from './utils';

export interface ReadinessInput {
  examId: ID;
  now: number;
  /** concepts in the exam scope */
  conceptIds: ID[];
  /** per concept: mastery 0..100, state */
  masteryOf: (id: ID) => number;
  stateOf: (id: ID) => string;
  /** attempts on scope concepts */
  attempts: { conceptId: ID; correct: boolean; score: number; ts: number; cognitiveLevel: string }[];
  /** estimated recall probability per concept */
  retrievabilityOf: (id: ID) => number;
  openGaps: number;
}

const MIN_ATTEMPTS_FOR_EVIDENCE = 8;

export function computeReadiness(input: ReadinessInput): ReadinessSnapshot {
  const { conceptIds, attempts } = input;
  const total = conceptIds.length;
  const reasons: ReadinessSnapshot['reasons'] = [];

  if (attempts.length < MIN_ATTEMPTS_FOR_EVIDENCE || total === 0) {
    return {
      examId: input.examId,
      ts: input.now,
      score: 0,
      coverage: 0,
      accuracy: 0,
      freshness: 0,
      mastery: 0,
      weakConcepts: [],
      gaps: input.openGaps,
      attemptCount: attempts.length,
      insufficientEvidence: true,
      reasons: [{ key: 'rdy.insufficient' }],
    };
  }

  const inLearning = conceptIds.filter((id) => {
    const st = input.stateOf(id);
    return !['unknown', 'encountered'].includes(st);
  });
  const coverage = total ? inLearning.length / total : 0;

  // accuracy: weighted by recency (last 2 weeks dominate)
  const cutoff = input.now - 14 * DAY;
  const accAttempts = attempts.filter((a) => a.ts >= cutoff);
  const relevant = accAttempts.length >= 4 ? accAttempts : attempts.slice(-10);
  const accuracy = relevant.length
    ? relevant.reduce((s, a) => s + a.score, 0) / relevant.length
    : 0;

  // freshness: mean retrievability over scope
  const freshVals = conceptIds.map((id) => input.retrievabilityOf(id));
  const freshness = freshVals.length ? freshVals.reduce((a, b) => a + b, 0) / freshVals.length : 0;

  // mastery: fraction at/above proficiency, partial credit below
  const masteryScore = total
    ? conceptIds.reduce((s, id) => {
        const m = input.masteryOf(id) / 100;
        return s + clamp01(m / 0.88); // reaching "mastered gate" counts as full
      }, 0) / total
    : 0;

  const weakConcepts = conceptIds.filter((id) => {
    const st = input.stateOf(id);
    const m = input.masteryOf(id);
    return (st !== 'unknown' && m < 45) || (st === 'unknown' && attempts.some((a) => a.conceptId === id && !a.correct));
  });

  const gapsPenalty = clamp01(1 - 0.04 * input.openGaps);
  const weakPenalty = clamp01(1 - (weakConcepts.length / Math.max(1, total)) * 0.5);

  const score = Math.round(
    100 * clamp01(0.3 * coverage + 0.25 * accuracy + 0.2 * freshness + 0.25 * masteryScore) * gapsPenalty * weakPenalty,
  );

  reasons.push({ key: 'rdy.coverage', params: { n: inLearning.length, total } });
  reasons.push({ key: 'rdy.accuracy', params: { value: Math.round(accuracy * 100), n: relevant.length } });
  reasons.push({ key: 'rdy.freshness', params: { value: Math.round(freshness * 100) } });
  reasons.push({
    key: 'rdy.mastery',
    params: { n: conceptIds.filter((id) => input.stateOf(id) === 'mastered').length, total },
  });
  if (weakConcepts.length) reasons.push({ key: 'rdy.weak', params: { n: weakConcepts.length } });
  if (input.openGaps) reasons.push({ key: 'rdy.gaps', params: { n: input.openGaps } });

  return {
    examId: input.examId,
    ts: input.now,
    score,
    coverage,
    accuracy,
    freshness,
    mastery: masteryScore,
    weakConcepts,
    gaps: input.openGaps,
    attemptCount: attempts.length,
    insufficientEvidence: false,
    reasons,
  };
}
