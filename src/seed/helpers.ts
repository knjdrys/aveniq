/**
 * Seed helpers — terse DSL for authoring rich concept content.
 */
import {
  Card,
  CognitiveLevel,
  Concept,
  Explanation,
  ExplanationStyle,
  KeyIdea,
  LayerKind,
  MCChoice,
  MisconceptionDef,
  Question,
  Term,
} from '../domain/types';

export const NOW = Date.parse('2026-01-01T00:00:00Z');

let explainSeq = 0;
export function E(style: ExplanationStyle, layer: LayerKind, content: string): Explanation {
  return { id: `e${++explainSeq}`, style, layer, content, source: 'curated' };
}

export function T(word: string, definition: string, simple: string, example: string, why: string, conceptId?: string): Term {
  return { id: `t_${word.toLowerCase().replace(/\s+/g, '-')}`, word, definition, simple, example, why, conceptId };
}

export function KI(label: string, ...groups: string[][]): KeyIdea {
  return { id: `ki_${label.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 30)}`, label, groups };
}

export interface QOpts {
  hints?: string[];
  difficultyBase?: number;
  scenario?: string;
  isTransfer?: boolean;
  requiresConcepts?: string[];
  targetsMisconception?: string;
  compareWith?: string;
  socraticSteps?: string[];
  cognitiveLevel?: CognitiveLevel;
  kind?: Question['kind'];
  partialKeywords?: string[];
}

export interface MCOpts extends QOpts {
  correctIndex: number;
}

export function MC(
  id: string,
  conceptId: string,
  prompt: string,
  choices: (string | { text: string; misconceptionId?: string; conceptId?: string; feedback?: string })[],
  opts: MCOpts,
): Question {
  const mcChoices: MCChoice[] = choices.map((c, i) =>
    typeof c === 'string'
      ? { id: `ch${i}`, text: c, correct: i === opts.correctIndex }
      : {
          id: `ch${i}`,
          text: c.text,
          correct: i === opts.correctIndex,
          misconceptionId: c.misconceptionId,
          conceptId: c.conceptId,
          feedback: c.feedback,
        },
  );
  return {
    id,
    conceptId,
    kind: 'mc',
    cognitiveLevel: opts.cognitiveLevel ?? 'recall',
    prompt,
    choices: mcChoices,
    hints: opts.hints ?? [],
    difficultyBase: opts.difficultyBase ?? 0.3,
    scenario: opts.scenario,
    isTransfer: opts.isTransfer,
    requiresConcepts: opts.requiresConcepts,
    targetsMisconception: opts.targetsMisconception,
    compareWith: opts.compareWith,
    socraticSteps: opts.socraticSteps,
    source: 'curated',
    createdAt: NOW,
    updatedAt: NOW,
  };
}

export function SA(id: string, conceptId: string, prompt: string, answer: string, keywords: string[][], opts: QOpts = {}): Question {
  return {
    id,
    conceptId,
    kind: opts.kind ?? 'short',
    cognitiveLevel: opts.cognitiveLevel ?? 'understanding',
    prompt,
    answer,
    keywords,
    partialKeywords: opts.partialKeywords,
    hints: opts.hints ?? [],
    difficultyBase: opts.difficultyBase ?? 0.4,
    scenario: opts.scenario,
    isTransfer: opts.isTransfer,
    requiresConcepts: opts.requiresConcepts,
    targetsMisconception: opts.targetsMisconception,
    compareWith: opts.compareWith,
    socraticSteps: opts.socraticSteps,
    source: 'curated',
    createdAt: NOW,
    updatedAt: NOW,
  } as Question;
}

/** Application / transfer question. Scenario text goes in opts.scenario (or embed it in the prompt). */
export function APP(
  id: string,
  conceptId: string,
  prompt: string,
  answer: string,
  keywords: string[][],
  opts: QOpts = {},
): Question {
  return SA(id, conceptId, prompt, answer, keywords, {
    ...opts,
    kind: 'apply-scenario',
    cognitiveLevel: opts.cognitiveLevel ?? 'application',
    isTransfer: opts.isTransfer ?? true,
  });
}

export interface ConceptInput {
  id: string;
  subjectId: string;
  topicId?: string;
  name: string;
  shortName?: string;
  aliases?: string[];
  intro: string;
  why: string;
  explanations: Explanation[];
  terms?: Term[];
  examples?: Concept['examples'];
  keyIdeas?: KeyIdea[];
  prerequisites?: string[];
  misconceptions?: Omit<MisconceptionDef, 'id'>[];
  examWeight?: number;
  difficultyBase?: number;
  tags?: string[];
}

export function C(input: ConceptInput): Concept {
  return {
    id: input.id,
    subjectId: input.subjectId,
    topicId: input.topicId,
    name: input.name,
    shortName: input.shortName,
    aliases: input.aliases ?? [],
    intro: input.intro,
    whyItMatters: input.why,
    explanations: input.explanations,
    terms: input.terms ?? [],
    examples: input.examples ?? {},
    keyIdeas: input.keyIdeas ?? [],
    prerequisites: input.prerequisites ?? [],
    misconceptionDefs: (input.misconceptions ?? []).map((m) => ({
      ...m,
      id: `md_${input.id}_${m.label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
    })),
    examWeight: input.examWeight ?? 0.5,
    difficultyBase: input.difficultyBase ?? 0.5,
    tags: input.tags ?? [],
    source: 'curated' as const,
    createdAt: NOW,
    updatedAt: NOW,
  };
}

let cardSeq = 0;
export function card(conceptId: string, front: string, back: string): Card {
  return { id: `card_${conceptId}_${++cardSeq}`, conceptId, front, back, createdAt: NOW, updatedAt: NOW };
}
