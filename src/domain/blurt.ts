/**
 * Blurt engine (req 18): timed memory dump → compare with concept requirements →
 * classify remembered / partially remembered / missing / incorrect →
 * build a targeted mini-review.
 */
import { Concept, ID } from './types';
import { evaluateTeachBack, IdeaResult } from './teachback';

export type BlurtClass = 'remembered' | 'partial' | 'missing' | 'incorrect';

export interface BlurtIdeaResult {
  label: string;
  classification: BlurtClass;
}

export interface BlurtResult {
  score: number;
  ideas: BlurtIdeaResult[];
  misconceptionHits: string[];
  miniReview: {
    conceptIds: ID[];
    focusIdeaLabels: string[];
    misconceptionDefIds: ID[];
  };
}

export function evaluateBlurt(concept: Concept, text: string): BlurtResult {
  const evalResult = evaluateTeachBack(concept, text);
  const ideas: BlurtIdeaResult[] = evalResult.ideaResults.map((r: IdeaResult) => ({
    label: r.idea.label,
    classification: r.covered ? 'remembered' : 'missing',
  }));
  const misconceptionHits = evalResult.misconceptionHits.map((m) => m.label);

  // any trap hit marks related ideas incorrect rather than remembered
  if (misconceptionHits.length) {
    for (const idea of ideas) {
      if (idea.classification === 'remembered' && evalResult.coverage < 1) idea.classification = 'partial';
    }
  }

  const remembered = ideas.filter((i) => i.classification === 'remembered').length;
  const partial = ideas.filter((i) => i.classification === 'partial').length;
  const score = ideas.length ? (remembered + 0.5 * partial) / ideas.length : evalResult.score;

  return {
    score,
    ideas,
    misconceptionHits,
    miniReview: {
      conceptIds: [concept.id],
      focusIdeaLabels: ideas.filter((i) => i.classification !== 'remembered').map((i) => i.label),
      misconceptionDefIds: evalResult.misconceptionHits.map((m) => m.id),
    },
  };
}
