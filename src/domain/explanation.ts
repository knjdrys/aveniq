/**
 * Adaptive explanation engine (req 4, 5, 54).
 * Personalizes explanation style, and powers the "I don't understand" system:
 * never repeat the same paragraph — cycle alternative strategies,
 * personalized by which styles historically lead to successful learning.
 */
import { Concept, Explanation, ExplanationStyle, LayerKind, StyleStat } from './types';

/** All strategies used to re-explain (req 5). */
export const RE_EXPLAIN_ORDER: ExplanationStyle[] = [
  'simplified',
  'analogy',
  'example',
  'steps',
  'comparison',
  'scenario',
  'visual',
  'worked',
  'technical',
  'definition',
];

export interface StyleAffinity {
  style: ExplanationStyle;
  /** success rate after using this style (fallback to global preference) */
  score: number;
  n: number;
}

export function styleAffinity(stats: Partial<Record<ExplanationStyle, StyleStat>>): StyleAffinity[] {
  return RE_EXPLAIN_ORDER.map((style) => {
    const s = stats[style];
    // Laplace-smoothed success rate; untried styles get 0.5 with low n
    const score = s && s.uses > 0 ? (s.successes + 1) / (s.uses + 2) : 0.5;
    return { style, score, n: s?.uses ?? 0 };
  });
}

/** Pick the explanation for a stage/layer, personalized (req 4, 54). */
export function pickExplanation(
  concept: Concept,
  layer: LayerKind,
  stats: Partial<Record<ExplanationStyle, StyleStat>>,
  triedStyles: ExplanationStyle[] = [],
  fallbackLayer?: LayerKind,
): Explanation | null {
  const candidates = concept.explanations.filter(
    (e) => e.layer === layer && !triedStyles.includes(e.style),
  );
  const pool = candidates.length
    ? candidates
    : fallbackLayer
      ? concept.explanations.filter((e) => e.layer === fallbackLayer && !triedStyles.includes(e.style))
      : [];
  if (!pool.length) {
    // last resort: anything not tried at this layer
    const any = concept.explanations.filter((e) => !triedStyles.includes(e.style));
    if (!any.length) return null;
    return any[0];
  }
  const affinity = new Map(styleAffinity(stats).map((a) => [a.style, a]));
  return [...pool].sort((a, b) => {
    const sa = affinity.get(a.style)!.score;
    const sb = affinity.get(b.style)!.score;
    return sb - sa;
  })[0];
}

export interface ReExplainChoice {
  explanation: Explanation | null;
  /** strategy note for the UI */
  strategy: ExplanationStyle;
  /** escalation: move backward in the prerequisite graph instead */
  escalateToPrereq: boolean;
}

/**
 * "I don't understand" (req 5): pick the next-best untried strategy,
 * personalized. After exhausting strategies → escalate to prerequisites.
 */
export function nextAlternative(
  concept: Concept,
  layer: LayerKind,
  stats: Partial<Record<ExplanationStyle, StyleStat>>,
  triedStyles: ExplanationStyle[],
  failCount: number,
): ReExplainChoice {
  const choice = pickExplanation(concept, layer, stats, triedStyles);
  if (choice) {
    return { explanation: choice, strategy: choice.style, escalateToPrereq: false };
  }
  // exhausted concept-local alternatives → teach the prerequisite
  return {
    explanation: null,
    strategy: 'simplified',
    escalateToPrereq: failCount >= 2 && concept.prerequisites.length > 0,
  };
}

/** Record that a style led to a successful check (feeds personalization). */
export function recordStyleOutcome(
  stats: Partial<Record<ExplanationStyle, StyleStat>>,
  style: ExplanationStyle,
  success: boolean,
): Partial<Record<ExplanationStyle, StyleStat>> {
  const s = stats[style] ?? { uses: 0, successes: 0 };
  return { ...stats, [style]: { uses: s.uses + 1, successes: s.successes + (success ? 1 : 0) } };
}

/** Render helpers: [[term]] markers → tap targets for the vocabulary decoder. */
export function extractTermMarkers(content: string): { text: string; term?: string }[] {
  const parts: { text: string; term?: string }[] = [];
  const re = /\[\[([^\]]+)\]\]/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(content))) {
    if (m.index > last) parts.push({ text: content.slice(last, m.index) });
    parts.push({ text: m[1], term: m[1] });
    last = m.index + m[0].length;
  }
  if (last < content.length) parts.push({ text: content.slice(last) });
  return parts;
}

/**
 * Automatically identify terms in raw material that likely need decoding (req 6):
 * terms of this concept + capitalized/jargon words the learner hasn't seen.
 */
export function autoDetectUnfamiliarTerms(
  content: string,
  conceptTerms: { word: string }[],
  knownVocabulary: Set<string>,
): string[] {
  const words = new Set<string>();
  const termWords = new Set(conceptTerms.map((t) => t.word.toLowerCase()));
  const tokens = content.match(/[A-Za-z][A-Za-z-]{3,}/g) ?? [];
  for (const tok of tokens) {
    const lower = tok.toLowerCase();
    if (termWords.has(lower) && !knownVocabulary.has(lower)) words.add(lower);
  }
  return [...words];
}
