/**
 * AI safety layer (req 21, 66, 79).
 * AI may help generate explanations/questions/feedback, but:
 *   - structured output is validated (schema + sanity)
 *   - generated content is clearly marked
 *   - everything has a deterministic fallback — the engine never blocks on AI
 *   - requests disclose what is sent (privacy)
 */
import { Concept, Explanation, ExplanationStyle, KeyIdea, LayerKind, Question } from './types';
import { uid, wordCount } from './utils';

export type AIRequest =
  | { type: 'alternative-explanation'; concept: string; layer: LayerKind; triedStyles: ExplanationStyle[] }
  | { type: 'generate-question'; concept: string; definition: string; level: string }
  | { type: 'evaluate-teachback'; concept: string; keyIdeas: string[]; learnerText: string }
  | { type: 'socratic-reply'; concept: string; question: string; learnerMessage: string; misconceptions: string[] }
  | { type: 'enrich-concept'; name: string; definition: string };

export interface AIPrivacyDisclosure {
  sentFields: string[];
  note: string;
}

export function disclosureFor(req: AIRequest): AIPrivacyDisclosure {
  switch (req.type) {
    case 'alternative-explanation':
      return { sentFields: ['concept name', 'depth layer'], note: 'No learning history is sent.' };
    case 'generate-question':
      return { sentFields: ['concept name', 'concept definition'], note: 'No learning history is sent.' };
    case 'evaluate-teachback':
      return { sentFields: ['concept name', 'required ideas', 'your explanation text'], note: 'Your written text is sent for evaluation.' };
    case 'socratic-reply':
      return { sentFields: ['concept name', 'question text', 'your message'], note: 'This conversation turn is sent.' };
    case 'enrich-concept':
      return { sentFields: ['concept name', 'definition'], note: 'No learning history is sent.' };
  }
}

export interface AIValidatedResult<T> {
  ok: boolean;
  value?: T;
  errors: string[];
  /** always set so callers can show provenance */
  source: 'ai';
}

function isObj(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null;
}

/** Validate an AI-generated explanation. */
export function validateExplanation(raw: unknown, layer: LayerKind): AIValidatedResult<Explanation> {
  const errors: string[] = [];
  if (!isObj(raw)) return { ok: false, errors: ['not an object'], source: 'ai' };
  const content = typeof raw.content === 'string' ? raw.content.trim() : '';
  const style = typeof raw.style === 'string' ? (raw.style as ExplanationStyle) : 'simplified';
  if (content.length < 40) errors.push('content too short (<40 chars)');
  if (content.length > 4000) errors.push('content too long');
  if (wordCount(content) > 350) errors.push('too many words');
  if (!/^[a-z-]+$/.test(style)) errors.push('invalid style');
  if (/<script|javascript:/i.test(content)) errors.push('unsafe content');
  if (errors.length) return { ok: false, errors, source: 'ai' };
  return {
    ok: true,
    value: { id: uid('e'), style, layer, content, source: 'ai' },
    errors: [],
    source: 'ai',
  };
}

/** Validate an AI-generated question (MC with exactly one correct choice). */
export function validateQuestion(raw: unknown): AIValidatedResult<Question> {
  const errors: string[] = [];
  if (!isObj(raw)) return { ok: false, errors: ['not an object'], source: 'ai' };
  const prompt = typeof raw.prompt === 'string' ? raw.prompt.trim() : '';
  if (prompt.length < 10) errors.push('prompt too short');
  if (prompt.length > 600) errors.push('prompt too long');
  const choicesRaw = Array.isArray(raw.choices) ? raw.choices : [];
  if (choicesRaw.length < 2 || choicesRaw.length > 5) errors.push('need 2–5 choices');
  let correctCount = 0;
  const choices = choicesRaw.map((c, i) => {
    const o = isObj(c) ? c : { text: String(c), correct: false };
    if (o.correct === true) correctCount++;
    return { id: `ch${i}`, text: String(o.text ?? '').slice(0, 300), correct: o.correct === true };
  });
  if (correctCount !== 1) errors.push('exactly one choice must be correct');
  if (choices.some((c) => c.text.length < 1)) errors.push('empty choice text');
  if (errors.length) return { ok: false, errors, source: 'ai' };
  return {
    ok: true,
    value: {
      id: uid('q'),
      conceptId: '',
      kind: 'mc',
      cognitiveLevel: 'understanding',
      prompt,
      choices,
      hints: Array.isArray(raw.hints) ? (raw.hints as unknown[]).slice(0, 5).map(String) : [],
      difficultyBase: 0.5,
      source: 'ai',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    },
    errors: [],
    source: 'ai',
  };
}

/** Validate AI teach-back evaluation against deterministic bounds. */
export interface AITeachBackEval {
  coverage: number;
  missing: string[];
  misconceptions: string[];
  comment: string;
}

export function validateTeachBackEval(raw: unknown): AIValidatedResult<AITeachBackEval> {
  if (!isObj(raw)) return { ok: false, errors: ['not an object'], source: 'ai' };
  const coverage = Number(raw.coverage);
  const errors: string[] = [];
  if (!Number.isFinite(coverage) || coverage < 0 || coverage > 1) errors.push('coverage out of range');
  const missing = Array.isArray(raw.missing) ? (raw.missing as unknown[]).slice(0, 8).map(String) : [];
  const misconceptions = Array.isArray(raw.misconceptions) ? (raw.misconceptions as unknown[]).slice(0, 4).map(String) : [];
  if (errors.length) return { ok: false, errors, source: 'ai' };
  return {
    ok: true,
    value: { coverage, missing, misconceptions, comment: String(raw.comment ?? '').slice(0, 500) },
    errors: [],
    source: 'ai',
  };
}

/** Validate an AI socratic reply — must be a guiding question, not an answer dump. */
export function validateSocraticReply(raw: unknown, answerText: string): AIValidatedResult<string> {
  if (!isObj(raw)) return { ok: false, errors: ['not an object'], source: 'ai' };
  const reply = typeof raw.reply === 'string' ? raw.reply.trim() : '';
  const errors: string[] = [];
  if (reply.length < 5) errors.push('reply too short');
  if (reply.length > 600) errors.push('reply too long');
  // guardrail: must not hand over the literal answer (req 20: know when NOT to explain)
  if (answerText && reply.toLowerCase().includes(answerText.toLowerCase().slice(0, 40)) && answerText.length > 12) {
    errors.push('reply leaks the answer');
  }
  if (errors.length) return { ok: false, errors, source: 'ai' };
  return { ok: true, value: reply, errors: [], source: 'ai' };
}

/** Deterministic fallbacks (req 79) — the engine works without AI. */
export function fallbackExplanation(concept: Concept, layer: LayerKind): Explanation {
  const curated = concept.explanations.find((e) => e.layer === layer) ?? concept.explanations[0];
  if (curated) return curated;
  return {
    id: uid('e'),
    style: 'definition',
    layer,
    content: `${concept.name}: ${concept.intro} ${concept.whyItMatters}`,
    source: 'curated',
  };
}

export function fallbackSocraticReply(stepIndex: number, hints: string[]): string {
  if (stepIndex < hints.length) return hints[stepIndex];
  return "Take a moment and tell me: what do you think the first step is? I'll guide you from there.";
}

/** Merge AI eval with deterministic eval — AI may only refine, not contradict. */
export function mergeTeachBackEval(detCoverage: number, ai: AITeachBackEval | null): number {
  if (!ai) return detCoverage;
  // blend, weighted toward deterministic evidence (req 21: never blindly trust)
  return Math.max(0, Math.min(1, 0.65 * detCoverage + 0.35 * ai.coverage));
}

/** Key-idea extraction guard for enriched concepts. */
export function validateKeyIdeas(raw: unknown): AIValidatedResult<KeyIdea[]> {
  if (!Array.isArray(raw)) return { ok: false, errors: ['not an array'], source: 'ai' };
  const ideas: KeyIdea[] = [];
  for (const item of raw.slice(0, 6)) {
    if (!isObj(item)) continue;
    const label = String(item.label ?? '').slice(0, 80);
    const groups = Array.isArray(item.groups) ? (item.groups as unknown[]).map((g) => (Array.isArray(g) ? g.map(String) : [String(g)])) : [];
    if (!label || !groups.length) continue;
    ideas.push({ id: uid('ki'), label, groups });
  }
  if (!ideas.length) return { ok: false, errors: ['no valid ideas'], source: 'ai' };
  return { ok: true, value: ideas, errors: [], source: 'ai' };
}
