/**
 * Exam service (req 35, 36) + planner (req 37).
 * Practice exams, readiness with reasons, dynamic study plans.
 */
import { AveniqDB } from '../db/db';
import { Clock, realClock } from '../domain/clock';
import { Attempt, Exam, ID, PlanDay, Question, ReadinessSnapshot, StudyPlan } from '../domain/types';
import { computeReadiness } from '../domain/readiness';
import { generatePlan, updatePlan } from '../domain/planner';
import { selectQuestion } from '../domain/questionSelect';
import { retrievability } from '../domain/scheduler';
import { LearningService } from './learningService';
import { shuffle, uid, DAY } from '../domain/utils';

export type PracticeTestKind = 'mixed' | 'weak-area' | 'due-review' | 'topic' | 'timed';

export interface PracticeTest {
  id: ID;
  examId?: ID;
  subjectId: ID;
  kind: PracticeTestKind;
  questionIds: ID[];
  startedAt: number;
  timeLimitMinutes?: number;
  status: 'active' | 'completed';
  results: { questionId: ID; correct: boolean; score: number; responseMs: number; confidence?: number }[];
}

export class ExamService {
  constructor(
    private db: AveniqDB,
    private learning: LearningService,
    private clock: Clock = realClock,
  ) {}

  async createExam(input: { title: string; subjectId: ID; date: number; targetMastery?: number }): Promise<Exam> {
    const exam: Exam = {
      id: uid('ex'),
      title: input.title,
      subjectId: input.subjectId,
      date: input.date,
      targetMastery: input.targetMastery ?? 85,
      createdAt: this.clock.now(),
      updatedAt: this.clock.now(),
    };
    await this.db.exams.put(exam);
    return exam;
  }

  async readiness(examId: ID): Promise<ReadinessSnapshot & { conceptNames: Record<ID, string> }> {
    const exam = await this.db.exams.get(examId);
    if (!exam) throw new Error('Unknown exam');
    const now = this.clock.now();
    const concepts = await this.db.concepts.where('subjectId').equals(exam.subjectId).toArray();
    const ids = concepts.map((c) => c.id);
    const states = await this.learning.statesMap();
    const attempts = (await this.db.attempts.toArray()).filter((a) => ids.includes(a.conceptId));
    const gaps = (await this.db.gaps.where('status').equals('open').toArray()).filter((g) => ids.includes(g.conceptId));

    const snap = computeReadiness({
      examId,
      now,
      conceptIds: ids,
      masteryOf: (id) => states.get(id)?.mastery ?? 0,
      stateOf: (id) => states.get(id)?.state ?? 'unknown',
      attempts: attempts as Pick<Attempt, 'conceptId' | 'correct' | 'score' | 'ts' | 'cognitiveLevel'>[],
      retrievabilityOf: (id) => {
        const s = states.get(id);
        return s ? retrievability(s.scheduler, now) : 0;
      },
      openGaps: gaps.length,
    });
    const conceptNames = Object.fromEntries(concepts.map((c) => [c.id, c.name]));
    return { ...snap, conceptNames };
  }

  /** Generate a practice test (req 35). */
  async generatePracticeTest(input: {
    subjectId: ID;
    kind: PracticeTestKind;
    count?: number;
    timeLimitMinutes?: number;
    topicId?: ID;
    examId?: ID;
  }): Promise<PracticeTest> {
    const now = this.clock.now();
    const states = await this.learning.statesMap();
    let concepts = await this.db.concepts.where('subjectId').equals(input.subjectId).toArray();
    if (input.topicId) concepts = concepts.filter((c) => c.topicId === input.topicId);
    const conceptIds = new Set(concepts.map((c) => c.id));

    let pool: Question[] = [];
    for (const c of concepts) {
      const qs = await this.db.questions.where('conceptId').equals(c.id).toArray();
      pool.push(...qs.filter((q) => !q.id.includes('#')));
    }

    switch (input.kind) {
      case 'weak-area':
        pool = pool.filter((q) => (states.get(q.conceptId)?.mastery ?? 0) < 55);
        break;
      case 'due-review': {
        const due = new Set(
          concepts
            .filter((c) => {
              const s = states.get(c.id);
              return s && s.scheduler.dueAt <= now;
            })
            .map((c) => c.id),
        );
        pool = pool.filter((q) => due.has(q.conceptId));
        break;
      }
      case 'timed':
        break;
      case 'topic':
        break;
      default:
        break;
    }

    // mixed: weight by weakness + exam weight; interleave concepts
    const weightOf = (q: Question) => {
      const s = states.get(q.conceptId);
      const c = concepts.find((x) => x.id === q.conceptId);
      const weakness = s ? 1 - s.mastery / 100 : 0.6;
      return 0.7 * weakness + 0.3 * (c?.examWeight ?? 0.5);
    };
    const shuffled = shuffle(pool);
    shuffled.sort((a, b) => weightOf(b) - weightOf(a));
    const picked: Question[] = [];
    let lastConcept: ID | null = null;
    const remaining = [...shuffled];
    const count = input.count ?? Math.min(10, pool.length);
    while (picked.length < count && remaining.length) {
      let idx = remaining.findIndex((q) => q.conceptId !== lastConcept);
      if (idx < 0) idx = 0;
      picked.push(remaining.splice(idx, 1)[0]);
      lastConcept = picked[picked.length - 1].conceptId;
    }

    const test: PracticeTest = {
      id: uid('test'),
      examId: input.examId,
      subjectId: input.subjectId,
      kind: input.kind,
      questionIds: picked.map((q) => q.id),
      startedAt: now,
      timeLimitMinutes: input.timeLimitMinutes,
      status: 'active',
      results: [],
    };
    void conceptIds;
    return test;
  }

  /** Submit a practice-test answer → recorded through the pipeline with exam context. */
  async submitTestAnswer(test: PracticeTest, questionId: ID, score: number, responseMs: number, confidence?: number): Promise<PracticeTest> {
    const q = await this.db.questions.get(questionId);
    if (!q) return test;
    await this.learning.recordAttempt({
      conceptId: q.conceptId,
      questionId,
      score,
      responseMs,
      confidence,
      hintsUsed: 0,
      cognitiveLevel: q.cognitiveLevel,
      givenAnswer: undefined,
      context: 'exam',
    });
    const results = [...test.results, { questionId, correct: score >= 0.7, score, responseMs, confidence }];
    return { ...test, results };
  }

  /* ---------------- Planner (req 37) ---------------- */

  async generateStudyPlan(input: { subjectId: ID; dailyMinutes: number; examId?: ID }): Promise<StudyPlan> {
    const now = this.clock.now();
    const exam = input.examId ? await this.db.exams.get(input.examId) : undefined;
    const concepts = await this.db.concepts.where('subjectId').equals(input.subjectId).toArray();
    const states = await this.learning.statesMap();
    const plan = generatePlan({
      now,
      subjectId: input.subjectId,
      dailyMinutes: input.dailyMinutes,
      examDate: exam?.date,
      concepts: concepts.map((c) => ({
        id: c.id,
        mastery: states.get(c.id)?.mastery ?? 0,
        state: states.get(c.id)?.state ?? 'unknown',
        examWeight: c.examWeight,
        prerequisites: c.prerequisites,
      })),
      states,
    });
    if (exam) plan.examId = exam.id;
    await this.db.plans.put(plan);
    return plan;
  }

  /** Auto-update plans with current progress; returns adjustments for UI display. */
  async refreshPlans(): Promise<StudyPlan[]> {
    const now = this.clock.now();
    const states = await this.learning.statesMap();
    const out: StudyPlan[] = [];
    for (const plan of await this.db.plans.toArray()) {
      const { plan: updated } = updatePlan(plan, states, now);
      await this.db.plans.put(updated);
      out.push(updated);
    }
    return out;
  }

  async activePlan(subjectId?: ID): Promise<StudyPlan | undefined> {
    const plans = await this.db.plans.where('status').equals('active').toArray();
    const filtered = subjectId ? plans.filter((p) => p.subjectId === subjectId) : plans;
    return filtered.sort((a, b) => b.updatedAt - a.updatedAt)[0];
  }

  /** Today's plan items (used by Today view). */
  async todayPlanItems(plan: StudyPlan): Promise<PlanDay | undefined> {
    const today = new Date(this.clock.now());
    const key = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    return plan.days.find((d) => d.date === key) ?? plan.days.find((d) => d.date >= key);
  }

  /** Days until exam (for countdown + urgency). */
  async examCountdown(examId: ID): Promise<number> {
    const exam = await this.db.exams.get(examId);
    return exam ? Math.max(0, Math.round((exam.date - this.clock.now()) / DAY)) : 0;
  }
}
