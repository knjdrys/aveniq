/**
 * Engine unit tests: scheduler, mastery, knowledge states, calibration, fatigue.
 */
import { describe, expect, it } from 'vitest';
import { schedule, retrievability, gradeFromAttempt, detectDecay, isDue, scheduleManual } from '../../src/domain/scheduler';
import { computeMastery, masteryGateReport, DEFAULT_CHECKPOINTS, applyCheckpointEvidence } from '../../src/domain/mastery';
import { deriveState, initialState, progressionLabel, prerequisiteHealth } from '../../src/domain/knowledgeState';
import { profile, addSample, brierScore, calibrationAdjustment } from '../../src/domain/calibration';
import { estimateFatigue } from '../../src/domain/fatigue';
import { Attempt, ConceptState } from '../../src/domain/types';
import { DAY } from '../../src/domain/utils';

const NOW = Date.parse('2026-03-02T09:00:00Z');

function schedState(over: Partial<ConceptState['scheduler']> = {}): ConceptState['scheduler'] {
  return {
    stabilityDays: 0,
    difficulty: 0.5,
    dueAt: 0,
    lastIntervalDays: 0,
    lapses: 0,
    streak: 0,
    reviews: 0,
    lastReviewedAt: null,
    lastGrade: null,
    ...over,
  };
}

describe('scheduler (req 28, 29, 30, 46)', () => {
  it('first successful step creates stability ≥ 0.5d and a due date', () => {
    const out = schedule(schedState(), { score: 0.9, hintsUsed: 0, evidenceType: 'recall', responseMs: 10000, correct: true, wasDelayed: false, daysSincePrev: 0 }, NOW, { difficultyBase: 0.5 });
    expect(out.scheduler.stabilityDays).toBeGreaterThanOrEqual(0.5);
    expect(out.scheduler.dueAt).toBeGreaterThan(NOW);
    expect(out.grade).toBe('good');
  });

  it('stability grows on successful review and caps at 10 years', () => {
    let s = schedState({ stabilityDays: 2, lastReviewedAt: NOW - 2 * DAY, reviews: 1, lastIntervalDays: 2, dueAt: NOW - 1 * DAY });
    for (let i = 0; i < 30; i++) {
      const out = schedule(s, { score: 0.95, hintsUsed: 0, evidenceType: 'recall', responseMs: 9000, correct: true, wasDelayed: true, daysSincePrev: s.lastIntervalDays }, NOW + i * DAY, { difficultyBase: 0.3 });
      expect(out.scheduler.stabilityDays).toBeGreaterThanOrEqual(s.stabilityDays);
      s = out.scheduler;
    }
    expect(s.stabilityDays).toBeLessThanOrEqual(3650);
  });

  it('lapse (score < 0.4) resets stability, counts a lapse, schedules relearning in 10 minutes', () => {
    const prev = schedState({ stabilityDays: 30, lastReviewedAt: NOW - 30 * DAY, reviews: 10, streak: 8, lastIntervalDays: 30, dueAt: NOW - DAY });
    const out = schedule(prev, { score: 0, hintsUsed: 0, evidenceType: 'delayed-retrieval', responseMs: 15000, correct: false, wasDelayed: true, daysSincePrev: 30 }, NOW, { difficultyBase: 0.5 });
    expect(out.lapsed).toBe(true);
    expect(out.scheduler.lapses).toBe(1);
    expect(out.scheduler.streak).toBe(0);
    expect(out.scheduler.stabilityDays).toBeLessThan(30);
    expect(out.scheduler.dueAt - NOW).toBeLessThan(20 * 60_000);
    expect(out.grade).toBe('again');
  });

  it('delayed retrieval success grows stability MORE than fresh review (req 46)', () => {
    const base = { score: 0.9, hintsUsed: 0, evidenceType: 'recall' as const, responseMs: 9000, correct: true };
    const fresh = schedule(schedState({ stabilityDays: 4, lastReviewedAt: NOW - 0.5 * DAY, reviews: 3, lastIntervalDays: 4, dueAt: NOW + 3 * DAY }), { ...base, wasDelayed: false, daysSincePrev: 0.5 }, NOW, { difficultyBase: 0.5 });
    const delayed = schedule(schedState({ stabilityDays: 4, lastReviewedAt: NOW - 6 * DAY, reviews: 3, lastIntervalDays: 4, dueAt: NOW - 2 * DAY }), { ...base, wasDelayed: true, daysSincePrev: 6 }, NOW, { difficultyBase: 0.5 });
    expect(delayed.scheduler.stabilityDays).toBeGreaterThan(fresh.scheduler.stabilityDays);
  });

  it('application/transfer evidence boosts growth (req 48)', () => {
    const base = { score: 0.9, hintsUsed: 0, responseMs: 9000, correct: true, wasDelayed: true, daysSincePrev: 5 };
    const recall = schedule(schedState({ stabilityDays: 4, lastReviewedAt: NOW - 5 * DAY, reviews: 3, lastIntervalDays: 4, dueAt: NOW - DAY }), { ...base, evidenceType: 'recall' }, NOW, { difficultyBase: 0.5 });
    const transfer = schedule(schedState({ stabilityDays: 4, lastReviewedAt: NOW - 5 * DAY, reviews: 3, lastIntervalDays: 4, dueAt: NOW - DAY }), { ...base, evidenceType: 'transfer' }, NOW, { difficultyBase: 0.5 });
    expect(transfer.scheduler.stabilityDays).toBeGreaterThan(recall.scheduler.stabilityDays);
  });

  it('hints reduce credit and grade (req 16)', () => {
    expect(gradeFromAttempt({ score: 0.95, hintsUsed: 0, evidenceType: 'recall', responseMs: 8000 })).toBe('easy');
    expect(gradeFromAttempt({ score: 0.95, hintsUsed: 3, evidenceType: 'recall', responseMs: 8000 })).not.toBe('easy');
    expect(gradeFromAttempt({ score: 0.95, hintsUsed: 5, evidenceType: 'recall', responseMs: 8000 })).toBe('hard');
  });

  it('retrievability decays exponentially; decay detection flags stale strong concepts (req 30)', () => {
    const s = schedState({ stabilityDays: 10, lastReviewedAt: NOW - 20 * DAY, dueAt: NOW - 10 * DAY });
    expect(retrievability(s, NOW)).toBeLessThan(0.2);
    expect(detectDecay(s, NOW)).toBe(true);
    expect(isDue(s, NOW)).toBe(true);
    const fresh = schedState({ stabilityDays: 10, lastReviewedAt: NOW - 1 * DAY, dueAt: NOW + 9 * DAY });
    expect(detectDecay(fresh, NOW)).toBe(false);
  });

  it('manual grading maps Again/Hard/Good/Easy (req 28)', () => {
    const prev = schedState({ stabilityDays: 5, lastReviewedAt: NOW - 5 * DAY, reviews: 5, lastIntervalDays: 5, dueAt: NOW });
    const again = scheduleManual(prev, 'again', NOW, 0.5);
    expect(again.lapsed).toBe(true);
    const easy = scheduleManual(prev, 'easy', NOW, 0.3);
    expect(easy.scheduler.stabilityDays).toBeGreaterThan(prev.stabilityDays * 2);
  });
});

describe('mastery engine (req 9, 45, 74, 75)', () => {
  const conceptId = 'c-x';
  function attempt(over: Partial<Attempt> = {}): Attempt {
    return {
      id: `a${Math.random()}`,
      conceptId,
      questionId: 'q',
      ts: NOW,
      correct: true,
      score: 1,
      responseMs: 10000,
      hintsUsed: 0,
      cognitiveLevel: 'recall',
      evidenceType: 'recall',
      daysSincePrev: 0,
      misconceptionIds: [],
      wasDelayed: false,
      context: 'review',
      ...over,
    };
  }

  it('recognition is weak evidence; delayed retrieval is strong (req 74)', () => {
    const recognition = computeMastery({
      attempts: [attempt({ evidenceType: 'recognition', ts: NOW - DAY, score: 1 })],
      prereqMasteries: [],
      activeMisconceptions: 0,
      schedulerStabilityDays: 1,
      lastReviewedAt: NOW - DAY,
      now: NOW,
      bestExplainScore: null,
    });
    const delayed = computeMastery({
      attempts: [attempt({ evidenceType: 'delayed-retrieval', ts: NOW - DAY, score: 1 })],
      prereqMasteries: [],
      activeMisconceptions: 0,
      schedulerStabilityDays: 1,
      lastReviewedAt: NOW - DAY,
      now: NOW,
      bestExplainScore: null,
    });
    expect(delayed.breakdown.retrieval).toBeGreaterThan(recognition.breakdown.retrieval);
    expect(delayed.mastery).toBeGreaterThan(recognition.mastery);
  });

  it('active misconceptions and weak prerequisites reduce mastery', () => {
    const attempts = [attempt(), attempt({ ts: NOW - 1 }, ), attempt({ ts: NOW - 2 })];
    const base = { attempts, schedulerStabilityDays: 10, lastReviewedAt: NOW - DAY, now: NOW, bestExplainScore: null };
    const clean = computeMastery({ ...base, prereqMasteries: [90, 90], activeMisconceptions: 0 });
    const troubled = computeMastery({ ...base, prereqMasteries: [10], activeMisconceptions: 2 });
    expect(troubled.mastery).toBeLessThan(clean.mastery);
    expect(troubled.breakdown.prerequisiteHealth).toBeLessThan(0.4);
  });

  it('mastery requires ALL evidence gates — explainable report (req 45, 75)', () => {
    const state: ConceptState = {
      ...initialState(conceptId, NOW),
      mastery: 92,
      checkpointProgress: { retrievals: 1, delayedRetrievals: 0, applications: 1, explanations: 1 },
      scheduler: schedState({ stabilityDays: 12, lastReviewedAt: NOW - DAY }),
      breakdown: { ...initialState(conceptId, NOW).breakdown, prerequisiteHealth: 0.9 },
    };
    const report = masteryGateReport(state, DEFAULT_CHECKPOINTS, 'X');
    const failed = report.filter((r) => !r.ok);
    expect(failed.some((r) => r.key === 'gate.delayed')).toBe(true);
    expect(failed.some((r) => r.key === 'gate.retrievals')).toBe(true);
    // filling the evidence closes the gates
    state.checkpointProgress.retrievals = 2;
    state.checkpointProgress.delayedRetrievals = 1;
    const report2 = masteryGateReport(state, DEFAULT_CHECKPOINTS, 'X');
    expect(report2.every((r) => r.ok)).toBe(true);
  });

  it('checkpoint evidence counts successful demonstrations by type', () => {
    const s = initialState('c', NOW);
    applyCheckpointEvidence(s, attempt({ evidenceType: 'recall', score: 1 }));
    applyCheckpointEvidence(s, attempt({ evidenceType: 'delayed-retrieval', score: 1, wasDelayed: true }));
    applyCheckpointEvidence(s, attempt({ evidenceType: 'application', score: 0.9 }));
    applyCheckpointEvidence(s, attempt({ evidenceType: 'explanation', score: 0.8 }));
    expect(s.checkpointProgress).toEqual({ retrievals: 1, delayedRetrievals: 1, applications: 1, explanations: 1 });
  });
});

describe('knowledge state machine (req 8, 73)', () => {
  it('progresses with mastery and requires gates for mastered', () => {
    const cps = DEFAULT_CHECKPOINTS;
    const s = initialState('c', NOW);
    expect(deriveState(s, cps).state).toBe('unknown');
    s.firstSeenAt = NOW;
    s.attempts = 1;
    s.mastery = 5;
    expect(deriveState(s, cps).state).toBe('encountered');
    s.attempts = 5;
    s.mastery = 30;
    expect(deriveState(s, cps).state).toBe('learning');
    s.mastery = 50;
    expect(deriveState(s, cps).state).toBe('familiar');
    s.mastery = 65;
    expect(deriveState(s, cps).state).toBe('developing');
    s.mastery = 80;
    expect(deriveState(s, cps).state).toBe('proficient'); // gates not met
    s.checkpointProgress = { retrievals: 2, delayedRetrievals: 1, applications: 1, explanations: 1 };
    s.scheduler.stabilityDays = 8;
    s.breakdown.prerequisiteHealth = 0.9;
    s.mastery = 90;
    expect(deriveState(s, cps).state).toBe('mastered');
  });

  it('states move backward: decaying & confused flags (req 8)', () => {
    const s = initialState('c', NOW);
    s.mastery = 90;
    s.attempts = 10;
    s.bestStabilityDays = 10;
    s.checkpointProgress = { retrievals: 3, delayedRetrievals: 2, applications: 2, explanations: 2 };
    s.scheduler.stabilityDays = 10;
    s.breakdown.prerequisiteHealth = 1;
    s.flag = 'decaying';
    const d = deriveState(s, DEFAULT_CHECKPOINTS);
    expect(d.state).toBe('mastered');
    expect(d.flag).toBe('decaying');
    s.activeMisconceptions = ['md1'];
    const c = deriveState(s, DEFAULT_CHECKPOINTS);
    expect(c.flag).toBe('confused');
  });

  it('progression ladder labels (req 73)', () => {
    expect(progressionLabel(0)).toContain('never heard');
    expect(progressionLabel(60)).toContain('solve');
    expect(progressionLabel(97)).toContain('teach');
  });

  it('prerequisite health is weakest-link weighted', () => {
    expect(prerequisiteHealth([])).toBe(1);
    expect(prerequisiteHealth([100, 100])).toBeCloseTo(1, 1);
    expect(prerequisiteHealth([100, 0])).toBeCloseTo(0.2, 1);
    expect(prerequisiteHealth([50, 50])).toBeCloseTo(0.5, 1);
  });
});

describe('confidence calibration (req 27)', () => {
  it('classifies over/underconfident with enough samples; unknown below 5', () => {
    expect(profile([]).verdict).toBe('unknown');
    const over = Array.from({ length: 10 }, (_, i) => ({ ts: i, conceptId: 'c', confidence: 5, correct: false, score: 0 }));
    expect(profile(over).verdict).toBe('overconfident');
    const under = Array.from({ length: 10 }, (_, i) => ({ ts: i, conceptId: 'c', confidence: 1, correct: true, score: 1 }));
    expect(profile(under).verdict).toBe('underconfident');
    const accurate = Array.from({ length: 10 }, (_, i) => ({ ts: i, conceptId: 'c', confidence: i % 2 ? 4 : 2, correct: i % 2 === 1, score: i % 2 === 1 ? 1 : 0 }));
    expect(profile(accurate).verdict).toBe('accurate');
  });

  it('samples are capped; brier score present with evidence', () => {
    let samples = addSample([], { ts: 1, conceptId: 'c', confidence: 3, correct: true, score: 1 });
    for (let i = 0; i < 200; i++) samples = addSample(samples, { ts: i, conceptId: 'c', confidence: 3, correct: true, score: 1 });
    expect(samples.length).toBe(100);
    expect(brierScore(samples)).toBeGreaterThanOrEqual(0);
    expect(brierScore([])).toBeNull();
  });

  it('calibration adapts practice (req 27)', () => {
    expect(calibrationAdjustment(profile([])).levelShift).toBe(0);
    const over = { verdict: 'overconfident' as const, confidence: 0.9, performance: 0.4, gap: 0.5, n: 10 };
    const adj = calibrationAdjustment(over);
    expect(adj.levelShift).toBe(1);
    expect(adj.preferRetrieval).toBe(true);
  });
});

describe('fatigue awareness (req 55)', () => {
  it('detects slow responses + rapid mistakes + long session', () => {
    const mk = (i: number, correct: boolean, ms: number): Attempt => ({
      id: `a${i}`,
      conceptId: 'c',
      questionId: 'q',
      ts: NOW + i * 60000,
      correct,
      score: correct ? 1 : 0,
      responseMs: ms,
      hintsUsed: 0,
      cognitiveLevel: 'recall',
      evidenceType: 'recall',
      daysSincePrev: 0,
      misconceptionIds: [],
      wasDelayed: false,
      context: 'review',
    });
    const early = [mk(0, true, 10000), mk(1, true, 12000)];
    const late = [mk(2, false, 6000), mk(3, false, 5000), mk(4, false, 6500)];
    const f = estimateFatigue({ sessionAttempts: [...early, ...late], sessionStartMs: NOW, now: NOW + 70 * 60000, typicalResponseMs: 10000 });
    expect(f.level).toBeGreaterThan(0.5);
    expect(f.recommendation).toMatch(/break|switch|reduce/);
    const ok = estimateFatigue({ sessionAttempts: early, sessionStartMs: NOW, now: NOW + 5 * 60000, typicalResponseMs: 11000 });
    expect(ok.recommendation).toBe('continue');
  });
});
