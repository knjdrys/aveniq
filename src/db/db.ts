/**
 * Local database (req 58, 59).
 * IndexedDB via Dexie: schema versions, migrations, indexes, safe writes, recovery.
 * Offline-first: everything the learner does persists locally.
 */
import Dexie, { Table } from 'dexie';
import {
  Attempt,
  Card,
  Concept,
  ConceptState,
  ConfusionPair,
  DomainEvent,
  Exam,
  ID,
  Insight,
  KnowledgeGap,
  LearnerModel,
  MisconceptionRecord,
  Note,
  Question,
  ReadinessSnapshot,
  Resource,
  StudyPlan,
  StudySession,
  Subject,
  Topic,
} from '../domain/types';
import { BackupData } from '../domain/backup';

export interface DexieOptions {
  indexedDB?: unknown;
  IDBKeyRange?: unknown;
}

export class AveniqDB extends Dexie {
  subjects!: Table<Subject, string>;
  topics!: Table<Topic, string>;
  concepts!: Table<Concept, string>;
  questions!: Table<Question, string>;
  cards!: Table<Card, string>;
  conceptStates!: Table<ConceptState, string>;
  attempts!: Table<Attempt, string>;
  misconceptions!: Table<MisconceptionRecord, string>;
  confusionPairs!: Table<ConfusionPair, string>;
  gaps!: Table<KnowledgeGap, string>;
  sessions!: Table<StudySession, string>;
  plans!: Table<StudyPlan, string>;
  exams!: Table<Exam, string>;
  readiness!: Table<ReadinessSnapshot, string>;
  insights!: Table<Insight, string>;
  events!: Table<DomainEvent, number>;
  notes!: Table<Note, string>;
  resources!: Table<Resource, string>;
  learner!: Table<LearnerModel, string>;

  constructor(name = 'aveniq', options?: DexieOptions) {
    super(name, options as never);
    this.version(1).stores({
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
      // v1 pre-release: no resources/readiness tables
    });
    // v2: adds resources + readiness snapshots (real migration path)
    this.version(2)
      .stores({
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
        resources: 'id, conceptId',
        readiness: 'examId, ts',
      })
      .upgrade((tx) => {
        // populate readiness from nothing — snapshots are recomputed lazily anyway
        return Promise.all([tx.table('resources').toArray().catch(() => []), tx.table('readiness').toArray().catch(() => [])]).then(
          () => undefined,
        );
      });
  }

  /** Safe bulk write with recovery semantics (req 69): never silently lose progress. */
  async safeWrite<T>(fn: () => Promise<T>): Promise<{ ok: true; value: T } | { ok: false; error: string }> {
    try {
      const value = await fn();
      return { ok: true, value };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      // QuotaExceeded / DatabaseClosed are surfaced to the caller for a toast + retry
      return { ok: false, error: msg };
    }
  }

  async exportAll(): Promise<BackupData> {
    const [
      subjects,
      topics,
      concepts,
      questions,
      cards,
      conceptStates,
      attempts,
      misconceptions,
      confusionPairs,
      gaps,
      sessions,
      plans,
      exams,
      readiness,
      insights,
      notes,
      resources,
      learners,
    ] = await Promise.all([
      this.subjects.toArray(),
      this.topics.toArray(),
      this.concepts.toArray(),
      this.questions.toArray(),
      this.cards.toArray(),
      this.conceptStates.toArray(),
      this.attempts.toArray(),
      this.misconceptions.toArray(),
      this.confusionPairs.toArray(),
      this.gaps.toArray(),
      this.sessions.toArray(),
      this.plans.toArray(),
      this.exams.toArray(),
      this.readiness.toArray(),
      this.insights.toArray(),
      this.notes.toArray(),
      this.resources.toArray(),
      this.learner.toArray(),
    ]);
    return {
      subjects,
      topics,
      concepts,
      questions,
      cards,
      conceptStates,
      attempts,
      misconceptions,
      confusionPairs,
      gaps,
      sessions,
      plans,
      exams,
      readiness,
      insights,
      notes,
      resources,
      learner: learners[0] ?? null,
    };
  }

  async importAll(data: BackupData, mode: 'replace' | 'merge' = 'replace'): Promise<void> {
    await this.transaction(
      'rw',
      [
        this.subjects,
        this.topics,
        this.concepts,
        this.questions,
        this.cards,
        this.conceptStates,
        this.attempts,
        this.misconceptions,
        this.confusionPairs,
        this.gaps,
        this.sessions,
        this.plans,
        this.exams,
        this.readiness,
        this.insights,
        this.notes,
        this.resources,
        this.learner,
        this.events,
      ],
      async () => {
        if (mode === 'replace') {
          await Promise.all([
            this.subjects.clear(),
            this.topics.clear(),
            this.concepts.clear(),
            this.questions.clear(),
            this.cards.clear(),
            this.conceptStates.clear(),
            this.attempts.clear(),
            this.misconceptions.clear(),
            this.confusionPairs.clear(),
            this.gaps.clear(),
            this.sessions.clear(),
            this.plans.clear(),
            this.exams.clear(),
            this.readiness.clear(),
            this.insights.clear(),
            this.notes.clear(),
            this.resources.clear(),
            this.learner.clear(),
          ]);
        }
        await this.subjects.bulkPut(data.subjects ?? []);
        await this.topics.bulkPut(data.topics ?? []);
        await this.concepts.bulkPut(data.concepts ?? []);
        await this.questions.bulkPut(data.questions ?? []);
        await this.cards.bulkPut(data.cards ?? []);
        await this.conceptStates.bulkPut(data.conceptStates ?? []);
        await this.attempts.bulkPut(data.attempts ?? []);
        await this.misconceptions.bulkPut(data.misconceptions ?? []);
        await this.confusionPairs.bulkPut(data.confusionPairs ?? []);
        await this.gaps.bulkPut(data.gaps ?? []);
        await this.sessions.bulkPut(data.sessions ?? []);
        await this.plans.bulkPut(data.plans ?? []);
        await this.exams.bulkPut(data.exams ?? []);
        await this.readiness.bulkPut(data.readiness ?? []);
        await this.insights.bulkPut(data.insights ?? []);
        await this.notes.bulkPut(data.notes ?? []);
        await this.resources.bulkPut(data.resources ?? []);
        if (data.learner) await this.learner.put(data.learner);
      },
    );
  }

  /** Wipe all learning progress (keep library content optionally). */
  async resetProgress(keepLibrary: boolean): Promise<void> {
    await this.transaction(
      'rw',
      [this.conceptStates, this.attempts, this.misconceptions, this.confusionPairs, this.gaps, this.sessions, this.plans, this.exams, this.readiness, this.insights, this.events, this.learner, this.notes],
      async () => {
        await Promise.all([
          this.conceptStates.clear(),
          this.attempts.clear(),
          this.misconceptions.clear(),
          this.confusionPairs.clear(),
          this.gaps.clear(),
          this.sessions.clear(),
          this.plans.clear(),
          this.exams.clear(),
          this.readiness.clear(),
          this.insights.clear(),
          this.events.clear(),
          this.notes.clear(),
          this.learner.clear(),
        ]);
        if (!keepLibrary) {
          await Promise.all([this.subjects.clear(), this.topics.clear(), this.concepts.clear(), this.questions.clear(), this.cards.clear(), this.resources.clear()]);
        }
      },
    );
  }

  /** Corrupted-record quarantine scan (req 69). */
  async healthCheck(): Promise<{ ok: boolean; issues: string[] }> {
    const issues: string[] = [];
    try {
      const concepts = await this.concepts.toArray();
      const ids = new Set(concepts.map((c) => c.id));
      for (const c of concepts) {
        for (const p of c.prerequisites) {
          if (!ids.has(p)) issues.push(`Concept ${c.id} references missing prerequisite ${p}`);
        }
      }
      const states = await this.conceptStates.toArray();
      for (const s of states) {
        if (!ids.has(s.conceptId)) issues.push(`State for unknown concept ${s.conceptId}`);
        if (!Number.isFinite(s.mastery)) issues.push(`Non-finite mastery on ${s.conceptId}`);
      }
    } catch (e) {
      issues.push(`Database read failed: ${e instanceof Error ? e.message : String(e)}`);
    }
    return { ok: issues.length === 0, issues };
  }

  async appendEvents(events: DomainEvent[]): Promise<void> {
    if (!events.length) return;
    await this.events.bulkAdd(events.map((e) => ({ ...e })));
  }

  /** Learner model singleton helpers. */
  async getLearner(): Promise<LearnerModel | undefined> {
    return (await this.learner.toArray())[0];
  }

  async putLearner(l: LearnerModel): Promise<void> {
    await this.learner.put(l);
  }
}

export const db = new AveniqDB();
export type { ID };
