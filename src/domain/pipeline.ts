/**
 * CORE DATA PIPELINE (req 70). Mandatory.
 * A learner action flows through the complete pipeline:
 *
 *   ANSWER → ATTEMPT → CONFIDENCE → RESPONSE TIME → ERROR ANALYSIS →
 *   MASTERY UPDATE → SCHEDULING UPDATE → KNOWLEDGE-GAP UPDATE →
 *   INSIGHT UPDATE → RECOMMENDATION UPDATE → READINESS UPDATE →
 *   PROGRESS UPDATE → MOTIVATION UPDATE
 *
 * Nothing important exists as a disconnected feature. This function is pure:
 * it takes the current world state and returns every update to persist,
 * plus events for the append-only log (recovery & sync).
 */
import {
  Attempt,
  CalibrationSample,
  Concept,
  ConceptState,
  ConfusionPair,
  DomainEvent,
  EvidenceType,
  ID,
  Insight,
  KnowledgeGap,
  LearnerModel,
  MasteryCheckpoints,
  MisconceptionRecord,
  Question,
  XPAwardLike,
} from './types';
import * as types from './types';
import { computeMastery, applyCheckpointEvidence, DEFAULT_MIN_EXPLAIN } from './mastery';
import { schedule, retrievability, detectDecay } from './scheduler';
import { deriveState, initialState, markConfusedWith } from './knowledgeState';
import { applyTrigger, applyRetest, detectFromAttempt } from './misconception';
import { applyChoice, applyExerciseResult } from './confusion';
import { diagnose, upsertGap, closeResolvedGaps } from './gapAnalysis';
import * as insights from './insights';
import { xpForAttempt, xpForMilestone, updateStreak } from './motivation';
import { uid, clamp01 } from './utils';

export interface AttemptInput {
  conceptId: ID;
  questionId: ID | null;
  sessionId?: ID;
  /** raw correctness from the evaluator (MC, short answer, teach-back…) */
  score: number; // 0..1
  confidence?: number; // 1..5 (req 27)
  responseMs: number;
  hintsUsed?: number;
  cognitiveLevel: types.CognitiveLevel;
  /** computed by the caller from question type + delay (see evidenceTypeFor) */
  evidenceType?: EvidenceType;
  /** wrong MC choice tags / free-text misconceptions */
  misconceptionIds?: ID[];
  /** MC: concept the chosen (wrong) distractor represents → confusion detection */
  chosenConceptId?: ID;
  givenAnswer?: string;
  context: Attempt['context'];
}

/** Evidence type for an attempt (req 74). */
export function evidenceTypeFor(
  question: Question | null,
  opts: { daysSincePrev: number; isTeachBack?: boolean; isBlurt?: boolean; kind?: string; cognitiveLevel?: types.CognitiveLevel },
): EvidenceType {
  if (opts.isTeachBack || question?.kind === 'teach-back' || question?.kind === 'free') return 'explanation';
  if (opts.isBlurt || question?.kind === 'blurt') return 'explanation';
  if (opts.cognitiveLevel === 'explanation') return 'explanation';
  const delayed = opts.daysSincePrev >= 1;
  switch (question?.cognitiveLevel ?? opts.cognitiveLevel ?? 'recall') {
    case 'transfer':
      return 'transfer';
    case 'application':
    case 'problem-solving':
      return 'application';
    case 'explanation':
      return 'explanation';
    default:
      if (question?.kind === 'mc') return delayed ? 'delayed-retrieval' : 'recognition';
      return delayed ? 'delayed-retrieval' : 'recall';
  }
}

export interface PipelineWorld {
  concept: Concept;
  question: Question | null;
  state: ConceptState | null;
  attempts: Attempt[]; // previous attempts on this concept (old → new)
  misconceptions: Map<ID, MisconceptionRecord>; // by defId
  confusionPairs: Map<string, ConfusionPair>;
  gaps: KnowledgeGap[];
  learner: LearnerModel;
  prereqMasteries: number[]; // direct prerequisites' mastery (0..100)
  /** mastery lookup for gap analysis */
  masteryOf: (id: ID) => number;
  /** vocabulary the learner has decoded (lowercased words) */
  knownVocabulary: Set<string>;
  checkpoints: MasteryCheckpoints;
  now: number;
}

export interface PipelineResult {
  attempt: Attempt;
  state: ConceptState;
  /** misconception records upserted (keyed by defId) */
  misconceptionRecords: MisconceptionRecord[];
  /** confusion pairs upserted (keyed by pair id) */
  confusionPairs: ConfusionPair[];
  gaps: KnowledgeGap[];
  insights: Insight[];
  learner: LearnerModel;
  xpAwards: XPAwardLike[];
  events: DomainEvent[];
  /** signals for the UI */
  signals: {
    lapsed: boolean;
    decayed: boolean;
    misconceptionActivated: boolean;
    confusionActivated: boolean;
    masteredNow: boolean;
    delayedWin: boolean;
    grade: string;
    intervalDays: number;
  };
}

export function processAttempt(world: PipelineWorld, input: AttemptInput): PipelineResult {
  const { now } = world;
  const concept = world.concept;
  const prevAttempts = world.attempts;
  const lastAttempt = prevAttempts[prevAttempts.length - 1];
  const daysSincePrev = lastAttempt ? Math.max(0, (now - lastAttempt.ts) / 86_400_000) : 0;
  const wasDelayed = daysSincePrev >= 1;

  const evidenceType = input.evidenceType ?? evidenceTypeFor(world.question, { daysSincePrev, kind: world.question?.kind, cognitiveLevel: input.cognitiveLevel });

  /* 1. ATTEMPT + CONFIDENCE + RESPONSE TIME */
  const hintsUsed = input.hintsUsed ?? 0;
  const correct = input.score >= 0.7;
  const attempt: Attempt = {
    id: uid('a'),
    conceptId: input.conceptId,
    questionId: input.questionId,
    sessionId: input.sessionId,
    ts: now,
    correct,
    score: clamp01(input.score),
    confidence: input.confidence,
    responseMs: input.responseMs,
    hintsUsed,
    cognitiveLevel: input.cognitiveLevel,
    evidenceType,
    daysSincePrev,
    misconceptionIds: input.misconceptionIds ?? [],
    givenAnswer: input.givenAnswer,
    wasDelayed,
    context: input.context,
  };

  /* 2. ERROR ANALYSIS — misconceptions & confusion.
     Free-text explanations are ALWAYS scanned for misconception traps:
     a learner can pass overall while smuggling in a wrong idea (req 10, 81). */
  const misconceptionRecords = new Map(world.misconceptions);
  const scanFreeText = input.givenAnswer != null && (evidenceType === 'explanation' || !correct);
  const triggeredDefs = scanFreeText ? detectFromAttempt(concept, attempt, input.givenAnswer) : [];
  const triggeredFromTags = input.misconceptionIds ?? [];
  const allTriggered = [...new Set([...triggeredDefs, ...triggeredFromTags])];

  const confusionPairs = new Map(world.confusionPairs);
  let confusionActivated = false;
  if (!correct && input.chosenConceptId) {
    const upd = applyChoice(confusionPairs, input.chosenConceptId, concept.id, now);
    if (upd) {
      confusionPairs.set(upd.pair.id, upd.pair);
      confusionActivated = upd.activated;
    }
  }

  /* 3. STATE + SCHEDULING UPDATE */
  const state: ConceptState = world.state
    ? {
        ...world.state,
        evidence: { ...world.state.evidence },
        scheduler: { ...world.state.scheduler },
        checkpointProgress: { ...world.state.checkpointProgress },
        explanationStats: { ...world.state.explanationStats },
      }
    : initialState(concept.id, now);
  state.firstSeenAt ??= now;
  state.lastSeenAt = now;
  state.attempts += 1;
  if (correct) state.successes += 1;
  state.updatedAt = now;

  // success at delayed retrieval clears decay flag & counts evidence
  if (correct && (evidenceType === 'delayed-retrieval' || (wasDelayed && evidenceType !== 'recognition'))) {
    if (state.flag === 'decaying') state.flag = 'none';
  }

  if (correct) {
    state.lastSuccessAt = now;
    state.evidence[evidenceType] = (state.evidence[evidenceType] ?? 0) + 1;
    applyCheckpointEvidence(state, { ...attempt, score: Math.max(attempt.score, 0.8) });
  }

  // targeted retest of a known misconception? (context compare / targeted question)
  if (correct && world.question?.targetsMisconception) {
    const rec = misconceptionRecords.get(world.question.targetsMisconception);
    if (rec) {
      const updated = applyRetest(rec, true, now);
      misconceptionRecords.set(rec.defId, updated);
      if (updated.status === 'corrected') {
        state.activeMisconceptions = state.activeMisconceptions.filter((m) => m !== rec.defId);
      }
    }
  }

  const sched = schedule(
    state.scheduler,
    {
      score: attempt.score,
      hintsUsed: attempt.hintsUsed,
      evidenceType,
      responseMs: attempt.responseMs,
      correct,
      wasDelayed,
      daysSincePrev,
    },
    now,
    { difficultyBase: concept.difficultyBase },
  );
  state.scheduler = sched.scheduler;
  state.bestStabilityDays = Math.max(state.bestStabilityDays, sched.scheduler.stabilityDays);

  /* 4. MASTERY UPDATE */
  const activeMisconceptions = [...state.activeMisconceptions];
  const masteryCtx = {
    attempts: [...prevAttempts, attempt],
    prereqMasteries: world.prereqMasteries,
    activeMisconceptions: activeMisconceptions.length,
    schedulerStabilityDays: state.scheduler.stabilityDays,
    lastReviewedAt: state.scheduler.lastReviewedAt,
    now,
    bestExplainScore: state.bestExplainScore,
  };
  const { mastery, breakdown } = computeMastery(masteryCtx);
  const prevMastery = state.mastery;
  state.mastery = mastery;
  state.breakdown = breakdown;

  // misconception bookkeeping on the state
  let misconceptionActivated = false;
  const newInsights: Insight[] = [];
  for (const defId of allTriggered) {
    const upd = applyTrigger(misconceptionRecords, defId, concept.id, attempt.id, now);
    misconceptionRecords.set(defId, upd.record);
    if (!activeMisconceptions.includes(defId)) activeMisconceptions.push(defId);
    if (upd.activated) {
      misconceptionActivated = true;
      const def = concept.misconceptionDefs.find((d) => d.id === defId);
      newInsights.push(insights.misconceptionInsight(upd.record, def?.label ?? defId, concept.id, now));
    }
  }
  state.activeMisconceptions = [...new Set(activeMisconceptions)];

  /* 5. CONFUSION sync onto state */
  const confusedWith: ID[] = [];
  for (const pair of confusionPairs.values()) {
    if (pair.status !== 'active') continue;
    if (pair.aId === concept.id) confusedWith.push(pair.bId);
    if (pair.bId === concept.id) confusedWith.push(pair.aId);
  }
  markConfusedWith(state, confusedWith);
  if (confusionActivated) {
    const pair = [...confusionPairs.values()].find(
      (p) => (p.aId === concept.id || p.bId === concept.id) && p.abCount + p.baCount >= 2,
    );
    if (pair) newInsights.push(insights.confusionInsight(pair, now));
  }

  /* 6. KNOWLEDGE-GAP UPDATE (root cause, req 41) */
  let gaps = world.gaps;
  if (!correct && attempt.score < 0.55) {
    const root = diagnose({
      concept,
      attempt,
      state,
      masteryOf: world.masteryOf,
      unknownTerms: concept.terms
        .filter((t) => !world.knownVocabulary.has(t.word.toLowerCase()))
        .map((t) => t.word),
    });
    const { gap } = upsertGap(gaps, root, concept.id, now);
    const exists = gaps.some((g) => g.id === gap.id);
    gaps = exists ? gaps.map((g) => (g.id === gap.id ? gap : g)) : [...gaps, gap];
    if (gap.occurrences === 1 && gap.cause === 'prerequisite') {
      newInsights.push(insights.gapInsight(gap, now));
    }
  }
  // close gaps when the root cause is fixed
  if (correct) {
    gaps = closeResolvedGaps(gaps, concept.id, now, (g) => {
      if (g.cause === 'prerequisite' && g.rootConceptId) return world.masteryOf(g.rootConceptId) >= 45;
      if (g.cause === 'misconception') return !state.activeMisconceptions.length;
      if (g.cause === 'memory' || g.cause === 'application' || g.cause === 'careless') return attempt.score >= 0.8;
      return false;
    });
  }

  /* 7. KNOWLEDGE STATE (with backward moves) */
  const derived = deriveState(state, world.checkpoints);
  const prevState = world.state?.state ?? 'unknown';
  state.state = derived.state;
  state.flag = derived.flag;

  const masteredNow = derived.state === 'mastered' && prevState !== 'mastered';
  if (masteredNow) newInsights.push(insights.masteredInsight(concept.id, now));
  const delayedWin = correct && (evidenceType === 'delayed-retrieval') && daysSincePrev >= 1;
  if (delayedWin) newInsights.push(insights.delayedSuccessInsight(concept.id, daysSincePrev, now));

  // decay detection pass on this concept
  const decayed = detectDecay(state.scheduler, now) && state.bestStabilityDays >= 3 && !correct;
  if (state.state === 'proficient' || state.state === 'mastered') {
    if (detectDecay(state.scheduler, now)) {
      state.flag = state.flag === 'confused' ? 'confused' : 'decaying';
      if (state.flag === 'decaying') newInsights.push(insights.decayInsight(concept.id, state, now));
    }
  }

  // weakness insight (evidence-based)
  const weak = insights.weakInsight(concept.id, state, [...prevAttempts, attempt], now);
  if (weak) newInsights.push(weak);

  /* 8. LEARNER MODEL + CALIBRATION */
  let learner = world.learner;
  const calibrationSamples = input.confidence
    ? [...learner.calibrationSamples, { ts: now, conceptId: concept.id, confidence: input.confidence, correct, score: attempt.score } as CalibrationSample].slice(-100)
    : learner.calibrationSamples;

  /* 9. MOTIVATION UPDATE (req 57) */
  const xpAwards: XPAwardLike[] = xpForAttempt(attempt, {
    firstSuccess: prevAttempts.length === 0 && correct,
    masteryGain: mastery - prevMastery,
  });
  if (masteredNow) xpAwards.push(xpForMilestone('mastered'));
  const streakRes = updateStreak(learner, attempt, now);
  learner = streakRes.learner;
  if (streakRes.extended && learner.streakDays > 1) {
    xpAwards.push(xpForMilestone('streak', { days: learner.streakDays }));
    newInsights.push({
      id: uid('ins'),
      ts: now,
      kind: 'streak',
      key: 'ins.streak',
      params: { days: learner.streakDays },
      severity: 'good',
    });
  }
  const xpTotal = xpAwards.reduce((s, a) => s + a.amount, 0);
  learner = {
    ...learner,
    xp: learner.xp + xpTotal,
    calibrationSamples,
    updatedAt: now,
  };
  learner.level = Math.max(1, Math.floor(levelForXpSafe(learner.xp)));

  /* 10. EVENTS (recovery & sync feed) */
  const events: DomainEvent[] = [
    { ts: now, type: 'attempt.recorded', payload: { attemptId: attempt.id, conceptId: concept.id, score: attempt.score, evidenceType, correct } },
    { ts: now, type: 'mastery.updated', payload: { conceptId: concept.id, mastery: Math.round(mastery), prev: Math.round(prevMastery) } },
    { ts: now, type: 'scheduler.updated', payload: { conceptId: concept.id, stabilityDays: state.scheduler.stabilityDays, dueAt: state.scheduler.dueAt, grade: sched.grade } },
  ];
  if (allTriggered.length > 0) events.push({ ts: now, type: 'misconception.detected', payload: { conceptId: concept.id, defs: allTriggered } });
  if (misconceptionActivated) events.push({ ts: now, type: 'misconception.activated', payload: { conceptId: concept.id } });
  if (confusionActivated) events.push({ ts: now, type: 'confusion.activated', payload: { conceptId: concept.id } });
  if (masteredNow) events.push({ ts: now, type: 'concept.mastered', payload: { conceptId: concept.id } });
  if (delayedWin) events.push({ ts: now, type: 'delayed.retrievalSuccess', payload: { conceptId: concept.id, days: Math.round(daysSincePrev) } });

  return {
    attempt,
    state,
    misconceptionRecords: [...misconceptionRecords.values()],
    confusionPairs: [...confusionPairs.values()],
    gaps,
    insights: newInsights,
    learner,
    xpAwards,
    events,
    signals: {
      lapsed: sched.lapsed,
      decayed,
      misconceptionActivated,
      confusionActivated,
      masteredNow,
      delayedWin,
      grade: sched.grade,
      intervalDays: sched.intervalDays,
    },
  };
}

function levelForXpSafe(xp: number): number {
  let level = 1;
  let cost = 100;
  let remaining = xp;
  while (remaining >= cost && level < 100) {
    remaining -= cost;
    level++;
    cost = Math.round(cost * 1.15);
  }
  return level;
}

/** Comparison exercise outcome flows through the pipeline too (req 12, 48). */
export function processComparisonResult(
  world: PipelineWorld,
  input: { aId: ID; bId: ID; passed: boolean; otherPair: ConfusionPair; sessionId?: ID },
): { pair: ConfusionPair; insights: Insight[]; events: DomainEvent[]; learner: LearnerModel } {
  const pair = applyExerciseResult(input.otherPair, input.passed, world.now);
  const outInsights: Insight[] = [];
  const events: DomainEvent[] = [
    { ts: world.now, type: 'comparison.result', payload: { aId: input.aId, bId: input.bId, passed: input.passed } },
  ];
  let learner = world.learner;
  if (pair.status === 'resolved') {
    outInsights.push({
      id: uid('ins'),
      ts: world.now,
      kind: 'confusion',
      key: 'ins.confusionResolved',
      params: { a: pair.aId, b: pair.bId },
      severity: 'good',
    });
    events.push({ ts: world.now, type: 'confusion.resolved', payload: { aId: pair.aId, bId: pair.bId } });
    learner = { ...learner, xp: learner.xp + 20, updatedAt: world.now };
  }
  return { pair, insights: outInsights, events, learner };
}

/** Post-attempt pass over ALL concepts for decay detection (forgetting, req 30). */
export function detectAllDecay(
  states: Map<ID, ConceptState>,
  now: number,
): { state: ConceptState; insight: Insight }[] {
  const out: { state: ConceptState; insight: Insight }[] = [];
  for (const s of states.values()) {
    if (s.scheduler.lastReviewedAt == null) continue;
    const wasStrong = s.bestStabilityDays >= 3;
    const r = retrievability(s.scheduler, now);
    if (wasStrong && r < 0.6 && now >= s.scheduler.dueAt) {
      const updated: ConceptState = {
        ...s,
        flag: s.flag === 'confused' ? 'confused' : 'decaying',
        updatedAt: now,
      };
      out.push({ state: updated, insight: insights.decayInsight(s.conceptId, s, now) });
    }
  }
  return out;
}
