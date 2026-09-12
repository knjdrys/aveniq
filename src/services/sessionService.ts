/**
 * Session service (req 32, 34, 47, 55).
 * Time-aware adaptive study sessions; dynamic re-planning; fatigue awareness;
 * everything records through the pipeline.
 */
import { AveniqDB } from '../db/db';
import { Clock, realClock } from '../domain/clock';
import {
  ConfusionPair,
  ID,
  LearnerModel,
  Question,
  SegmentPlan,
  SessionItem,
  SessionOutcome,
  StudySession,
} from '../domain/types';
import { planSession, buildItems, adapt, SessionSize, sessionSize } from '../domain/sessionEngine';
import { selectQuestion } from '../domain/questionSelect';
import { estimateFatigue } from '../domain/fatigue';
import { profile } from '../domain/calibration';
import { unlockFrontier } from '../domain/graph';
import { isDue, overdueDays, retrievability } from '../domain/scheduler';
import { LearningService } from './learningService';
import { Attempt } from '../domain/types';
import { uid } from '../domain/utils';

export interface SessionStartInput {
  minutes?: number;
  focus?: StudySession['focus'];
  /** specific concepts (e.g. "learn this concept now") */
  conceptIds?: ID[];
}

export class SessionService {
  constructor(
    private db: AveniqDB,
    private learning: LearningService,
    private clock: Clock = realClock,
  ) {}

  /** Create a session with an adaptive plan for the available time (req 32). */
  async start(input: SessionStartInput = {}): Promise<StudySession> {
    const learner = await this.learning.getLearner();
    const minutes = input.minutes ?? learner.settings.defaultSessionMinutes;
    const now = this.clock.now();

    const states = await this.learning.statesMap();
    const concepts = await this.db.concepts.toArray();
    const prereqMap = new Map(concepts.filter((c) => c.prerequisites.length).map((c) => [c.id, c.prerequisites]));

    const dueConcepts: ID[] = [];
    const weakConcepts: ID[] = [];
    const staleConcepts: ID[] = [];
    for (const c of concepts) {
      const s = states.get(c.id);
      if (!s || s.scheduler.lastReviewedAt == null) continue;
      if (isDue(s.scheduler, now)) dueConcepts.push(c.id);
      if (s.attempts >= 2 && s.mastery < 45) weakConcepts.push(c.id);
      if ((s.state === 'mastered' || s.state === 'proficient') && retrievability(s.scheduler, now) < 0.75) staleConcepts.push(c.id);
    }

    const newConcepts = unlockFrontier(
      concepts.map((c) => c.id),
      prereqMap,
      (id) => {
        const s = states.get(id);
        return s ? s.mastery >= 45 : false;
      },
      (id) => {
        const s = states.get(id);
        return s ? s.firstSeenAt != null : false;
      },
    ).filter((id) => {
      // only genuinely new concepts (unknown)
      const s = states.get(id);
      return !s || (s.firstSeenAt == null && s.attempts === 0);
    });

    const misconceptions = (await this.db.misconceptions.where('status').equals('active').toArray()).map((m) => m.conceptId);
    const gaps = (await this.db.gaps.where('status').equals('open').toArray()).map((g) => g.conceptId);
    const confusionPairs: [ID, ID][] = (await this.db.confusionPairs.where('status').equals('active').toArray()).map(
      (p: ConfusionPair) => [p.aId, p.bId] as [ID, ID],
    );

    let plan: SegmentPlan[];
    if (input.conceptIds?.length) {
      // targeted session (e.g. "learn this concept")
      const targeted: SegmentPlan[] = [
        { type: 'first-encounter', conceptIds: input.conceptIds, estMinutes: Math.min(12, minutes), reasonKey: 'seg.first' },
        { type: 'retrieval', conceptIds: [...dueConcepts].slice(0, 2), estMinutes: 3, reasonKey: 'seg.retrieval' },
        { type: 'reflection', conceptIds: [], estMinutes: 1, reasonKey: 'seg.reflection' },
      ];
      plan = targeted.filter((s) => s.conceptIds.length > 0 || s.type === 'reflection' || s.type === 'first-encounter');
    } else {
      plan = planSession({
        minutes,
        now,
        dueConcepts,
        weakConcepts,
        newConcepts,
        gapConcepts: gaps,
        confusionPairs,
        misconceptionConcepts: misconceptions,
      });
    }

    const items = await this.buildSessionItems(plan);
    const session: StudySession = {
      id: uid('ses'),
      startedAt: now,
      endedAt: null,
      plannedMinutes: minutes,
      plan,
      items,
      executed: [],
      status: 'active',
      adaptations: [],
      reflection: undefined,
      focus: input.focus ?? { type: 'mixed' },
      updatedAt: now,
    };
    await this.db.sessions.put(session);
    await this.db.events.add({ ts: now, type: 'session.started', payload: { sessionId: session.id, minutes, size: sessionSize(minutes) } });
    return session;
  }

  /** Build concrete items with question selection (interleaved, req 47). */
  private async buildSessionItems(plan: SegmentPlan[]): Promise<SessionItem[]> {
    const learner = await this.learning.getLearner();
    const calibration = profile(learner.calibrationSamples);
    const calAdj = calibration.verdict === 'overconfident' ? { levelShift: 1, preferRetrieval: true } : calibration.verdict === 'underconfident' ? { levelShift: -1, preferRetrieval: false } : { levelShift: 0, preferRetrieval: false };

    const picker = async (conceptId: ID, seg: SegmentPlan): Promise<ID | null> => {
      const questions = await this.learning.questionsFor(conceptId);
      if (!questions.length) return null;
      const state = await this.learning.conceptState(conceptId);
      const attempts = await this.learning.recentAttempts(conceptId, 8);
      const misconceptions = await this.db.misconceptions.where('conceptId').equals(conceptId).toArray();
      const scored = selectQuestion({
        questions: seg.type === 'application' ? questions.filter((q) => ['application', 'transfer', 'problem-solving', 'analysis'].includes(q.cognitiveLevel)) || questions : questions,
        state,
        recentAttempts: attempts,
        activeMisconceptions: misconceptions.filter((m) => m.status === 'active').map((m) => m.defId),
        usedQuestionIds: new Set(),
        recentCorrectIds: new Set(attempts.filter((a) => a.correct).slice(-3).map((a) => a.questionId ?? '')),
        levelShift: calAdj.levelShift,
        preferRetrieval: calAdj.preferRetrieval,
      });
      return scored?.question.id ?? null;
    };

    // two-pass: resolve question ids then interleave
    const queue: { conceptId: ID; priority: number; seg: SegmentPlan; questionId: ID | null }[] = [];
    const items: SessionItem[] = [];
    for (const seg of plan) {
      if (seg.type === 'first-encounter') {
        for (const c of seg.conceptIds) items.push({ kind: 'fe-stage', conceptId: c, feStage: 'prereq-check', reasonKey: seg.reasonKey });
      } else if (seg.type === 'reflection') {
        items.push({ kind: 'reflection', conceptId: '' });
      } else if (seg.type === 'comparison') {
        items.push({ kind: 'compare', conceptId: seg.conceptIds[0], questionId: seg.conceptIds[1], reasonKey: 'seg.comparison' });
      } else {
        for (const c of seg.conceptIds) {
          queue.push({ conceptId: c, priority: seg.type === 'review' ? 2 : 1, seg, questionId: null });
        }
      }
    }
    for (const q of queue) q.questionId = await picker(q.conceptId, q.seg);
    // interleave by concept
    const interleaved = interleaveItems(queue);
    for (const q of interleaved) {
      items.push({
        kind: q.seg.type === 'teach-back' ? 'teach-back' : q.seg.type === 'blurt' ? 'blurt' : 'question',
        conceptId: q.conceptId,
        questionId: q.questionId ?? undefined,
        reasonKey: q.seg.reasonKey,
      });
    }
    items.push({ kind: 'summary', conceptId: '' });
    return items;
  }

  /** Record an outcome; dynamic adaptation (req 34) + fatigue (req 55). */
  async recordOutcome(sessionId: ID, outcome: SessionOutcome): Promise<StudySession> {
    const session = await this.db.sessions.get(sessionId);
    if (!session) throw new Error('Unknown session');
    const executed = [...session.executed, outcome];
    const adaptations = [...session.adaptations];

    // fatigue check
    const sessionAttempts = (await this.db.attempts.where('sessionId').equals(sessionId).toArray()) as Attempt[];
    const allAttempts = await this.db.attempts.toArray();
    const typical = allAttempts.length ? allAttempts.reduce((s, a) => s + a.responseMs, 0) / allAttempts.length : 25000;
    const fatigue = estimateFatigue({
      sessionAttempts,
      sessionStartMs: session.startedAt,
      now: this.clock.now(),
      typicalResponseMs: typical,
    });
    const newAdaptations = adapt(session, executed, fatigue.level);
    adaptations.push(...newAdaptations.map((a) => ({ itemId: outcome.itemId, ...a })));

    const updated: StudySession = { ...session, executed, adaptations, updatedAt: this.clock.now() };
    await this.db.sessions.put(updated);
    return { ...updated, /* non-persisted runtime channel */ adaptations, } as StudySession & { fatigue?: unknown } & { fatigueState?: unknown } & Record<string, unknown>;
  }

  /** Fatigue state for the session UI. */
  async fatigue(sessionId: ID): Promise<{ level: number; recommendation: string; signals: string[] }> {
    const session = await this.db.sessions.get(sessionId);
    if (!session) return { level: 0, recommendation: 'continue', signals: [] };
    const sessionAttempts = (await this.db.attempts.where('sessionId').equals(sessionId).toArray()) as Attempt[];
    const all = await this.db.attempts.toArray();
    const typical = all.length ? all.reduce((s, a) => s + a.responseMs, 0) / all.length : 25000;
    const f = estimateFatigue({ sessionAttempts, sessionStartMs: session.startedAt, now: this.clock.now(), typicalResponseMs: typical });
    return { level: f.level, recommendation: f.recommendation, signals: f.signals };
  }

  /** End the session with a reflection (req 56). */
  async finish(sessionId: ID, reflection?: StudySession['reflection']): Promise<StudySession> {
    const session = await this.db.sessions.get(sessionId);
    if (!session) throw new Error('Unknown session');
    const learner = await this.learning.getLearner();
    const updated: StudySession = {
      ...session,
      status: 'completed',
      endedAt: this.clock.now(),
      reflection: reflection
        ? { ...reflection, ts: this.clock.now() }
        : undefined,
      updatedAt: this.clock.now(),
    };
    await this.db.sessions.put(updated);
    // reflection XP (req 57: reward engagement with learning, small)
    await this.db.putLearner({ ...learner, xp: learner.xp + (reflection ? 3 : 0), updatedAt: this.clock.now() });
    if (reflection?.revisit) {
      await this.learning.addInsight({
        kind: 'progress',
        key: 'ins.revisitRequested',
        params: { concept: reflection.revisit },
        conceptId: reflection.revisit,
        severity: 'info',
      });
    }
    await this.db.events.add({ ts: this.clock.now(), type: 'session.completed', payload: { sessionId, items: updated.executed.length } });
    return updated;
  }

  async current(): Promise<StudySession | undefined> {
    const active = await this.db.sessions.where('status').equals('active').toArray();
    return active.sort((a, b) => b.startedAt - a.startedAt)[0];
  }

  async get(sessionId: ID): Promise<StudySession | undefined> {
    return this.db.sessions.get(sessionId);
  }

  async abandon(sessionId: ID): Promise<void> {
    const s = await this.db.sessions.get(sessionId);
    if (s) await this.db.sessions.put({ ...s, status: 'abandoned', endedAt: this.clock.now(), updatedAt: this.clock.now() });
  }
}

function interleaveItems<T extends { conceptId: ID; priority: number }>(items: T[]): T[] {
  const remaining = [...items].sort((a, b) => b.priority - a.priority);
  const out: T[] = [];
  let prev: ID | null = null;
  while (remaining.length) {
    let idx = remaining.findIndex((r) => r.conceptId !== prev);
    if (idx < 0) idx = 0;
    const picked = remaining.splice(idx, 1)[0];
    out.push(picked);
    prev = picked.conceptId;
  }
  return out;
}

export type { SessionSize, Question, LearnerModel };
