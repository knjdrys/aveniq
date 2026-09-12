/**
 * Import (req 50): CSV, JSON, term-definition text, structured backups.
 * Import understands material structure; ambiguous structures can be corrected
 * in the review UI before commit.
 */
import { Card, Concept, Question } from './types';
import { normalizeText, uid } from './utils';

/* ---------- CSV ---------- */

/** Minimal RFC-4180-ish CSV parser (quotes, escaped quotes, commas, newlines). */
export function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else inQuotes = false;
      } else cell += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === ',') {
      row.push(cell);
      cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cell);
      cell = '';
      if (row.some((c) => c.trim())) rows.push(row);
      row = [];
    } else cell += ch;
  }
  row.push(cell);
  if (row.some((c) => c.trim())) rows.push(row);
  return rows;
}

export type CSVKind = 'term-definition' | 'question' | 'card' | 'unknown';

export function detectCSVKind(rows: string[][]): { kind: CSVKind; header: string[] | null } {
  if (!rows.length) return { kind: 'unknown', header: null };
  const first = rows[0].map((h) => normalizeText(h));
  const has = (...names: string[]) => names.some((n) => first.includes(n));
  if (has('term', 'front', 'word', 'concept')) return { kind: 'term-definition', header: rows[0] };
  if (has('question', 'prompt', 'q')) return { kind: 'question', header: rows[0] };
  if (rows[0].length === 2 && !has('term', 'question')) return { kind: 'card', header: null };
  // no recognizable header → heuristic: 2 cols = term-def, 3+ with numbers = questions?
  if (rows.length > 1 && rows[0].length === 2) return { kind: 'term-definition', header: null };
  return { kind: 'unknown', header: null };
}

/* ---------- Term-definition text ---------- */

const TERM_SEPARATORS = ['–', '—', ' - ', ': ', ' – ', ' — ', '\t'];

/**
 * Recognize term-definition structure from pasted text (req 50):
 *   "Photosynthesis – process plants use to convert light energy…"
 */
export function parseTermDefinitionText(text: string): { term: string; definition: string; raw: string; ambiguous: boolean }[] {
  const out: { term: string; definition: string; raw: string; ambiguous: boolean }[] = [];
  const lines = text.split(/\n+/).map((l) => l.trim()).filter(Boolean);
  for (const line of lines) {
    // strip list markers
    const cleaned = line.replace(/^[-*•\d.)\]]+\s*/, '');
    let best: { term: string; definition: string } | null = null;
    for (const sep of TERM_SEPARATORS) {
      const idx = cleaned.indexOf(sep);
      if (idx > 1 && idx < 80) {
        const term = cleaned.slice(0, idx).trim();
        const definition = cleaned.slice(idx + sep.length).trim();
        if (term.split(/\s+/).length <= 6 && definition.length > 5) {
          best = { term, definition };
          break;
        }
      }
    }
    if (best) out.push({ ...best, raw: line, ambiguous: false });
    else if (cleaned.length > 10) out.push({ term: '', definition: cleaned, raw: line, ambiguous: true });
  }
  return out;
}

/* ---------- Draft building (review before commit, req 50/51) ---------- */

export interface DraftConcept {
  tempId: string;
  name: string;
  definition: string;
  /** inferred prerequisites (names of other imported concepts mentioned) */
  prerequisiteNames: string[];
  /** detected key terms (capitalized / jargon heuristics + cross-mentions) */
  detectedTerms: string[];
  questions: { prompt: string; answer: string; kind: 'recall' | 'understanding' }[];
  ambiguous: boolean;
  raw: string;
}

/** Build draft concepts from parsed term-definitions; infer structure (req 50). */
export function buildDraftConcepts(
  items: { term: string; definition: string; ambiguous: boolean; raw: string }[],
): DraftConcept[] {
  const knownNames = items.filter((i) => i.term).map((i) => i.term.toLowerCase());
  return items.map((item, idx) => {
    const name = item.term || `Concept ${idx + 1}`;
    const lower = normalizeText(item.definition);
    // prerequisites: other imported terms mentioned in this definition
    const prerequisiteNames = knownNames.filter(
      (n) => n !== name.toLowerCase() && lower.includes(n),
    );
    // key terms: capitalized multi-word or single technical words not in stopwords
    const detectedTerms = extractCandidateTerms(item.definition);
    // auto-generate practice: one recall (cloze), one understanding
    const questions: DraftConcept['questions'] = [];
    if (item.term) {
      questions.push({
        prompt: `In one word: what term describes “${trimDef(item.definition)}”?`,
        answer: item.term,
        kind: 'recall',
      });
      questions.push({
        prompt: `Which statement matches “${item.term}”?`,
        answer: item.definition,
        kind: 'understanding',
      });
    }
    return {
      tempId: uid('draft'),
      name,
      definition: item.definition,
      prerequisiteNames,
      detectedTerms,
      questions,
      ambiguous: item.ambiguous,
      raw: item.raw,
    };
  });
}

function trimDef(d: string): string {
  return d.length > 90 ? d.slice(0, 90) + '…' : d;
}

const STOPWORDS = new Set(
  'the a an of and or to in for with that this those these is are was were be been being it its as at by from on if then than when where which who whom what how why not no can could should would may might must will shall do does did have has had also into over under between within without about after before during each other more most some such only own same so too very just'.split(' '),
);

export function extractCandidateTerms(text: string): string[] {
  const terms = new Set<string>();
  // capitalized mid-sentence words (likely terms)
  const caps = text.match(/(?<=[.,;:!] |\.\s|^)[A-Z][a-z]{2,}(?:\s[A-Z][a-z]{2,})?/g) ?? [];
  for (const c of caps) if (!STOPWORDS.has(c.toLowerCase())) terms.add(c);
  // quoted / bolded terms
  const quoted = text.match(/["“]([^"”]{3,40})["”]/g) ?? [];
  for (const q of quoted) terms.add(q.replace(/["“”]/g, ''));
  return [...terms].slice(0, 6);
}

/** Convert approved drafts to real domain objects. */
export function draftsToContent(
  drafts: DraftConcept[],
  opts: { subjectId: string; topicId?: string; now: number },
): { concepts: Concept[]; questions: Question[]; cards: Card[] } {
  const nameToId = new Map<string, string>();
  const concepts: Concept[] = drafts.map((d) => {
    const id = uid('c');
    nameToId.set(d.name.toLowerCase(), id);
    return {
      id,
      subjectId: opts.subjectId,
      topicId: opts.topicId,
      name: d.name,
      aliases: [],
      intro: d.definition.split(/[.!?]/)[0] + '.',
      whyItMatters: 'Imported material — edit to add the “why it matters” story.',
      explanations: [
        { id: uid('e'), style: 'definition', layer: 'what', content: d.definition, source: 'imported' },
        { id: uid('e'), style: 'simplified', layer: 'eli5', content: simplify(d.definition), source: 'imported' },
      ],
      terms: d.detectedTerms.slice(0, 4).map((w) => ({
        id: uid('t'),
        word: w,
        definition: `Term used in “${d.name}”.`,
        simple: `A word to decode while learning ${d.name}.`,
        example: '',
        why: `It appears in the definition of ${d.name}.`,
      })),
      examples: {},
      keyIdeas: buildKeyIdeasFromDefinition(d.definition),
      prerequisites: [], // resolved after all ids exist
      misconceptionDefs: [],
      examWeight: 0.5,
      difficultyBase: 0.5,
      tags: ['imported'],
      source: 'imported',
      createdAt: opts.now,
      updatedAt: opts.now,
    };
  });
  // resolve prerequisite names → ids
  for (let i = 0; i < drafts.length; i++) {
    const prereqIds = drafts[i].prerequisiteNames
      .map((n) => nameToId.get(n.toLowerCase()))
      .filter((x): x is string => Boolean(x));
    concepts[i].prerequisites = [...new Set(prereqIds)];
  }
  const questions: Question[] = [];
  const cards: Card[] = [];
  drafts.forEach((d, i) => {
    const concept = concepts[i];
    for (const q of d.questions) {
      questions.push({
        id: uid('q'),
        conceptId: concept.id,
        kind: 'short',
        cognitiveLevel: q.kind === 'recall' ? 'recall' : 'understanding',
        prompt: q.prompt,
        answer: q.answer,
        keywords: q.kind === 'recall' ? [[q.answer.toLowerCase()]] : undefined,
        hints: [`Think about the definition of ${concept.name}.`, `The key property: ${trimDef(concept.intro)}`, `Answer: ${q.answer}`],
        difficultyBase: 0.35,
        source: 'imported',
        createdAt: opts.now,
        updatedAt: opts.now,
      });
    }
    cards.push({
      id: uid('card'),
      conceptId: concept.id,
      front: d.name,
      back: d.definition,
      createdAt: opts.now,
      updatedAt: opts.now,
    });
  });
  return { concepts, questions, cards };
}

function simplify(definition: string): string {
  const first = definition.split(/[.!?]/)[0];
  return `In plain language: ${first.trim().replace(/\s+/g, ' ')}.`;
}

function buildKeyIdeasFromDefinition(definition: string): Concept['keyIdeas'] {
  // content words of the definition become required ideas for teach-back checks
  const words = normalizeText(definition)
    .split(' ')
    .filter((w) => w.length > 4 && !STOPWORDS.has(w));
  const uniq = [...new Set(words)].slice(0, 4);
  return uniq.map((w, i) => ({
    id: `ki_${i}`,
    label: w,
    groups: [[w]],
  }));
}

/* ---------- JSON question banks ---------- */

export function parseQuestionJSON(
  json: unknown,
  opts: { subjectId: string; now: number },
): { concepts: Concept[]; questions: Question[] } | { error: string } {
  if (typeof json !== 'object' || json == null) return { error: 'Root must be an object or array' };
  const arr = Array.isArray(json) ? json : (json as { questions?: unknown[] }).questions;
  if (!Array.isArray(arr)) return { error: 'Expected an array of questions or { questions: [...] }' };
  const byConcept = new Map<string, { concept: Concept; questions: Question[] }>();
  for (const raw of arr) {
    if (typeof raw !== 'object' || raw == null) continue;
    const q = raw as Record<string, unknown>;
    const conceptName = String(q.concept ?? q.topic ?? 'Imported');
    const prompt = String(q.prompt ?? q.question ?? '');
    if (!prompt) continue;
    if (!byConcept.has(conceptName)) {
      byConcept.set(conceptName, {
        concept: {
          id: uid('c'),
          subjectId: opts.subjectId,
          name: conceptName,
          aliases: [],
          intro: `Imported questions about ${conceptName}.`,
          whyItMatters: 'Imported material.',
          explanations: [],
          terms: [],
          examples: {},
          keyIdeas: [],
          prerequisites: [],
          misconceptionDefs: [],
          examWeight: 0.5,
          difficultyBase: 0.5,
          tags: ['imported'],
          source: 'imported',
          createdAt: opts.now,
          updatedAt: opts.now,
        },
        questions: [],
      });
    }
    const entry = byConcept.get(conceptName)!;
    const choices = Array.isArray(q.choices)
      ? (q.choices as Record<string, unknown>[]).map((c, i) => ({
          id: `ch${i}`,
          text: String(c.text ?? c),
          correct: Boolean(c.correct),
        }))
      : undefined;
    if (choices && !choices.some((c) => c.correct)) return { error: `Question "${prompt.slice(0, 40)}" has no correct choice` };
    entry.questions.push({
      id: uid('q'),
      conceptId: entry.concept.id,
      kind: choices ? 'mc' : 'short',
      cognitiveLevel: (String(q.level ?? 'recall') as Question['cognitiveLevel']) || 'recall',
      prompt,
      choices,
      answer: q.answer != null ? String(q.answer) : undefined,
      keywords: q.answer != null ? [[String(q.answer).toLowerCase()]] : undefined,
      hints: Array.isArray(q.hints) ? (q.hints as string[]).map(String) : [],
      difficultyBase: typeof q.difficulty === 'number' ? q.difficulty : 0.5,
      source: 'imported',
      createdAt: opts.now,
      updatedAt: opts.now,
    });
  }
  if (!byConcept.size) return { error: 'No valid questions found' };
  return {
    concepts: [...byConcept.values()].map((v) => v.concept),
    questions: [...byConcept.values()].flatMap((v) => v.questions),
  };
}
