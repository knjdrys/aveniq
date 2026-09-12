/**
 * Seed loader — populates the database with the starter library on first run.
 */
import { AveniqDB } from '../db/db';
import { Card, Concept, Question, Subject, Topic } from '../domain/types';
import { DB_CARDS, DB_CONCEPTS, DB_QUESTIONS, DB_SUBJECT, DB_TOPICS } from './databases';
import { BIO_CARDS, BIO_CONCEPTS, BIO_QUESTIONS, BIO_SUBJECT, BIO_TOPICS } from './biology';
import { PRG_CARDS, PRG_CONCEPTS, PRG_QUESTIONS, PRG_SUBJECT, PRG_TOPICS } from './programming';

export const SEED_SUBJECTS: Subject[] = [DB_SUBJECT, BIO_SUBJECT, PRG_SUBJECT];
export const SEED_TOPICS: Topic[] = [...DB_TOPICS, ...BIO_TOPICS, ...PRG_TOPICS];
export const SEED_CONCEPTS: Concept[] = [...DB_CONCEPTS, ...BIO_CONCEPTS, ...PRG_CONCEPTS];
export const SEED_QUESTIONS: Question[] = [...DB_QUESTIONS, ...BIO_QUESTIONS, ...PRG_QUESTIONS];
export const SEED_CARDS: Card[] = [...DB_CARDS, ...BIO_CARDS, ...PRG_CARDS];

/** Prerequisite graph from seeded concepts (used by tests and the map view). */
export function seedPrerequisiteMap(): Map<string, string[]> {
  return new Map(SEED_CONCEPTS.map((c) => [c.id, c.prerequisites]));
}

/** Insert seed content if the library is empty. Safe to call on every boot. */
export async function seedIfEmpty(db: AveniqDB): Promise<boolean> {
  const count = await db.subjects.count();
  if (count > 0) return false;
  const now = Date.now();
  const stamp = <T extends { createdAt: number; updatedAt: number }>(x: T): T => ({ ...x, createdAt: now, updatedAt: now });
  await db.transaction('rw', [db.subjects, db.topics, db.concepts, db.questions, db.cards], async () => {
    await db.subjects.bulkPut(SEED_SUBJECTS.map(stamp));
    await db.topics.bulkPut(SEED_TOPICS.map(stamp));
    await db.concepts.bulkPut(SEED_CONCEPTS.map(stamp));
    await db.questions.bulkPut(SEED_QUESTIONS.map(stamp));
    await db.cards.bulkPut(SEED_CARDS.map(stamp));
  });
  return true;
}
