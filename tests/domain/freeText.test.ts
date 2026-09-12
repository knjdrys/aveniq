/**
 * Free-text evaluation: teach-back, blurt, Feynman, explanations, scaffolding.
 * The deterministic core must judge real understanding (req 17, 18, 19).
 */
import { describe, expect, it } from 'vitest';
import { evaluateTeachBack, evaluateShortAnswer, evaluateCloze } from '../../src/domain/teachback';
import { evaluateBlurt } from '../../src/domain/blurt';
import { pickExplanation, nextAlternative, recordStyleOutcome, extractTermMarkers } from '../../src/domain/explanation';
import { hintForLevel, nextScaffold, scaffoldPenalty, needsIndependentConfirm } from '../../src/domain/scaffold';
import { Concept, ExplanationStyle } from '../../src/domain/types';

const NOW = Date.parse('2026-03-02T09:00:00Z');

const concept: Concept = {
  id: 'c-norm',
  subjectId: 's',
  name: 'Database Normalization',
  aliases: [],
  intro: 'Restructure tables so each fact is stored once.',
  whyItMatters: '',
  explanations: [
    { id: 'e1', style: 'analogy', layer: 'eli5', content: 'One list on the fridge.', source: 'curated' },
    { id: 'e2', style: 'simplified', layer: 'eli5', content: 'Each piece of info lives in one place.', source: 'curated' },
    { id: 'e3', style: 'steps', layer: 'how-it-works', content: '1) Find dependencies 2) Split tables.', source: 'curated' },
    { id: 'e4', style: 'technical', layer: 'formal', content: 'Normal forms via functional dependencies.', source: 'curated' },
  ],
  terms: [
    { id: 't1', word: 'functional dependency', definition: '', simple: '', example: '', why: '' },
  ],
  examples: {},
  keyIdeas: [
    { id: 'ki1', label: 'each fact stored once', groups: [['once', 'one place', 'single place']] },
    { id: 'ki2', label: 'uses functional dependencies', groups: [['functional dependency', 'dependencies', 'depends']] },
    { id: 'ki3', label: 'eliminates anomalies', groups: [['anomal', 'contradict', 'inconsist']] },
  ],
  prerequisites: [],
  misconceptionDefs: [
    {
      id: 'md1',
      label: 'Always faster',
      wrongIdea: '',
      whyPlausible: '',
      whereItBreaks: '',
      correction: '',
      contrast: { wrong: '', correct: '' },
      targetedExample: '',
      detectPatterns: ['always faster', 'makes queries faster'],
    },
  ],
  examWeight: 1,
  difficultyBase: 0.6,
  tags: [],
  source: 'curated',
  createdAt: NOW,
  updatedAt: NOW,
};

describe('teach-back evaluation (req 17, 19)', () => {
  it('full credit requires covering key ideas — recognition is not enough', () => {
    const good = evaluateTeachBack(concept, 'Normalization means each fact is stored once. You find the functional dependencies and split the tables so updates never leave contradictory copies. For example, a customer name lives in one table only.');
    expect(good.coverage).toBe(1);
    expect(good.verdict).toBe('strong');
    expect(good.score).toBeGreaterThanOrEqual(0.75);

    const recognitionOnly = evaluateTeachBack(concept, 'It is about tables and databases and making things organized.');
    expect(recognitionOnly.score).toBeLessThan(0.5);
    expect(recognitionOnly.verdict).toBe('weak');
  });

  it('misconception traps are detected and penalized', () => {
    const trapped = evaluateTeachBack(concept, 'Normalization means each fact is stored once, and it makes queries faster because there is less data.');
    expect(trapped.misconceptionHits.map((m) => m.id)).toContain('md1');
    expect(trapped.verdict).not.toBe('strong');
    expect(trapped.feedback.some((f) => f.key === 'tb.misconception')).toBe(true);
  });

  it('missing ideas are listed for targeted feedback', () => {
    const partial = evaluateTeachBack(concept, 'You store each fact once so nothing gets duplicated.');
    expect(partial.missingIdeas.map((m) => m.label)).toContain('uses functional dependencies');
    expect(partial.missingIdeas.map((m) => m.label)).toContain('eliminates anomalies');
  });

  it('example quality is rewarded; jargon flagged for unknown vocabulary', () => {
    const withExample = evaluateTeachBack(concept, 'Each fact once. Uses dependencies. Prevents anomalies. For example, a customer name is stored in one table.');
    const without = evaluateTeachBack(concept, 'Each fact once. Uses dependencies. Prevents anomalies.');
    expect(withExample.hasExample).toBe(true);
    expect(withExample.score).toBeGreaterThan(without.score);
    const jargon = evaluateTeachBack(concept, 'Each fact once. Uses functional dependency. Prevents anomalies.', { knownVocabulary: new Set() });
    expect(jargon.jargonFlags).toContain('functional dependency');
  });

  it('Feynman mode rewards brevity with understanding, not word count (req 19)', () => {
    const short = evaluateTeachBack(concept, 'Store each fact once using dependencies; prevents anomalies like two different names for one customer.', { isFeynman: true });
    const verbose = evaluateTeachBack(concept, 'So basically and I want to say that when you have a database you might have duplication and duplication is bad because when you update you can miss copies and also there are anomalies like update anomalies and insert anomalies and delete anomalies and furthermore in addition you normalize by finding functional dependencies which are like when one column determines another and then you split tables.', { isFeynman: true });
    expect(short.score).toBeGreaterThan(verbose.score);
  });

  it('empty/too-short answers cannot pass', () => {
    expect(evaluateTeachBack(concept, '').score).toBe(0);
    expect(evaluateTeachBack(concept, 'yes').score).toBeLessThanOrEqual(0.3);
  });
});

describe('blurt engine (req 18)', () => {
  it('classifies ideas remembered/partial/missing/incorrect and builds a mini-review', () => {
    const res = evaluateBlurt(concept, 'each fact stored once... uses functional dependencies... something about speed, it makes queries faster');
    const remembered = res.ideas.filter((i) => i.classification === 'remembered').map((i) => i.label);
    expect(remembered).toContain('each fact stored once');
    expect(res.misconceptionHits.length).toBe(1);
    expect(res.miniReview.focusIdeaLabels).toContain('eliminates anomalies');
    expect(res.miniReview.misconceptionDefIds).toContain('md1');
    expect(res.score).toBeLessThan(1);
  });
});

describe('short answer + cloze evaluation', () => {
  it('keyword groups with partial credit', () => {
    const full = evaluateShortAnswer('The second insert is rejected because keys must be unique', [['unique'], ['reject', 'rejected']], ['constraint']);
    expect(full.correct).toBe(true);
    expect(full.score).toBe(1);
    const half = evaluateShortAnswer('It has to be unique', [['unique'], ['reject', 'rejected']]);
    expect(half.score).toBeGreaterThan(0);
    expect(half.correct).toBe(false);
  });
  it('cloze compares normalized content', () => {
    expect(evaluateCloze('Primary key', 'primary key').correct).toBe(true);
    expect(evaluateCloze('foreign key', 'primary key').correct).toBe(false);
  });
});

describe('adaptive explanation engine (req 4, 5, 54)', () => {
  it('picks explanations personalized by style success history', () => {
    const stats = recordStyleOutcome(recordStyleOutcome({}, 'analogy', true), 'analogy', true);
    const pick = pickExplanation(concept, 'eli5', stats, []);
    expect(pick?.style).toBe('analogy');
  });

  it('"I don\'t understand" never repeats the same paragraph; escalates to prereqs when exhausted (req 5)', () => {
    const withPrereqs = { ...concept, prerequisites: ['c-root'] } as Concept;
    let tried: ExplanationStyle[] = [];
    const stats = {};
    // cycle through every distinct explanation style available
    let choice = nextAlternative(withPrereqs, 'eli5', stats, tried, 2);
    const seen: string[] = [];
    while (choice.explanation) {
      expect(seen).not.toContain(choice.explanation.id); // never repeats
      seen.push(choice.explanation.id);
      tried = [...tried, choice.explanation.style];
      choice = nextAlternative(withPrereqs, 'eli5', stats, tried, 2);
    }
    expect(seen.length).toBe(withPrereqs.explanations.length); // all alternatives were offered
    expect(choice.explanation).toBeNull();
    expect(choice.escalateToPrereq).toBe(true); // go backward in the prerequisite graph
  });

  it('[[term]] markers extract for the vocabulary decoder (req 6)', () => {
    const parts = extractTermMarkers('Encapsulation bundles [[data]] with [[methods]] into one object.');
    expect(parts.filter((p) => p.term).map((p) => p.term)).toEqual(['data', 'methods']);
  });
});

describe('scaffolding & hints (req 15, 16)', () => {
  it('progressive hint ladder maps question hints to levels', () => {
    const q = { hints: ['h1-idea', 'h2-prereq', 'h3-reasoning', 'h4-first-step', 'h5-solution'] } as never;
    expect(hintForLevel(q as never, 'reminder')).toBe('h1-idea');
    expect(hintForLevel(q as never, 'keyword')).toBe('h2-prereq');
    expect(hintForLevel(q as never, 'first-step')).toBe('h4-first-step');
    expect(hintForLevel(q as never, 'full')).toBe('h5-solution');
    expect(hintForLevel(q as never, 'none')).toBeNull();
    // fallback when no curated hints
    expect(hintForLevel({ hints: [] } as never, 'reminder')).toBeTruthy();
  });

  it('ladder advances and penalizes evidence by help used', () => {
    expect(nextScaffold('none')).toBe('reminder');
    expect(nextScaffold('worked')).toBe('full');
    expect(scaffoldPenalty(0)).toBe(1);
    expect(scaffoldPenalty(3)).toBeLessThan(1);
    expect(needsIndependentConfirm(2, 0)).toBe(true);
    expect(needsIndependentConfirm(1, 2)).toBe(false);
  });
});
