/**
 * Scheduler (req 28, 29, 30, 46, 48).
 * FSRS-inspired spaced repetition, extended so that grading considers
 * deeper evidence than flashcard self-grading:
 *   - answer score (0..1) instead of manual buttons
 *   - hints used (support reduces credit)
 *   - evidence strength (application/explanation/transfer successes grow stability more)
 *   - delayed retrieval (recalled after the interval) gets a strong stability bonus
 *   - streaks & consistency feed stability growth
 * Supports Again/Hard/Good/Easy explicitly for card-style UI.
 */
import { Attempt, EvidenceType, SchedulerState } from './types';
import { EVIDENCE_STRENGTH } from './types';
import { clamp, clamp01, DAY, hashString, seededRandom } from './utils';

export type Grade = 'again' | 'hard' | 'good' | 'easy';

export interface ScheduleOutcome {
  scheduler: SchedulerState;
  grade: Grade;
  /** interval in days actually scheduled */
  intervalDays: number;
  /** estimated retrievability at review time (0..1) */
  retrievability: number;
  /** lapse (forgot) — triggers targeted reinforcement */
  lapsed: boolean;
}

export function retrievability(s: SchedulerState, now: number): number {
  if (s.lastReviewedAt == null || s.stabilityDays <= 0) return 0;
  const elapsedDays = Math.max(0, (now - s.lastReviewedAt) / DAY);
  return clamp01(Math.exp(-elapsedDays / Math.max(0.1, s.stabilityDays)));
}

/** Map an attempt to a grade, considering evidence depth (req 28). */
export function gradeFromAttempt(a: {
  score: number;
  hintsUsed: number;
  evidenceType: EvidenceType;
  responseMs: number;
  expectedMs?: number;
}): Grade {
  let score = a.score;
  // hints reduce credit
  score -= a.hintsUsed * 0.08;
  if (score < 0.4) return 'again';
  if (score < 0.7) return 'hard';
  // strong-evidence success can upgrade
  const strong = EVIDENCE_STRENGTH[a.evidenceType] >= 0.8;
  const fast = a.expectedMs == null || a.responseMs <= a.expectedMs * 1.5;
  if (score >= 0.95 && a.hintsUsed === 0 && strong && fast) return 'easy';
  if (score >= 0.95 && a.hintsUsed === 0) return 'easy';
  if (score >= 0.7 && strong && a.hintsUsed === 0 && score >= 0.9) return 'easy';
  return score >= 0.9 ? 'good' : score >= 0.7 ? 'good' : 'hard';
}

/** Initial stability after the first successful learning step. */
export function initialStability(grade: Grade, difficultyBase: number): number {
  const base = 1.0 - 0.4 * difficultyBase;
  switch (grade) {
    case 'hard':
      return Math.max(0.5, base * 0.75);
    case 'good':
      return base;
    case 'easy':
      return base * 1.4;
    default:
      return 0.4;
  }
}

/**
 * Next scheduler state after a review.
 */
export function schedule(
  prev: SchedulerState,
  attempt: {
    score: number;
    hintsUsed: number;
    evidenceType: EvidenceType;
    responseMs: number;
    correct: boolean;
    wasDelayed: boolean;
    daysSincePrev: number;
  },
  now: number,
  opts: { difficultyBase: number; lapse?: boolean },
): ScheduleOutcome {
  const grade = gradeFromAttempt(attempt);
  const S = Math.max(0.1, prev.stabilityDays);
  const D = clamp(prev.difficulty, 0.1, 0.95);
  const elapsedDays = prev.lastReviewedAt == null ? 0 : Math.max(0, (now - prev.lastReviewedAt) / DAY);
  const R = clamp01(Math.exp(-elapsedDays / S));

  const next: SchedulerState = { ...prev, lastGrade: grade, reviews: prev.reviews + 1, lastReviewedAt: now };
  let intervalDays: number;
  let lapsed = false;

  if (attempt.score < 0.4) {
    // LAPSE — knowledge did not survive (req 30)
    lapsed = true;
    next.lapses = prev.lapses + 1;
    next.streak = 0;
    next.difficulty = clamp(D + 0.2, 0.1, 0.95);
    next.stabilityDays = Math.max(0.4, S * 0.3);
    intervalDays = 0; // due immediately for relearning
    next.dueAt = now + 10 * 60_000; // 10-minute relearning step
    next.lastIntervalDays = 0;
  } else if (prev.reviews === 0 || prev.stabilityDays === 0) {
    // FIRST successful learning step
    next.streak = 1;
    next.difficulty = clamp(D + (grade === 'hard' ? 0.05 : grade === 'easy' ? -0.08 : -0.02), 0.1, 0.95);
    next.stabilityDays = initialStability(grade, opts.difficultyBase);
    intervalDays = next.stabilityDays;
    next.dueAt = now + intervalDays * DAY;
    next.lastIntervalDays = intervalDays;
  } else {
    // RETENTION step — stability growth
    let growth: number;
    switch (grade) {
      case 'hard':
        growth = 1.25;
        break;
      case 'easy':
        growth = (3.0 - 2.0 * D) * 1.35;
        break;
      default:
        growth = 3.0 - 2.0 * D; // good: 1.2 (hard concept) .. 2.8 (easy concept)
    }
    // retrievability at review modulates growth: reviewing at low R (overdue) is harder →
    // but success at low R is STRONG evidence → net bonus for delayed success (req 46)
    if (attempt.wasDelayed && attempt.score >= 0.7) {
      growth *= 1 + Math.min(0.6, (elapsedDays / Math.max(0.1, prev.lastIntervalDays || S) - 1) * 0.5 + 0.15);
    }
    // streak bonus (consistency)
    growth *= 1 + Math.min(0.15, prev.streak * 0.02);
    // strong-evidence bonus (application/explanation/transfer success, req 48)
    if (attempt.score >= 0.7 && EVIDENCE_STRENGTH[attempt.evidenceType] >= 0.8) growth *= 1.1;
    if (attempt.evidenceType === 'transfer' && attempt.score >= 0.7) growth *= 1.1;
    // hints reduce growth
    growth *= Math.max(0.5, 1 - 0.12 * attempt.hintsUsed);
    // over-reviewing (still very fresh) grows slower
    if (R > 0.95) growth = Math.max(1.05, growth * 0.75);
    // intra-session successes (minutes apart) barely grow stability —
    // stability must be earned against forgetting over real time (req 29)
    if (elapsedDays < 0.25) growth = 1 + (growth - 1) * 0.12;

    next.stabilityDays = Math.min(3650, S * growth);
    next.streak = prev.streak + 1;
    next.difficulty = clamp(
      D + (grade === 'hard' ? 0.05 : grade === 'easy' ? -0.1 : -0.05),
      0.1,
      0.95,
    );
    // deterministic ±5% fuzz to avoid cliqued due dates
    const rng = seededRandom(hashString(`${attempt.evidenceType}:${Math.round(next.stabilityDays * 100)}`));
    intervalDays = Math.max(0.5, next.stabilityDays * (0.95 + 0.1 * rng()));
    next.dueAt = now + intervalDays * DAY;
    next.lastIntervalDays = intervalDays;
  }

  return { scheduler: next, grade, intervalDays, retrievability: R, lapsed };
}

/** Explicit manual grading (card UI: Again/Hard/Good/Easy), still evidence-aware. */
export function scheduleManual(
  prev: SchedulerState,
  grade: Grade,
  now: number,
  difficultyBase: number,
): ScheduleOutcome {
  return schedule(
    prev,
    {
      score: grade === 'again' ? 0 : grade === 'hard' ? 0.6 : grade === 'good' ? 0.85 : 1,
      hintsUsed: 0,
      evidenceType: 'recall',
      responseMs: 0,
      correct: grade !== 'again',
      wasDelayed: prev.lastReviewedAt != null && now - prev.lastReviewedAt >= DAY,
      daysSincePrev: 0,
    },
    now,
    { difficultyBase },
  );
}

/** Forgetting detection (req 30): has a strong concept become stale? */
export function detectDecay(s: SchedulerState, now: number): boolean {
  if (s.lastReviewedAt == null || s.stabilityDays <= 0) return false;
  const R = retrievability(s, now);
  return R < 0.7 && now > s.dueAt - 0.5 * DAY; // meaningfully stale & (nearly) due
}

/** Is the concept due for review? */
export function isDue(s: SchedulerState, now: number): boolean {
  return s.lastReviewedAt != null && now >= s.dueAt;
}

/** How overdue, in days (0 if not due). */
export function overdueDays(s: SchedulerState, now: number): number {
  return s.lastReviewedAt == null ? 0 : Math.max(0, (now - s.dueAt) / DAY);
}
