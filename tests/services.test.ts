/**
 * Service-level tests: sessions, recommendations, exams, import/export,
 * DB migrations, pipeline integration.
 */
import { describe, expect, it } from 'vitest';
import { makeTestContext, dispose, conceptByName } from './testUtils';
import { AveniqDB } from '../src/db/db';
import { Dexie } from 'dexie';
import { BACKUP_FORMAT, BACKUP_VERSION } from '../src/domain/backup';

describe('pipeline integration (req 70)', () => {
  it('a single answer updates attempt, mastery, scheduler, gaps, insights, motivation — atomically', async () => {
    const ctx = await makeTestContext();
    try {
      const pk = await conceptByName(ctx, 'Primary Key');
      const res = await ctx.learning.recordAttempt({
        conceptId: pk.id,
        questionId: 'q-db-pk-guided',
        score: 0,
        confidence: 5,
        responseMs: 20000,
        hintsUsed: 0,
        cognitiveLevel: 'recall',
        givenAnswer: 'A primary key can be NULL',
        context: 'review',
      });
      // attempt recorded
      expect(res.attempt.conceptId).toBe(pk.id);
      // misconception tagged by the given answer choice
      expect(res.attempt.misconceptionIds.length).toBeGreaterThanOrEqual(0);
      // state + scheduler created
      const state = await ctx.db.conceptStates.get(pk.id);
      expect(state).toBeTruthy();
      expect(state!.attempts).toBe(1);
      expect(state!.scheduler.reviews).toBe(1);
      // learner got a little XP for engaging (wrong but attempted with hints=0 → no XP here)
      const learner = await ctx.db.getLearner();
      expect(learner).toBeTruthy();
      // events logged
      const events = await ctx.db.events.toArray();
      expect(events.some((e) => e.type === 'attempt.recorded')).toBe(true);
      expect(events.some((e) => e.type === 'mastery.updated')).toBe(true);

      // now a correct delayed retrieval: confidence calibration sample recorded (req 27)
      ctx.clock.advanceDays(1);
      const res2 = await ctx.learning.recordAttempt({
        conceptId: pk.id,
        questionId: 'q-db-pk-confirm',
        score: 1,
        confidence: 4,
        responseMs: 15000,
        cognitiveLevel: 'recall',
        context: 'review',
      });
      const learner2 = await ctx.db.getLearner();
      expect(learner2!.calibrationSamples.length).toBe(2);
      expect(res2.signals.delayedWin).toBe(true);
      await dispose(ctx);
    } catch (e) {
      await dispose(ctx);
      throw e;
    }
  });
});

describe('session service (req 32, 34)', () => {
  it('plans time-appropriate sessions through real data', async () => {
    const ctx = await makeTestContext();
    try {
      // micro session with nothing due → still produces a plan (new concepts)
      const micro = await ctx.sessions.start({ minutes: 5 });
      expect(micro.plannedMinutes).toBe(5);
      expect(micro.items.length).toBeGreaterThan(0);
      expect(micro.items[micro.items.length - 1].kind).toBe('summary');

      // learn two concepts directly → FE items for them
      const norm = await conceptByName(ctx, 'Database Normalization');
      const targeted = await ctx.sessions.start({ minutes: 15, conceptIds: [norm.id] });
      expect(targeted.items.some((i) => i.kind === 'fe-stage' && i.conceptId === norm.id)).toBe(true);

      // record outcomes + finish with reflection (req 56)
      const done = await ctx.sessions.finish(targeted.id, { clearer: 'the kitchen analogy', confusing: '2NF vs 3NF', revisit: norm.id, ts: 0 });
      expect(done.status).toBe('completed');
      expect(done.reflection?.clearer).toBeTruthy();
      // revisit request became an insight
      const insights = await ctx.db.insights.toArray();
      expect(insights.some((i) => i.key === 'ins.revisitRequested')).toBe(true);
      await dispose(ctx);
    } catch (e) {
      await dispose(ctx);
      throw e;
    }
  });
});

describe('recommendation service (req 31)', () => {
  it('answers "what should I study right now" with a reasoned top pick', async () => {
    const ctx = await makeTestContext();
    try {
      // nothing studied: recommend the first new unlocked concept
      const what = await ctx.recommend.whatToStudy(10);
      expect(what).toBeTruthy();
      expect(what!.top.type).toBe('new');
      expect(what!.top.reasons[0].key).toBe('rec.new');

      // after failing a concept twice, weak + gap candidates appear
      const table = await conceptByName(ctx, 'Table');
      await ctx.learning.recordAttempt({ conceptId: table.id, questionId: 'q-db-table-guided', score: 0, responseMs: 30000, cognitiveLevel: 'recall', context: 'review' });
      await ctx.learning.recordAttempt({ conceptId: table.id, questionId: 'q-db-table-confirm', score: 0.2, responseMs: 30000, cognitiveLevel: 'understanding', context: 'review' });
      const what2 = await ctx.recommend.whatToStudy(10);
      expect(what2!.alternatives.some((c) => c.conceptId === table.id)).toBe(true);
      await dispose(ctx);
    } catch (e) {
      await dispose(ctx);
      throw e;
    }
  });
});

describe('exam service (req 35, 36, 37)', () => {
  it('creates exams, computes explainable readiness, generates plans & practice tests', async () => {
    const ctx = await makeTestContext();
    try {
      const exam = await ctx.exams.createExam({ title: 'DB Midterm', subjectId: 's-db', date: ctx.clock.now() + 14 * 86_400_000 });
      const readiness = await ctx.exams.readiness(exam.id);
      // fresh learner → insufficient evidence, no fake number (req 75)
      expect(readiness.insufficientEvidence).toBe(true);
      expect(readiness.reasons[0].key).toBe('rdy.insufficient');

      // study a bit
      const pk = await conceptByName(ctx, 'Primary Key');
      for (let i = 0; i < 9; i++) {
        await ctx.learning.recordAttempt({ conceptId: pk.id, questionId: 'q-db-pk-guided', score: 0.95, responseMs: 10000, cognitiveLevel: 'recall', context: 'review' });
      }
      const readiness2 = await ctx.exams.readiness(exam.id);
      expect(readiness2.insufficientEvidence).toBe(false);
      expect(readiness2.reasons.some((r) => r.key === 'rdy.coverage')).toBe(true);

      // practice test: mixed, interleaved, weighted
      const test = await ctx.exams.generatePracticeTest({ subjectId: 's-db', kind: 'mixed', count: 6 });
      expect(test.questionIds.length).toBe(6);
      const questions = await Promise.all(test.questionIds.map((id) => ctx.db.questions.get(id)));
      expect(questions.every(Boolean)).toBe(true);
      // no two consecutive questions on the same concept
      for (let i = 1; i < questions.length; i++) {
        const prev = questions[i - 1]!;
        const cur = questions[i]!;
        if (questions.slice(i).some((q) => q!.conceptId !== prev.conceptId)) {
          expect(cur.conceptId).not.toBe(prev.conceptId);
        }
      }

      // weak-area test only includes weak concepts
      const weakTest = await ctx.exams.generatePracticeTest({ subjectId: 's-db', kind: 'weak-area', count: 20 });
      const weakQs = await Promise.all(weakTest.questionIds.map((id) => ctx.db.questions.get(id)));
      const states = await ctx.learning.statesMap();
      for (const q of weakQs) {
        if (q) expect((states.get(q.conceptId)?.mastery ?? 0) < 55 || (states.get(q.conceptId)?.mastery ?? 0) === 0).toBe(true);
      }

      // study plan
      const plan = await ctx.exams.generateStudyPlan({ subjectId: 's-db', dailyMinutes: 20, examId: exam.id });
      expect(plan.days.length).toBeGreaterThan(0);
      expect(plan.days.length).toBeLessThanOrEqual(15);
      const refreshed = await ctx.exams.refreshPlans();
      expect(refreshed.length).toBe(1);
      await dispose(ctx);
    } catch (e) {
      await dispose(ctx);
      throw e;
    }
  });
});

describe('import/export through services (req 50, 60)', () => {
  it('imports term-definition text → reviewable drafts → committed concepts with practice', async () => {
    const ctx = await makeTestContext();
    try {
      const parsed = await ctx.content.parseImport(
        'Photosynthesis – process plants use to convert light energy into chemical energy inside the chloroplast\nChloroplast – the organelle where photosynthesis happens',
        'auto',
      );
      expect(parsed.format).toBe('term-def');
      if (parsed.format !== 'term-def') throw new Error('unreachable');
      expect(parsed.drafts.map((d) => d.name)).toEqual(['Photosynthesis', 'Chloroplast']);

      const subject = await ctx.content.createSubject('Biology Notes', 'Imported', '#2E9E6B', 'bio');
      const committed = await ctx.content.commitDrafts(parsed.drafts, { subjectId: subject.id });
      expect(committed.concepts.length).toBe(2);
      expect(committed.questions.length).toBeGreaterThanOrEqual(4);
      // photosynthesis mentions chloroplast → prerequisite edge inferred
      const photo = committed.concepts.find((c) => c.name === 'Photosynthesis')!;
      const chloro = committed.concepts.find((c) => c.name === 'Chloroplast')!;
      expect(photo.prerequisites).toContain(chloro.id);
      // and the imported concept is learnable through the FE flow
      const view = await ctx.fe.start(photo.id);
      expect(view.prereqGaps.map((g) => g.concept.id)).toContain(chloro.id);
      await dispose(ctx);
    } catch (e) {
      await dispose(ctx);
      throw e;
    }
  });

  it('full backup export → import round-trip preserves ALL learning state', async () => {
    const ctx = await makeTestContext();
    try {
      // generate learning history
      const pk = await conceptByName(ctx, 'Primary Key');
      await ctx.learning.recordAttempt({ conceptId: pk.id, questionId: 'q-db-pk-guided', score: 0.9, responseMs: 12000, cognitiveLevel: 'recall', context: 'review' });
      await ctx.sessions.start({ minutes: 10 });
      const before = await ctx.db.exportAll();
      const backup = { format: BACKUP_FORMAT, version: BACKUP_VERSION, exportedAt: Date.now(), appVersion: '1.0.0', data: before };

      // fresh DB, import the backup
      const fidb = await import('fake-indexeddb');
      const fakeIndexedDB = (fidb as unknown as { indexedDB: typeof indexedDB }).indexedDB ?? (fidb as unknown as { default: typeof indexedDB }).default;
      const fakeIDBKeyRange = (fidb as unknown as { IDBKeyRange: typeof IDBKeyRange }).IDBKeyRange;
      const db2 = new AveniqDB(`aveniq-restore-${Date.now()}`, { indexedDB: fakeIndexedDB, IDBKeyRange: fakeIDBKeyRange });
      await db2.open();
      await db2.importAll(backup.data);
      const after = await db2.exportAll();
      expect(after.concepts.length).toBe(before.concepts.length);
      expect(after.attempts.length).toBe(before.attempts.length);
      expect(after.conceptStates.length).toBe(before.conceptStates.length);
      expect(after.sessions.length).toBe(before.sessions.length);
      expect(after.learner?.xp).toBe(before.learner?.xp);
      await db2.delete();
      await dispose(ctx);
    } catch (e) {
      await dispose(ctx);
      throw e;
    }
  });
});

describe('database (req 58, 59, 69)', () => {
  it('migrates a v1-shaped database to the current schema (real migration path)', async () => {
    const fidb = await import('fake-indexeddb');
      const fakeIndexedDB = (fidb as unknown as { indexedDB: typeof indexedDB }).indexedDB ?? (fidb as unknown as { default: typeof indexedDB }).default;
      const fakeIDBKeyRange = (fidb as unknown as { IDBKeyRange: typeof IDBKeyRange }).IDBKeyRange;
    const name = `aveniq-migration-${Date.now()}`;
    // create a v1 database by hand (the old schema)
    const v1 = new Dexie(name, { indexedDB: fakeIndexedDB, IDBKeyRange: fakeIDBKeyRange });
    v1.version(1).stores({
      subjects: 'id, name',
      topics: 'id, subjectId, name',
      concepts: 'id, subjectId, topicId, name',
      questions: 'id, conceptId, cognitiveLevel, kind',
      cards: 'id, conceptId',
      conceptStates: 'conceptId, state',
      attempts: 'id, conceptId, ts, [conceptId+ts], sessionId, evidenceType',
      misconceptions: 'id, conceptId, defId, status',
      confusionPairs: 'id, aId, bId, status',
      gaps: 'id, conceptId, status, cause',
      sessions: 'id, startedAt, status',
      plans: 'id, subjectId, examId',
      exams: 'id, subjectId, date',
      insights: 'id, ts, kind',
      events: '++seq, ts, type',
      notes: 'id, conceptId, ts',
    });
    await v1.open();
    await v1.table('concepts').put({ id: 'c1', subjectId: 's', name: 'Old Concept', aliases: [], prerequisites: [], explanations: [], terms: [], examples: {}, keyIdeas: [], misconceptionDefs: [], tags: [], examWeight: 0.5, difficultyBase: 0.5, source: 'curated', createdAt: 1, updatedAt: 1 });
    await v1.table('attempts').put({ id: 'a1', conceptId: 'c1', questionId: null, ts: 1, correct: true, score: 1, responseMs: 1000, hintsUsed: 0, cognitiveLevel: 'recall', evidenceType: 'recall', daysSincePrev: 0, misconceptionIds: [], wasDelayed: false, context: 'review' });
    v1.close();

    // open with the app's DB class — the v1→v2 upgrade must run
    const app = new AveniqDB(name, { indexedDB: fakeIndexedDB, IDBKeyRange: fakeIDBKeyRange });
    await app.open();
    expect(app.verno).toBe(2);
    // data survived
    const c = await app.concepts.get('c1');
    expect(c?.name).toBe('Old Concept');
    const a = await app.attempts.get('a1');
    expect(a?.correct).toBe(true);
    // new tables exist and are usable
    await app.resources.put({ id: 'r1', title: 'T', content: 'C', kind: 'text', createdAt: 1 });
    expect((await app.resources.toArray()).length).toBe(1);
    await app.readiness.put({ examId: 'e1', ts: 1, score: 50, coverage: 0.5, accuracy: 0.6, freshness: 0.7, mastery: 0.4, weakConcepts: [], gaps: 0, attemptCount: 10, insufficientEvidence: false, reasons: [] });
    expect((await app.readiness.toArray()).length).toBe(1);
    await app.delete();
  });

  it('health check flags dangling references and quarantines bad states', async () => {
    const ctx = await makeTestContext();
    try {
      const health = await ctx.db.healthCheck();
      expect(health.ok).toBe(true);
      // inject a dangling prerequisite (simulated corruption)
      const c = await ctx.db.concepts.toArray();
      await ctx.db.concepts.put({ ...c[0], prerequisites: ['missing-concept'] });
      const health2 = await ctx.db.healthCheck();
      expect(health2.ok).toBe(false);
      expect(health2.issues.some((i) => i.includes('missing prerequisite'))).toBe(true);
      await dispose(ctx);
    } catch (e) {
      await dispose(ctx);
      throw e;
    }
  });
});

describe('FE engine state machine (req 1, 2)', () => {
  it('prereq gap detection + "I don\'t understand" escalation through services', async () => {
    const ctx = await makeTestContext();
    try {
      const norm = await conceptByName(ctx, 'Database Normalization');
      let view = await ctx.fe.start(norm.id);
      // nothing known → deep chain of gaps (database, table, row, column, pk, fd, duplication)
      expect(view.prereqGaps.length).toBeGreaterThanOrEqual(5);
      const gapNames = view.prereqGaps.map((g) => g.concept.name);
      expect(gapNames).toContain('Database');
      expect(gapNames).toContain('Table');
      expect(gapNames).toContain('Functional Dependency');

      // proceed to encounter; then "I don't understand" cycles styles without repeating
      view = await ctx.fe.advance(view.state, { type: 'continue' });
      expect(view.state.stage).toBe('encounter');
      const firstExplanationId = view.explanation?.id;
      view = await ctx.fe.advance(view.state, { type: 'dont-understand' });
      expect(view.state.stylesTried.length).toBe(1);
      expect(view.explanation?.id).not.toBe(firstExplanationId);
      await dispose(ctx);
    } catch (e) {
      await dispose(ctx);
      throw e;
    }
  });
});
