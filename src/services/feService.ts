/**
 * First-Encounter service (req 1, 2, 72).
 * Drives the 13-stage zero-knowledge flow against real data:
 * prerequisite detection, vocabulary, checks, simplification, teach-back, scheduling.
 */
import { AveniqDB } from '../db/db';
import { Clock, realClock } from '../domain/clock';
import {
  Concept,
  Explanation,
  FEState,
  ID,
  Question,
  SessionItem,
} from '../domain/types';
import { checkPrerequisites, feQuestionFilter, pickExplanationForStage, stageLayer } from '../domain/feEngine';
import { evaluateTeachBack, TeachBackEvaluation } from '../domain/teachback';
import { LearningService } from './learningService';
import * as pipeline from '../domain/pipeline';
import { uid } from '../domain/utils';

export type FEEvent =
  | { type: 'continue' }
  | { type: 'dont-understand' }
  | { type: 'check-failed' }
  | { type: 'check-passed' }
  | { type: 'prereq-teach'; conceptId: ID }
  | { type: 'prereq-skip' };

export interface FEView {
  state: FEState;
  concept: Concept;
  /** current stage content */
  explanation?: Explanation;
  /** missing prerequisites detected at prereq-check */
  prereqGaps: { concept: Concept; mastery: number }[];
  /** guided/confirm/apply question */
  question?: Question;
  /** teach-back evaluation of the last submission */
  teachbackEval?: TeachBackEvaluation;
}

export class FEService {
  constructor(
    private db: AveniqDB,
    private learning: LearningService,
    private clock: Clock = realClock,
  ) {}

  /** Start (or resume) the first-encounter flow for a concept. */
  async start(conceptId: ID, sessionId?: ID): Promise<FEView> {
    const concept = await this.learning.concept(conceptId);
    if (!concept) throw new Error('Unknown concept');
    const states = await this.learning.statesMap();
    const prereqMap = await this.prereqMap();
    const { gaps, chain } = checkPrerequisites(concept, prereqMap, (id) => states.get(id)?.mastery ?? 0);
    const state: FEState = {
      conceptId,
      stage: 'prereq-check',
      startedAt: this.clock.now(),
      stylesTried: [],
      failedChecks: 0,
      simplified: false,
      prereqGaps: gaps,
      prereqStack: [],
      vocabIndex: 0,
      vocabShown: [],
      attempts: [],
    };
    await this.db.events.add({ ts: this.clock.now(), type: 'fe.started', payload: { conceptId, gaps, chain } });
    return this.view(state, concept, sessionId);
  }

  async prereqMap(): Promise<Map<ID, ID[]>> {
    const concepts = await this.db.concepts.toArray();
    return new Map(concepts.filter((c) => c.prerequisites.length).map((c) => [c.id, c.prerequisites]));
  }

  /** Advance the flow from a stage event; records attempts for check stages. */
  async advance(
    state: FEState,
    event: FEEvent,
    payload?: {
      /** for check stages: score/confidence/response/hints */
      score?: number;
      confidence?: number;
      responseMs?: number;
      hintsUsed?: number;
      givenAnswer?: string;
      sessionId?: ID;
      /** teach-back text */
      text?: string;
    },
  ): Promise<FEView> {
    const concept = await this.learning.concept(state.conceptId);
    if (!concept) throw new Error('Unknown concept');
    const learner = await this.learning.getLearner();
    let s: FEState = { ...state, stylesTried: [...state.stylesTried] };
    let teachbackEval: TeachBackEvaluation | undefined;

    const record = async (input: pipeline.AttemptInput) => {
      const res = await this.learning.recordAttempt(input);
      s.attempts.push(res.attempt.id);
      return res;
    };

    const stage = s.stage;
    switch (event.type) {
      case 'continue': {
        if (stage === 'prereq-check') {
          // gaps were shown; learner chose to proceed teaching prereqs (deepest first) or knows them
          s.stage = 'encounter';
          s.stylesTried = [];
        } else if (stage === 'vocabulary') {
          s.vocabIndex += 1;
          if (s.vocabIndex >= concept.terms.length) {
            s.stage = 'example';
            s.stylesTried = [];
          }
        } else if (stage === 'teach-back') {
          s.stage = 'scheduled';
        } else if (stage === 'scheduled') {
          s.stage = 'done';
        } else {
          const next = nextStageOf(stage);
          s.stage = next;
          s.stylesTried = [];
        }
        break;
      }
      case 'dont-understand': {
        // alternative explanation, never the same paragraph (req 5)
        const pick = pickExplanationForStage(concept, stage, learner.styleStats, s.stylesTried);
        if (pick) {
          s.stylesTried.push(pick.style);
          await this.learning.recordStyleOutcome(concept.id, pick.style, false);
        } else {
          // exhausted → go backward to the weakest prerequisite (req 5, 2)
          const prereqMap = await this.prereqMap();
          const states = await this.learning.statesMap();
          const { gaps } = checkPrerequisites(concept, prereqMap, (id) => states.get(id)?.mastery ?? 0);
          const target = gaps[0] ?? concept.prerequisites[0];
          if (target) {
            s.prereqStack = [...s.prereqStack, { conceptId: target, stage: 'prereq-check' }];
            const prereqView = await this.start(target);
            s.failedChecks += 1;
            return { ...prereqView, state: s };
          }
        }
        break;
      }
      case 'check-failed': {
        s.failedChecks += 1;
        // record the failed attempt
        await record({
          conceptId: concept.id,
          questionId: null,
          sessionId: payload?.sessionId,
          score: payload?.score ?? 0,
          confidence: payload?.confidence,
          responseMs: payload?.responseMs ?? 30000,
          hintsUsed: payload?.hintsUsed ?? 0,
          cognitiveLevel: stage === 'apply' ? 'application' : stage === 'teach-back' ? 'explanation' : 'understanding',
          givenAnswer: payload?.givenAnswer,
          context: 'learn',
        });
        if (stage === 'teach-back') {
          const evalRes = evaluateTeachBack(concept, payload?.text ?? '');
          teachbackEval = evalRes;
          break; // stay on stage, retry
        }
        // simplify: retry the same stage with a fresh explanation
        const retryStage: FEState['stage'] = stage === 'guided-check' || stage === 'confirm' ? 'plain' : stage;
        const pick = pickExplanationForStage(concept, retryStage, learner.styleStats, s.stylesTried);
        if (pick) s.stylesTried.push(pick.style);
        s.simplified = true;
        break; // stay on stage
      }
      case 'check-passed': {
        const evidenceMap: Record<string, { level: 'recall' | 'understanding' | 'application' | 'explanation'; kind: string }> = {
          'guided-check': { level: 'recall', kind: 'mc' },
          confirm: { level: 'understanding', kind: 'short' },
          apply: { level: 'application', kind: 'apply-scenario' },
          'teach-back': { level: 'explanation', kind: 'teach-back' },
        };
        const meta = evidenceMap[stage];
        if (meta) {
          const score = stage === 'teach-back' ? (payload?.score ?? 0.8) : Math.max(0.8, payload?.score ?? 0.9);
          const res = await record({
            conceptId: concept.id,
            questionId: null,
            sessionId: payload?.sessionId,
            score,
            confidence: payload?.confidence,
            responseMs: payload?.responseMs ?? 30000,
            hintsUsed: payload?.hintsUsed ?? 0,
            cognitiveLevel: meta.level,
            givenAnswer: payload?.text ?? payload?.givenAnswer,
            context: 'learn',
          });
          if (stage === 'teach-back') {
            const evalRes = evaluateTeachBack(concept, payload?.text ?? '');
            teachbackEval = evalRes;
            // success → record the winning explanation styles
            await this.learning.recordStyleOutcome(concept.id, 'definition', true);
          }
          void res;
        }
        if (stage === 'teach-back') {
          s.stage = 'scheduled';
        } else {
          s.stage = nextStageOf(stage);
          s.stylesTried = [];
        }
        break;
      }
      case 'prereq-teach': {
        // handled by caller via view.state.prereqStack
        break;
      }
      case 'prereq-skip': {
        await this.learning.markSelfFamiliar(payload?.givenAnswer ? state.conceptId : state.conceptId);
        break;
      }
    }

    await this.db.events.add({ ts: this.clock.now(), type: 'fe.advance', payload: { conceptId: concept.id, stage, event: event.type, next: s.stage } });
    return this.view(s, concept, payload?.sessionId);
  }

  /** Check-stage questions: pick the right difficulty for the stage. */
  async pickCheckQuestion(conceptId: ID, stage: FEState['stage']): Promise<Question | undefined> {
    const concept = await this.learning.concept(conceptId);
    if (!concept) return undefined;
    const questions = await this.learning.questionsFor(conceptId);
    const states = await this.learning.statesMap();
    const attempts = await this.db.attempts.where('conceptId').equals(conceptId).toArray();
    const usedIds = new Set<string>();
    const pool = questions.filter((q) => feQuestionFilter(stage, q));
    if (!pool.length) return questions[0];
    // avoid exact reuse when alternatives exist
    for (const q of pool) {
      if (!attempts.some((a) => a.questionId === q.id)) return q;
    }
    void states;
    return pool[attempts.length % pool.length];
  }

  /** Evaluate a teach-back text without recording (preview for the UI). */
  async evaluateTeachBack(conceptId: ID, text: string): Promise<TeachBackEvaluation> {
    const concept = await this.learning.concept(conceptId);
    if (!concept) throw new Error('Unknown concept');
    const known = await this.learning.knownVocabulary();
    return evaluateTeachBack(concept, text, { knownVocabulary: known });
  }

  /** Build the current view content for a FE state. */
  private async view(state: FEState, concept: Concept, sessionId?: ID): Promise<FEView> {
    const learner = await this.learning.getLearner();
    let explanation: Explanation | undefined;
    if (['encounter', 'why', 'analogy', 'plain', 'build', 'example'].includes(state.stage)) {
      explanation = pickExplanationForStage(concept, state.stage, learner.styleStats, state.stylesTried) ?? undefined;
      if (!explanation && state.stylesTried.length > 0) {
        explanation = pickExplanationForStage(concept, state.stage, learner.styleStats, []) ?? undefined;
      }
    }
    let prereqGaps: FEView['prereqGaps'] = [];
    if (state.stage === 'prereq-check') {
      const prereqMap = await this.prereqMap();
      const states = await this.learning.statesMap();
      const { gaps } = checkPrerequisites(concept, prereqMap, (id) => states.get(id)?.mastery ?? 0);
      const gapConcepts: FEView['prereqGaps'] = [];
      for (const g of gaps) {
        const gc = await this.learning.concept(g);
        if (gc) gapConcepts.push({ concept: gc, mastery: states.get(g)?.mastery ?? 0 });
      }
      prereqGaps = gapConcepts;
    }
    const question =
      state.stage === 'guided-check' || state.stage === 'confirm' || state.stage === 'apply'
        ? await this.pickCheckQuestion(concept.id, state.stage)
        : undefined;
    void sessionId;
    return { state, concept, explanation, prereqGaps, question };
  }
}

function nextStageOf(stage: FEState['stage']): FEState['stage'] {
  const order: FEState['stage'][] = [
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

/** Session item for a FE stage (used by the session view renderer). */
export function feStageItem(conceptId: ID, stage: FEState['stage']): SessionItem {
  return { kind: 'fe-stage', conceptId, feStage: stage };
}

export function newSessionId(): ID {
  return uid('ses');
}
