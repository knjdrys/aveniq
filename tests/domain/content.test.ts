/**
 * Content pipelines: import parsing, ingestion, search, AI validation,
 * backup & sync.
 */
import { describe, expect, it } from 'vitest';
import {
  parseCSV,
  detectCSVKind,
  parseTermDefinitionText,
  buildDraftConcepts,
  draftsToContent,
  parseQuestionJSON,
  extractCandidateTerms,
} from '../../src/domain/importParsers';
import { ingestMaterial } from '../../src/domain/ingestion';
import { SearchIndex } from '../../src/domain/search';
import {
  validateExplanation,
  validateQuestion,
  validateTeachBackEval,
  validateSocraticReply,
  disclosureFor,
} from '../../src/domain/aiSchemas';
import { validateBackup, migrateBackup, mergeLWW, mergeAppend, buildSyncPack, BACKUP_VERSION } from '../../src/domain/backup';

const NOW = Date.parse('2026-03-02T09:00:00Z');

describe('CSV import (req 50)', () => {
  it('parses quoted cells, embedded commas and newlines', () => {
    const rows = parseCSV('name,note\n"Smith, John","said ""hi"""\nplain,row');
    expect(rows).toEqual([
      ['name', 'note'],
      ['Smith, John', 'said "hi"'],
      ['plain', 'row'],
    ]);
  });

  it('detects term-definition vs question structure', () => {
    expect(detectCSVKind([['term', 'definition'], ['x', 'y']]).kind).toBe('term-definition');
    expect(detectCSVKind([['question', 'answer'], ['q?', 'a']]).kind).toBe('question');
    expect(detectCSVKind([['front', 'back'], ['x', 'y']]).kind).toBe('term-definition');
  });
});

describe('term-definition text import (req 50)', () => {
  it('recognizes the spec example: "Photosynthesis – process plants use to convert light energy…"', () => {
    const items = parseTermDefinitionText(
      'Photosynthesis – process plants use to convert light energy into chemical energy\n' +
        'Mitochondria – organelles that produce energy for the cell\n' +
        'This line has no dash and is just a sentence about nothing in particular.',
    );
    expect(items[0]).toMatchObject({ term: 'Photosynthesis', ambiguous: false });
    expect(items[0].definition).toContain('convert light energy');
    expect(items[2].ambiguous).toBe(true);
  });

  it('builds drafts with inferred prerequisites and generated practice', () => {
    const drafts = buildDraftConcepts([
      { term: 'Chloroplast', definition: 'The organelle where photosynthesis happens.', ambiguous: false, raw: '' },
      { term: 'Photosynthesis', definition: 'A process that happens in the chloroplast.', ambiguous: false, raw: '' },
    ]);
    const photo = drafts.find((d) => d.name === 'Photosynthesis')!;
    expect(photo.prerequisiteNames).toContain('chloroplast');
    expect(photo.questions.length).toBeGreaterThanOrEqual(2);
    // draftsToContent resolves names to ids
    const { concepts, questions, cards } = draftsToContent(drafts, { subjectId: 's1', now: NOW });
    const chloroplast = concepts.find((c) => c.name === 'Chloroplast')!;
    expect(concepts.find((c) => c.name === 'Photosynthesis')!.prerequisites).toContain(chloroplast.id);
    expect(questions.length).toBeGreaterThanOrEqual(4);
    expect(cards.length).toBe(2);
  });

  it('question JSON validation rejects choices without a correct one', () => {
    const bad = parseQuestionJSON([{ concept: 'X', prompt: 'P?', choices: [{ text: 'a' }, { text: 'b' }] }], { subjectId: 's', now: NOW });
    expect('error' in bad).toBe(true);
    const good = parseQuestionJSON([{ concept: 'X', prompt: 'P?', choices: [{ text: 'a', correct: true }, { text: 'b' }] }], { subjectId: 's', now: NOW });
    expect('error' in good).toBe(false);
  });

  it('extracts candidate terms for the vocabulary decoder', () => {
    const terms = extractCandidateTerms('The "Functional Dependency" is a rule. Rows must agree on Values.');
    expect(terms.join(' ').toLowerCase()).toContain('functional dependency');
  });
});

describe('material ingestion (req 51, 52)', () => {
  const notes = `# Cell Respiration
Cells need energy. Respiration converts glucose into ATP.
For example, a muscle cell burns glucose during exercise.

# Prerequisites
Respiration requires Glucose, a sugar molecule.

Common mistake: respiration is breathing. Breathing supplies oxygen but respiration is the chemical process.

# Photosynthesis
Photosynthesis – process plants use to convert light energy into chemical energy
Chloroplast – the organelle where photosynthesis happens`;

  it('extracts sections, concepts, relationships, misconceptions, and a study sequence', () => {
    const draft = ingestMaterial(notes);
    expect(draft.title).toBe('Cell Respiration');
    expect(draft.sections.length).toBeGreaterThanOrEqual(3);
    const names = draft.concepts.map((c) => c.name.toLowerCase());
    expect(names.some((n) => n.includes('respiration'))).toBe(true);
    expect(names).toContain('photosynthesis');
    expect(names).toContain('chloroplast');
    // prerequisite inferred from "requires Glucose"
    expect(draft.relationships.some((r) => r.type === 'prerequisite')).toBe(true);
    // misconception note captured from "Common mistake:"
    expect(draft.misconceptionNotes.length).toBeGreaterThanOrEqual(1);
    expect(draft.questionsGenerated).toBeGreaterThan(0);
    expect(draft.studySequence.length).toBeGreaterThan(1);
  });

  it('term-definition heavy material is recognized (the spec example)', () => {
    const draft = ingestMaterial('Photosynthesis – process plants use to convert light energy into chemical energy\nChloroplast – organelle containing chlorophyll');
    const names = draft.concepts.map((c) => c.name);
    expect(names).toContain('Photosynthesis');
    expect(names).toContain('Chloroplast');
  });
});

describe('global search (req 64)', () => {
  it('indexes and ranks entities, with prefix matching', () => {
    const index = new SearchIndex();
    index.build({
      subjects: [{ id: 's', name: 'Databases', description: '', color: '', icon: '', createdAt: 0, updatedAt: 0 }],
      topics: [],
      concepts: [
        { id: 'c1', subjectId: 's', name: 'Database Normalization', aliases: ['normalization'], intro: 'Store each fact once', whyItMatters: '', explanations: [], terms: [], examples: {}, keyIdeas: [], prerequisites: [], misconceptionDefs: [], examWeight: 1, difficultyBase: 0.5, tags: [], source: 'curated', createdAt: 0, updatedAt: 0 },
        { id: 'c2', subjectId: 's', name: 'Functional Dependency', aliases: [], intro: '', whyItMatters: '', explanations: [], terms: [], examples: {}, keyIdeas: [], prerequisites: [], misconceptionDefs: [], examWeight: 1, difficultyBase: 0.5, tags: [], source: 'curated', createdAt: 0, updatedAt: 0 },
      ],
      questions: [{ id: 'q1', conceptId: 'c1', kind: 'mc', cognitiveLevel: 'recall', prompt: 'What is the goal of normalization?', hints: [], difficultyBase: 0.3, source: 'curated', createdAt: 0, updatedAt: 0 }],
      cards: [],
      notes: [],
      conceptName: (id) => (id === 'c1' ? 'Database Normalization' : 'Functional Dependency'),
      topicName: () => '',
      subjectName: () => 'Databases',
    });
    const hits = index.query('normaliz');
    expect(hits[0].kind).toBe('concept');
    expect(hits[0].id).toBe('c1');
    expect(index.query('goal of normalization').some((h) => h.kind === 'question')).toBe(true);
    expect(index.query('zzz')).toEqual([]);
  });
});

describe('AI validation & safety (req 21, 79)', () => {
  it('validates explanations: rejects short, unsafe, malformed', () => {
    expect(validateExplanation({ content: 'too short' }, 'eli5').ok).toBe(false);
    expect(validateExplanation({ content: 'x'.repeat(5000) }, 'eli5').ok).toBe(false);
    expect(validateExplanation({ content: 'hello <script>alert(1)</script>' }, 'eli5').ok).toBe(false);
    const ok = validateExplanation({ style: 'analogy', content: 'A database is like a well-organized filing cabinet where every folder has a label.' }, 'eli5');
    expect(ok.ok).toBe(true);
    expect(ok.value!.source).toBe('ai');
  });

  it('validates MC questions: exactly one correct answer', () => {
    expect(validateQuestion({ prompt: 'Q?', choices: [{ text: 'a', correct: true }, { text: 'b', correct: true }] }).ok).toBe(false);
    expect(validateQuestion({ prompt: 'Q?', choices: [{ text: 'a' }, { text: 'b' }] }).ok).toBe(false);
    const ok = validateQuestion({ prompt: 'What is a table?', choices: [{ text: 'A grid of rows and columns', correct: true }, { text: 'A chair' }] });
    expect(ok.ok).toBe(true);
  });

  it('socratic replies must not leak the answer (req 20)', () => {
    const leak = validateSocraticReply({ reply: 'The answer is primary key uniqueness means no duplicates allowed' }, 'primary key uniqueness means no duplicates allowed');
    expect(leak.ok).toBe(false);
    const good = validateSocraticReply({ reply: 'What do you think happens if two rows share the same key?' }, 'primary key uniqueness means no duplicates');
    expect(good.ok).toBe(true);
  });

  it('teach-back eval validation clamps coverage', () => {
    expect(validateTeachBackEval({ coverage: 1.5 }).ok).toBe(false);
    expect(validateTeachBackEval({ coverage: 0.8, missing: [], misconceptions: [] }).ok).toBe(true);
  });

  it('discloses what is sent for each request type (req 66)', () => {
    expect(disclosureFor({ type: 'evaluate-teachback', concept: 'X', keyIdeas: [], learnerText: 'text' }).sentFields).toContain('your explanation text');
    expect(disclosureFor({ type: 'alternative-explanation', concept: 'X', layer: 'eli5' }).note).toContain('No learning history');
  });
});

describe('backup & sync (req 60, 61)', () => {
  it('validates and migrates backups', () => {
    const v1 = { format: 'aveniq.backup', version: 1, exportedAt: NOW, appVersion: '1.0', data: { concepts: [], subjects: [], topics: [], questions: [], cards: [], conceptStates: [], attempts: [], misconceptions: [], confusionPairs: [], gaps: [], sessions: [], plans: [], exams: [], insights: [], notes: [], learner: null } };
    const res = validateBackup(v1);
    expect(res.ok).toBe(true);
    const migrated = migrateBackup(res.backup!);
    expect(migrated.version).toBe(BACKUP_VERSION);
    expect(migrated.data.readiness).toEqual([]);
    expect(validateBackup({ format: 'other' }).ok).toBe(false);
  });

  it('merges sync packs last-writer-wins with tombstones (req 61)', () => {
    const local = [
      { id: 'cs1', conceptId: 'c1', updatedAt: NOW - 100, mastery: 50 },
      { id: 'cs2', conceptId: 'c2', updatedAt: NOW, mastery: 80 },
    ];
    const remote = [
      { id: 'cs1', conceptId: 'c1', updatedAt: NOW, mastery: 70 }, // newer remote wins
      { id: 'cs3', conceptId: 'c3', updatedAt: NOW, mastery: 10 }, // new remote record
    ];
    const { merged, changed } = mergeLWW(local, remote, (r) => r.id, 'deviceB');
    expect(changed).toBe(1);
    const cs1 = merged.find((m) => m.id === 'cs1')!;
    expect(cs1.mastery).toBe(70);
    expect(merged.find((m) => m.id === 'cs2')!.mastery).toBe(80); // local kept
    expect(merged.length).toBe(3);
    // tombstone: remote deleted cs2
    const remoteDeleted = [{ id: 'cs2', conceptId: 'c2', updatedAt: NOW + 1, mastery: 80, deleted: true }];
    const { merged: merged2 } = mergeLWW(local, remoteDeleted, (r) => r.id, 'deviceB');
    expect(merged2.find((m) => m.id === 'cs2')).toBeUndefined();
  });

  it('append-only merge by id never duplicates', () => {
    const local = [{ id: 'a1', conceptId: 'c', ts: NOW, correct: true, score: 1, responseMs: 1, hintsUsed: 0, cognitiveLevel: 'recall', evidenceType: 'recall', daysSincePrev: 0, misconceptionIds: [], wasDelayed: false, context: 'review' as never }];
    const remote = [...local, { id: 'a2', conceptId: 'c', ts: NOW + 1, correct: true, score: 1, responseMs: 1, hintsUsed: 0, cognitiveLevel: 'recall', evidenceType: 'recall', daysSincePrev: 0, misconceptionIds: [], wasDelayed: false, context: 'review' as never }];
    const { merged, added } = mergeAppend(local, remote);
    expect(merged.length).toBe(2);
    expect(added).toBe(1);
  });

  it('builds a sync pack from backup data', () => {
    const pack = buildSyncPack({
      subjects: [], topics: [], concepts: [], questions: [], cards: [], conceptStates: [], misconceptions: [],
      confusionPairs: [], gaps: [], sessions: [], plans: [], exams: [], readiness: [], insights: [], notes: [], resources: [], learner: null,
      attempts: [],
    }, 'dev1', NOW);
    expect(pack.format).toBe('aveniq.syncpack');
    expect(pack.deviceId).toBe('dev1');
  });
});
