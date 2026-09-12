/**
 * Knowledge state machine (req 8, 73).
 * Evidence-based progression; concepts can move backward.
 */
import { ConceptState, ID, KnowledgeState, MasteryCheckpoints, StateFlag } from './types';
import { clamp01 } from './utils';

export function initialState(conceptId: ID, now: number): ConceptState {
  return {
    conceptId,
    state: 'unknown',
    flag: 'none',
    firstSeenAt: null,
    lastSeenAt: null,
    lastReviewedAt: null,
    lastSuccessAt: null,
    attempts: 0,
    successes: 0,
    bestStabilityDays: 0,
    evidence: { recognition: 0, recall: 0, application: 0, explanation: 0, 'delayed-retrieval': 0, transfer: 0 },
    mastery: 0,
    breakdown: {
      retrieval: 0,
      application: 0,
      explanation: 0,
      stability: 0,
      recency: 0,
      consistency: 0,
      prerequisiteHealth: 1,
      misconceptionFree: 1,
      weighted: 0,
    },
    checkpointProgress: { retrievals: 0, delayedRetrievals: 0, applications: 0, explanations: 0 },
    scheduler: {
      stabilityDays: 0,
      difficulty: 0.5,
      dueAt: 0,
      lastIntervalDays: 0,
      lapses: 0,
      streak: 0,
      reviews: 0,
      lastReviewedAt: null,
      lastGrade: null,
    },
    activeMisconceptions: [],
    lastExplainScore: null,
    bestExplainScore: null,
    explanationStats: {},
    updatedAt: now,
  };
}

/**
 * Derive the knowledge state from mastery + evidence + checkpoint gates.
 * "mastered" requires the mastery gate AND checkpoint evidence — not just a number.
 */
export function deriveState(
  s: ConceptState,
  checkpoints: MasteryCheckpoints,
): { state: KnowledgeState; flag: StateFlag } {
  const m = s.mastery;
  const hasPractice = s.attempts >= 2 || s.scheduler.reviews >= 1;

  let state: KnowledgeState;
  if (s.firstSeenAt == null && s.attempts === 0 && !s.selfClaimedFamiliar) state = 'unknown';
  else if (!hasPractice && m < 10) state = 'encountered';
  else if (m < 25) state = 'emerging';
  else if (m < 45) state = 'learning';
  else if (m < 60) state = 'familiar';
  else if (m < 75) state = 'developing';
  else {
    const cp = s.checkpointProgress;
    const gatesMet =
      m >= checkpoints.minMastery &&
      cp.retrievals >= checkpoints.retrievals &&
      cp.delayedRetrievals >= checkpoints.delayedRetrievals &&
      cp.applications >= checkpoints.applications &&
      cp.explanations >= checkpoints.explanations &&
      s.scheduler.stabilityDays >= checkpoints.minStabilityDays &&
      s.activeMisconceptions.length === 0 &&
      s.breakdown.prerequisiteHealth >= checkpoints.minPrerequisiteHealth;
    state = gatesMet ? 'mastered' : 'proficient';
  }

  // flags ride alongside the progression: decaying is set by forgetting detection,
  // cleared on a successful delayed retrieval; confused while misconceptions/confusion are active.
  let flag: StateFlag = 'none';
  if (s.flag === 'decaying' && (state === 'proficient' || state === 'mastered' || s.bestStabilityDays >= 3)) {
    flag = 'decaying';
  }
  if (s.activeMisconceptions.length > 0 || confusionCount(s) > 0) flag = 'confused';

  return { state, flag };
}

/** confusion pairs are synced onto the state by the pipeline as `confusedWith` */
export function confusionCount(s: ConceptState): number {
  const cw = (s as ConceptState & { confusedWith?: ID[] }).confusedWith;
  return cw ? cw.length : 0;
}

export function markConfusedWith(s: ConceptState, ids: ID[]): ConceptState {
  (s as ConceptState & { confusedWith?: ID[] }).confusedWith = ids;
  return s;
}

/** Human-readable progression ladder (req 73). */
export const PROGRESSION_LABELS: { min: number; label: string }[] = [
  { min: 0, label: "I've never heard this." },
  { min: 10, label: 'I recognize this.' },
  { min: 25, label: 'I can explain the basic idea.' },
  { min: 45, label: 'I understand how it works.' },
  { min: 60, label: 'I can solve a basic problem.' },
  { min: 75, label: 'I can use it in a new situation.' },
  { min: 85, label: 'I can distinguish it from similar concepts.' },
  { min: 92, label: 'I can explain it clearly.' },
  { min: 97, label: 'I can teach it — and remember it later.' },
];

export function progressionLabel(mastery: number): string {
  let label = PROGRESSION_LABELS[0].label;
  for (const p of PROGRESSION_LABELS) if (mastery >= p.min) label = p.label;
  return label;
}

/** Weakest-link prerequisite health (0..1) from direct prerequisite masteries (0..100). */
export function prerequisiteHealth(prereqMasteries: number[]): number {
  if (prereqMasteries.length === 0) return 1;
  const min = Math.min(...prereqMasteries);
  const avg = prereqMasteries.reduce((a, b) => a + b, 0) / prereqMasteries.length;
  return clamp01(0.6 * (min / 100) + 0.4 * (avg / 100));
}
