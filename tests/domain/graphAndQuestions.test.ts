/**
 * Graph, gap analysis, question selection, misconception & confusion tests.
 */
import { describe, expect, it } from 'vitest';
import { findPrereqGaps, detectCycle, topoOrder, unlockFrontier, closureOf } from '../../src/domain/graph';
import { diagnose, upsertGap } from '../../src/domain/gapAnalysis';
import { selectQuestion, interleave, targetLevel, effectiveDifficulty } from '../../src/domain/questionSelect';
import { applyTrigger, applyRetest, buildErrorFirstFeedback, detectFromAttempt } from '../../src/domain/misconception';
import { applyChoice, applyExerciseResult, isKnownButConfused, pairId } from '../../src/domain/confusion';
import { Attempt, Concept, ConceptState, Question } from '../../src/domain/types';
import { initialState } from '../../src/domain/knowledgeState';

const NOW = Date.parse('2026-03-02T09:00:00Z');

const DB = 'c-db-database';
const TABLE = 'c-db-table';
const ROW = 'c-db-row';
const COL = 'c-db-column';
const PK = 'c-db-pk';
const FD = 'c-db-fd';
const NORM = 'c-db-norm';

function prereqMap(): Map<string, string[]> {
  return new Map([
    [NORM, [FD, 'c-db-dup']],
    [FD, [PK, COL, ROW]],
    [PK, [TABLE, ROW, COL]],
    [TABLE, [DB]],
    [ROW, [TABLE]],
    [COL, [TABLE]],
  ]);
}

describe('prerequisite graph (req 7)', () => {
  it('finds missing transitive prerequisites for a first encounter', () => {
    const mastery = new Map<string, number>([
      [DB, 90],
      [TABLE, 85],
      [ROW, 80],
      [COL, 75],
      [PK, 82],
      [FD, 10], // learner doesn't know functional dependency
      ['c-db-dup', 70],
    ]);
    const gaps = findPrereqGaps(NORM, prereqMap(), (id) => (mastery.get(id) ?? 0) < 30);
    expect(gaps.missing).toEqual([FD]);
    expect(gaps.chain.length).toBeGreaterThan(0);
  });

  it('detects cycles (data quality guard)', () => {
    const cyclic = new Map([
      ['a', ['b']],
      ['b', ['c']],
      ['c', ['a']],
    ]);
    expect(detectCycle(cyclic)).not.toBeNull();
    expect(detectCycle(prereqMap())).toBeNull();
  });

  it('topological order puts foundations first', () => {
    const order = topoOrder([NORM, FD, PK, TABLE, ROW, COL, DB], prereqMap())!;
    expect(order.indexOf(DB)).toBeLessThan(order.indexOf(TABLE));
    expect(order.indexOf(TABLE)).toBeLessThan(order.indexOf(ROW));
    expect(order.indexOf(FD)).toBeLessThan(order.indexOf(NORM));
  });

  it('unlock frontier respects prerequisites (req 31)', () => {
    const all = [DB, TABLE, ROW, COL, PK, FD, NORM];
    const known = new Set([DB]);
    const frontier = unlockFrontier(all, prereqMap(), (id) => known.has(id) || (id === DB));
    expect(frontier).toContain(TABLE);
    expect(frontier).not.toContain(ROW); // requires TABLE, not yet known
    expect(frontier).not.toContain(NORM);
  });

  it('closure of a concept includes all transitive prereqs', () => {
    const closure = closureOf([NORM], prereqMap());
    for (const id of [DB, TABLE, ROW, COL, PK, FD, 'c-db-dup']) expect(closure).toContain(id);
  });
});

describe('root-cause gap analysis (req 40, 41)', () => {
  const concept: Concept = {
    id: 'c-x',
    subjectId: 's',
    name: 'X',
    aliases: [],
    intro: '',
    whyItMatters: '',
    explanations: [],
    terms: [{ id: 't1', word: 'determinant', definition: '', simple: '', example: '', why: '' }],
    examples: {},
    keyIdeas: [],
    prerequisites: ['c-root'],
    misconceptionDefs: [
      {
        id: 'md1',
        label: 'Wrong idea',
        wrongIdea: '',
        whyPlausible: '',
        whereItBreaks: '',
        correction: '',
        contrast: { wrong: '', correct: '' },
        targetedExample: '',
        detectPatterns: ['always faster'],
      },
    ],
    examWeight: 0.5,
    difficultyBase: 0.5,
    tags: [],
    source: 'curated',
    createdAt: NOW,
    updatedAt: NOW,
  };

  function attempt(over: Partial<Attempt> = {}): Attempt {
    return {
      id: 'a1',
      conceptId: 'c-x',
      questionId: null,
      ts: NOW,
      correct: false,
      score: 0,
      confidence: undefined,
      responseMs: 20000,
      hintsUsed: 0,
      cognitiveLevel: 'application',
      evidenceType: 'application',
      daysSincePrev: 0,
      misconceptionIds: [],
      wasDelayed: false,
      context: 'review',
      ...over,
    };
  }

  it('diagnoses prerequisite gap when foundation is weak', () => {
    const res = diagnose({ concept, attempt: attempt(), state: initialState('c-x', NOW), masteryOf: () => 10, unknownTerms: [] });
    expect(res.cause).toBe('prerequisite');
    expect(res.rootConceptId).toBe('c-root');
  });

  it('diagnoses misconception when pattern triggered', () => {
    const res = diagnose({ concept, attempt: attempt({ misconceptionIds: ['md1'] }), state: initialState('c-x', NOW), masteryOf: () => 90, unknownTerms: [] });
    expect(res.cause).toBe('misconception');
  });

  it('diagnoses vocabulary gap on low-level questions with unknown terms', () => {
    const res = diagnose({ concept, attempt: attempt({ cognitiveLevel: 'understanding', evidenceType: 'recall' }), state: initialState('c-x', NOW), masteryOf: () => 90, unknownTerms: ['determinant'] });
    expect(res.cause).toBe('vocabulary');
  });

  it('diagnoses interpretation problem on high confidence + wrong', () => {
    const state = initialState('c-x', NOW);
    const res = diagnose({ concept, attempt: attempt({ confidence: 5, score: 0, cognitiveLevel: 'application' }), state, masteryOf: () => 90, unknownTerms: [] });
    expect(['interpretation', 'application']).toContain(res.cause);
  });

  it('diagnoses memory failure when previously recalled, now blank', () => {
    const state = initialState('c-x', NOW);
    state.evidence.recall = 3;
    const res = diagnose({ concept, attempt: attempt({ score: 0, cognitiveLevel: 'recall', evidenceType: 'recall', hintsUsed: 0, wasDelayed: true, daysSincePrev: 20 }), state, masteryOf: () => 90, unknownTerms: [] });
    expect(res.cause).toBe('memory');
  });

  it('upsert dedupes gaps and counts occurrences', () => {
    const gaps: never[] = [];
    const res1 = upsertGap(gaps, { cause: 'prerequisite', rootConceptId: 'c-root', detail: '', evidence: [] }, 'c-x', NOW);
    expect(res1.isNew).toBe(true);
    const res2 = upsertGap([res1.gap], { cause: 'prerequisite', rootConceptId: 'c-root', detail: '', evidence: [] }, 'c-x', NOW + 1000);
    expect(res2.isNew).toBe(false);
    expect(res2.gap.occurrences).toBe(2);
  });
});

describe('question engine (req 22, 23, 25, 47, 53)', () => {
  function q(id: string, level: Question['cognitiveLevel'], diff = 0.4): Question {
    return {
      id,
      conceptId: 'c',
      kind: 'mc',
      cognitiveLevel: level,
      prompt: `Q ${id}`,
      choices: [{ id: 'ch0', text: 'a', correct: true }, { id: 'ch1', text: 'b', correct: false }],
      hints: [],
      difficultyBase: diff,
      source: 'curated',
      createdAt: NOW,
      updatedAt: NOW,
    };
  }

  it('targets the cognitive level appropriate to mastery (req 23)', () => {
    const mk = (mastery: number, fails = 0) => {
      const s = initialState('c', NOW);
      s.mastery = mastery;
      s.attempts = 5;
      const recent = Array.from({ length: fails }, () => ({ id: 'a', conceptId: 'c', questionId: null, ts: NOW, correct: false, score: 0, responseMs: 1, hintsUsed: 0, cognitiveLevel: 'recall' as const, evidenceType: 'recall' as const, daysSincePrev: 0, misconceptionIds: [], wasDelayed: false, context: 'review' as const }));
      return { questions: [q('r', 'recall'), q('u', 'understanding'), q('a', 'application'), q('t', 'transfer'), q('e', 'explanation')], state: s, recentAttempts: recent, activeMisconceptions: [], usedQuestionIds: new Set<string>(), recentCorrectIds: new Set<string>(), levelShift: 0, preferRetrieval: false, rng: () => 0 };
    };
    expect(targetLevel(mk(15))).toBe('understanding');
    expect(targetLevel(mk(40))).toBe('application');
    expect(targetLevel(mk(85))).toBe('explanation');
    expect(targetLevel(mk(85, 2))).toBe('problem-solving'); // struggling → step back 2 levels
    const overconfident = mk(60, 0);
    overconfident.levelShift = 1;
    overconfident.preferRetrieval = true;
    expect(targetLevel(overconfident)).toBe('understanding');
  });

  it('avoids reused questions; prefers misconception-targeted (req 22, 25)', () => {
    const s = initialState('c', NOW);
    s.mastery = 30;
    const target = q('mis-q', 'recall');
    target.targetsMisconception = 'md1';
    const picked = selectQuestion({
      questions: [q('used', 'recall'), target, q('fresh', 'recall')],
      state: s,
      recentAttempts: [],
      activeMisconceptions: ['md1'],
      usedQuestionIds: new Set(['used']),
      recentCorrectIds: new Set(),
      levelShift: 0,
      preferRetrieval: false,
      rng: () => 0,
    });
    expect(picked?.question.id).toBe('mis-q');
    expect(picked?.reasonKey).toBe('q.misconception');
  });

  it('interleaves concepts A B A C B instead of A A A (req 47)', () => {
    const items = [
      { conceptId: 'A', priority: 1, n: 1 },
      { conceptId: 'A', priority: 1, n: 2 },
      { conceptId: 'A', priority: 1, n: 3 },
      { conceptId: 'B', priority: 1, n: 1 },
      { conceptId: 'C', priority: 1, n: 1 },
    ];
    const ordered = interleave(items);
    for (let i = 1; i < ordered.length; i++) {
      const prev = ordered[i - 1].conceptId;
      const cur = ordered[i].conceptId;
      const hasAlternative = ordered.slice(i).some((x) => x.conceptId !== prev);
      if (hasAlternative) expect(cur).not.toBe(prev);
    }
  });

  it('personalized difficulty scales with performance (req 53)', () => {
    const s = initialState('c', NOW);
    s.attempts = 10;
    s.successes = 9;
    const hard = effectiveDifficulty({ ...q('x', 'recall', 0.6) }, s, null);
    s.successes = 1;
    const easy = effectiveDifficulty({ ...q('x', 'recall', 0.6) }, s, null);
    expect(hard).toBeLessThan(easy);
  });
});

describe('misconception engine (req 10, 26)', () => {
  it('activates after 2 triggers; correction needs 2 retest passes', () => {
    const records = new Map();
    const r1 = applyTrigger(records, 'md1', 'c', 'a1', NOW);
    expect(r1.activated).toBe(false);
    const r2 = applyTrigger(new Map([[r1.record.defId, r1.record]]), 'md1', 'c', 'a2', NOW + 1);
    expect(r2.activated).toBe(true);
    expect(r2.record.triggerCount).toBe(2);
    const half = applyRetest(r2.record, true, NOW + 2);
    expect(half.status).toBe('active');
    const full = applyRetest(half, true, NOW + 3);
    expect(full.status).toBe('corrected');
  });

  it('detects misconceptions in free text via patterns', () => {
    const concept: Concept = {
      ...{ id: 'c' } as Concept,
      misconceptionDefs: [
        {
          id: 'md1',
          label: 'Always faster',
          wrongIdea: '',
          whyPlausible: '',
          whereItBreaks: '',
          correction: 'Normalization optimizes correctness, not speed.',
          contrast: { wrong: '', correct: '' },
          targetedExample: '',
          detectPatterns: ['always faster', 'makes queries faster'],
        },
      ],
    } as Concept;
    const attempt: Attempt = { id: 'a', conceptId: 'c', questionId: null, ts: NOW, correct: false, score: 0, responseMs: 1, hintsUsed: 0, cognitiveLevel: 'explanation', evidenceType: 'explanation', daysSincePrev: 0, misconceptionIds: [], wasDelayed: false, context: 'learn' };
    const hits = detectFromAttempt(concept, attempt, 'I think normalization makes queries faster because it removes data');
    expect(hits).toContain('md1');
  });

  it('builds error-first feedback that teaches the mistake (req 26)', () => {
    const concept = { name: 'Normalization', misconceptionDefs: [] } as unknown as Concept;
    const fb = buildErrorFirstFeedback(
      { ...concept, misconceptionDefs: [{ id: 'md1', label: 'Always faster', wrongIdea: 'It is always faster', whyPlausible: 'Sounds good', whereItBreaks: 'Joins cost time', correction: 'Optimizes correctness', contrast: { wrong: 'w', correct: 'c' }, targetedExample: 'Report got slower' }] } as Concept,
      'Normalization makes it faster',
      'It optimizes correctness',
      concept.misconceptionDefs[0] as never,
    );
    expect(fb.whyPlausible).toBeTruthy();
    expect(fb.correctIdea).toContain('correctness');
    expect(fb.howToRecognize).toBeTruthy();
  });
});

describe('confusion network (req 11, 12)', () => {
  it('creates a pair when choosing concept B on an A question; activates at 2 mix-ups', () => {
    const pairs = new Map();
    const A = 'c-mitosis';
    const B = 'c-meiosis';
    // learner chooses B (wrong concept) when answer is A
    const u1 = applyChoice(pairs, B, A, NOW)!;
    expect(u1.created).toBe(true);
    pairs.set(u1.pair.id, u1.pair);
    const u2 = applyChoice(pairs, B, A, NOW + 1)!;
    expect(u2.activated).toBe(true);
    pairs.set(u2.pair.id, u2.pair);
    // known but confused?
    const masteryOf = (id: string) => (id === A || id === B ? 60 : 0);
    expect(isKnownButConfused(u2.pair, masteryOf)).toBe(true);
    // resolution requires 2 passes
    const half = applyExerciseResult(u2.pair, true, NOW + 2);
    expect(half.status).toBe('active');
    const full = applyExerciseResult(half, true, NOW + 3);
    expect(full.status).toBe('resolved');
    expect(pairId(A, B)).toBe(pairId(B, A));
  });
});
