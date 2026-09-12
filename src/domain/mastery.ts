/**
 * Mastery engine (req 9, 45, 46, 74).
 * Mastery is NOT a simple percentage — it is a weighted, explainable
 * composition of independent evidence dimensions. Every number the UI shows
 * can be traced to real evidence (req 75).
 */
import { Attempt, ConceptState, EvidenceType, MasteryBreakdown, MasteryCheckpoints } from './types';
import { EVIDENCE_STRENGTH } from './types';
import { clamp01, DAY } from './utils';
import { prerequisiteHealth } from './knowledgeState';

export const DEFAULT_CHECKPOINTS: MasteryCheckpoints = {
  retrievals: 2,
  delayedRetrievals: 1,
  applications: 1,
  explanations: 1,
  minExplainScore: 0.7,
  minStabilityDays: 7,
  minMastery: 88,
  minPrerequisiteHealth: 0.6,
};

export interface MasteryContext {
  /** attempts for this concept, oldest → newest */
  attempts: Attempt[];
  /** mastery (0..100) of direct prerequisites */
  prereqMasteries: number[];
  /** active misconception count */
  activeMisconceptions: number;
  schedulerStabilityDays: number;
  lastReviewedAt: number | null;
  now: number;
  bestExplainScore: number | null;
}

/** Recency-weighted success rate for a subset of evidence types. */
function weightedSuccess(attempts: Attempt[], types: EvidenceType[], now: number, halfLifeDays: number): number {
  const relevant = attempts.filter((a) => types.includes(a.evidenceType));
  if (relevant.length === 0) return 0;
  let num = 0;
  let den = 0;
  for (const a of relevant) {
    const ageDays = Math.max(0, (now - a.ts) / DAY);
    // weight by evidence strength and exponential recency decay
    const w = EVIDENCE_STRENGTH[a.evidenceType] * Math.pow(0.5, ageDays / halfLifeDays);
    num += w * a.score;
    den += w;
  }
  return den > 0 ? clamp01(num / den) : 0;
}

export function computeMastery(ctx: MasteryContext): { breakdown: MasteryBreakdown; mastery: number } {
  const { attempts, now } = ctx;
  const S = Math.max(0.1, ctx.schedulerStabilityDays);

  // 1. retrieval: recall + delayed retrieval, delayed successes weigh 1.5×
  const retrieval = weightedSuccess(attempts, ['recall', 'delayed-retrieval'], now, Math.max(3, S));

  // 2. application: application + transfer
  const application = weightedSuccess(attempts, ['application', 'transfer'], now, Math.max(7, S * 2));

  // 3. explanation: best recent teach-back score (coverage), decayed
  const explainAttempts = attempts.filter((a) => a.evidenceType === 'explanation');
  let explanation = 0;
  if (explainAttempts.length) {
    const recent = explainAttempts.slice(-3);
    const best = Math.max(...recent.map((a) => a.score));
    const ageDays = Math.max(0, (now - recent[recent.length - 1].ts) / DAY);
    explanation = clamp01(best * Math.pow(0.5, ageDays / Math.max(14, S * 2)));
  }

  // 4. stability: log-scale of scheduler stability — 30+ days ≈ 1.0
  const stability = clamp01(Math.log10(S + 1) / Math.log10(31));

  // 5. recency: estimated retrievability R = e^(-t/S)
  const recency =
    ctx.lastReviewedAt == null ? 0 : clamp01(Math.exp(-Math.max(0, (now - ctx.lastReviewedAt) / DAY) / S));

  // 6. consistency: recent window must be clean; alternation is punished
  const last = attempts.slice(-5);
  let consistency = 0;
  if (last.length) {
    const ratio = last.filter((a) => a.correct).length / last.length;
    const last2Fails = last.slice(-2).some((a) => !a.correct) ? 0.15 : 0;
    consistency = clamp01(ratio - last2Fails);
  }

  // 7. prerequisite health: weakest-link
  const preHealth = prerequisiteHealth(ctx.prereqMasteries);

  // 8. free of active misconceptions
  const misconceptionFree = clamp01(1 - 0.3 * ctx.activeMisconceptions);

  const weighted =
    100 *
    (0.24 * retrieval +
      0.16 * application +
      0.12 * explanation +
      0.14 * stability +
      0.1 * recency +
      0.08 * consistency +
      0.1 * preHealth +
      0.06 * misconceptionFree);

  return {
    mastery: weighted,
    breakdown: {
      retrieval,
      application,
      explanation,
      stability,
      recency,
      consistency,
      prerequisiteHealth: preHealth,
      misconceptionFree,
      weighted,
    },
  };
}

/** Update checkpoint counters from a successful attempt (req 45). */
export function applyCheckpointEvidence(state: ConceptState, attempt: Attempt): ConceptState {
  const cp = state.checkpointProgress;
  const isDelayed = attempt.wasDelayed || attempt.daysSincePrev >= 1;
  if (attempt.score >= 0.7) {
    if (attempt.evidenceType === 'recall') cp.retrievals++;
    if (attempt.evidenceType === 'delayed-retrieval' || (attempt.evidenceType === 'recall' && isDelayed)) {
      cp.delayedRetrievals++;
    }
    if (attempt.evidenceType === 'application') cp.applications++;
    if (attempt.evidenceType === 'transfer') cp.applications++;
    if (attempt.evidenceType === 'explanation' && attempt.score >= DEFAULT_MIN_EXPLAIN) cp.explanations++;
  }
  return state;
}

export const DEFAULT_MIN_EXPLAIN = 0.7;

/**
 * Explainable "why mastered / why not" (req 75, 36).
 */
export function masteryGateReport(
  state: ConceptState,
  checkpoints: MasteryCheckpoints,
  conceptName: string,
): { key: string; params?: Record<string, string | number>; ok: boolean }[] {
  const cp = state.checkpointProgress;
  const report: { key: string; params?: Record<string, string | number>; ok: boolean }[] = [];
  const push = (key: string, ok: boolean, params?: Record<string, string | number>) => report.push({ key, ok, params });
  push('gate.mastery', state.mastery >= checkpoints.minMastery, {
    mastery: Math.round(state.mastery),
    needed: checkpoints.minMastery,
    concept: conceptName,
  });
  push('gate.retrievals', cp.retrievals >= checkpoints.retrievals, { have: cp.retrievals, need: checkpoints.retrievals });
  push('gate.delayed', cp.delayedRetrievals >= checkpoints.delayedRetrievals, {
    have: cp.delayedRetrievals,
    need: checkpoints.delayedRetrievals,
  });
  push('gate.applications', cp.applications >= checkpoints.applications, {
    have: cp.applications,
    need: checkpoints.applications,
  });
  push('gate.explanations', cp.explanations >= checkpoints.explanations, {
    have: cp.explanations,
    need: checkpoints.explanations,
  });
  push('gate.stability', state.scheduler.stabilityDays >= checkpoints.minStabilityDays, {
    have: Math.round(state.scheduler.stabilityDays * 10) / 10,
    need: checkpoints.minStabilityDays,
  });
  push('gate.misconceptions', state.activeMisconceptions.length === 0, { have: state.activeMisconceptions.length });
  push('gate.prereq', state.breakdown.prerequisiteHealth >= checkpoints.minPrerequisiteHealth, {
    have: Math.round(state.breakdown.prerequisiteHealth * 100),
    need: Math.round(checkpoints.minPrerequisiteHealth * 100),
  });
  return report;
}
