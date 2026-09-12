/**
 * Material ingestion (req 51, 52).
 * Material → adaptive course pipeline:
 *   INPUT → EXTRACT → UNDERSTAND STRUCTURE → IDENTIFY CONCEPTS → PREREQUISITES →
 *   VOCABULARY → RELATIONSHIPS → EXAMPLES → MISCONCEPTIONS → PRACTICE →
 *   RETRIEVAL → STUDY SEQUENCE → VERIFY LEARNING
 * Deterministic parser first; optional AI enrichment with validation (req 21).
 * The learner always reviews generated structure before it is trusted (req 51).
 */
import { DraftConcept } from './importParsers';
import { extractCandidateTerms, parseTermDefinitionText, buildDraftConcepts } from './importParsers';
import { uid, normalizeText } from './utils';

export interface IngestedSection {
  heading: string;
  paragraphs: string[];
}

export interface IngestionDraft {
  title: string;
  sections: IngestedSection[];
  concepts: (DraftConcept & { sectionIndex: number; notePattern?: string })[];
  /** inferred relationships between draft concepts (by name) */
  relationships: { from: string; to: string; type: 'prerequisite' | 'related' | 'part-of' }[];
  /** misconceptions detected from "common mistake" / "don't confuse" patterns */
  misconceptionNotes: { conceptName: string; note: string }[];
  questionsGenerated: number;
  studySequence: string[]; // concept names, foundations first
  warnings: string[];
}

/** Split raw material into sections by headings. */
export function extractSections(text: string): { title: string; sections: IngestedSection[] } {
  const lines = text.split(/\r?\n/);
  let title = '';
  let current: IngestedSection | null = null;
  const sections: IngestedSection[] = [];
  const isHeading = (l: string) =>
    /^#{1,4}\s+/.test(l) ||
    (l.length > 2 && l.length < 70 && l === l.toUpperCase() && /[A-Z]/.test(l) && !/[.!?]$/.test(l)) ||
    (l.length > 3 && l.length < 70 && /^[A-Z][^.!?]{3,60}:$/.test(l)) ||
    (l.length > 3 && l.length < 65 && /^[IVX0-9]+[.)]\s/.test(l));

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    if (!title && isHeading(line) && !current) {
      title = line.replace(/^#{1,4}\s+/, '');
      continue;
    }
    if (isHeading(line)) {
      current = { heading: line.replace(/^#{1,4}\s+/, '').replace(/:$/, ''), paragraphs: [] };
      sections.push(current);
      continue;
    }
    if (!current) {
      current = { heading: '', paragraphs: [] };
      sections.push(current);
    }
    current.paragraphs.push(line);
  }
  return { title: title || 'Imported material', sections };
}

/** Detect "for example …" spans within a paragraph. */
export function extractExample(paragraphs: string[]): string | undefined {
  for (const p of paragraphs) {
    const m = p.match(/(?:for example|for instance|e\.g\.|such as)[:\s]+([^.]*(?:\.[^.]*){0,1})/i);
    if (m) return m[0].trim();
  }
  return undefined;
}

/** Detect misconception-warning patterns: "common mistake", "don't confuse", "note that". */
export function extractMisconceptionNotes(paragraphs: string[]): string[] {
  const notes: string[] = [];
  for (const p of paragraphs) {
    const m = p.match(/(?:common (?:mistake|misconception)|don't confuse|do not confuse|a frequent error|beware)[:\s]+([^.]+\.)?/i);
    if (m) notes.push(m[0].trim());
  }
  return notes;
}

/**
 * Full deterministic ingestion. Produces a reviewable draft course.
 */
export function ingestMaterial(text: string): IngestionDraft {
  const warnings: string[] = [];
  const { title, sections } = extractSections(text);

  // concept extraction: headings become candidate concepts; term-definition lines too
  const termDefs = parseTermDefinitionText(text).filter((x) => !x.ambiguous);
  const concepts: (DraftConcept & { sectionIndex: number; notePattern?: string })[] = [];
  const misconceptionNotes: { conceptName: string; note: string }[] = [];

  if (termDefs.length >= 2) {
    // term-definition heavy material
    const drafts = buildDraftConcepts(termDefs);
    drafts.forEach((d, i) => concepts.push({ ...d, sectionIndex: Math.min(i, sections.length - 1) }));
  }

  sections.forEach((section, idx) => {
    const body = section.paragraphs.join(' ');
    if (!section.heading && !body) return;
    if (concepts.some((c) => c.name.toLowerCase() === section.heading.toLowerCase())) return;
    if (section.heading || body.length > 60) {
      const example = extractExample(section.paragraphs);
      const mNotes = extractMisconceptionNotes(section.paragraphs);
      const firstSentence = body.split(/(?<=[.!?])\s/).slice(0, 2).join(' ');
      concepts.push({
        tempId: uid('draft'),
        name: section.heading || firstSentence.split(' ').slice(0, 5).join(' '),
        definition: firstSentence || body.slice(0, 200),
        prerequisiteNames: [],
        detectedTerms: extractCandidateTerms(body),
        questions: [
          {
            prompt: `What is “${section.heading || 'this section'}” about, in one sentence?`,
            answer: firstSentence,
            kind: 'understanding',
          },
        ],
        ambiguous: !section.heading,
        raw: body.slice(0, 120),
        sectionIndex: idx,
        notePattern: example,
      });
      for (const n of mNotes) misconceptionNotes.push({ conceptName: section.heading || concepts[concepts.length - 1].name, note: n });
    }
  });

  // relationships: mentions of one concept inside another's definition
  const names = concepts.map((c) => c.name);
  const relationships: IngestionDraft['relationships'] = [];
  for (const c of concepts) {
    const body = normalizeText(`${c.definition} ${c.raw}`);
    for (const other of names) {
      if (other === c.name) continue;
      if (body.includes(normalizeText(other))) {
        relationships.push({ from: c.name, to: other, type: 'related' });
      }
    }
  }
  // heading hierarchy implies part-of
  let lastHeadingIdx = -1;
  sections.forEach((s, i) => {
    if (s.heading) lastHeadingIdx = i;
  });
  if (lastHeadingIdx >= 0 && sections.length > 1) {
    // sections under the same document are siblings → related to the title concept
    const titleConcept = concepts.find((c) => c.name.toLowerCase() === title.toLowerCase());
    if (titleConcept) {
      for (const c of concepts) {
        if (c.name !== titleConcept.name) relationships.push({ from: titleConcept.name, to: c.name, type: 'part-of' });
      }
    }
  }

  // prerequisite inference: "X requires Y" / "X depends on Y" / "before X, you need Y"
  for (const c of concepts) {
    const body = `${c.definition} ${c.raw}`.toLowerCase();
    for (const other of names) {
      if (other === c.name) continue;
      if (/(requires|depends on|assumes|builds on|prerequisite)/.test(body) && body.includes(other.toLowerCase())) {
        relationships.push({ from: c.name, to: other, type: 'prerequisite' });
      }
    }
  }

  if (concepts.length === 0) {
    warnings.push('ingest.noStructure');
  }
  if (concepts.some((c) => c.ambiguous)) warnings.push('ingest.ambiguous');
  if (!concepts.some((c) => c.questions.length)) warnings.push('ingest.noQuestions');

  // study sequence: concepts with fewer mentions-of-others first (foundations first approximation)
  const mentionCount = new Map(concepts.map((c) => [c.name, relationships.filter((r) => r.to === c.name).length]));
  const studySequence = [...concepts].sort((a, b) => (mentionCount.get(a.name) ?? 0) - (mentionCount.get(b.name) ?? 0)).map((c) => c.name);

  return {
    title,
    sections,
    concepts,
    relationships: dedupeRelationships(relationships),
    misconceptionNotes,
    questionsGenerated: concepts.reduce((s, c) => s + c.questions.length, 0),
    studySequence,
    warnings,
  };
}

function dedupeRelationships(rels: IngestionDraft['relationships']): IngestionDraft['relationships'] {
  const seen = new Set<string>();
  const out: IngestionDraft['relationships'] = [];
  for (const r of rels) {
    const k = `${r.from}|${r.to}|${r.type}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(r);
  }
  return out;
}

/** Question interpretation training steps (req 42) — used by worked-solution mode. */
export const INTERPRETATION_STEPS = [
  { key: 'interp.given' }, // What information is given?
  { key: 'interp.asked' }, // What is being asked?
  { key: 'interp.concept' }, // What concept applies?
  { key: 'interp.matters' }, // What information matters?
  { key: 'interp.strategy' }, // What strategy should be used?
  { key: 'interp.solve' }, // Solve
] as const;
