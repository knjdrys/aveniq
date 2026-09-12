/**
 * First-Encounter Engine (req 1, 2, 72).
 * 13-stage zero-knowledge teaching flow. Never dumps the full explanation.
 * Detects missing prerequisites first, teaches vocabulary, builds from
 * analogy → plain language → example → formal → retrieval → teach-back → scheduling.
 * Can stop, slow down, repeat, simplify, or go backward when the learner struggles.
 */
import {
  Concept,
  ExplanationStyle,
  FEStage,
  FEState,
  ID,
  LayerKind,
  Question,
  StyleStat,
} from './types';
import { findPrereqGaps } from './graph';
import { nextAlternative, pickExplanation, recordStyleOutcome, ReExplainChoice } from './explanation';

export function startFE(conceptId: ID, now: number): FEState {
  return {
    conceptId,
    stage: 'prereq-check',
    startedAt: now,
    stylesTried: [],
    failedChecks: 0,
    simplified: false,
    prereqGaps: [],
    prereqStack: [],
    vocabIndex: 0,
    vocabShown: [],
    attempts: [],
  };
}

/** Check prerequisites; returns gaps (mastery < 30 or unknown). */
export function checkPrerequisites(
  concept: Concept,
  prerequisites: Map<ID, ID[]>,
  masteryOf: (id: ID) => number,
): { gaps: ID[]; chain: ID[] } {
  const result = findPrereqGaps(concept.id, prerequisites, (id) => {
    if (id === concept.id) return false;
    return masteryOf(id) < 30;
  });
  return { gaps: result.missing, chain: result.chain };
}

/** Stage order for driving the flow. */
export function nextStage(stage: FEStage): FEStage {
  const order: FEStage[] = [
    'prereq-check',
    'encounter',
    'why',
    'analogy',
    'plain',
    'vocabulary',
    'example',
    'build',
    'guided-check',
    'confirm',
    'apply',
    'retrieval',
    'teach-back',
    'scheduled',
    'done',
  ];
  const i = order.indexOf(stage);
  return order[Math.min(i + 1, order.length - 1)];
}

/** Layer used at each FE stage. */
export function stageLayer(stage: FEStage): LayerKind {
  switch (stage) {
    case 'encounter':
      return 'what';
    case 'analogy':
      return 'eli5';
    case 'plain':
      return 'eli5';
    case 'example':
      return 'simple-example';
    case 'build':
      return 'how-it-works';
    default:
      return 'what';
  }
}

/** Explanation stage? (needs style cycling / "I don't understand") */
export function isExplanationStage(stage: FEStage): boolean {
  return stage === 'encounter' || stage === 'why' || stage === 'analogy' || stage === 'plain' || stage === 'build';
}

export interface FEAdvance {
  state: FEState;
  /** if set: teach this prerequisite now (pushed onto the stack) */
  pushPrereq?: ID;
  /** signal to UI: simplified fallback active */
  changed: 'stage' | 'style' | 'prereq' | 'none';
}

export function advance(
  state: FEState,
  event:
    | { type: 'continue' }
    | { type: 'dont-understand' }
    | { type: 'check-failed'; questionKind: 'guided' | 'confirm' }
    | { type: 'check-passed' }
    | { type: 'prereq-known' } // learner claims to know the prerequisite → quick check
    | { type: 'prereq-taught' }, // nested FE for prerequisite finished
  concept: Concept,
  stats: Partial<Record<ExplanationStyle, StyleStat>>,
): FEAdvance {
  const s: FEState = { ...state, stylesTried: [...state.stylesTried] };

  if (event.type === 'prereq-taught') {
    // pop the prerequisite stack, resume outer flow
    s.prereqStack = s.prereqStack.slice(0, -1);
    if (s.prereqStack.length === 0 && s.stage === 'prereq-check') {
      s.stage = 'encounter';
      s.stylesTried = [];
      return { state: s, changed: 'stage' };
    }
    return { state: s, changed: 'prereq' };
  }

  if (event.type === 'dont-understand') {
    const layer = stageLayer(s.stage);
    const choice: ReExplainChoice = nextAlternative(concept, layer, stats, s.stylesTried, s.failedChecks);
    if (choice.explanation) {
      s.stylesTried.push(choice.explanation.style);
      return { state: s, changed: 'style' };
    }
    if (choice.escalateToPrereq && s.prereqGaps.length > 0) {
      // go backward in the prerequisite graph (req 5)
      const target = s.prereqGaps[0];
      s.prereqStack = [...s.prereqStack, { conceptId: target, stage: 'prereq-check' }];
      return { state: s, pushPrereq: target, changed: 'prereq' };
    }
    // nothing left: restart at the simplest layer with fresh styles
    s.stylesTried = [];
    s.simplified = true;
    return { state: s, changed: 'style' };
  }

  if (event.type === 'check-failed') {
    s.failedChecks += 1;
    // struggling: simplify (req 2 — stop/slow/repeat/simplify/backward)
    if (s.failedChecks >= 2 && concept.prerequisites.length > 0) {
      const layer = stageLayer(s.stage);
      void layer;
      const weakest = concept.prerequisites[0];
      s.prereqStack = [...s.prereqStack, { conceptId: weakest, stage: 'prereq-check' }];
      return { state: s, pushPrereq: weakest, changed: 'prereq' };
    }
    // repeat current stage with a different explanation
    const layer = s.stage === 'guided-check' || s.stage === 'confirm' ? 'eli5' : stageLayer(s.stage);
    const alt = pickExplanation(concept, layer, stats, s.stylesTried);
    if (alt) s.stylesTried.push(alt.style);
    s.simplified = true;
    return { state: s, changed: 'style' };
  }

  if (event.type === 'check-passed') {
    s.failedChecks = Math.max(0, s.failedChecks - 1);
    s.stage = nextStage(s.stage);
    s.stylesTried = [];
    return { state: s, changed: 'stage' };
  }

  // continue
  s.stage = nextStage(s.stage);
  s.stylesTried = [];
  return { state: s, changed: 'stage' };
}

/** Question selection for FE stages: guided check (easy), confirm, apply. */
export function feQuestionFilter(
  stage: FEStage,
  question: Question,
): boolean {
  switch (stage) {
    case 'guided-check':
      return (question.cognitiveLevel === 'recall' || question.cognitiveLevel === 'understanding') && question.difficultyBase <= 0.4;
    case 'confirm':
      return question.cognitiveLevel === 'understanding';
    case 'apply':
      return question.cognitiveLevel === 'application' || question.cognitiveLevel === 'transfer';
    default:
      return false;
  }
}

export function feDone(state: FEState): boolean {
  return state.stage === 'done';
}
