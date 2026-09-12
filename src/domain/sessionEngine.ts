/**
 * Study session engine (req 32, 34, 47, 48).
 * Time-aware adaptive sessions: micro (≤5 min) / focused (10) / balanced (25) /
 * deep (60). Dynamic segments; re-plans as the session runs based on outcomes.
 */
import { ID, SegmentPlan, SessionItem, SessionOutcome, StudySession } from './types';
import { interleave } from './questionSelect';

export type SessionSize = 'micro' | 'focus' | 'balance' | 'deep';

export function sessionSize(minutes: number): SessionSize {
  if (minutes <= 7) return 'micro';
  if (minutes <= 15) return 'focus';
  if (minutes <= 40) return 'balance';
  return 'deep';
}

export interface PlanInput {
  minutes: number;
  now: number;
  dueConcepts: ID[];
  weakConcepts: ID[]; // mastery < 45, attempted
  newConcepts: ID[]; // unlocked frontier, unknown
  gapConcepts: ID[]; // concepts with open gaps
  confusionPairs: [ID, ID][];
  misconceptionConcepts: ID[];
  activeSession?: StudySession;
}

/** Build a segment plan for the available time (req 32). */
export function planSession(input: PlanInput): SegmentPlan[] {
  const size = sessionSize(input.minutes);
  const segments: SegmentPlan[] = [];
  const uniq = (xs: ID[]) => [...new Set(xs)];

  const due = uniq(input.dueConcepts);
  const weak = uniq(input.weakConcepts).filter((c) => !due.includes(c));
  const mis = uniq(input.misconceptionConcepts);
  const conf = input.confusionPairs;

  switch (size) {
    case 'micro': // 2-5 min (req 33): one meaningful unit of progress
      if (mis.length) {
        segments.push({ type: 'review', conceptIds: [mis[0]], estMinutes: 3, reasonKey: 'seg.misconception' });
      }
      if (conf.length) {
        segments.push({ type: 'comparison', conceptIds: [conf[0][0], conf[0][1]], estMinutes: 3, reasonKey: 'seg.comparison' });
      }
      segments.push({
        type: due.length ? 'retrieval' : 'review',
        conceptIds: (due.length ? due : weak).slice(0, 3),
        estMinutes: 3,
        reasonKey: due.length ? 'seg.retrieval' : 'seg.review',
      });
      break;
    case 'focus': // ~10 min: focused review
      if (due.length) segments.push({ type: 'warmup', conceptIds: due.slice(0, 2), estMinutes: 3, reasonKey: 'seg.warmup' });
      if (mis.length) segments.push({ type: 'review', conceptIds: [mis[0]], estMinutes: 3, reasonKey: 'seg.misconception' });
      if (conf.length) segments.push({ type: 'comparison', conceptIds: conf[0], estMinutes: 3, reasonKey: 'seg.comparison' });
      segments.push({ type: 'retrieval', conceptIds: [...due.slice(2), ...weak].slice(0, 4), estMinutes: 4, reasonKey: 'seg.retrieval' });
      segments.push({ type: 'reflection', conceptIds: [], estMinutes: 1, reasonKey: 'seg.reflection' });
      break;
    case 'balance': // ~25 min
      if (due.length) segments.push({ type: 'warmup', conceptIds: due.slice(0, 3), estMinutes: 5, reasonKey: 'seg.warmup' });
      if (input.newConcepts.length) {
        segments.push({ type: 'first-encounter', conceptIds: [input.newConcepts[0]], estMinutes: 8, reasonKey: 'seg.first' });
      }
      if (mis.length || weak.length) {
        segments.push({ type: 'review', conceptIds: [...mis, ...weak].slice(0, 2), estMinutes: 5, reasonKey: 'seg.review' });
      }
      segments.push({ type: 'retrieval', conceptIds: [...due.slice(3), ...weak].slice(0, 3), estMinutes: 4, reasonKey: 'seg.retrieval' });
      segments.push({ type: 'application', conceptIds: [...due, ...weak].slice(0, 2), estMinutes: 3, reasonKey: 'seg.application' });
      if (conf.length) segments.push({ type: 'comparison', conceptIds: conf[0], estMinutes: 3, reasonKey: 'seg.comparison' });
      segments.push({ type: 'reflection', conceptIds: [], estMinutes: 1, reasonKey: 'seg.reflection' });
      break;
    case 'deep': // ~60 min: deeper learning + retrieval + application
      if (due.length) segments.push({ type: 'warmup', conceptIds: due.slice(0, 4), estMinutes: 7, reasonKey: 'seg.warmup' });
      if (input.newConcepts.length) {
        segments.push({ type: 'first-encounter', conceptIds: input.newConcepts.slice(0, 2), estMinutes: 18, reasonKey: 'seg.first' });
      }
      segments.push({ type: 'retrieval', conceptIds: due.slice(4).slice(0, 5), estMinutes: 8, reasonKey: 'seg.retrieval' });
      if (mis.length || weak.length) {
        segments.push({ type: 'review', conceptIds: [...mis, ...weak].slice(0, 3), estMinutes: 7, reasonKey: 'seg.review' });
      }
      segments.push({ type: 'application', conceptIds: [...due, ...weak, ...input.newConcepts].slice(0, 4), estMinutes: 8, reasonKey: 'seg.application' });
      segments.push({ type: 'teach-back', conceptIds: [...due, ...input.newConcepts].slice(0, 2), estMinutes: 6, reasonKey: 'seg.teachBack' });
      if (conf.length) segments.push({ type: 'comparison', conceptIds: conf[0], estMinutes: 4, reasonKey: 'seg.comparison' });
      segments.push({ type: 'blurt', conceptIds: input.newConcepts.slice(0, 1), estMinutes: 4, reasonKey: 'seg.blurt' });
      segments.push({ type: 'reflection', conceptIds: [], estMinutes: 1, reasonKey: 'seg.reflection' });
      break;
  }
  // trim to time budget
  let budget = input.minutes;
  const trimmed: SegmentPlan[] = [];
  for (const seg of segments) {
    if (budget <= 0) break;
    if (seg.estMinutes <= budget || trimmed.length === 0) {
      trimmed.push(seg);
      budget -= seg.estMinutes;
    }
  }
  return trimmed.filter((s) => s.conceptIds.length > 0 || s.type === 'reflection' || s.type === 'first-encounter');
}

/**
 * Expand segment plans into a concrete, interleaved item sequence.
 * First-encounter segments expand to fe-stage items (handled by the FE engine at runtime).
 */
export function buildItems(plan: SegmentPlan[], opts: { questionPicker?: (conceptId: ID, seg: SegmentPlan) => ID | null }): SessionItem[] {
  const items: SessionItem[] = [];
  type Q = { conceptId: ID; priority: number; seg: SegmentPlan };
  const queue: Q[] = [];
  for (const seg of plan) {
    if (seg.type === 'first-encounter') {
      for (const c of seg.conceptIds) {
        items.push({ kind: 'fe-stage', conceptId: c, feStage: 'prereq-check', reasonKey: seg.reasonKey });
      }
    } else if (seg.type === 'reflection') {
      items.push({ kind: 'reflection', conceptId: '' });
    } else {
      for (const c of seg.conceptIds) queue.push({ conceptId: c, priority: seg.type === 'review' ? 2 : 1, seg });
    }
  }
  // interleave the question pool (req 47)
  const ordered = interleave(queue);
  for (const q of ordered) {
    const questionId = opts.questionPicker?.(q.conceptId, q.seg) ?? null;
    switch (q.seg.type) {
      case 'warmup':
      case 'retrieval':
        items.push({ kind: 'question', conceptId: q.conceptId, questionId: questionId ?? undefined, reasonKey: 'seg.retrieval' });
        break;
      case 'review':
        items.push({ kind: 'question', conceptId: q.conceptId, questionId: questionId ?? undefined, reasonKey: 'seg.review' });
        break;
      case 'application':
        items.push({ kind: 'question', conceptId: q.conceptId, questionId: questionId ?? undefined, reasonKey: 'seg.application' });
        break;
      case 'comparison':
        items.push({ kind: 'compare', conceptId: q.conceptId, reasonKey: 'seg.comparison' });
        break;
      case 'teach-back':
        items.push({ kind: 'teach-back', conceptId: q.conceptId, reasonKey: 'seg.teachBack' });
        break;
      case 'blurt':
        items.push({ kind: 'blurt', conceptId: q.conceptId, reasonKey: 'seg.blurt' });
        break;
    }
  }
  items.push({ kind: 'summary', conceptId: '' });
  return items;
}

/**
 * Dynamic adaptation during a session (req 34, 55).
 * Called after each outcome; returns plan adjustments with reasons.
 */
export function adapt(
  session: StudySession,
  lastOutcomes: SessionOutcome[],
  fatigue: number,
): { key: string; params?: Record<string, string | number> }[] {
  const adaptations: { key: string; params?: Record<string, string | number> }[] = [];
  const recent = lastOutcomes.slice(-3);
  const fails = recent.filter((o) => o.correct === false).length;

  if (fails >= 2) {
    adaptations.push({ key: 'adapt.slowDown', params: { concept: recent[recent.length - 1].conceptId } });
  }
  if (fatigue > 0.7) {
    adaptations.push({ key: 'adapt.fatigue' });
  }
  const successes = recent.filter((o) => o.correct === true).length;
  if (recent.length >= 4 && successes === recent.length) {
    adaptations.push({ key: 'adapt.challenge' });
  }
  return adaptations;
}
