/**
 * Misconception engine (req 10, 26).
 * Detect repeated conceptual mistakes, record patterns, teach the error
 * (error-first), and verify correction with targeted retests.
 */
import { Attempt, Concept, ID, MisconceptionDef, MisconceptionRecord } from './types';
import { containsAny, uid } from './utils';

/** Misconceptions triggered by a single attempt (wrong MC choice tagged, or free-text trap patterns). */
export function detectFromAttempt(concept: Concept, attempt: Attempt, givenText?: string): ID[] {
  const triggered = new Set<ID>(attempt.misconceptionIds ?? []);
  if (givenText && givenText.trim()) {
    for (const def of concept.misconceptionDefs) {
      if (def.detectPatterns.some((p) => containsAny(givenText, [p]) != null)) triggered.add(def.id);
    }
  }
  return [...triggered];
}

export interface MisconceptionUpdate {
  record: MisconceptionRecord;
  isNew: boolean;
  /** crossed the activation threshold this time */
  activated: boolean;
}

const ACTIVATE_AFTER = 2; // same conceptual mistake twice → active misconception

export function applyTrigger(
  records: Map<ID, MisconceptionRecord>,
  defId: ID,
  conceptId: ID,
  attemptId: ID,
  now: number,
): MisconceptionUpdate {
  const existing = records.get(defId);
  if (existing) {
    const record: MisconceptionRecord = {
      ...existing,
      triggerCount: existing.triggerCount + 1,
      lastAt: now,
      lastAttemptId: attemptId,
      status: 'active',
      updatedAt: now,
    };
    return { record, isNew: false, activated: existing.triggerCount + 1 >= ACTIVATE_AFTER && existing.triggerCount < ACTIVATE_AFTER };
  }
  const record: MisconceptionRecord = {
    id: uid('mc'),
    defId,
    conceptId,
    triggerCount: 1,
    firstAt: now,
    lastAt: now,
    lastAttemptId: attemptId,
    status: 'active',
    retestResults: [],
    updatedAt: now,
  };
  return { record, isNew: true, activated: false };
}

/** A targeted retest was passed — requires 2 consecutive passes to mark corrected. */
export function applyRetest(record: MisconceptionRecord, passed: boolean, now: number): MisconceptionRecord {
  const retestResults = [...record.retestResults, passed].slice(-3);
  const corrected = passed && retestResults.slice(-2).length === 2 && retestResults.slice(-2).every(Boolean);
  return {
    ...record,
    retestResults,
    status: corrected ? 'corrected' : 'active',
    correctedAt: corrected ? now : undefined,
    updatedAt: now,
  };
}

/** Error-first feedback panel content (req 26): teach the mistake, don't just mark wrong. */
export interface ErrorFirstFeedback {
  misconception?: MisconceptionDef;
  whatYouAnswered: string;
  whyPlausible: string;
  whereBroke: string;
  correctIdea: string;
  howToRecognize: string;
  retryHint: string;
}

export function buildErrorFirstFeedback(
  concept: Concept,
  given: string,
  correctAnswer: string,
  triggeredDef?: MisconceptionDef,
): ErrorFirstFeedback {
  return {
    misconception: triggeredDef,
    whatYouAnswered: given,
    whyPlausible:
      triggeredDef?.whyPlausible ??
      'This looks close to the right idea because it uses related words from the topic — the distinction is subtle.',
    whereBroke:
      triggeredDef?.whereItBreaks ??
      `The answer leans on an association with “${concept.name}” instead of the defining property asked for.`,
    correctIdea: triggeredDef?.correction ?? `The key idea: ${correctAnswer}`,
    howToRecognize: triggeredDef
      ? `When you notice yourself thinking “${triggeredDef.wrongIdea}”, stop and check ${triggeredDef.contrast.correct}.`
      : 'Ask: what is the *defining* property here, not just an associated one?',
    retryHint: triggeredDef?.targetedExample ?? 'Try the modified retry — same idea, different surface.',
  };
}

/** Pick a targeted question for an active misconception. */
export function targetedQuestionId(concept: Concept, record: MisconceptionRecord, allQuestionIds: ID[]): ID | null {
  const def = concept.misconceptionDefs.find((d) => d.id === record.defId);
  if (def?.checkQuestionIds?.length) {
    const available = def.checkQuestionIds.filter((q) => allQuestionIds.includes(q));
    if (available.length) return available[record.retestResults.length % available.length];
  }
  return null;
}
