/**
 * Content service (req 49, 50, 51, 52).
 * Library CRUD + import (CSV/JSON/term-definition) + material ingestion commit.
 * Learner always reviews generated structure before it is trusted.
 */
import { AveniqDB } from '../db/db';
import { Clock, realClock } from '../domain/clock';
import { Card, Concept, ID, Question, Subject, Topic } from '../domain/types';
import {
  buildDraftConcepts,
  detectCSVKind,
  draftsToContent,
  DraftConcept,
  parseCSV,
  parseQuestionJSON,
  parseTermDefinitionText,
} from '../domain/importParsers';
import { ingestMaterial, IngestionDraft } from '../domain/ingestion';
import { SearchIndex } from '../domain/search';
import { uid } from '../domain/utils';

export class ContentService {
  constructor(
    private db: AveniqDB,
    private clock: Clock = realClock,
  ) {}

  /* ---------- Library ---------- */

  async subjects(): Promise<Subject[]> {
    return this.db.subjects.toArray();
  }
  async topics(subjectId?: ID): Promise<Topic[]> {
    return subjectId ? this.db.topics.where('subjectId').equals(subjectId).toArray() : this.db.topics.toArray();
  }
  async concepts(subjectId?: ID, topicId?: ID): Promise<Concept[]> {
    let list: Concept[] = [];
    if (topicId) list = await this.db.concepts.where('topicId').equals(topicId).toArray();
    else if (subjectId) list = await this.db.concepts.where('subjectId').equals(subjectId).toArray();
    else list = await this.db.concepts.toArray();
    return list.sort((a, b) => a.name.localeCompare(b.name));
  }
  async concept(id: ID): Promise<Concept | undefined> {
    return this.db.concepts.get(id);
  }
  async saveConcept(c: Concept): Promise<void> {
    await this.db.concepts.put({ ...c, updatedAt: this.clock.now() });
  }
  async createSubject(name: string, description: string, color: string, icon: string): Promise<Subject> {
    const s: Subject = { id: uid('s'), name, description, color, icon, createdAt: this.clock.now(), updatedAt: this.clock.now() };
    await this.db.subjects.put(s);
    return s;
  }
  async deleteConcept(id: ID): Promise<void> {
    await this.db.transaction('rw', [this.db.concepts, this.db.questions, this.db.cards], async () => {
      await this.db.concepts.delete(id);
      await this.db.questions.where('conceptId').equals(id).delete();
      await this.db.cards.where('conceptId').equals(id).delete();
    });
  }

  /* ---------- Import (req 50) ---------- */

  /** Parse pasted text or file content into reviewable drafts. */
  async parseImport(text: string, kind: 'auto' | 'csv' | 'json' | 'term-def'): Promise<
    | { format: 'term-def'; drafts: DraftConcept[]; warning?: string }
    | { format: 'questions'; questions: unknown; error?: string }
    | { format: 'unknown' }
  > {
    if (kind === 'json' || (kind === 'auto' && text.trim().startsWith('{'))) {
      let json: unknown;
      try {
        json = JSON.parse(text);
      } catch {
        return { format: 'questions', questions: null, error: 'Invalid JSON' };
      }
      const res = parseQuestionJSON(json, { subjectId: '', now: this.clock.now() });
      if ('error' in res) return { format: 'questions', questions: null, error: res.error };
      return { format: 'questions', questions: res };
    }
    if (kind === 'csv' || (kind === 'auto' && (text.includes(',') || text.includes(';')) && text.includes('\n'))) {
      const rows = parseCSV(text);
      const { kind: detected, header } = detectCSVKind(rows);
      const body = header ? rows.slice(1) : rows;
      if (detected === 'term-definition' || detected === 'card') {
        const items = body
          .filter((r) => r.length >= 2)
          .map((r) => ({ term: r[0].trim(), definition: r[1].trim(), ambiguous: false, raw: r.join(',') }))
          .filter((x) => x.term && x.definition);
        return { format: 'term-def', drafts: buildDraftConcepts(items) };
      }
      if (detected === 'question') {
        const col = (name: string, fallback: number) => header?.findIndex((h) => h.trim().toLowerCase() === name) ?? fallback;
        const qs = body.map((r) => ({
          concept: r[col('concept', 2)] || 'Imported',
          prompt: r[col('question', 0)] || r[col('prompt', 0)] || r[0],
          answer: r[col('answer', 1)] || r[1],
        }));
        return { format: 'questions', questions: qs };
      }
      return { format: 'unknown' };
    }
    // term-definition text
    const items = parseTermDefinitionText(text);
    const termDefs = items.filter((i) => !i.ambiguous);
    if (termDefs.length >= 1) {
      return {
        format: 'term-def',
        drafts: buildDraftConcepts(items),
        warning: items.some((i) => i.ambiguous) ? 'import.someLinesAmbiguous' : undefined,
      };
    }
    return { format: 'unknown' };
  }

  /** Commit reviewed drafts into the library (req 50 — review before trust). */
  async commitDrafts(
    drafts: DraftConcept[],
    opts: { subjectId: ID; topicId?: ID; subjectName?: string },
  ): Promise<{ concepts: Concept[]; questions: Question[]; cards: Card[]; subject: Subject }> {
    let subjectId = opts.subjectId;
    let subject = subjectId ? await this.db.subjects.get(subjectId) : undefined;
    if (!subject && opts.subjectName) {
      subject = await this.createSubject(opts.subjectName, 'Imported material', '#8A7FD6', 'import');
      subjectId = subject.id;
    }
    if (!subject || !subjectId) throw new Error('No subject to import into');
    const { concepts, questions, cards } = draftsToContent(drafts, { subjectId, topicId: opts.topicId, now: this.clock.now() });
    await this.db.transaction('rw', [this.db.concepts, this.db.questions, this.db.cards], async () => {
      await this.db.concepts.bulkPut(concepts);
      await this.db.questions.bulkPut(questions);
      await this.db.cards.bulkPut(cards);
    });
    await this.db.events.add({
      ts: this.clock.now(),
      type: 'content.imported',
      payload: { concepts: concepts.length, questions: questions.length, cards: cards.length },
    });
    return { concepts, questions, cards, subject };
  }

  /* ---------- Material ingestion (req 51, 52) ---------- */

  ingest(text: string): IngestionDraft {
    return ingestMaterial(text);
  }

  /** Commit a reviewed ingestion draft: concepts + prerequisite edges + questions. */
  async commitIngestion(
    draft: IngestionDraft,
    opts: { subjectId: ID; topicId?: ID; subjectName?: string },
  ): Promise<{ concepts: Concept[]; questions: Question[]; cards: Card[]; subject: Subject }> {
    // use the ingestion draft's concepts (they carry section context + relationships)
    const drafts: DraftConcept[] = draft.concepts.map((c) => ({
      tempId: c.tempId,
      name: c.name,
      definition: c.definition,
      prerequisiteNames: draft.relationships
        .filter((r) => r.type === 'prerequisite' && r.from === c.name)
        .map((r) => r.to),
      detectedTerms: c.detectedTerms,
      questions: c.questions,
      ambiguous: c.ambiguous,
      raw: c.raw,
    }));
    const committed = await this.commitDrafts(drafts, opts);

    // apply related/contrast edges from the draft (by name → id)
    const nameToId = new Map(committed.concepts.map((c) => [c.name.toLowerCase(), c.id]));
    for (const rel of draft.relationships) {
      if (rel.type !== 'prerequisite') continue;
      const fromId = nameToId.get(rel.from.toLowerCase());
      const toId = nameToId.get(rel.to.toLowerCase());
      if (fromId && toId) {
        const concept = await this.db.concepts.get(fromId);
        if (concept && !concept.prerequisites.includes(toId)) {
          await this.db.concepts.put({ ...concept, prerequisites: [...concept.prerequisites, toId], updatedAt: this.clock.now() });
        }
      }
    }
    await this.db.events.add({
      ts: this.clock.now(),
      type: 'content.ingested',
      payload: { title: draft.title, concepts: committed.concepts.length, warnings: draft.warnings },
    });
    return committed;
  }

  /* ---------- Search (req 64) ---------- */

  async buildSearchIndex(): Promise<SearchIndex> {
    const index = new SearchIndex();
    const [subjects, topics, concepts, questions, cards, notes] = await Promise.all([
      this.db.subjects.toArray(),
      this.db.topics.toArray(),
      this.db.concepts.toArray(),
      this.db.questions.toArray(),
      this.db.cards.toArray(),
      this.db.notes.toArray(),
    ]);
    const conceptName = (id: ID) => concepts.find((c) => c.id === id)?.name ?? '';
    index.build({
      subjects,
      topics,
      concepts,
      questions,
      cards,
      notes,
      conceptName,
      topicName: (id) => topics.find((t) => t.id === id)?.name ?? '',
      subjectName: (id) => subjects.find((s) => s.id === id)?.name ?? '',
    });
    return index;
  }
}
