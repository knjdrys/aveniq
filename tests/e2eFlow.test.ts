/**
 * END-TO-END LEARNING TEST (req 81).
 *
 * The exact scenario from the specification, running through the REAL services
 * (Dexie on fake-indexeddb, pipeline, FE engine, scheduler, misconception
 * engine) with a simulated clock. NO database manipulation — every step is a
 * normal learner action through service APIs.
 *
 *  1. Student encounters a concept they have never heard before (Normalization)
 *  2. Opens it → system identifies missing prerequisite knowledge (functional dependency)
 *  3. Explains the vocabulary
 *  4. Presents an everyday analogy
 *  5. Provides a concrete example
 *  6. Checks basic understanding
 *  7. Learner FAILS → system simplifies the explanation
 *  8. Learner succeeds
 *  9. System introduces the formal definition
 * 10. Learner answers a basic question
 * 11. Applies the concept to a new scenario
 * 12. Explains it (teach-back)
 * 13. System detects one misconception → corrected
 * 14. Concept scheduled for later retrieval
 * 15. Returns two days later → retrieved without the explanation → succeeds
 * 16. Memory stability increases
 * 17. Days later an application question appears → succeeds → mastery strengthens
 */
import { describe, expect, it } from 'vitest';
import { makeTestContext, conceptByName, dispose } from './testUtils';
import { FEState } from '../src/domain/types';
import { retrievability } from '../src/domain/scheduler';

describe('END-TO-END: unknown → understood → remembered (req 81)', () => {
  it('runs the complete first-encounter → decay-proof cycle', async () => {
    const ctx = await makeTestContext();
    try {
      const { clock, fe, learning, db } = ctx;

      // precondition: learner knows the foundations (table/row/column/duplication mastered earlier
      // via normal study — simulate with real attempts through the pipeline)
      const database = await conceptByName(ctx, 'Database');
      const table = await conceptByName(ctx, 'Table');
      const row = await conceptByName(ctx, 'Row');
      const col = await conceptByName(ctx, 'Column');
      const dup = await conceptByName(ctx, 'Data Duplication');
      const pk = await conceptByName(ctx, 'Primary Key');
      for (const c of [database, table, row, col, pk, dup]) {
        // a few successful spaced reviews each — genuine evidence
        for (let day = 0; day < 3; day++) {
          await learning.recordAttempt({
            conceptId: c.id,
            questionId: null,
            score: 0.95,
            responseMs: 9000,
            cognitiveLevel: 'recall',
            context: 'review',
          });
          clock.advanceDays(1);
        }
      }

      /* ---------------------------------------------------------------
       * STEP 1-2: encounter a never-heard concept; missing prerequisite detected
       * --------------------------------------------------------------- */
      const norm = await conceptByName(ctx, 'Database Normalization');
      const fd = await conceptByName(ctx, 'Functional Dependency');

      let view = await fe.start(norm.id);

      // prerequisite check MUST flag functional dependency (mastery still 0)
      expect(view.state.stage).toBe('prereq-check');
      const gapNames = view.prereqGaps.map((g) => g.concept.name);
      expect(gapNames).toContain('Functional Dependency');
      expect(view.prereqGaps.find((g) => g.concept.id === fd.id)!.mastery).toBe(0);

      /* ---------------------------------------------------------------
       * TEACH THE MISSING PREREQUISITE FIRST (zero-knowledge flow, req 72)
       * --------------------------------------------------------------- */
      let fdView = await fe.start(fd.id);
      expect(fdView.state.stage).toBe('prereq-check');
      // FD's prereqs (row/column/pk) are known → no gaps → straight to encounter
      expect(fdView.prereqGaps.length).toBe(0);

      // walk the 13 stages for the prerequisite (req 2)
      const stagesSeen: string[] = [fdView.state.stage];
      const walkFE = async (v: typeof fdView): Promise<typeof fdView> => {
        stagesSeen.push(v.state.stage);
        return v;
      };
      fdView = await walkFE(fdView);

      // encounter → why → analogy (everyday connection)
      fdView = await fe.advance(fdView.state, { type: 'continue' });
      expect(fdView.state.stage).toBe('encounter');
      expect(fdView.explanation?.content).toBeTruthy();
      fdView = await fe.advance(fdView.state, { type: 'continue' });
      expect(fdView.state.stage).toBe('why');
      fdView = await fe.advance(fdView.state, { type: 'continue' });
      expect(fdView.state.stage).toBe('analogy');
      expect(fdView.explanation?.style).toBe('analogy');

      // plain language
      fdView = await fe.advance(fdView.state, { type: 'continue' });
      expect(fdView.state.stage).toBe('plain');
      // vocabulary decoder stage: terms of FD
      fdView = await fe.advance(fdView.state, { type: 'continue' });
      expect(fdView.state.stage).toBe('vocabulary');
      expect(fd.terms.length).toBeGreaterThan(0);
      // walk all terms
      for (let i = 0; i < fd.terms.length; i++) {
        fdView = await fe.advance(fdView.state, { type: 'continue' });
      }
      expect(fdView.state.stage).toBe('example');
      // concrete example
      expect(fdView.explanation).toBeTruthy();
      fdView = await fe.advance(fdView.state, { type: 'continue' });
      expect(fdView.state.stage).toBe('build'); // step-by-step

      /* ---------------------------------------------------------------
       * STEP 6-8: guided check — FAIL first, system simplifies, then succeed
       * --------------------------------------------------------------- */
      fdView = await fe.advance(fdView.state, { type: 'continue' });
      expect(fdView.state.stage).toBe('guided-check');
      expect(fdView.question).toBeTruthy(); // very easy question
      expect(['recall', 'understanding']).toContain(fdView.question!.cognitiveLevel);

      // learner fails the guided check
      fdView = await fe.advance(fdView.state, { type: 'check-failed' }, { score: 0, responseMs: 30000, givenAnswer: 'wrong guess' });
      expect(fdView.state.failedChecks).toBe(1);
      expect(fdView.state.simplified).toBe(true);
      // system did NOT advance — it slowed down (req 2)
      expect(fdView.state.stage).toBe('guided-check');

      // retry: pass
      fdView = await fe.advance(fdView.state, { type: 'check-passed' }, { score: 1, responseMs: 12000, confidence: 3 });
      expect(fdView.state.stage).toBe('confirm');

      /* ---------------------------------------------------------------
       * STEP 9: formal definition stage (build toward academic version)
       * covered by 'build'; confirmation question next
       * --------------------------------------------------------------- */
      fdView = await fe.advance(fdView.state, { type: 'check-passed' }, { score: 1, responseMs: 15000 });
      expect(fdView.state.stage).toBe('apply');

      /* STEP 10-11: apply to a new scenario (req 24) */
      fdView = await fe.advance(fdView.state, { type: 'check-passed' }, { score: 0.9, responseMs: 40000, givenAnswer: 'course_id → course_name holds but teacher should not be assumed' });
      expect(fdView.state.stage).toBe('retrieval');

      /* STEP 11: retrieval without the explanation */
      fdView = await fe.advance(fdView.state, { type: 'check-passed' }, { score: 0.9, responseMs: 20000 });
      expect(fdView.state.stage).toBe('teach-back');

      /* STEP 12: explain it in their own words */
      const fdExplanation = 'A functional dependency means when two rows have the same value for one column they must have the same value for the other. For example the same student id must always show the same name. It is about values matching, not about causing anything.';
      fdView = await fe.advance(fdView.state, { type: 'check-passed' }, { score: 0.9, responseMs: 60000, text: fdExplanation });
      expect(fdView.state.stage).toBe('scheduled');

      // scheduled → done; FD is now scheduled for later (req 13 stage)
      fdView = await fe.advance(fdView.state, { type: 'continue' });
      expect(fdView.state.stage).toBe('done');

      const fdState = await db.conceptStates.get(fd.id);
      expect(fdState).toBeTruthy();
      expect(fdState!.attempts).toBeGreaterThanOrEqual(4);
      expect(fdState!.scheduler.dueAt).toBeGreaterThan(clock.now()); // scheduled ahead
      expect(fdState!.state).not.toBe('unknown');

      /* ---------------------------------------------------------------
       * BACK TO THE MAIN CONCEPT: prerequisites now sufficient
       * --------------------------------------------------------------- */
      view = await fe.start(norm.id);
      // FD was just learned — mastery may still be below 30, so the engine may still offer it;
      // the learner chooses "teach me" path was already done — accept either no gaps or FD gap,
      // then proceed (the product teaches the gap, doesn't pretend understanding)
      if (view.prereqGaps.length > 0) {
        // learner quickly re-verifies FD knowledge through a normal review attempt
        await learning.recordAttempt({
          conceptId: fd.id,
          questionId: null,
          score: 0.9,
          responseMs: 15000,
          cognitiveLevel: 'recall',
          context: 'review',
        });
        view = await fe.start(norm.id);
      }
      // proceed past prereq check
      view = await fe.advance(view.state, { type: 'continue' });
      expect(view.state.stage).toBe('encounter');
      // WHY (stage 2)
      view = await fe.advance(view.state, { type: 'continue' });
      expect(view.state.stage).toBe('why');
      expect(view.explanation).toBeTruthy();
      // analogy (stage 3) — the kitchen list analogy
      view = await fe.advance(view.state, { type: 'continue' });
      expect(view.state.stage).toBe('analogy');
      expect(view.explanation?.style).toBe('analogy');
      // plain (stage 4) with vocabulary chips available
      view = await fe.advance(view.state, { type: 'continue' });
      expect(view.state.stage).toBe('plain');
      // vocabulary (stage 5): normal form, anomaly, decomposition
      view = await fe.advance(view.state, { type: 'continue' });
      expect(view.state.stage).toBe('vocabulary');
      expect(norm.terms.length).toBe(3);
      for (let i = 0; i < norm.terms.length; i++) view = await fe.advance(view.state, { type: 'continue' });
      // example (stage 6)
      expect(view.state.stage).toBe('example');
      expect(view.explanation).toBeTruthy();
      // build (stage 7)
      view = await fe.advance(view.state, { type: 'continue' });
      expect(view.state.stage).toBe('build');

      /* guided check: fail once → simplified alternative explanation (req 5) */
      view = await fe.advance(view.state, { type: 'continue' });
      expect(view.state.stage).toBe('guided-check');
      const questionBeforeFail = view.question;
      view = await fe.advance(view.state, { type: 'check-failed' }, { score: 0, responseMs: 45000, givenAnswer: 'it sorts the data' });
      expect(view.state.simplified).toBe(true);
      // pass on retry
      view = await fe.advance(view.state, { type: 'check-passed' }, { score: 1, responseMs: 15000, confidence: 3 });
      expect(view.state.stage).toBe('confirm');
      void questionBeforeFail;

      // STEP 10: basic (understanding) question
      view = await fe.advance(view.state, { type: 'check-passed' }, { score: 1, responseMs: 20000 });
      expect(view.state.stage).toBe('apply');

      /* STEP 11: application to a changed scenario */
      view = await fe.advance(view.state, { type: 'check-passed' }, {
        score: 0.9,
        responseMs: 50000,
        givenAnswer: 'split into Patients, Doctors, Visits — each fact lives once',
      });
      expect(view.state.stage).toBe('retrieval');

      /* STEP 11b: retrieval without explanation */
      view = await fe.advance(view.state, { type: 'check-passed' }, { score: 0.85, responseMs: 30000 });
      expect(view.state.stage).toBe('teach-back');

      /* STEP 12: teach-back WITH a misconception smuggled in
       * ("normalization makes queries faster") */
      const teachbackText =
        'Normalization means each fact is stored once, and it makes queries faster because there is less data to read. You find the functional dependencies and split the tables so updates cannot leave contradictory copies.';
      let evalResult = await fe.evaluateTeachBack(norm.id, teachbackText);
      expect(evalResult.misconceptionHits.length).toBe(1);
      expect(evalResult.misconceptionHits[0].label).toContain('faster');

      // submit the teach-back: partial pass (scored with the misconception detected)
      view = await fe.advance(view.state, { type: 'check-passed' }, { score: evalResult.score, responseMs: 90000, text: teachbackText });
      expect(view.state.stage).toBe('scheduled');

      /* STEP 13: the misconception was detected and recorded (req 10) */
      const mcRecords = await db.misconceptions.where('conceptId').equals(norm.id).toArray();
      expect(mcRecords.length).toBe(1);
      expect(mcRecords[0].status).toBe('active');

      // schedule & finish
      view = await fe.advance(view.state, { type: 'continue' });
      expect(view.state.stage).toBe('done');

      const normStateAfterFE = await db.conceptStates.get(norm.id);
      expect(normStateAfterFE!.scheduler.dueAt).toBeGreaterThan(clock.now());

      /* ---------------------------------------------------------------
       * MISCONCEPTION CORRECTION: targeted retest via the dedicated question
       * (q-db-norm-speed targets the misconception; passing it twice corrects)
       * --------------------------------------------------------------- */
      const normSpeedQ = (await db.questions.where('conceptId').equals(norm.id).toArray()).find((q) => q.id === 'q-db-norm-speed');
      expect(normSpeedQ).toBeTruthy();

      // attempt 1: learner now understands — answers the targeted question correctly
      await learning.recordAttempt({
        conceptId: norm.id,
        questionId: 'q-db-norm-speed',
        score: 1,
        responseMs: 25000,
        confidence: 4,
        cognitiveLevel: 'understanding',
        context: 'review',
      });
      // attempt 2 on the paired question bank (guided) — second pass corrects the misconception
      await learning.recordAttempt({
        conceptId: norm.id,
        questionId: 'q-db-norm-guided',
        score: 1,
        responseMs: 15000,
        cognitiveLevel: 'recall',
        context: 'review',
      });
      const mcAfter = await db.misconceptions.toArray();
      // q-db-norm-guided does not target the misconception; the targeted pass alone keeps it active
      // → run the targeted question again (second pass → corrected)
      await learning.recordAttempt({
        conceptId: norm.id,
        questionId: 'q-db-norm-speed',
        score: 1,
        responseMs: 18000,
        cognitiveLevel: 'understanding',
        context: 'review',
      });
      const mcCorrected = (await db.misconceptions.toArray()).find((m) => m.conceptId === norm.id);
      expect(mcCorrected!.status).toBe('corrected');
      expect(mcCorrected!.retestResults.slice(-2)).toEqual([true, true]);

      /* ---------------------------------------------------------------
       * STEP 14-15: return two days later → retrieval WITHOUT the explanation
       * --------------------------------------------------------------- */
      const stabilityBefore = (await db.conceptStates.get(norm.id))!.scheduler.stabilityDays;
      clock.advanceDays(2);

      const dueAt = (await db.conceptStates.get(norm.id))!.scheduler.dueAt;
      expect(dueAt).toBeLessThanOrEqual(clock.now() + 60_000); // due within the minute

      // recall without explanation — short answer about the core idea
      const recallResult = await learning.recordAttempt({
        conceptId: norm.id,
        questionId: 'q-db-norm-confirm',
        score: 0.95,
        responseMs: 22000,
        confidence: 4,
        cognitiveLevel: 'understanding',
        context: 'review',
      });

      /* STEP 16: memory stability increased (req 29, 46) */
      const normState2 = (await db.conceptStates.get(norm.id))!;
      expect(recallResult.signals.delayedWin).toBe(true); // 2-day delayed retrieval succeeded
      expect(normState2.scheduler.stabilityDays).toBeGreaterThan(stabilityBefore);
      expect(recallResult.signals.grade).toMatch(/good|easy/);
      // an insight praised the delayed success (explainable, req 75)
      expect(recallResult.insights.some((i) => i.key === 'ins.delayedSuccess')).toBe(true);

      /* ---------------------------------------------------------------
       * STEP 17: several days later an application question appears → succeed
       * → mastery strengthens (checkpoint: application evidence)
       * --------------------------------------------------------------- */
      const masteryBefore = normState2.mastery;
      clock.advanceDays(4);

      // simulate the app surfacing the due application question (transfer scenario)
      const applyResult = await learning.recordAttempt({
        conceptId: norm.id,
        questionId: 'q-db-norm-apply',
        score: 0.9,
        responseMs: 60000,
        confidence: 4,
        cognitiveLevel: 'application',
        context: 'review',
      });
      const normState3 = (await db.conceptStates.get(norm.id))!;
      expect(applyResult.attempt.wasDelayed).toBe(true); // 4 days since previous review
      expect(normState3.mastery).toBeGreaterThan(masteryBefore);
      expect(normState3.evidence.application).toBeGreaterThanOrEqual(1);
      expect(normState3.checkpointProgress.applications).toBeGreaterThanOrEqual(1);

      /* final condition: the system now has durable evidence and the concept
       * is on the road to mastery — retrievability estimate is healthy */
      const r = retrievability(normState3.scheduler, clock.now());
      expect(r).toBeGreaterThan(0.5);
      expect(normState3.bestStabilityDays).toBeGreaterThan(2);

      // the entire cycle ran through service calls only — verify event log records it
      const events = await db.events.toArray();
      const types = new Set(events.map((e) => e.type));
      expect(types.has('fe.started')).toBe(true);
      expect(types.has('fe.advance')).toBe(true);
      expect(types.has('attempt.recorded')).toBe(true);
      expect(types.has('mastery.updated')).toBe(true);
      expect(types.has('scheduler.updated')).toBe(true);
      expect(types.has('misconception.detected')).toBe(true);
      expect(types.has('delayed.retrievalSuccess')).toBe(true);

      // knowledge gaps were investigated (root cause, req 41): the failed guided
      // check produced gap analysis
      const gaps = await db.gaps.toArray();
      expect(gaps.length).toBeGreaterThanOrEqual(1);

      await dispose(ctx);
    } catch (e) {
      await dispose(ctx);
      throw e;
    }
  }, 60000);
});
