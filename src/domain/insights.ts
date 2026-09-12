/**
 * Insight generation (req 31, 40, 75).
 * Every insight carries its evidence. Insights are structured {key, params}
 * so they stay localizable and explainable.
 */
import { Attempt, ConceptState, ConfusionPair, ID, Insight, KnowledgeGap, MisconceptionRecord } from './types';
import { uid } from './utils';
import { retrievability } from './scheduler';

export function conceptNameFallback(id: ID): ID {
  return id;
}

export function misconceptionInsight(
  record: MisconceptionRecord,
  label: string,
  conceptId: ID,
  now: number,
): Insight {
  return {
    id: uid('ins'),
    ts: now,
    kind: 'misconception',
    key: 'ins.misconception',
    params: { concept: conceptId, label },
    conceptId,
    severity: 'warn',
  };
}

export function misconceptionFixedInsight(
  record: MisconceptionRecord,
  label: string,
  conceptId: ID,
  now: number,
): Insight {
  return {
    id: uid('ins'),
    ts: now,
    kind: 'misconception',
    key: 'ins.misconceptionFixed',
    params: { concept: conceptId, label },
    conceptId,
    severity: 'good',
  };
}

export function confusionInsight(pair: ConfusionPair, now: number): Insight {
  return {
    id: uid('ins'),
    ts: now,
    kind: 'confusion',
    key: 'ins.confusion',
    params: { a: pair.aId, b: pair.bId, count: pair.abCount + pair.baCount },
    severity: 'warn',
  };
}

export function decayInsight(conceptId: ID, state: ConceptState, now: number): Insight {
  const r = retrievability(state.scheduler, now);
  return {
    id: uid('ins'),
    ts: now,
    kind: 'decay',
    key: 'ins.decay',
    params: { concept: conceptId, recall: Math.round(r * 100) },
    conceptId,
    severity: 'warn',
  };
}

export function masteredInsight(conceptId: ID, now: number): Insight {
  return {
    id: uid('ins'),
    ts: now,
    kind: 'progress',
    key: 'ins.mastered',
    params: { concept: conceptId },
    conceptId,
    severity: 'good',
  };
}

export function delayedSuccessInsight(conceptId: ID, days: number, now: number): Insight {
  return {
    id: uid('ins'),
    ts: now,
    kind: 'progress',
    key: 'ins.delayedSuccess',
    params: { concept: conceptId, days: Math.round(days) },
    conceptId,
    severity: 'good',
  };
}

export function gapInsight(gap: KnowledgeGap, now: number): Insight {
  return {
    id: uid('ins'),
    ts: now,
    kind: 'gap',
    key: 'ins.gap',
    params: { concept: gap.conceptId, root: gap.rootConceptId ?? '' },
    conceptId: gap.conceptId,
    severity: 'warn',
  };
}

/** Weakness insight with explicit evidence (req 75). */
export function weakInsight(
  conceptId: ID,
  state: ConceptState,
  attempts: Attempt[],
  now: number,
): Insight | null {
  if (state.attempts < 2) return null;
  const recent = attempts.slice(-4);
  const fails = recent.filter((a) => !a.correct).length;
  if (fails < 2 || state.mastery > 55) return null;
  const evidence = `${fails}/${recent.length} recent attempts missed`;
  return {
    id: uid('ins'),
    ts: now,
    kind: 'weakness',
    key: 'ins.weak',
    params: { concept: conceptId, evidence },
    conceptId,
    severity: 'warn',
  };
}
