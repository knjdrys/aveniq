/**
 * Planning engines: session planning, recommendations, readiness, study planner,
 * progress metrics, motivation.
 */
import { describe, expect, it } from 'vitest';
import { planSession, sessionSize, buildItems, adapt } from '../../src/domain/sessionEngine';
import { recommend, bundle } from '../../src/domain/recommend';
import { computeReadiness } from '../../src/domain/readiness';
import { generatePlan, updatePlan } from '../../src/domain/planner';
import { computeProgress, retentionCurve, accuracyByLevel } from '../../src/domain/progress';
import { xpForAttempt, levelForXp, updateStreak, sessionSummaryKeys } from '../../src/domain/motivation';
import { Attempt, LearnerModel, StudySession } from '../../src/domain/types';
import { DAY } from '../../src/domain/utils';

const NOW = Date.parse('2026-03-02T09:00:00Z');

describe('time-aware sessions (req 32, 33, 34)', () => {
  it('sizes sessions to available time', () => {
    expect(sessionSize(5)).toBe('micro');
    expect(sessionSize(10)).toBe('focus');
    expect(sessionSize(25)).toBe('balance');
    expect(sessionSize(60)).toBe('deep');
  });

  it('micro (≤5 min) is a tiny meaningful unit, not the 60-min flow', () => {
    const plan = planSession({ minutes: 5, now: NOW, dueConcepts: ['a', 'b'], weakConcepts: [], newConcepts: [], gapConcepts: [], confusionPairs: [], misconceptionConcepts: [] });
    expect(plan.length).toBeLessThanOrEqual(2);
    expect(plan.reduce((s, p) => s + p.estMinutes, 0)).toBeLessThanOrEqual(6);
    expect(plan.some((p) => p.type === 'first-encounter')).toBe(false);
  });

  it('deep (60 min) includes first-encounter + retrieval + application + teach-back + reflection', () => {
    const plan = planSession({ minutes: 60, now: NOW, dueConcepts: ['a', 'b', 'c'], weakConcepts: [], newConcepts: ['n1'], gapConcepts: [], confusionPairs: [['x', 'y']], misconceptionConcepts: [] });
    const types = plan.map((p) => p.type);
    expect(types).toContain('first-encounter');
    expect(types).toContain('retrieval');
    expect(types).toContain('application');
    expect(types).toContain('teach-back');
    expect(types).toContain('comparison');
    expect(types).toContain('reflection');
  });

  it('misconceptions and confusion pairs jump the queue at every size', () => {
    for (const minutes of [5, 10, 25, 60]) {
      const plan = planSession({ minutes, now: NOW, dueConcepts: [], weakConcepts: [], newConcepts: [], gapConcepts: [], confusionPairs: [['x', 'y']], misconceptionConcepts: ['m'] });
      expect(plan.some((p) => p.conceptIds.includes('m'))).toBe(true);
    }
  });

  it('builds interleaved concrete items (req 47)', () => {
    const plan = planSession({ minutes: 25, now: NOW, dueConcepts: ['a', 'b', 'c', 'd'], weakConcepts: ['e'], newConcepts: [], gapConcepts: [], confusionPairs: [], misconceptionConcepts: [] });
    const items = buildItems(plan, { questionPicker: () => 'q1' });
    const questionConcepts = items.filter((i) => i.kind === 'question').map((i) => i.conceptId);
    expect(questionConcepts.length).toBeGreaterThan(3);
    expect(items[items.length - 1].kind).toBe('summary');
    // no two adjacent same-concept questions when alternatives exist
    for (let i = 1; i < questionConcepts.length; i++) {
      if (questionConcepts.slice(i).some((c) => c !== questionConcepts[i - 1])) {
        expect(questionConcepts[i]).not.toBe(questionConcepts[i - 1]);
      }
    }
  });

  it('adapts dynamically: failures → slow down; fatigue → break; success streak → challenge (req 34, 55)', () => {
    const session: StudySession = {
      id: 's', startedAt: NOW, endedAt: null, plannedMinutes: 10, plan: [], items: [], executed: [], status: 'active', adaptations: [], focus: { type: 'mixed' }, updatedAt: NOW,
    };
    const failing = adapt(session, [
      { itemId: 1, conceptId: 'a', correct: false, score: 0 },
      { itemId: 2, conceptId: 'b', correct: false, score: 0 },
      { itemId: 3, conceptId: 'a', correct: false, score: 0 },
    ], 0);
    expect(failing.some((a) => a.key === 'adapt.slowDown')).toBe(true);
    expect(failing.some((a) => a.key === 'adapt.challenge')).toBe(false);

    const tired = adapt(session, [{ itemId: 1, conceptId: 'a', correct: true, score: 1 }], 0.8);
    expect(tired.some((a) => a.key === 'adapt.fatigue')).toBe(true);

    const cruising = adapt(session, [
      { itemId: 1, conceptId: 'a', correct: true, score: 1 },
      { itemId: 2, conceptId: 'b', correct: true, score: 1 },
      { itemId: 3, conceptId: 'a', correct: true, score: 1 },
      { itemId: 4, conceptId: 'c', correct: true, score: 1 },
    ], 0);
    expect(cruising.some((a) => a.key === 'adapt.challenge')).toBe(true);
  });
});

describe('recommendation engine (req 31, 32, 75)', () => {
  it('ranks misconceptions and gaps above routine reviews, with reasons', () => {
    const recs = recommend({
      now: NOW,
      due: [{ conceptId: 'due1', overdueDays: 1, stabilityDays: 3, lastReviewedAt: NOW - 4 * DAY }],
      weak: [{ conceptId: 'weak1', mastery: 20 }],
      stale: [{ conceptId: 'stale1', retrievability: 0.5 }],
      newUnlocked: [{ conceptId: 'new1', examWeight: 0.5 }],
      misconceptions: [{ conceptId: 'mis1', triggerCount: 3, label: 'L' }],
      confusions: [{ aId: 'a', bId: 'b', count: 2 }],
      gaps: [{ conceptId: 'gap1', rootConceptId: 'root', occurrences: 2 }],
      goals: [],
    });
    expect(recs[0].type).toMatch(/misconception|gap|confusion/);
    const mis = recs.find((r) => r.type === 'misconception')!;
    expect(mis.reasons[0].key).toBe('rec.misconception');
    expect(mis.reasons[0].params!.count).toBe(3);
    const due = recs.find((r) => r.type === 'due')!;
    expect(due.reasons[0].key).toBe('rec.due');
    const gap = recs.find((r) => r.type === 'gap')!;
    expect(gap.relatedId).toBe('root');
  });

  it('exam urgency boosts weak concepts near the exam', () => {
    const recs = recommend({
      now: NOW,
      due: [],
      weak: [{ conceptId: 'w', mastery: 40 }],
      stale: [],
      newUnlocked: [],
      misconceptions: [],
      confusions: [],
      gaps: [],
      examUrgent: [{ conceptId: 'w', examTitle: 'Final', daysLeft: 2 }],
    });
    expect(recs[0].reasons.some((r) => r.key === 'rec.examUrgent')).toBe(true);
  });

  it('bundle fits the available minutes (req 32)', () => {
    const candidates = [
      { conceptId: 'a', type: 'due' as const, score: 90, reasons: [], estMinutes: 8 },
      { conceptId: 'b', type: 'weak' as const, score: 80, reasons: [], estMinutes: 3 },
      { conceptId: 'c', type: 'new' as const, score: 70, reasons: [], estMinutes: 8 },
    ];
    const five = bundle(candidates, 5);
    expect(five.map((c) => c.conceptId)).toEqual(['b']);
    const fifteen = bundle(candidates, 15);
    expect(fifteen.length).toBe(2);
  });
});

describe('exam readiness (req 35, 36, 75)', () => {
  const scope = ['c1', 'c2', 'c3', 'c4'];

  function readiness(over: {
    mastery?: Record<string, number>;
    states?: Record<string, string>;
    attempts?: { conceptId: string; correct: boolean; score: number; ts: number; cognitiveLevel: string }[];
    gaps?: number;
  }) {
    return computeReadiness({
      examId: 'ex1',
      now: NOW,
      conceptIds: scope,
      masteryOf: (id) => over.mastery?.[id] ?? 0,
      stateOf: (id) => over.states?.[id] ?? 'unknown',
      attempts: over.attempts ?? [],
      retrievabilityOf: () => 0.8,
      openGaps: over.gaps ?? 0,
    });
  }

  it('refuses to fake a score without evidence (req 75)', () => {
    const r = readiness({ attempts: [] });
    expect(r.insufficientEvidence).toBe(true);
    expect(r.reasons[0].key).toBe('rdy.insufficient');
  });

  it('computes an explainable score with evidence', () => {
    const attempts = Array.from({ length: 20 }, (_, i) => ({ conceptId: scope[i % 4], correct: i % 4 !== 0, score: i % 4 === 0 ? 0.2 : 0.95, ts: NOW - i * 60000, cognitiveLevel: 'recall' }));
    const strong = readiness({
      mastery: { c1: 90, c2: 85, c3: 80, c4: 88 },
      states: { c1: 'mastered', c2: 'proficient', c3: 'developing', c4: 'mastered' },
      attempts,
    });
    expect(strong.insufficientEvidence).toBe(false);
    expect(strong.score).toBeGreaterThan(60);
    expect(strong.reasons.some((r) => r.key === 'rdy.coverage')).toBe(true);
    expect(strong.reasons.some((r) => r.key === 'rdy.accuracy')).toBe(true);

    const weak = readiness({
      mastery: { c1: 20, c2: 10, c3: 15, c4: 30 },
      states: { c1: 'learning', c2: 'unknown', c3: 'emerging', c4: 'learning' },
      attempts,
      gaps: 3,
    });
    expect(weak.score).toBeLessThan(strong.score);
    expect(weak.weakConcepts.length).toBeGreaterThan(0);
    expect(weak.reasons.some((r) => r.key === 'rdy.gaps')).toBe(true);
  });
});

describe('study planner (req 37)', () => {
  const concepts = ['a', 'b', 'c', 'd', 'e', 'f'].map((id) => ({
    id,
    mastery: id === 'a' ? 0 : id === 'b' ? 95 : 30,
    state: (id === 'a' ? 'unknown' : id === 'b' ? 'mastered' : 'learning') as 'unknown' | 'mastered' | 'learning',
    examWeight: id === 'a' ? 1 : 0.5,
    prerequisites: id === 'b' ? ['a'] : [],
  }));

  it('generates a foundations-first plan within the exam window', () => {
    const plan = generatePlan({ now: NOW, subjectId: 's', dailyMinutes: 20, examDate: NOW + 7 * DAY, concepts, states: new Map() });
    expect(plan.days.length).toBeGreaterThan(0);
    expect(plan.days.length).toBeLessThanOrEqual(8);
    const firstDayConcepts = plan.days.flatMap((d) => d.items.map((i) => i.conceptId));
    // 'a' (unknown, exam-heavy) must be scheduled; 'b' (mastered) deprioritized or dropped
    expect(firstDayConcepts).toContain('a');
    expect(firstDayConcepts.indexOf('a')).toBeLessThan(firstDayConcepts.indexOf('b'));
  });

  it('updates automatically: behind → catch up; mastered → lighten (req 37)', () => {
    const plan = generatePlan({ now: NOW - 3 * DAY, subjectId: 's', dailyMinutes: 20, concepts, states: new Map() });
    // learner did nothing for 3 days
    const states = new Map([
      ['a', { attempts: 0, state: 'unknown', mastery: 0 } as never],
      ['b', { attempts: 0, state: 'unknown', mastery: 0 } as never],
    ]);
    const { plan: updated, adjustments } = updatePlan(plan, states, NOW);
    expect(updated.behind).toBe(true);
    expect(adjustments.some((a) => a.key === 'plan.behind')).toBe(true);
    // now: a fresh plan where everything gets mastered → future days are lightened
    const many = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i'].map((id, i) => ({
      id,
      mastery: id === 'b' ? 95 : 20,
      state: (id === 'b' ? 'mastered' : 'learning') as 'mastered' | 'learning',
      examWeight: 0.5,
      prerequisites: i === 0 ? [] : ['a'],
    }));
    const freshPlan = generatePlan({ now: NOW, subjectId: 's', dailyMinutes: 20, concepts: many, states: new Map() });
    const masteredStates = new Map(
      many.map((c) => [c.id, { attempts: 5, state: 'mastered' as const, flag: 'none' as const, mastery: 95 } as never]),
    );
    const { plan: updated2, adjustments: adjustments2 } = updatePlan(freshPlan, masteredStates, NOW);
    expect(adjustments2.some((a) => a.key === 'plan.lightened')).toBe(true);
  });
});

describe('progress & motivation (req 38, 57)', () => {
  function learner(over: Partial<LearnerModel> = {}): LearnerModel {
    return {
      id: 'l', name: 'L', createdAt: NOW, xp: 0, level: 1, streakDays: 0, lastStudyDay: null, studyDays: [],
      styleStats: {}, calibrationSamples: [], goals: [], updatedAt: NOW,
      settings: {} as never,
      ...over,
    };
  }
  function attempt(over: Partial<Attempt> = {}): Attempt {
    return {
      id: 'a', conceptId: 'c', questionId: null, ts: NOW, correct: true, score: 1, responseMs: 15000, hintsUsed: 0,
      cognitiveLevel: 'recall', evidenceType: 'recall', daysSincePrev: 0, misconceptionIds: [], wasDelayed: false,
      context: 'review', ...over,
    };
  }

  it('computes real metrics, not vanity stats', () => {
    const states = new Map([
      ['c1', { state: 'mastered', flag: 'none', firstSeenAt: NOW, attempts: 5, mastery: 95 } as never],
      ['c2', { state: 'learning', flag: 'confused', firstSeenAt: NOW, attempts: 3, mastery: 30 } as never],
      ['c3', { state: 'mastered', flag: 'decaying', firstSeenAt: NOW, attempts: 8, mastery: 90 } as never],
    ]);
    const attempts = [
      attempt({ evidenceType: 'delayed-retrieval', score: 1 }),
      attempt({ evidenceType: 'delayed-retrieval', score: 0.5, ts: NOW - 1 }),
      attempt({ evidenceType: 'application', score: 0.9 }),
      attempt({ evidenceType: 'explanation', score: 0.8 }),
    ];
    const report = computeProgress(states, attempts, learner({ xp: 250, streakDays: 4 }), 10);
    expect(report.mastered).toBe(1); // decaying one is flagged
    expect(report.confused).toBe(1);
    expect(report.decaying).toBe(1);
    expect(report.retrievalAccuracy).toBeCloseTo(0.75, 1);
    expect(report.applicationAccuracy).toBeCloseTo(0.9, 1);
    expect(report.delayedRetention).toBeCloseTo(0.75, 1);
    expect(report.studyMinutes).toBe(1);
  });

  it('retention curve buckets delayed retrievals', () => {
    const curve = retentionCurve([
      attempt({ evidenceType: 'delayed-retrieval', daysSincePrev: 1.5, score: 1 }),
      attempt({ evidenceType: 'delayed-retrieval', daysSincePrev: 6, score: 0.5 }),
      attempt({ evidenceType: 'delayed-retrieval', daysSincePrev: 20, score: 1 }),
    ]);
    expect(curve.find((c) => c.bucket === '1d')!.n).toBe(1);
    expect(curve.find((c) => c.bucket === '7d')!.n).toBe(1);
    expect(curve.find((c) => c.bucket === '14d+')!.n).toBe(1);
  });

  it('accuracy by cognitive level exposes real ability', () => {
    const levels = accuracyByLevel([attempt({ cognitiveLevel: 'recall', score: 1 }), attempt({ cognitiveLevel: 'transfer', score: 0.2 })]);
    expect(levels.find((l) => l.level === 'recall')!.accuracy).toBe(1);
    expect(levels.find((l) => l.level === 'transfer')!.accuracy).toBe(0.2);
  });

  it('XP rewards learning evidence, not clicks (req 57)', () => {
    const delayed = xpForAttempt(attempt({ evidenceType: 'delayed-retrieval', wasDelayed: true, daysSincePrev: 5 }));
    const recognition = xpForAttempt(attempt({ evidenceType: 'recognition' }));
    const wrong = xpForAttempt(attempt({ correct: false, score: 0 }));
    const delayedXP = delayed.reduce((s, a) => s + a.amount, 0);
    const recognitionXP = recognition.reduce((s, a) => s + a.amount, 0);
    const wrongXP = wrong.reduce((s, a) => s + a.amount, 0);
    expect(delayedXP).toBeGreaterThan(recognitionXP);
    expect(wrongXP).toBe(0);
  });

  it('levels follow a rising curve; streaks require successful retrievals', () => {
    expect(levelForXp(0)).toBe(1);
    expect(levelForXp(100)).toBe(2);
    expect(levelForXp(1000)).toBeGreaterThan(levelForXp(300));
    const l = learner();
    const day1 = updateStreak(l, attempt({ correct: true }), NOW);
    expect(day1.learner.streakDays).toBe(1);
    const sameDay = updateStreak(day1.learner, attempt({ correct: true }), NOW + 3600_000);
    expect(sameDay.learner.streakDays).toBe(1);
    const failedNextDay = updateStreak(sameDay.learner, attempt({ correct: false }), NOW + DAY);
    expect(failedNextDay.learner.streakDays).toBe(1); // no growth on failure
    const succeededNextDay = updateStreak(sameDay.learner, attempt({ correct: true }), NOW + DAY);
    expect(succeededNextDay.learner.streakDays).toBe(2);
  });

  it('session summary speaks the learning message (req 57, 82)', () => {
    const empty = sessionSummaryKeys({ newConcepts: 0, mastered: 0, misconceptionsFixed: 0, delayedRetrievals: 0, explainbacks: 0 });
    expect(empty[0].key).toBe('sum.keptAtIt');
    const rich = sessionSummaryKeys({ newConcepts: 2, mastered: 1, misconceptionsFixed: 1, delayedRetrievals: 3, explainbacks: 1 });
    expect(rich.some((r) => r.key === 'sum.mastered')).toBe(true);
    expect(rich.some((r) => r.key === 'sum.delayed')).toBe(true);
  });
});
