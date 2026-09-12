/**
 * Scaffolding engine (req 15) + progressive hints (req 16).
 * Temporary support: reminder → keyword → partial answer → first step →
 * worked example → full explanation. Support is gradually removed.
 * Help needed is learning evidence (reduces credit, informs mastery).
 */
import { Question } from './types';

export type ScaffoldLevel =
  | 'none'
  | 'reminder'
  | 'keyword'
  | 'partial'
  | 'first-step'
  | 'worked'
  | 'full';

export const SCAFFOLD_LADDER: ScaffoldLevel[] = [
  'none',
  'reminder',
  'keyword',
  'partial',
  'first-step',
  'worked',
  'full',
];

/** Next scaffold level given struggles so far. */
export function nextScaffold(current: ScaffoldLevel): ScaffoldLevel {
  const i = SCAFFOLD_LADDER.indexOf(current);
  return SCAFFOLD_LADDER[Math.min(i + 1, SCAFFOLD_LADDER.length - 1)];
}

/**
 * Map a question's curated hints onto the progressive ladder.
 * Hints: 1 = point to the idea, 2 = recall prerequisite, 3 = part of reasoning,
 * 4 = first step, 5 = solution with explanation.
 */
export function hintForLevel(question: Question, level: ScaffoldLevel): string | null {
  const idx: Partial<Record<ScaffoldLevel, number>> = {
    reminder: 0,
    keyword: 1,
    partial: 2,
    'first-step': 3,
    worked: 4,
    full: 5,
  };
  const i = idx[level];
  if (i == null) return null;
  if (question.hints.length === 0) return fallbackHint(level);
  return question.hints[Math.min(i, question.hints.length - 1)];
}

function fallbackHint(level: ScaffoldLevel): string {
  switch (level) {
    case 'reminder':
      return 'Think back to the core idea — what is this concept really about?';
    case 'keyword':
      return 'Which words from the definition matter most here?';
    case 'partial':
      return('Part of the answer: start from what the concept guarantees, then what it does not.');
    case 'first-step':
      return 'First step: name the concept involved, then say what it changes.';
    case 'worked':
      return('Worked example: take the smallest possible case and apply the idea step by step.');
    default:
      return 'Full solution: review the explanation above — it contains the answer.';
  }
}

/** How much did help reduce the evidence? (0..1 multiplier on score) */
export function scaffoldPenalty(hintsUsed: number): number {
  return Math.max(0.4, 1 - 0.08 * hintsUsed);
}

/**
 * Scaffolding removal: after a scaffolded success, require an unscaffolded
 * retrieval before the evidence counts at full strength (req 15).
 */
export function needsIndependentConfirm(scaffoldedSuccesses: number, independentSuccesses: number): boolean {
  return scaffoldedSuccesses > independentSuccesses;
}
