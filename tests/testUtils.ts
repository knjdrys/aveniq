/**
 * Shared test utilities: fake clock, fake IndexedDB, wired services.
 */
import { AveniqDB } from '../src/db/db';
import { FakeClock } from '../src/domain/clock';
import { LearningService } from '../src/services/learningService';
import { FEService } from '../src/services/feService';
import { SessionService } from '../src/services/sessionService';
import { RecommendService } from '../src/services/recommendService';
import { ExamService } from '../src/services/examService';
import { ContentService } from '../src/services/contentService';
import { seedIfEmpty } from '../src/seed';
import { Concept, ConceptState, ID } from '../src/domain/types';

export function makeClock(start: number = Date.parse('2026-03-02T09:00:00Z')): FakeClock {
  return new FakeClock(start);
}

let dbCounter = 0;

/** Fresh seeded database per test context. */
export async function makeTestContext() {
  const fidb = await import('fake-indexeddb');
      const fakeIndexedDB = (fidb as unknown as { indexedDB: typeof indexedDB }).indexedDB ?? (fidb as unknown as { default: typeof indexedDB }).default;
      const fakeIDBKeyRange = (fidb as unknown as { IDBKeyRange: typeof IDBKeyRange }).IDBKeyRange;
  const name = `aveniq-test-${Date.now()}-${dbCounter++}`;
  const db = new AveniqDB(name, { indexedDB: fakeIndexedDB, IDBKeyRange: fakeIDBKeyRange });
  await db.open();
  const seeded = await seedIfEmpty(db);
  const clock = makeClock();
  const learning = new LearningService(db, clock);
  const fe = new FEService(db, learning, clock);
  const sessions = new SessionService(db, learning, clock);
  const recommend = new RecommendService(db, learning, clock);
  const exams = new ExamService(db, learning, clock);
  const content = new ContentService(db, clock);
  return { db, clock, learning, fe, sessions, recommend, exams, content, seeded };
}

export async function dispose(ctx: Awaited<ReturnType<typeof makeTestContext>>) {
  await ctx.db.delete();
}

export async function conceptByName(ctx: Awaited<ReturnType<typeof makeTestContext>>, name: string): Promise<Concept> {
  const all = await ctx.db.concepts.toArray();
  const hit = all.find((c) => c.name === name || c.aliases.includes(name));
  if (!hit) throw new Error(`No concept named ${name}`);
  return hit;
}

export async function stateOf(ctx: Awaited<ReturnType<typeof makeTestContext>>, conceptId: ID): Promise<ConceptState> {
  return (await ctx.db.conceptStates.get(conceptId)) ?? (await ctx.learning.conceptState(conceptId));
}

/** Fast-forward the learner through a concept's first-encounter stages (as a real learner would). */
export async function answerMC(
  ctx: Awaited<ReturnType<typeof makeTestContext>>,
  conceptId: ID,
  questionId: ID,
  correct: boolean,
  opts: { confidence?: number; responseMs?: number; hintsUsed?: number; sessionId?: string; context?: 'learn' | 'review' | 'exam' } = {},
) {
  return ctx.learning.recordAttempt({
    conceptId,
    questionId,
    score: correct ? 1 : 0,
    confidence: opts.confidence,
    responseMs: opts.responseMs ?? 12000,
    hintsUsed: opts.hintsUsed ?? 0,
    cognitiveLevel: 'recall',
    givenAnswer: correct ? 'correct' : 'wrong',
    context: opts.context ?? 'review',
  });
}
