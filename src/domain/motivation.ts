/**
 * Motivation (req 57, 38).
 * XP, streaks, levels — carefully: reward ACTUAL LEARNING
 * (evidence milestones, corrections, delayed retrieval, teach-backs),
 * never clicks. Core message: "You're getting better because you understand more."
 */
import { LearnerModel, Attempt } from './types';
import { dayKey } from './utils';

export interface XPAward {
  amount: number;
  key: string; // i18n key describing WHY (req 75)
  params?: Record<string, string | number>;
}

export function xpForAttempt(attempt: Attempt, context: { firstSuccess?: boolean; masteryGain?: number }): XPAward[] {
  const awards: XPAward[] = [];
  if (!attempt.correct) {
    // struggling still earns a little: engagement with feedback is learning
    if (attempt.hintsUsed > 0 && attempt.score > 0.3) awards.push({ amount: 1, key: 'xp.workedThrough' });
    return awards;
  }
  const base = 4;
  let amount = base;
  awards.push({ amount, key: 'xp.correct' });
  if (attempt.evidenceType === 'application') awards.push({ amount: 6, key: 'xp.applied' });
  if (attempt.evidenceType === 'transfer') awards.push({ amount: 10, key: 'xp.transferred' });
  if (attempt.evidenceType === 'explanation') awards.push({ amount: 8, key: 'xp.explained' });
  if (attempt.wasDelayed && attempt.evidenceType === 'delayed-retrieval') {
    awards.push({ amount: 8, key: 'xp.rememberedLater', params: { days: Math.round(attempt.daysSincePrev) } });
  }
  if (context.firstSuccess) awards.push({ amount: 5, key: 'xp.firstSuccess' });
  void amount;
  return awards;
}

export function xpForMilestone(kind: 'mastered' | 'misconception-corrected' | 'confusion-resolved' | 'streak' | 'reflection', params?: Record<string, string | number>): XPAward {
  switch (kind) {
    case 'mastered':
      return { amount: 40, key: 'xp.mastered', params };
    case 'misconception-corrected':
      return { amount: 25, key: 'xp.misconceptionFixed', params };
    case 'confusion-resolved':
      return { amount: 20, key: 'xp.confusionResolved', params };
    case 'streak':
      return { amount: 10, key: 'xp.streak', params };
    case 'reflection':
      return { amount: 3, key: 'xp.reflection' };
  }
}

/** Level curve: each level costs a bit more. */
export function levelForXp(xp: number): number {
  let level = 1;
  let cost = 100;
  let remaining = xp;
  while (remaining >= cost) {
    remaining -= cost;
    level++;
    cost = Math.round(cost * 1.15);
  }
  return level;
}

export function levelProgress(xp: number): { level: number; into: number; need: number } {
  let level = 1;
  let cost = 100;
  let remaining = xp;
  while (remaining >= cost) {
    remaining -= cost;
    level++;
    cost = Math.round(cost * 1.15);
  }
  return { level, into: remaining, need: cost };
}

/**
 * Streak: days with ≥1 *successful retrieval* (not just app opens — req 57).
 */
export function updateStreak(learner: LearnerModel, attempt: Attempt, now: number): { learner: LearnerModel; extended: boolean } {
  if (!attempt.correct) return { learner, extended: false };
  const today = dayKey(now);
  const studyDays = learner.studyDays.includes(today) ? learner.studyDays : [...learner.studyDays, today];
  const yesterday = dayKey(now - 86_400_000);
  const extended = !learner.studyDays.includes(today) && (learner.lastStudyDay === yesterday || learner.studyDays.length === 0);
  let streakDays = learner.streakDays;
  if (extended) streakDays += 1;
  else if (learner.studyDays.includes(today)) {
    // same day: no change
  } else if (learner.lastStudyDay && learner.lastStudyDay !== yesterday && learner.lastStudyDay !== today) {
    streakDays = 1; // streak broken
  }
  return {
    learner: { ...learner, studyDays, streakDays, lastStudyDay: today },
    extended,
  };
}

/** Understanding-gained summary — the emotional core (req 57, 82). */
export function sessionSummaryKeys(gains: {
  newConcepts: number;
  mastered: number;
  misconceptionsFixed: number;
  delayedRetrievals: number;
  explainbacks: number;
}): { key: string; params?: Record<string, string | number> }[] {
  const out: { key: string; params?: Record<string, string | number> }[] = [];
  if (gains.newConcepts) out.push({ key: 'sum.newConcepts', params: { n: gains.newConcepts } });
  if (gains.delayedRetrievals) out.push({ key: 'sum.delayed', params: { n: gains.delayedRetrievals } });
  if (gains.misconceptionsFixed) out.push({ key: 'sum.misconceptions', params: { n: gains.misconceptionsFixed } });
  if (gains.explainbacks) out.push({ key: 'sum.explained', params: { n: gains.explainbacks } });
  if (gains.mastered) out.push({ key: 'sum.mastered', params: { n: gains.mastered } });
  if (out.length === 0) out.push({ key: 'sum.keptAtIt' });
  return out;
}
