/**
 * Confusion network (req 11, 12).
 * Two concepts individually known but repeatedly confused.
 * Detection: learner picks a distractor representing concept B on questions
 * about concept A (and vice versa) → create A↔B confusion, teach the distinction.
 */
import { ConfusionPair, ID } from './types';

export function pairId(a: ID, b: ID): string {
  return [a, b].sort().join('::');
}

export interface ConfusionUpdate {
  pair: ConfusionPair;
  created: boolean;
  /** crossed activation threshold this time */
  activated: boolean;
}

const ACTIVATE_AFTER = 2;

export function applyChoice(
  pairs: Map<string, ConfusionPair>,
  chosenConceptId: ID, // the wrong concept the learner chose
  answerConceptId: ID, // the concept actually being asked about
  now: number,
): ConfusionUpdate | null {
  if (chosenConceptId === answerConceptId) return null;
  const id = pairId(chosenConceptId, answerConceptId);
  const [aId, bId] = [chosenConceptId, answerConceptId].sort() as [ID, ID];
  // abCount = chose a when answer was b
  const choseA = chosenConceptId === aId;
  const existing = pairs.get(id);
  if (existing) {
    const pair: ConfusionPair = {
      ...existing,
      abCount: existing.abCount + (choseA ? 1 : 0),
      baCount: existing.baCount + (choseA ? 0 : 1),
      lastAt: now,
      status: 'active',
      updatedAt: now,
    };
    const total = pair.abCount + pair.baCount;
    return {
      pair,
      created: false,
      activated: total >= ACTIVATE_AFTER && existing.abCount + existing.baCount < ACTIVATE_AFTER,
    };
  }
  const pair: ConfusionPair = {
    id: id,
    aId,
    bId,
    abCount: choseA ? 1 : 0,
    baCount: choseA ? 0 : 1,
    firstAt: now,
    lastAt: now,
    status: 'active',
    exerciseResults: [],
    updatedAt: now,
  };
  return { pair, created: true, activated: false };
}

/** Both concepts individually known enough for "known but confused" pattern? */
export function isKnownButConfused(pair: ConfusionPair, masteryOf: (id: ID) => number): boolean {
  return masteryOf(pair.aId) >= 45 && masteryOf(pair.bId) >= 45;
}

/** Comparison exercise passed → resolve after 2 consecutive passes. */
export function applyExerciseResult(pair: ConfusionPair, passed: boolean, now: number): ConfusionPair {
  const exerciseResults = [...pair.exerciseResults, passed].slice(-3);
  const resolved = passed && exerciseResults.slice(-2).length === 2 && exerciseResults.slice(-2).every(Boolean);
  return {
    ...pair,
    exerciseResults,
    status: resolved ? 'resolved' : 'active',
    resolvedAt: resolved ? now : undefined,
    updatedAt: now,
  };
}

/** Comparison exercise scaffolds (req 12). */
export interface CompareExercise {
  aId: ID;
  bId: ID;
  prompts: { key: string }[];
}

export function buildCompareExercise(aId: ID, bId: ID): CompareExercise {
  return {
    aId,
    bId,
    prompts: [
      { key: 'cmp.same' }, // What do they share?
      { key: 'cmp.different' }, // What makes them different?
      { key: 'cmp.swap' }, // What would break if we used A instead of B?
    ],
  };
}
