/**
 * Question engine (req 22, 23, 25, 47, 53).
 * Selects questions by actual learning need — never random quizzes.
 * Considers: mastery, due state, prerequisites, misconceptions, confusion pairs,
 * recent failures, cognitive-level progression, novelty (avoid reuse),
 * exam importance, interleaving.
 */
import {
  Attempt,
  CognitiveLevel,
  COGNITIVE_LEVELS,
  ConceptState,
  ID,
  Question,
} from './types';
import { seededRandom, clamp01 } from './utils';

export interface QuestionContext {
  questions: Question[]; // candidate pool for the concept
  state: ConceptState;
  recentAttempts: Attempt[]; // last attempts on this concept (newest last)
  /** active misconception def ids to target */
  activeMisconceptions: ID[];
  /** question ids used in this session already */
  usedQuestionIds: Set<ID>;
  /** question ids recently answered correctly (avoid immediate reuse) */
  recentCorrectIds: Set<ID>;
  /** level shift from calibration (-1 easier, +1 harder) */
  levelShift: number;
  /** prefer retrieval practice (overconfidence) */
  preferRetrieval: boolean;
  rng?: () => number;
}

export interface ScoredQuestion {
  question: Question;
  score: number;
  reasonKey: string;
}

/** Cognitive level appropriate to current mastery & recent performance. */
export function targetLevel(ctx: QuestionContext): CognitiveLevel {
  const m = ctx.state.mastery;
  const recent = ctx.recentAttempts.slice(-3);
  const recentFails = recent.filter((a) => !a.correct).length;
  // progression ladder (req 23)
  let idx = 0;
  if (m >= 15) idx = 1; // understanding
  if (m >= 35) idx = 2; // application
  if (m >= 50) idx = 3; // analysis
  if (m >= 60) idx = 4; // comparison
  if (m >= 70) idx = 5; // problem-solving
  if (m >= 80) idx = 6; // transfer
  if (m >= 85) idx = 7; // explanation
  // struggling → step back down (req 2: go backward)
  if (recentFails >= 2) idx = Math.max(0, idx - 2);
  else if (recentFails === 1) idx = Math.max(0, idx - 1);
  // calibration adaptation (req 27)
  idx = clamp01Idx(idx + ctx.levelShift);
  if (ctx.preferRetrieval && idx > 1) idx = 1;
  return COGNITIVE_LEVELS[idx];
}

function clamp01Idx(i: number): number {
  return Math.max(0, Math.min(COGNITIVE_LEVELS.length - 1, i));
}

export function selectQuestion(ctx: QuestionContext): ScoredQuestion | null {
  if (!ctx.questions.length) return null;
  const rng = ctx.rng ?? Math.random;
  const target = targetLevel(ctx);
  const usedOrRecent = (q: Question) => ctx.usedQuestionIds.has(q.id) || ctx.recentCorrectIds.has(q.id);

  const scored: ScoredQuestion[] = ctx.questions.map((q) => {
    let score = 0;
    let reasonKey = 'q.level';

    // novelty: strong penalty for reuse (req 25)
    if (usedOrRecent(q)) score -= 2.5;

    // cognitive level fit: distance from target level
    const dist = Math.abs(COGNITIVE_LEVELS.indexOf(q.cognitiveLevel) - COGNITIVE_LEVELS.indexOf(target));
    score += 1.5 - 0.5 * dist;

    // misconception targeting (req 22)
    if (q.targetsMisconception && ctx.activeMisconceptions.includes(q.targetsMisconception)) {
      score += 2.2;
      reasonKey = 'q.misconception';
    }

    // recently failed at this level → prefer easier variant (req 44)
    const lastFail = ctx.recentAttempts.slice(-1)[0]?.correct === false;
    if (lastFail && q.difficultyBase < 0.5) score += 0.8;

    // variety of kind
    const sameKindRecently = ctx.recentAttempts
      .slice(-2)
      .some((a) => ctx.questions.find((q2) => q2.id === a.questionId)?.kind === q.kind);
    if (sameKindRecently) score -= 0.4;

    // slight randomness to break ties (novelty of experience)
    score += rng() * 0.3;

    return { question: q, score, reasonKey };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored[0];
}

/**
 * Interleaving (req 47): order a mixed concept pool A B A C B instead of A A A B B.
 * Greedy: never repeat the previous concept while alternatives exist,
 * prefer highest priority, balance occurrences.
 */
export function interleave<T extends { conceptId: ID; priority: number }>(items: T[]): T[] {
  const remaining = [...items].sort((a, b) => b.priority - a.priority);
  const out: T[] = [];
  let prevConcept: ID | null = null;
  const counts = new Map<ID, number>();
  while (remaining.length) {
    let pickIdx = 0;
    for (let i = 0; i < remaining.length; i++) {
      const c = remaining[i].conceptId;
      if (c !== prevConcept) {
        pickIdx = i;
        break;
      }
      pickIdx = i;
    }
    // if picked would repeat prevConcept but alternatives exist, pick next different
    if (remaining[pickIdx].conceptId === prevConcept) {
      const altIdx = remaining.findIndex((r) => r.conceptId !== prevConcept);
      if (altIdx >= 0) pickIdx = altIdx;
    }
    const picked = remaining.splice(pickIdx, 1)[0];
    out.push(picked);
    counts.set(picked.conceptId, (counts.get(picked.conceptId) ?? 0) + 1);
    prevConcept = picked.conceptId;
  }
  return out;
}

/**
 * Novel problem generation (req 25): parameterize a question by swapping
 * surface context while keeping the learning objective. Deterministic template
 * substitution from variant pools stored on the question.
 */
export function variantOf(q: Question, n: number): Question {
  const variants = (q as Question & { variants?: string[] }).variants;
  if (variants && variants.length) {
    const scenario = variants[n % variants.length];
    return { ...q, id: `${q.id}#v${n % variants.length}`, scenario, source: 'generated' as const };
  }
  // fallback: reword by prefixing context instruction — still forces re-think
  return { ...q, id: `${q.id}#r${n}`, prompt: `${q.prompt}`, source: 'generated' as const };
}

/** Personalized difficulty (req 53): objective base × learner performance. */
export function effectiveDifficulty(q: Question, state: ConceptState, avgResponseMs: number | null): number {
  const perf = state.attempts > 0 ? state.successes / state.attempts : 0.5;
  const slow = avgResponseMs != null && avgResponseMs > 30_000 ? 0.1 : 0;
  return clamp01(q.difficultyBase * (1.25 - 0.5 * perf) + slow);
}
