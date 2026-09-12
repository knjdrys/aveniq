/**
 * Explain-back / teach-back / Feynman evaluation (req 17, 19).
 * Deterministic core (works without AI, req 79, 21):
 *   - coverage: which required key ideas are present
 *   - correctness: misconception traps detected
 *   - example quality: concrete markers present
 *   - jargon check: terms used that the learner hasn't decoded yet
 * The learner never gets full mastery just for recognizing the answer (req 17).
 */
import { Concept, KeyIdea, MisconceptionDef, Term } from './types';
import { clamp01, containsAny, normalizeText, wordCount } from './utils';

export interface IdeaResult {
  idea: KeyIdea;
  covered: boolean;
  matchedKeyword?: string;
}

export interface TeachBackEvaluation {
  score: number; // 0..1
  coverage: number; // 0..1
  ideaResults: IdeaResult[];
  missingIdeas: KeyIdea[];
  misconceptionHits: MisconceptionDef[];
  hasExample: boolean;
  jargonFlags: string[];
  wordCount: number;
  verdict: 'strong' | 'partial' | 'weak';
  feedback: { key: string; params?: Record<string, string | number> }[];
}

const EXAMPLE_MARKERS = [
  'for example',
  'e.g.',
  'eg.',
  'like a',
  'like the',
  'such as',
  'imagine',
  'say you',
  'suppose',
  'a case',
  'one way',
  'for instance',
];

export function evaluateTeachBack(
  concept: Concept,
  text: string,
  opts: { knownVocabulary?: Set<string>; isFeynman?: boolean } = {},
): TeachBackEvaluation {
  const normalized = normalizeText(text);
  const n = wordCount(text);

  // coverage: each key idea is covered if any keyword from any synonym group matches
  const ideaResults: IdeaResult[] = concept.keyIdeas.map((idea) => {
    for (const group of idea.groups) {
      const hit = containsAny(normalized, group);
      if (hit) return { idea, covered: true, matchedKeyword: hit };
    }
    return { idea, covered: false };
  });
  const coveredCount = ideaResults.filter((r) => r.covered).length;
  const coverage = concept.keyIdeas.length ? coveredCount / concept.keyIdeas.length : 0;

  // correctness: misconception traps
  const misconceptionHits = concept.misconceptionDefs.filter((d) =>
    d.detectPatterns.some((p) => containsAny(normalized, [p]) != null),
  );
  const trapPenalty = Math.min(0.5, 0.25 * misconceptionHits.length);

  // example quality
  const hasExample = EXAMPLE_MARKERS.some((m) => normalized.includes(m));

  // jargon check: concept terms used but never decoded by this learner
  const jargonFlags = concept.terms
    .filter(
      (t: Term) =>
        normalized.includes(normalizeText(t.word)) &&
        opts.knownVocabulary &&
        !opts.knownVocabulary.has(normalizeText(t.word)),
    )
    .map((t) => t.word);

  // Feynman mode (req 19): reward understanding, not word count.
  // Very long answers are not punished per se, but verbosity alone earns nothing:
  // brevity + coverage is rewarded.
  const tooShort = n < 8 && concept.keyIdeas.length > 1;
  const brevityBonus = opts.isFeynman && n > 0 && n <= 120 ? 0.05 : 0;

  let score = clamp01(0.7 * coverage + 0.1 * (hasExample ? 1 : 0) + 0.2 * (1 - trapPenalty * 2) + brevityBonus);
  if (tooShort) score = Math.min(score, 0.3);
  if (n === 0) score = 0;

  const verdict: TeachBackEvaluation['verdict'] = score >= 0.75 ? 'strong' : score >= 0.45 ? 'partial' : 'weak';

  const feedback: { key: string; params?: Record<string, string | number> }[] = [];
  const missing = ideaResults.filter((r) => !r.covered).map((r) => r.idea);
  if (misconceptionHits.length) {
    feedback.push({ key: 'tb.misconception', params: { label: misconceptionHits[0].label } });
  }
  if (missing.length) {
    feedback.push({
      key: coverage === 0 ? 'tb.nothing' : 'tb.missing',
      params: { ideas: missing.map((m) => m.label).join(' · ') },
    });
  }
  if (hasExample) feedback.push({ key: 'tb.exampleGood' });
  else if (verdict !== 'weak') feedback.push({ key: 'tb.exampleMissing' });
  if (jargonFlags.length) feedback.push({ key: 'tb.jargon', params: { terms: jargonFlags.join(', ') } });
  if (opts.isFeynman && n > 150) feedback.push({ key: 'tb.verbose' });
  if (verdict === 'strong') feedback.push({ key: 'tb.strong' });

  return {
    score,
    coverage,
    ideaResults,
    missingIdeas: missing,
    misconceptionHits,
    hasExample,
    jargonFlags,
    wordCount: n,
    verdict,
    feedback,
  };
}

/** Short-answer evaluation with keyword groups + partial credit. */
export interface ShortAnswerEvaluation {
  score: number;
  correct: boolean;
  matchedGroups: number;
  totalGroups: number;
  matchedPartial: boolean;
}

export function evaluateShortAnswer(
  answerText: string,
  keywords: string[][] | undefined,
  partialKeywords: string[] | undefined,
): ShortAnswerEvaluation {
  const normalized = normalizeText(answerText);
  if (!keywords || keywords.length === 0) {
    // no keywords defined: correctness by non-empty answer is NOT assumed —
    // caller should require AI or self-grade. We return conservative 0.5.
    return { score: normalized ? 0.5 : 0, correct: false, matchedGroups: 0, totalGroups: 0, matchedPartial: false };
  }
  const matched = keywords.filter((group) => containsAny(normalized, group) != null).length;
  const partial = (partialKeywords ?? []).some((k) => containsAny(normalized, [k]) != null);
  const score = keywords.length ? matched / keywords.length : 0;
  const boosted = clamp01(score + (partial && score > 0 ? 0.15 : 0));
  return {
    score: boosted,
    correct: boosted >= 0.7,
    matchedGroups: matched,
    totalGroups: keywords.length,
    matchedPartial: partial,
  };
}

/** Cloze evaluation: compare the blank content. */
export function evaluateCloze(given: string, expected: string): { score: number; correct: boolean } {
  const g = normalizeText(given);
  const e = normalizeText(expected);
  if (!g) return { score: 0, correct: false };
  if (g === e) return { score: 1, correct: true };
  if (e.includes(g) || g.includes(e)) return { score: 0.75, correct: true };
  return { score: 0, correct: false };
}
