/**
 * Global search (req 64).
 * In-memory inverted index over library content; fast keyboard access (⌘K).
 * Language-independent: normalizes unicode-ish text.
 */
import { Card, Concept, ID, Note, Question, Subject, Topic } from './types';
import { normalizeText } from './utils';

export type SearchEntity =
  | { kind: 'subject'; id: ID; title: string; subtitle: string }
  | { kind: 'topic'; id: ID; title: string; subtitle: string }
  | { kind: 'concept'; id: ID; title: string; subtitle: string }
  | { kind: 'question'; id: ID; title: string; subtitle: string }
  | { kind: 'card'; id: ID; title: string; subtitle: string }
  | { kind: 'note'; id: ID; title: string; subtitle: string };

interface IndexEntry {
  entity: SearchEntity;
  tokens: Set<string>;
}

export class SearchIndex {
  private entries: IndexEntry[] = [];

  build(data: {
    subjects: Subject[];
    topics: Topic[];
    concepts: Concept[];
    questions: Question[];
    cards: Card[];
    notes: Note[];
    conceptName: (id: ID) => string;
    topicName: (id: ID) => string;
    subjectName: (id: ID) => string;
  }) {
    this.entries = [];
    for (const s of data.subjects) {
      this.add({ kind: 'subject', id: s.id, title: s.name, subtitle: s.description }, s.name, s.description);
    }
    for (const t of data.topics) {
      this.add({ kind: 'topic', id: t.id, title: t.name, subtitle: data.subjectName(t.subjectId) }, t.name, t.description);
    }
    for (const c of data.concepts) {
      const sub = data.topicName(c.topicId ?? '') || data.subjectName(c.subjectId);
      this.add({ kind: 'concept', id: c.id, title: c.name, subtitle: sub }, c.name, [c.intro, ...c.aliases].join(' '));
    }
    for (const q of data.questions) {
      this.add(
        { kind: 'question', id: q.id, title: q.prompt.slice(0, 80), subtitle: data.conceptName(q.conceptId) },
        q.prompt,
        q.scenario ?? '',
      );
    }
    for (const c of data.cards) {
      this.add({ kind: 'card', id: c.id, title: c.front.slice(0, 80), subtitle: data.conceptName(c.conceptId) }, c.front, c.back);
    }
    for (const n of data.notes) {
      this.add(
        { kind: 'note', id: n.id, title: n.text.slice(0, 80), subtitle: data.conceptName(n.conceptId ?? '') },
        n.text,
        '',
      );
    }
  }

  private add(entity: SearchEntity, ...texts: string[]) {
    const tokens = new Set<string>();
    for (const t of texts) {
      if (!t) continue;
      for (const w of normalizeText(t).split(' ')) {
        if (w.length >= 2) {
          tokens.add(w);
          // prefix indexing for as-you-type
          if (w.length > 3) tokens.add(w.slice(0, Math.max(3, w.length - 1)));
        }
      }
    }
    this.entries.push({ entity, tokens });
  }

  query(q: string, limit = 12): SearchEntity[] {
    const terms = normalizeText(q).split(' ').filter((t) => t.length >= 2);
    if (!terms.length) return [];
    const scored: { entity: SearchEntity; score: number }[] = [];
    for (const e of this.entries) {
      let score = 0;
      for (const term of terms) {
        if (e.tokens.has(term)) score += 2;
        else if ([...e.tokens].some((t) => t.startsWith(term))) score += 1;
      }
      // title boost
      if (normalizeText(e.entity.title).includes(normalizeText(q))) score += 3;
      if (score > 0) scored.push({ entity: e.entity, score });
    }
    return scored.sort((a, b) => b.score - a.score).slice(0, limit).map((s) => s.entity);
  }
}
